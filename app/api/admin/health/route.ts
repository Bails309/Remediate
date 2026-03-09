import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { redis } from "@/lib/redis";
import { requireAdmin } from "@/lib/rbac";
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
        await requireAdmin();
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

    // Pentest backend health check (if configured)
    const pentestUrl = process.env.PENTEST_BACKEND_URL;
    let pentestStatus = "Not configured";
    if (pentestUrl) {
        try {
            // normalize URL
            const checkUrl = new URL(pentestUrl);
            checkUrl.pathname = "/health";
            const controller = new AbortController();
            const timeout = setTimeout(() => controller.abort(), 3000);
            const res = await fetch(checkUrl.toString(), { signal: controller.signal });
            clearTimeout(timeout);
            pentestStatus = res.ok ? "Healthy" : `Unhealthy (${res.status})`;
        } catch {
            pentestStatus = "Unhealthy";
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
        worker: {
            status: workerStatus,
        },
        pentestBackend: {
            status: pentestStatus,
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
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    return `${h}h ${m}m`;
}

async function resolveAppVersion() {
    // Prefer explicit env var set at build/deploy time
    if (process.env.APP_VERSION) return process.env.APP_VERSION;

    // Fallback to package.json version if available
    try {
        const pkgPath = path.join(process.cwd(), "package.json");
        const content = await fs.promises.readFile(pkgPath, "utf-8");
        const pkg = JSON.parse(content);
        return pkg.version ?? "unknown";
    } catch {
        return "unknown";
    }
}
