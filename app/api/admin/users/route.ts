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
        const { userId, roles } = await req.json();

        if (!userId || !Array.isArray(roles)) {
            return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
        }

        const allowedRoles = ["site_admin", "web_app_admin", "pentest_admin", "web_app_user", "pentest_user"];
        const hasInvalid = roles.some((role: string) => !allowedRoles.includes(role));
        if (hasInvalid) {
            return NextResponse.json({ error: "Invalid role" }, { status: 400 });
        }

        const normalizedRoles = Array.from(new Set(roles));
        if (!normalizedRoles.includes("web_app_user")) {
            normalizedRoles.push("web_app_user");
        }

        // Prevent removing site_admin role from the last site_admin
        if (!normalizedRoles.includes("site_admin")) {
            const adminCount = await prisma.user.count({ where: { roles: { has: "site_admin" } } });
            if (adminCount <= 1) {
                // Double check if the user being updated IS a site_admin
                const targetUser = await prisma.user.findUnique({ where: { id: userId }, select: { roles: true } });
                if ((targetUser?.roles ?? []).includes("site_admin")) {
                    return NextResponse.json({ error: "Cannot remove last site admin" }, { status: 400 });
                }
            }
        }

        const user = await prisma.user.update({
            where: { id: userId },
            data: { roles: normalizedRoles },
        });

        return NextResponse.json(user);
    } catch (error) {
        console.error("Failed to update user:", error);
        return NextResponse.json({ error: "Failed to update user" }, { status: 500 });
    }
}

export async function DELETE(req: NextRequest) {
    const session = await auth();
    if (!session?.user || !checkAdmin(session.user)) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { allowed } = await enforceRateLimit(req);
    if (!allowed) {
        return NextResponse.json({ error: "Too many requests" }, { status: 429 });
    }

    try {
        const { userId } = await req.json();

        if (!userId) {
            return NextResponse.json({ error: "Missing userId" }, { status: 400 });
        }

        const targetUser = await prisma.user.findUnique({ where: { id: userId }, select: { roles: true } });
        if (!targetUser) {
            return NextResponse.json({ error: "User not found" }, { status: 404 });
        }

        // Prevent deleting the last site admin
        if (targetUser.roles?.includes("site_admin")) {
            const adminCount = await prisma.user.count({ where: { roles: { has: "site_admin" } } });
            if (adminCount <= 1) {
                return NextResponse.json({ error: "Cannot delete last site admin" }, { status: 400 });
            }
        }

        // Prevent deleting yourself
        if (session.user.id === userId) {
            return NextResponse.json({ error: "Cannot delete yourself" }, { status: 400 });
        }

        await prisma.user.delete({ where: { id: userId } });

        return NextResponse.json({ success: true });
    } catch (error) {
        console.error("Failed to delete user:", error);
        return NextResponse.json({ error: "Failed to delete user" }, { status: 500 });
    }
}
