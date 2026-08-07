import { prisma } from "@/lib/prisma";
import { fetchNvdCve, fetchOsvById, fetchCisaKev, fetchRecentNvdCves } from "./fetcher";
import { normalizeThreatData } from "./normalizer";
import { Queue, Worker } from "bullmq";
import { getBullmqConnection } from "@/lib/redis";

export const THREAT_QUEUE_NAME = "{threat-ingestion}";
export const threatQueue = new Queue(THREAT_QUEUE_NAME, {
    // Own the BullMQ client lifecycle so a stalled blocking connection can be
    // detected and recovered independently of the shared `redis` proxy.
    connection: getBullmqConnection(),
});

interface ThreatApiResponse {
    id: string;
    summary?: string;
    details?: string;
    aliases?: string[];
    cvssScore?: number | null;
    affected_packages?: any[]; // eslint-disable-line @typescript-eslint/no-explicit-any
    published?: string;
    modified?: string;
    database_specific?: {
        severity?: string;
    };
}

/**
 * Ingests a threat by its ID (CVE or OSV ID).
 * This coordinates fetchers, enrichers, and the normalizer.
 */
export async function ingestThreat(id: string) {
    try {
        let baseData: ThreatApiResponse | null = null;
        let cveId: string | null = null;
        let osvId: string | null = null;

        if (id.startsWith("CVE-")) {
            cveId = id;
            // For CVEs, we first try OSV for ecosystem context
            try {
                baseData = (await fetchOsvById(id)) as unknown as ThreatApiResponse;
                osvId = baseData.id;
            } catch {
                const nvdData = await fetchNvdCve(id);
                baseData = extractBaseDataFromNvd(nvdData);
            }
        } else {
            osvId = id;
            try {
                baseData = (await fetchOsvById(id)) as unknown as ThreatApiResponse;
                cveId = baseData.aliases?.find((a: string) => a.startsWith("CVE-")) || null;
            } catch {
                console.warn(`OSV fetch failed for ${id}, skipping...`);
                return;
            }
        }

        if (!baseData) return;

        // Enrichment
        let cvss: number | null = baseData.cvssScore || null;
        const epss: number | null = null;
        let cisaKev = false;

        // If it has a CVE ID, enrich with CISA KEV and EPSS
        if (cveId) {
            const kevList = await fetchCisaKev();
            const vulnerabilities = (kevList.vulnerabilities || []) as { cveID: string }[];
            cisaKev = vulnerabilities.some((v) => v.cveID === cveId);
            
            if (cvss === null) {
                try {
                    const nvdData = await fetchNvdCve(cveId);
                    const vulns = (nvdData.vulnerabilities || []) as { cve?: { metrics?: { cvssMetricV31?: { cvssData?: { baseScore: number } }[] } } }[];
                    cvss = vulns[0]?.cve?.metrics?.cvssMetricV31?.[0]?.cvssData?.baseScore || null;
                } catch {
                    // Fallback to vendor in normalizer
                }
            }
        }

        const normalized = normalizeThreatData(
            {
                osvId: osvId || cveId || id,
                cveId,
                summary: (baseData.summary || baseData.details || "No summary available").substring(0, 500),
                details: baseData.details,
                source: id.startsWith("CVE-") ? "NVD" : "OSV",
                affectedPackages: (baseData.affected_packages || []) as any[], // eslint-disable-line @typescript-eslint/no-explicit-any
                publishedAt: baseData.published ? new Date(baseData.published) : new Date(0), // Fallback to epoch if missing
                modifiedAt: baseData.modified ? new Date(baseData.modified) : new Date(), // Modified is "Live"
            },
            {
                cvss,
                epss,
                cisaKev,
                vendorSeverity: baseData.database_specific?.severity,
            }
        );

        // Upsert into database
        await prisma.threatVulnerability.upsert({
            where: { osvId: normalized.osvId },
            update: {
                ...normalized,
                syncedAt: new Date(),
            },
            create: {
                ...normalized,
                syncedAt: new Date(),
            },
        });

    } catch (error) {
        console.error(`Failed to ingest threat ${id}:`, error);
    }
}

/**
 * Full sync logic for all active feeds.
 * @param lookbackHours Number of hours to look back for recent CVEs. Default is 48.
 */
