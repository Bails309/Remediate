import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { redis } from "@/lib/redis";
import { requireAdmin } from "@/lib/rbac";
import { enforceRateLimit } from "@/lib/rate-limit";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
    const rate = await enforceRateLimit(request);
    if (!rate.allowed) {
        return NextResponse.json({ error: "Too many requests" }, { status: 429 });
    }

    try {
        await requireAdmin();
    } catch (err) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const startDb = Date.now();
    let dbStatus = "Healthy";
    let dbLatency = 0;
    try {
        await prisma.$queryRaw`SELECT 1`;
        dbLatency = Date.now() - startDb;
    } catch (err) {
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
    } catch (err) {
        redisStatus = "Unhealthy";
    }

    // Schema sync check - for now just check if we can query migrations
    let schemaStatus = "Healthy";
    try {
        // A simple check to see if core tables exist
        await prisma.vulnerability.count();
    } catch (err) {
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
        timestamp: new Date().toISOString(),
    });
}

function formatUptime(seconds: number) {
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    return `${h}h ${m}m`;
}
