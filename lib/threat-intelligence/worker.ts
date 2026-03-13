import { prisma } from "@/lib/prisma";
import { fetchNvdCve, fetchOsvById, fetchCisaKev, fetchRecentNvdCves } from "./fetcher";
import { normalizeThreatData, NormalizedThreat } from "./normalizer";
import { Queue, Worker } from "bullmq";
import { redis } from "@/lib/redis";

export const THREAT_QUEUE_NAME = "threat-ingestion";
export const threatQueue = new Queue(THREAT_QUEUE_NAME, { connection: redis as any });

/**
 * Ingests a threat by its ID (CVE or OSV ID).
 * This coordinates fetchers, enrichers, and the normalizer.
 */
export async function ingestThreat(id: string) {
    try {
        let baseData: any = null;
        let cveId: string | null = null;
        let osvId: string | null = null;

        if (id.startsWith("CVE-")) {
            cveId = id;
            // For CVEs, we first try OSV for ecosystem context
            try {
                baseData = await fetchOsvById(id);
                osvId = baseData.id;
            } catch {
                const nvdData = await fetchNvdCve(id);
                baseData = extractBaseDataFromNvd(nvdData);
            }
        } else {
            osvId = id;
            try {
                baseData = await fetchOsvById(id);
                cveId = baseData.aliases?.find((a: string) => a.startsWith("CVE-")) || null;
            } catch (error) {
                console.warn(`OSV fetch failed for ${id}, skipping...`);
                return;
            }
        }

        if (!baseData) return;

        // Enrichment
        let cvss: number | null = baseData.cvssScore || null;
        let epss: number | null = null;
        let cisaKev = false;

        // If it has a CVE ID, enrich with CISA KEV and EPSS
        if (cveId) {
            const kevList = await fetchCisaKev();
            cisaKev = kevList.vulnerabilities?.some((v: any) => v.cveID === cveId);
            
            if (cvss === null) {
                try {
                    const nvdData = await fetchNvdCve(cveId);
                    cvss = nvdData.vulnerabilities?.[0]?.cve?.metrics?.cvssMetricV31?.[0]?.cvssData?.baseScore || null;
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
                affectedPackages: baseData.affected_packages || [],
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
        const kevData = await fetchCisaKev();
        const metalId = "CISA_KEV";
        
        await prisma.threatFeedMetadata.upsert({
            where: { id: metalId },
            update: { lastSyncedAt: new Date() },
            create: { id: metalId, lastSyncedAt: new Date() },
        });

        // 2. Fetch Recent CVEs from NVD
        console.log(`[Sync] Fetching recent CVEs from NVD (Last ${lookbackHours}h)...`);
        const nvdData = await fetchRecentNvdCves(lookbackHours);
        const vulns = nvdData.vulnerabilities || [];
        
        console.log(`[Sync] Found ${vulns.length} vulnerabilities. Queueing ingestion...`);
        
        for (const vuln of vulns) {
            const cveId = vuln.cve?.id;
            if (cveId) {
                await threatQueue.add("ingest", { id: cveId }, { 
                    removeOnComplete: true,
                    jobId: `sync-${cveId}` // Prevent duplicate sync jobs in the same window
                });
            }
        }
        
        console.log("[Sync] Threat intelligence sync completed (Job queue updated).");
    } catch (err) {
        console.error("[Sync] Sync failed:", err);
    }
}

/**
 * Worker to process individualized threat ingestion jobs from the queue.
 */
if (process.env.NODE_ENV !== "test") {
    new Worker(THREAT_QUEUE_NAME, async (job) => {
        const { id } = job.data;
        await ingestThreat(id);
    }, { connection: redis as any });
}

function extractBaseDataFromNvd(nvdData: any) {
    const vuln = nvdData.vulnerabilities?.[0]?.cve;
    if (!vuln) return null;

    return {
        summary: vuln.descriptions?.find((d: any) => d.lang === "en")?.value,
        details: vuln.descriptions?.find((d: any) => d.lang === "en")?.value,
        published: vuln.published,
        modified: vuln.lastModified,
        cvssScore: vuln.metrics?.cvssMetricV31?.[0]?.cvssData?.baseScore,
    };
}
