import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { Prisma, VulnerabilityStatus, Risk } from "@prisma/client";
import { WEB_APP_ADMIN_ROLES, canWriteWebApp } from "@/lib/rbac";
import {
    getGroupContext,
    canEditVulnerability,
    canSelfAssign,
    canReassign,
    canViewVulnerability,
    canChangeGroup,
    isLeaderOf,
} from "@/lib/group-rbac";
import { z } from "zod";
import { writeAuditLog } from "@/lib/audit-log";

const patchSchema = z.object({
    askForHelp: z.boolean().optional(),
    collaboratorIds: z.array(z.string().uuid()).optional(),
    assigneeId: z.string().uuid().nullable().optional(),
    groupId: z.string().uuid().nullable().optional(),
    status: z.enum(["Open", "Remediated", "FalsePositive", "NoFixAvailable", "InProgress", "InProgressWithCR", "Sunset", "AwaitingVendor"]).optional(),
    crNumber: z.string().optional(),
});

const ACTIVE_STATUSES = ["Open", "InProgress", "InProgressWithCR", "Sunset", "AwaitingVendor"];

interface VulnerabilityWithCollaborators {
    id: string;
    assigneeId: string | null;
    groupId: string | null;
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

    if (!canWriteWebApp({ roles: user.roles as string[] })) {
        return NextResponse.json({ error: "Read-only role cannot modify vulnerabilities" }, { status: 403 });
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
    const { askForHelp, collaboratorIds, assigneeId, groupId, status, crNumber } = result.data;

    // Group RBAC: visibility wall + leader privileges.
    const ctx = await getGroupContext(user.id);
    if (!canViewVulnerability(isAdmin, ctx, vulnerability)) {
        // Don't reveal existence of items the user shouldn't see.
        return NextResponse.json({ error: "Vulnerability not found" }, { status: 404 });
    }

    const isAssignee = vulnerability.assigneeId === user.id;
    const isLeader = isLeaderOf(ctx, vulnerability.groupId);
    const canEdit = canEditVulnerability(isAdmin, ctx, user.id, vulnerability);
    const isTargetingSelf = assigneeId === user.id;
    const isTargetingNull = assigneeId === null;

    // Only admins can move a vulnerability between groups.
    if (groupId !== undefined && groupId !== vulnerability.groupId && !canChangeGroup(isAdmin)) {
        return NextResponse.json(
            { error: "Only administrators can change a vulnerability's group" },
            { status: 403 }
        );
    }

    // If a non-admin attempts to assign to someone other than themselves / null,
    // they must be a leader of the assigned group AND the target must be in that group.
    if (assigneeId !== undefined && !isTargetingSelf && !isTargetingNull) {
        const allowed = await canReassign(isAdmin, ctx, user.id, vulnerability, assigneeId);
        if (!allowed) {
            return NextResponse.json(
                { error: "You can only assign to yourself, unassign, or (as group leader) assign to a member of your group" },
                { status: 403 }
            );
        }
    }

    // Self-assign requires the user to be allowed to see (and therefore pick up) the item.
    if (isTargetingSelf && !canSelfAssign(isAdmin, ctx, vulnerability)) {
        return NextResponse.json({ error: "You must be a member of this group to take ownership" }, { status: 403 });
    }

    if (!canEdit) {
        // Visible-but-uneditable user: only self-assignment (or unassign of own item) is allowed,
        // and no other fields may be set in the same request.
        const allowedKeysWithoutEdit = new Set(["assigneeId"]);
        const modifiedKeys = Object.keys(result.data).filter(
            (k) => result.data[k as keyof typeof result.data] !== undefined
        );
        const violatingKey = modifiedKeys.find((k) => !allowedKeysWithoutEdit.has(k));
        if (violatingKey) {
            return NextResponse.json(
                { error: "You must take ownership before making other changes" },
                { status: 403 }
            );
        }
        if (assigneeId === undefined) {
            return NextResponse.json({ error: "Forbidden" }, { status: 403 });
        }
    }
    // Suppress unused-variable warnings for context flags retained for readability.
    void isAssignee; void isLeader;

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
        const updatedGroupId = groupId !== undefined ? groupId : vulnerability.groupId;

        const history = await prisma.$transaction(async (tx: Prisma.TransactionClient) => {
            const h = await tx.vulnerabilityHistory.create({
                data: {
                    id: vulnerabilityId,
                    siteId: vulnerability.siteId,
                    assigneeId: updatedAssigneeId,
                    groupId: updatedGroupId,
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
                    group: { select: { id: true, name: true } },
                }
            });

            await tx.vulnerability.delete({
                where: { id: vulnerabilityId }
            });

            return h;
        });

        writeAuditLog({
            userId: user.id,
            userEmail: session.user.email!,
            action: "vulnerability.archived",
            entityType: "Vulnerability",
            entityId: vulnerabilityId,
            oldValue: vulnerability.status,
            newValue: status,
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
        if (assigneeId) {
            const assigneeExists = await prisma.user.findUnique({ where: { id: assigneeId }, select: { id: true } });
            if (!assigneeExists) {
                return NextResponse.json({ error: "Assignee user not found" }, { status: 400 });
            }
            updateData.assignee = { connect: { id: assigneeId } };
        } else {
            updateData.assignee = { disconnect: true };
        }
    }

    if (groupId !== undefined) {
        if (groupId) {
            const groupExists = await prisma.group.findUnique({ where: { id: groupId }, select: { id: true } });
            if (!groupExists) {
                return NextResponse.json({ error: "Group not found" }, { status: 400 });
            }
            updateData.group = { connect: { id: groupId } };
        } else {
            updateData.group = { disconnect: true };
        }
    }

    if (status && ACTIVE_STATUSES.includes(status)) {
        updateData.status = status as VulnerabilityStatus;
    }

    if (crNumber !== undefined) {
        updateData.crNumber = crNumber;
    }

    if (Array.isArray(collaboratorIds) && askForHelp !== false) {
        if (collaboratorIds.length > 0) {
            const existingUsers = await prisma.user.findMany({ where: { id: { in: collaboratorIds } }, select: { id: true } });
            if (existingUsers.length !== collaboratorIds.length) {
                return NextResponse.json({ error: "Some collaborator users not found" }, { status: 400 });
            }
        }
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
                group: { select: { id: true, name: true } },
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

    if (status) {
        writeAuditLog({
            userId: user.id,
            userEmail: session.user.email!,
            action: "vulnerability.status_changed",
            entityType: "Vulnerability",
            entityId: vulnerabilityId,
            oldValue: vulnerability.status,
            newValue: status,
        });
    }

    if (assigneeId !== undefined && assigneeId !== vulnerability.assigneeId) {
        writeAuditLog({
            userId: user.id,
            userEmail: session.user.email!,
            action: "vulnerability.assigned",
            entityType: "Vulnerability",
            entityId: vulnerabilityId,
            oldValue: vulnerability.assigneeId ? `user:${vulnerability.assigneeId}` : "unassigned",
            newValue: assigneeId ? `user:${assigneeId}` : "unassigned",
        });
    }

    if (groupId !== undefined && groupId !== vulnerability.groupId) {
        writeAuditLog({
            userId: user.id,
            userEmail: session.user.email!,
            action: "vulnerability.group_changed",
            entityType: "Vulnerability",
            entityId: vulnerabilityId,
            oldValue: vulnerability.groupId ? `group:${vulnerability.groupId}` : "none",
            newValue: groupId ? `group:${groupId}` : "none",
        });
    }

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

    const user = await prisma.user.findUnique({
        where: { email: session.user.email },
        select: { id: true, roles: true },
    });
    if (!user) return NextResponse.json({ error: "User not found" }, { status: 404 });

    const isAdmin = ((user.roles as string[]) || []).some((r) =>
        (WEB_APP_ADMIN_ROLES as readonly string[]).includes(r)
    );

    const vulnerability = await prisma.vulnerability.findUnique({
        where: { id: vulnerabilityId },
        include: {
            assignee: { select: { id: true, name: true } },
            group: { select: { id: true, name: true } },
            collaborators: { select: { id: true, name: true } },
            site: true,
        }
    });

    if (!vulnerability) {
        return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    const ctx = await getGroupContext(user.id);
    if (!canViewVulnerability(isAdmin, ctx, vulnerability)) {
        return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    return NextResponse.json(vulnerability);
}
