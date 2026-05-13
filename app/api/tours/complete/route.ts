import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { z } from "zod";

const VALID_TOURS = ["welcome-tour", "threat-intel-update-v1", "whats-new-apr-2026", "whats-new-may-2026", "whats-new-may-2026-pdf", "whats-new-may-2026-v262", "dashboard-tour", "vulnerabilities-tour", "analytics-tour", "threat-intelligence-tour"] as const;
const tourSchema = z.object({
    tourId: z.enum(VALID_TOURS),
});

export async function POST(req: Request) {
    const session = await auth();
    if (!session?.user?.email) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    try {
        const body = await req.json();
        const result = tourSchema.safeParse(body);
        if (!result.success) {
            return NextResponse.json({ error: "Invalid tourId" }, { status: 400 });
        }
        const { tourId } = result.data;

        const toursToMark = tourId === "welcome-tour" 
            ? ["welcome-tour", "threat-intel-update-v1"] 
            : [tourId];

        // Read-then-set for deduplication instead of push
        const existing = await prisma.user.findUnique({
            where: { email: session.user.email },
            select: { completedTours: true },
        });
        const merged = [...new Set([...(existing?.completedTours ?? []), ...toursToMark])];

        const user = await prisma.user.update({
            where: { email: session.user.email },
            data: {
                isNewUser: false,
                completedTours: { set: merged },
            }
        });

        return NextResponse.json({ success: true, completedTours: user.completedTours });
    } catch (error) {
        console.error("Error completing tour:", error);
        return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
    }
}