export async function syncAllThreats(lookbackHours = 48) {
    console.log(`[Sync] Starting ${lookbackHours === 48 ? 'full' : 'delta'} threat intelligence sync...`);
    
    try {
        // 1. Sync CISA KEV
        await fetchCisaKev();
        const metalId = "CISA_KEV";
        
        await prisma.threatFeedMetadata.upsert({
            where: { id: metalId },
            update: { lastSyncedAt: new Date() },
            create: { id: metalId, lastSyncedAt: new Date() },
        });

        // 2. Fetch Recent CVEs from NVD
        console.log(`[Sync] Fetching recent CVEs from NVD (Last ${lookbackHours}h)...`);
        const nvdData = await fetchRecentNvdCves(lookbackHours);
        const vulnerabilities = (nvdData.vulnerabilities || []) as unknown[];
        
        console.log(`[Sync] Found ${vulnerabilities.length} vulnerabilities. Queueing ingestion...`);

        // One round-trip per batch instead of one per CVE. Enqueuing 1,600+ jobs
        // with sequential `add()` calls saturated the shared cluster client and
        // starved slot-cache refresh alongside the sync's own CPU work.
        const jobs = vulnerabilities
            .map((vuln) => (vuln as { cve?: { id: string } })?.cve?.id)
            .filter((cveId): cveId is string => Boolean(cveId))
            .map((cveId) => ({
                name: "ingest",
                data: { id: cveId },
                opts: { removeOnComplete: true, jobId: `sync-${cveId}` },
            }));

        const ADD_BATCH_SIZE = 200;
        for (let i = 0; i < jobs.length; i += ADD_BATCH_SIZE) {
            await threatQueue.addBulk(jobs.slice(i, i + ADD_BATCH_SIZE));
        }

        console.log(`[Sync] Threat intelligence sync completed (${jobs.length} jobs queued).`);
    } catch (err) {
        console.error("[Sync] Sync failed:", err);
    }
}

/**
 * Worker to process individualized threat ingestion jobs from the queue.
 */
if (process.env.NODE_ENV !== "test") {
    const threatWorker = new Worker(THREAT_QUEUE_NAME, async (job) => {
        const { id } = job.data;
        await ingestThreat(id);
    }, {
        // Own our BullMQ connections -- see lib/redis.ts getBullmqConnection().
        connection: getBullmqConnection(),
        // Paced to NVD's published quota: 50 requests per rolling 30s with an
        // API key. Each job can make an NVD call, so anything faster just earns
        // 403/429s and burns the retry budget.
        concurrency: 1,
        limiter: {
            max: Number(process.env.THREAT_SYNC_MAX_PER_WINDOW) || 40,
            duration: 30_000,
        },
    });

    threatWorker.on('ready', () => {
        console.log(`[Worker:${THREAT_QUEUE_NAME}] Ready -- blocking connection established.`);
    });
    threatWorker.on('error', err => {
        console.error(`[Worker:${THREAT_QUEUE_NAME}] error:`, err);
    });
    threatWorker.on('failed', (job, err) => {
        console.error(`[Worker:${THREAT_QUEUE_NAME}] Job ${job?.id} failed:`, err.message);
    });
}

interface NvdCveResponse {
    vulnerabilities?: {
        cve: {
            id: string;
            descriptions?: { lang: string; value: string }[];
            published: string;
            lastModified: string;
            metrics?: Record<string, unknown>;
        };
    }[];
}

function extractBaseDataFromNvd(nvdData: Record<string, unknown>): ThreatApiResponse | null {
    const data = nvdData as unknown as NvdCveResponse;
    const vuln = data.vulnerabilities?.[0]?.cve;
    if (!vuln) return null;

    return {
        id: vuln.id,
        summary: vuln.descriptions?.find((d) => d.lang === "en")?.value,
        details: vuln.descriptions?.find((d) => d.lang === "en")?.value,
        published: vuln.published,
        modified: vuln.lastModified,
        cvssScore: (vuln.metrics as Record<string, { cvssData?: { baseScore: number } }[] | undefined>)?.cvssMetricV31?.[0]?.cvssData?.baseScore,
    };
}
