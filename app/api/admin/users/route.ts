import { NextResponse, NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { auth } from "@/auth";
import { checkAdmin } from "@/lib/rbac";
import { enforceRateLimit } from "@/lib/rate-limit";

export async function GET(req: NextRequest) {
    const session = await auth();
    if (!session?.user || !checkAdmin(session.user)) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { allowed } = await enforceRateLimit(req);
    if (!allowed) {
        return NextResponse.json({ error: "Too many requests" }, { status: 429 });
    }

    try {
        const users = await prisma.user.findMany({
            orderBy: { createdAt: "desc" },
        });
        return NextResponse.json(users);
    } catch (error) {
        console.error("Failed to fetch users:", error);
        return NextResponse.json({ error: "Failed to fetch users" }, { status: 500 });
    }
}

export async function PATCH(req: NextRequest) {
    const session = await auth();
    if (!session?.user || !checkAdmin(session.user)) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { allowed } = await enforceRateLimit(req);
    if (!allowed) {
        return NextResponse.json({ error: "Too many requests" }, { status: 429 });
    }

    try {
        const { userId, role } = await req.json();

        if (!userId || !role) {
            return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
        }

        if (!["Admin", "User"].includes(role)) {
            return NextResponse.json({ error: "Invalid role" }, { status: 400 });
        }

        // Prevent removing own admin role if you are the only admin
        if (userId === session.user.id && role !== "Admin") {
            const adminCount = await prisma.user.count({ where: { role: "Admin" } });
            if (adminCount <= 1) {
                return NextResponse.json({ error: "Cannot remove last admin" }, { status: 400 });
            }
        }

        const user = await prisma.user.update({
            where: { id: userId },
            data: { role },
        });

        return NextResponse.json(user);
    } catch (error) {
        console.error("Failed to update user:", error);
        return NextResponse.json({ error: "Failed to update user" }, { status: 500 });
    }
}
