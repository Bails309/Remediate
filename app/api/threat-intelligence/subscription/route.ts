import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/rbac";
import { Risk } from "@prisma/client";
import { z } from "zod";

const subscriptionSchema = z.object({
    isSubscribed: z.boolean().optional(),
    globalDigestEnabled: z.boolean().optional(),
    environmentDigestEnabled: z.boolean().optional(),
    minRisk: z.nativeEnum(Risk),
    cisaKevOnly: z.boolean(),
    scheduledHour: z.number().int().min(0).max(23),
    scheduledMinute: z.number().int().min(0).max(59),
});

export async function GET() {
    const session = await requireUser();
    const userId = session.user.id;

    if (!userId) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const sub = await prisma.threatSubscription.findUnique({
        where: { userId }
    });

    return NextResponse.json(sub);
}

export async function POST(request: Request) {
    const session = await requireUser();
    const userId = session.user.id;

    if (!userId) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const parsed = subscriptionSchema.safeParse(await request.json());

    if (!parsed.success) {
        return NextResponse.json({ error: "Invalid subscription payload" }, { status: 400 });
    }

    const { minRisk, cisaKevOnly, scheduledHour, scheduledMinute } = parsed.data;
    const hasExplicitFeeds = parsed.data.globalDigestEnabled !== undefined || parsed.data.environmentDigestEnabled !== undefined;

    let globalDigestEnabled: boolean;
    let environmentDigestEnabled: boolean;

    if (hasExplicitFeeds) {
        globalDigestEnabled = parsed.data.globalDigestEnabled ?? false;
        environmentDigestEnabled = parsed.data.environmentDigestEnabled ?? false;
    } else {
        const sub = parsed.data.isSubscribed ?? false;
        globalDigestEnabled = sub;
        environmentDigestEnabled = false;
    }

    const isSubscribed = globalDigestEnabled || environmentDigestEnabled;

    const sub = await prisma.threatSubscription.upsert({
        where: { userId },
        update: {
            isSubscribed,
            globalDigestEnabled,
            environmentDigestEnabled,
            minRisk,
            cisaKevOnly,
            scheduledHour,
            scheduledMinute
        },
        create: {
            userId,
            isSubscribed,
            globalDigestEnabled,
            environmentDigestEnabled,
            minRisk,
            cisaKevOnly,
            scheduledHour,
            scheduledMinute
        }
    });

    return NextResponse.json(sub);
}
