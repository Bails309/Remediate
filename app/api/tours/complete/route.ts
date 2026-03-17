import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";

export async function POST(req: Request) {
    const session = await auth();
    if (!session?.user?.email) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    try {
        const { tourId } = await req.json();
        
        if (!tourId) {
            return NextResponse.json({ error: "tourId is required" }, { status: 400 });
        }

        const toursToMark = tourId === "welcome-tour" 
            ? ["welcome-tour", "threat-intel-update-v1"] 
            : [tourId];

        const user = await prisma.user.update({
            where: { email: session.user.email },
            data: {
                isNewUser: false,
                completedTours: {
                    push: toursToMark
                }
            }
        });

        return NextResponse.json({ success: true, completedTours: user.completedTours });
    } catch (error) {
        console.error("Error completing tour:", error);
        return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
    }
}
