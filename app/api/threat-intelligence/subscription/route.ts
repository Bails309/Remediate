import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/rbac";
import { Risk } from "@prisma/client";
import { z } from "zod";

const subscriptionSchema = z.object({
    isSubscribed: z.boolean(),
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

    const { isSubscribed, minRisk, cisaKevOnly, scheduledHour, scheduledMinute } = parsed.data;

    const sub = await prisma.threatSubscription.upsert({
        where: { userId },
        update: {
            isSubscribed,
            minRisk,
            cisaKevOnly,
            scheduledHour,
            scheduledMinute
        },
        create: {
            userId,
            isSubscribed,
            minRisk,
            cisaKevOnly,
            scheduledHour,
            scheduledMinute
        }
    });

    return NextResponse.json(sub);
}
