import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/rbac";
import { enforceRateLimit } from "@/lib/rate-limit";
import type { NextRequest } from "next/server";

export async function GET() {
    await requireAdmin();

    let config = await prisma.importConfig.findUnique({
        where: { id: "singleton" }
    });

    if (!config) {
        config = await prisma.importConfig.create({
            data: { id: "singleton", pluginGracePeriodDays: 30 }
        });
    }

    return NextResponse.json({ pluginGracePeriodDays: config.pluginGracePeriodDays });
}

export async function POST(request: NextRequest) {
    const rate = await enforceRateLimit(request);
    if (!rate.allowed) {
        return NextResponse.json({ error: "Too many requests" }, { status: 429 });
    }

    await requireAdmin();

    try {
        const data = await request.json();
        const days = Number(data.pluginGracePeriodDays);

        if (isNaN(days) || days < 0) {
            return NextResponse.json({ error: "Invalid grace period value" }, { status: 400 });
        }

        const config = await prisma.importConfig.upsert({
            where: { id: "singleton" },
            update: { pluginGracePeriodDays: days },
            create: { id: "singleton", pluginGracePeriodDays: days },
        });

        return NextResponse.json({ pluginGracePeriodDays: config.pluginGracePeriodDays });
    } catch (error) {
        console.error("Failed to parse POST body", error);
        return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
    }
}
