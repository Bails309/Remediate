import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { Prisma, VulnerabilityStatus, Risk } from "@prisma/client";
import { WEB_APP_ADMIN_ROLES } from "@/lib/rbac";
import { z } from "zod";

const patchSchema = z.object({
    askForHelp: z.boolean().optional(),
    collaboratorIds: z.array(z.string()).optional(),
    assigneeId: z.string().uuid().nullable().optional(),
    status: z.string().optional(),
    crNumber: z.string().optional(),
});

const ACTIVE_STATUSES = ["Open", "InProgress", "InProgressWithCR"];

interface VulnerabilityWithCollaborators {
    id: string;
    assigneeId: string | null;
    siteId: string;
    lastSeenAt: Date;
    createdAt: Date;
    pluginId: string;
    cve: string | null;
    cvssScore: number | null;
    risk: Risk;
    host: string;
    protocol: string;
    port: string;
    name: string;
    synopsis: string | null;
    description: string | null;
    solution: string | null;
    seeAlso: string | null;
    pluginOutput: string | null;
    pluginPublicationDate: Date | null;
    pluginModificationDate: Date | null;
    status: VulnerabilityStatus;
    crNumber: string | null;
    collaborators: { id: string }[];
}

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

    const body = await req.json();
    const result = patchSchema.safeParse(body);
    if (!result.success) {
        return NextResponse.json({ error: result.error.format() }, { status: 400 });
    }
    const { askForHelp, collaboratorIds, assigneeId, status, crNumber } = result.data;

    // RBAC Rules for Non-Admins:
    // 1. Cannot assign to anyone other than themselves or "Unassigned".
    // 2. If not the current owner, can ONLY perform self-assignment (no other changes).
    // 3. If the current owner, can perform all changes but still cannot assign to others.
    const isAssignee = vulnerability.assigneeId === user.id;
    const isTargetingSelf = assigneeId === user.id;
    const isTargetingNull = assigneeId === null;

    if (!isAdmin) {
        // Prevent assigning to others
        if (assigneeId !== undefined && !isTargetingSelf && !isTargetingNull) {
            return NextResponse.json({ 
                error: "Standard users can only assign to themselves or Unassigned" 
            }, { status: 403 });
        }

        // If not the current owner
        if (!isAssignee) {
            if (isTargetingSelf) {
                // Limit to self-assignment only
                const modifiedKeys = Object.keys(result.data).filter(
                    (k) => result.data[k as keyof typeof result.data] !== undefined
                );
                if (modifiedKeys.length > 1) {
                    return NextResponse.json({ 
                        error: "You must take ownership before making other changes" 
                    }, { status: 403 });
                }
            } else {
                return NextResponse.json({ error: "Forbidden" }, { status: 403 });
            }
        }
    }

    // Manual validation that respects existing database state
    const effectiveStatus = status || vulnerability.status;
    const effectiveCr = crNumber !== undefined ? crNumber : vulnerability.crNumber;

    if (effectiveStatus === "InProgressWithCR" && !effectiveCr) {
        return NextResponse.json({ 
            error: "CR Number is required for 'In Progress with CR' status",
            path: ["crNumber"] 
        }, { status: 400 });
    }

    if (status && !ACTIVE_STATUSES.includes(status)) {
        // Archiving logic: move to history and delete from active
        const now = new Date();
        const updatedAssigneeId = assigneeId !== undefined ? assigneeId : vulnerability.assigneeId;

        const history = await prisma.$transaction(async (tx: Prisma.TransactionClient) => {
            const h = await tx.vulnerabilityHistory.create({
                data: {
                    id: vulnerabilityId,
                    siteId: vulnerability.siteId,
                    assigneeId: updatedAssigneeId,
                    status: status as VulnerabilityStatus,
                    lastSeenAt: vulnerability.lastSeenAt,
                    archivedAt: now,
                    createdAt: vulnerability.createdAt,
                    pluginId: vulnerability.pluginId,
                    cve: vulnerability.cve,
                    cvssScore: vulnerability.cvssScore,
                    risk: vulnerability.risk,
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
                    pluginModificationDate: vulnerability.pluginModificationDate,
                    crNumber: crNumber !== undefined ? crNumber : vulnerability.crNumber,
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
        if (askForHelp === false) {
            updateData.collaborators = { set: [] };
        }
    }

    if (assigneeId !== undefined) {
        updateData.assignee = assigneeId ? { connect: { id: assigneeId } } : { disconnect: true };
    }

    if (status && ACTIVE_STATUSES.includes(status)) {
        updateData.status = status as VulnerabilityStatus;
    }

    if (crNumber !== undefined) {
        updateData.crNumber = crNumber;
    }

    if (Array.isArray(collaboratorIds) && askForHelp !== false) {
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

    const vulnerability = await prisma.vulnerability.findUnique({
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
