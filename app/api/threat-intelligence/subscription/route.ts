import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { Risk } from "@prisma/client";

export async function GET(request: Request) {
    const { searchParams } = new URL(request.url);
    const userId = searchParams.get("userId");

    if (!userId) {
        return NextResponse.json({ error: "Missing userId" }, { status: 400 });
    }

    const sub = await prisma.threatSubscription.findUnique({
        where: { userId }
    });

    return NextResponse.json(sub);
}

export async function POST(request: Request) {
    const body = await request.json();
    const { userId, isSubscribed, minRisk, cisaKevOnly } = body;

    if (!userId) {
        return NextResponse.json({ error: "Missing userId" }, { status: 400 });
    }

    const sub = await prisma.threatSubscription.upsert({
        where: { userId },
        update: {
            isSubscribed,
            minRisk,
            cisaKevOnly
        },
        create: {
            userId,
            isSubscribed,
            minRisk,
            cisaKevOnly
        }
    });

    return NextResponse.json(sub);
}
