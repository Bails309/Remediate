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

export async function POST(req: NextRequest) {
    const session = await auth();
    if (!session?.user || !checkAdmin(session.user)) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { allowed } = await enforceRateLimit(req);
    if (!allowed) {
        return NextResponse.json({ error: "Too many requests" }, { status: 429 });
    }

    try {
        const { email, roles } = await req.json();

        if (!email || !Array.isArray(roles)) {
            return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
        }

        const normalizedEmail = email.toLowerCase().trim();

        // Check for existing user
        const existing = await prisma.user.findUnique({ where: { email: normalizedEmail } });
        if (existing) {
            return NextResponse.json({ error: "User already exists" }, { status: 400 });
        }

        const allowedRoles = ["site_admin", "web_app_admin", "toolkit_admin", "web_app_user", "toolkit_user"];
        const hasInvalid = roles.some((role: string) => !allowedRoles.includes(role));
        if (hasInvalid) {
            return NextResponse.json({ error: "Invalid role" }, { status: 400 });
        }

        // Role hierarchy: only site_admin can assign site_admin or toolkit_admin
        const requesterRoles = (session.user.roles as string[]) || [];
        const isSiteAdmin = requesterRoles.includes("site_admin");
        if (!isSiteAdmin && (roles.includes("site_admin") || roles.includes("toolkit_admin"))) {
            return NextResponse.json({ error: "Only site admins can assign site_admin or toolkit_admin roles" }, { status: 403 });
        }

        const normalizedRoles = Array.from(new Set(roles));
        if (!normalizedRoles.includes("web_app_user")) {
            normalizedRoles.push("web_app_user");
        }

        const user = await prisma.user.create({
            data: {
                email: normalizedEmail,
                name: "Pending Authorization", // Placeholder until SSO sync
                roles: normalizedRoles,
                authSource: "SSO", // Default to SSO for pre-registration
            },
        });

        return NextResponse.json(user);
    } catch (error) {
        console.error("Failed to pre-register user:", error);
        return NextResponse.json({ error: "Failed to pre-register user" }, { status: 500 });
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

        const allowedRoles = ["site_admin", "web_app_admin", "toolkit_admin", "web_app_user", "toolkit_user"];
        const hasInvalid = roles.some((role: string) => !allowedRoles.includes(role));
        if (hasInvalid) {
            return NextResponse.json({ error: "Invalid role" }, { status: 400 });
        }

        // Role hierarchy: only site_admin can assign site_admin or toolkit_admin
        const requesterRoles = (session.user.roles as string[]) || [];
        const isSiteAdmin = requesterRoles.includes("site_admin");
        if (!isSiteAdmin && (roles.includes("site_admin") || roles.includes("toolkit_admin"))) {
            return NextResponse.json({ error: "Only site admins can assign site_admin or toolkit_admin roles" }, { status: 403 });
        }

        const normalizedRoles = Array.from(new Set(roles));
        if (!normalizedRoles.includes("web_app_user")) {
            normalizedRoles.push("web_app_user");
        }

        // Check target user exists
        const targetUser = await prisma.user.findUnique({ where: { id: userId }, select: { roles: true } });
        if (!targetUser) {
            return NextResponse.json({ error: "User not found" }, { status: 404 });
        }

        // Prevent removing site_admin role from the last site_admin (within a transaction)
        if (!normalizedRoles.includes("site_admin") && (targetUser.roles ?? []).includes("site_admin")) {
            const updated = await prisma.$transaction(async (tx) => {
                const adminCount = await tx.user.count({ where: { roles: { has: "site_admin" } } });
                if (adminCount <= 1) {
                    throw new Error("Cannot remove last site admin");
                }
                return tx.user.update({
                    where: { id: userId },
                    data: { roles: normalizedRoles },
                });
            });
            return NextResponse.json(updated);
        }

        const user = await prisma.user.update({
            where: { id: userId },
            data: { roles: normalizedRoles },
        });

        return NextResponse.json(user);
    } catch (error) {
        if (error instanceof Error && error.message === "Cannot remove last site admin") {
            return NextResponse.json({ error: error.message }, { status: 400 });
        }
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

        // Prevent deleting the last site admin (within a transaction to avoid race condition)
        if (targetUser.roles?.includes("site_admin")) {
            await prisma.$transaction(async (tx) => {
                const adminCount = await tx.user.count({ where: { roles: { has: "site_admin" } } });
                if (adminCount <= 1) {
                    throw new Error("Cannot delete last site admin");
                }
                await tx.user.delete({ where: { id: userId } });
            });
            return NextResponse.json({ success: true });
        }

        // Prevent deleting yourself
        if (session.user.id === userId) {
            return NextResponse.json({ error: "Cannot delete yourself" }, { status: 400 });
        }

        await prisma.user.delete({ where: { id: userId } });

        return NextResponse.json({ success: true });
    } catch (error) {
        if (error instanceof Error && error.message === "Cannot delete last site admin") {
            return NextResponse.json({ error: error.message }, { status: 400 });
        }
        console.error("Failed to delete user:", error);
        return NextResponse.json({ error: "Failed to delete user" }, { status: 500 });
    }
}
