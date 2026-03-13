import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { WEB_APP_ADMIN_ROLES } from "@/lib/rbac";
import { z } from "zod";

const patchSchema = z.object({
    askForHelp: z.boolean().optional(),
    collaboratorIds: z.array(z.string()).optional(),
    assigneeId: z.string().uuid().nullable().optional(),
    status: z.enum(["Open", "Remediated", "FalsePositive", "NoFixAvailable"]).optional(),
});

type VulnerabilityWithCollaborators = Prisma.VulnerabilityGetPayload<{
    include: { collaborators: { select: { id: true } } }
}>;

export async function PATCH(
    req: Request,
    { params }: { params: Promise<{ id: string }> }
) {
    const { id: vulnerabilityId } = await params;
    const session = await auth();
    if (!session?.user?.email) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const user = await prisma.user.findUnique({
        where: { email: session.user.email },
        select: { id: true, roles: true }
    });

    if (!user) {
        return NextResponse.json({ error: "User not found" }, { status: 404 });
    }

    const isAdmin = (user?.roles as string[] || []).some((role) =>
        (WEB_APP_ADMIN_ROLES as readonly string[]).includes(role)
    );

    const vulnerability = await prisma.vulnerability.findUnique({
        where: { id: vulnerabilityId },
        include: { collaborators: { select: { id: true } } },
    }) as VulnerabilityWithCollaborators | null;

    if (!vulnerability) {
        return NextResponse.json({ error: "Vulnerability not found" }, { status: 404 });
    }

    const isAssignee = vulnerability.assigneeId === user.id;

    if (!isAdmin && !isAssignee) {
        return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const { askForHelp, collaboratorIds, assigneeId, status } = patchSchema.parse(await req.json());

    if (status && status !== "Open") {
        // Archiving logic: move to history and delete from active
        const now = new Date();
        const updatedAssigneeId = assigneeId !== undefined ? assigneeId : vulnerability.assigneeId;

        const history = await prisma.$transaction(async (tx: Prisma.TransactionClient) => {
            const h = await tx.vulnerabilityHistory.create({
                data: {
                    id: vulnerabilityId,
                    siteId: vulnerability.siteId,
                    assigneeId: updatedAssigneeId,
                    status: status,
                    lastSeenAt: vulnerability.lastSeenAt,
                    archivedAt: now,
                    createdAt: vulnerability.createdAt,
                    pluginId: vulnerability.pluginId,
                    cve: vulnerability.cve,
                    cvssScore: vulnerability.cvssScore,
                    risk: vulnerability.risk as string,
                    host: vulnerability.host,
                    protocol: vulnerability.protocol,
                    port: vulnerability.port,
                    name: vulnerability.name,
                    synopsis: vulnerability.synopsis,
                    description: vulnerability.description,
                    solution: vulnerability.solution,
                    seeAlso: vulnerability.seeAlso,
                    pluginOutput: vulnerability.pluginOutput,
                    pluginPublicationDate: vulnerability.pluginPublicationDate,
                    pluginModificationDate: vulnerability.pluginModificationDate
                },
                include: {
                    assignee: { select: { id: true, name: true } },
                }
            });

            await tx.vulnerability.delete({
                where: { id: vulnerabilityId }
            });

            return h;
        });

        return NextResponse.json({ ...history, recordScope: "archived" });
    }

    const updateData: Prisma.VulnerabilityUpdateInput = {};
    if (typeof askForHelp === 'boolean') {
        updateData.askForHelp = askForHelp;
    }

    if (assigneeId !== undefined) {
        updateData.assigneeId = assigneeId;
    }

    if (status === "Open") {
        updateData.status = "Open";
    }

    if (Array.isArray(collaboratorIds)) {
        updateData.collaborators = {
            set: collaboratorIds.map((id: string) => ({ id })),
        };
    }

    const updated = await prisma.$transaction(async (tx: Prisma.TransactionClient) => {
        const u = await tx.vulnerability.update({
            where: { id: vulnerabilityId },
            data: updateData,
            include: {
                assignee: { select: { id: true, name: true } },
                collaborators: { select: { id: true, name: true, email: true } },
            },
        });

        if (Array.isArray(collaboratorIds) && collaboratorIds.length > 0) {
            const existingCollaboratorIds = (vulnerability?.collaborators as { id: string }[] || []).map((c) => c.id);
            const newCollaboratorIds = collaboratorIds.filter((id: string) => !existingCollaboratorIds.includes(id));

            if (newCollaboratorIds.length > 0) {
                await tx.assignmentNotification.createMany({
                    data: newCollaboratorIds.map(userId => ({
                        userId,
                        vulnerabilityId
                    }))
                });
            }
        }

        if (assigneeId && assigneeId !== vulnerability.assigneeId) {
            await tx.assignmentNotification.create({
                data: {
                    userId: assigneeId,
                    vulnerabilityId,
                }
            });
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
