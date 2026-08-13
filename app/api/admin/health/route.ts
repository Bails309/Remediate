import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { redis } from "@/lib/redis";
import { requireSiteAdmin } from "@/lib/rbac";
import { enforceRateLimit } from "@/lib/rate-limit";
import fs from "fs";
import path from "path";
import { URL } from "url";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
    const rate = await enforceRateLimit(request);
    if (!rate.allowed) {
        return NextResponse.json({ error: "Too many requests" }, { status: 429 });
    }

    try {
        await requireSiteAdmin();
    } catch {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const startDb = Date.now();
    let dbStatus = "Healthy";
    let dbLatency = 0;
    try {
        await prisma.$queryRaw`SELECT 1`;
        dbLatency = Date.now() - startDb;
    } catch {
        dbStatus = "Unhealthy";
    }

    const startRedis = Date.now();
    let redisStatus = "Healthy";
    let redisLatency = 0;
    let redisMemory = "0MB";
    try {
        await redis.ping();
        redisLatency = Date.now() - startRedis;
        const info = await redis.info("memory");
        const match = info.match(/used_memory_human:(\d+\.?\d*[KMG]B)/);
        if (match) redisMemory = match[1];
    } catch {
        redisStatus = "Unhealthy";
    }

    // Worker heartbeat check (writes to Redis by worker)
    let workerStatus = "Unknown";
    try {
        const hb = await redis.get("worker:heartbeat");
        if (!hb) {
            workerStatus = "No heartbeat";
        } else {
            const ageMs = Date.now() - Number(hb);
            // consider healthy if heartbeat within last 30s
            workerStatus = ageMs <= 30_000 ? "Healthy" : `Stale (${Math.round(ageMs / 1000)}s)`;
        }
    } catch {
        workerStatus = "Unhealthy";
    }

    // Toolkit backend health check (if configured)
    const toolkitUrl = process.env.PENTEST_BACKEND_URL;
    let toolkitStatus = "Not configured";
    if (toolkitUrl) {
        try {
            // normalize URL
            const checkUrl = new URL(toolkitUrl);
            checkUrl.pathname = "/health";
            const controller = new AbortController();
            const timeout = setTimeout(() => controller.abort(), 3000);
            const res = await fetch(checkUrl.toString(), { signal: controller.signal });
            clearTimeout(timeout);
            toolkitStatus = res.ok ? "Healthy" : `Unhealthy (${res.status})`;
        } catch {
            toolkitStatus = "Unhealthy";
        }
    }

    // Schema sync check - for now just check if we can query migrations
    let schemaStatus = "Healthy";
    try {
        // A simple check to see if core tables exist
        await prisma.vulnerability.count();
    } catch {
        schemaStatus = "Out of sync";
    }

    // Storage Provider Health
    const config = await prisma.storageConfig.findUnique({
        where: { id: "singleton" },
    });

    const storageProvider = config?.provider || "REDIS";
    let storageStatus = "Healthy";
    let storageDetails = "Operational";

    if (storageProvider === "AZURE") {
        try {
            const { decrypt } = await import("@/lib/crypto");
            const {
                BlobServiceClient,
                StorageSharedKeyCredential,
            } = await import("@azure/storage-blob");

            const containerName = config?.azureContainerName || "uploads";
            let blobServiceClient: unknown = null;

            if (config?.azureAuthMethod === "CONNECTION_STRING") {
                if (!config.azureConnectionStringEnc) {
                    storageStatus = "Unhealthy";
                    storageDetails = "Missing connection string";
                } else {
                    const connectionString = decrypt(config.azureConnectionStringEnc);
                    blobServiceClient = BlobServiceClient.fromConnectionString(connectionString);
                }
            } else if (config?.azureAuthMethod === "ACCOUNT_KEY") {
                if (!config.azureAccountName || !config.azureAccountKeyEnc) {
                    storageStatus = "Unhealthy";
                    storageDetails = "Missing account name or account key";
                } else {
                    const accountKey = decrypt(config.azureAccountKeyEnc);
                    const credential = new StorageSharedKeyCredential(config.azureAccountName, accountKey);
                    blobServiceClient = new BlobServiceClient(`https://${config.azureAccountName}.blob.core.windows.net`, credential);
                }
            } else if (config?.azureAuthMethod === "SAS_TOKEN") {
                if (!config.azureAccountName || !config.azureSasTokenEnc) {
                    storageStatus = "Unhealthy";
                    storageDetails = "Missing account name or SAS token";
                } else {
                    const sas = decrypt(config.azureSasTokenEnc);
                    const raw = sas.startsWith("?") ? sas.substring(1) : sas;
                    const url = `https://${config.azureAccountName}.blob.core.windows.net?${raw}`;
                    blobServiceClient = new BlobServiceClient(url);
                }
            } else {
                storageStatus = "Unhealthy";
                storageDetails = "Unknown Azure auth method";
            }

            if (blobServiceClient) {
                const containerClient = (blobServiceClient as { getContainerClient(name: string): { listBlobsFlat(): { byPage(opts: { maxPageSize: number }): AsyncIterableIterator<unknown> } } }).getContainerClient(containerName);
                const iterator = containerClient.listBlobsFlat().byPage({ maxPageSize: 1 });
                // consume one page to verify connectivity
                await iterator.next();
                storageDetails = `Container: ${containerName}`;
            }
        } catch (e) {
            storageStatus = "Unhealthy";
            storageDetails = (e as Error).message || "Azure connection failed";
        }
    } else {
        // For Redis, storage health is healthy if Redis itself is healthy
        storageStatus = redisStatus;
        storageDetails = "Shared Redis storage active";
    }

    return NextResponse.json({
        database: {
            status: dbStatus,
            latency: `${dbLatency}ms`,
            type: "PostgreSQL",
        },
        redis: {
            status: redisStatus,
            latency: `${redisLatency}ms`,
            memory: redisMemory,
        },
        storage: {
            provider: storageProvider,
            status: storageStatus,
            details: storageDetails,
        },
        worker: {
            status: workerStatus,
        },
        toolkitBackend: {
            status: toolkitStatus,
            url: process.env.PENTEST_BACKEND_URL ?? null,
        },
        schema: {
            status: schemaStatus,
            version: "6.19.2",
        },
        process: {
            uptime: formatUptime(process.uptime()),
            memory: `${Math.round(process.memoryUsage().rss / 1024 / 1024)}MB`,
            nodeVersion: process.version,
            environment: process.env.NODE_ENV?.toUpperCase() || "DEVELOPMENT",
        },
        app: {
            version: await resolveAppVersion(),
        },
        timestamp: new Date().toISOString(),
    });
}

function formatUptime(seconds: number) {
    const d = Math.floor(seconds / 86400);
    const h = Math.floor((seconds % 86400) / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    if (d > 0) return `${d}d ${h}h ${m}m`;
    if (h > 0) return `${h}h ${m}m`;
    return `${m}m`;
}

async function resolveAppVersion() {
    // Prefer package.json version if available for local dev accuracy
    try {
        const pkgPath = path.join(process.cwd(), "package.json");
        const content = await fs.promises.readFile(pkgPath, "utf-8");
        const pkg = JSON.parse(content);
        if (pkg.version) return pkg.version;
    } catch {
        // Fallback to env var
    }

    if (process.env.APP_VERSION) return process.env.APP_VERSION;
    return "unknown";
}
