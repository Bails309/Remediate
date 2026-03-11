import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { WEB_APP_ADMIN_ROLES } from "@/lib/rbac";
// email/reporting helpers removed from this route to avoid unused imports

export async function PATCH(
    req: Request,
    { params }: { params: Promise<{ id: string }> }
) {
    const { id: vulnerabilityId } = await params;
    const session = await auth();
    if (!session?.user?.email) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const user = await (prisma.user as unknown as { findUnique: (a: unknown) => Promise<{ id: string, roles: string[] } | null> }).findUnique({
        where: { email: session.user.email },
        select: { id: true, roles: true }
    });

    if (!user) {
        return NextResponse.json({ error: "User not found" }, { status: 404 });
    }

    const isAdmin = (user?.roles as string[] || []).some((role) =>
        (WEB_APP_ADMIN_ROLES as readonly string[]).includes(role)
    );

    const vulnerability = await (prisma.vulnerability as unknown as { findUnique: (a: unknown) => Promise<{ assigneeId: string | null, collaborators: { id: string }[] } | null> }).findUnique({
        where: { id: vulnerabilityId },
        include: { collaborators: { select: { id: true } } },
    });

    if (!vulnerability) {
        return NextResponse.json({ error: "Vulnerability not found" }, { status: 404 });
    }

    const isAssignee = vulnerability.assigneeId === user.id;

    if (!isAdmin && !isAssignee) {
        return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const { askForHelp, collaboratorIds } = await req.json();

    const updateData: {
        askForHelp?: boolean;
        collaborators?: {
            set: { id: string }[];
        };
    } = {};
    if (typeof askForHelp === 'boolean') {
        updateData.askForHelp = askForHelp;
    }

    if (Array.isArray(collaboratorIds)) {
        updateData.collaborators = {
            set: collaboratorIds.map((id: string) => ({ id })),
        };
    }

    const updated = await prisma.$transaction(async (tx) => {
        const u = await (tx.vulnerability as unknown as {
            update: (opts: {
                where: { id: string };
                data: typeof updateData;
                include: { collaborators: { select: { id: true; name: true; email: true } } };
            }) => Promise<unknown>;
        }).update({
            where: { id: vulnerabilityId },
            data: updateData,
            include: {
                collaborators: { select: { id: true, name: true, email: true } },
            },
        });

        if (Array.isArray(collaboratorIds) && collaboratorIds.length > 0) {
            const existingCollaboratorIds = (vulnerability?.collaborators as { id: string }[] || []).map((c) => c.id);
            const newCollaboratorIds = collaboratorIds.filter((id: string) => !existingCollaboratorIds.includes(id));

            if (newCollaboratorIds.length > 0) {
                await (tx.assignmentNotification as unknown as {
                    createMany: (opts: { data: { userId: string; vulnerabilityId: string }[] }) => Promise<unknown>;
                }).createMany({
                    data: newCollaboratorIds.map(userId => ({
                        userId,
                        vulnerabilityId
                    }))
                });
            }
        }

        return u;
    });

    return NextResponse.json(updated);
}

export async function GET(
    req: Request,
    { params }: { params: Promise<{ id: string }> }
) {
    const { id: vulnerabilityId } = await params;
    const session = await auth();
    if (!session?.user?.email) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const vulnerability = await (prisma.vulnerability as unknown as { findUnique: (a: unknown) => Promise<unknown> }).findUnique({
        where: { id: vulnerabilityId },
        include: {
            assignee: { select: { id: true, name: true } },
            collaborators: { select: { id: true, name: true } },
            site: true,
        }
    });

    if (!vulnerability) {
        return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    return NextResponse.json(vulnerability);
}
