import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { Prisma, Vulnerability, VulnerabilityStatus } from "@prisma/client";
import { requireUser, WEB_APP_ADMIN_ROLES, canWriteWebApp } from "@/lib/rbac";
import {
  getGroupContext,
  canEditVulnerability,
  canReassign,
  canSelfAssign,
  canViewVulnerability,
  canChangeGroup,
} from "@/lib/group-rbac";
import { enforceRateLimit } from "@/lib/rate-limit";
import { writeAuditLog } from "@/lib/audit-log";
import type { NextRequest } from "next/server";

const bulkSchema = z.object({
  ids: z.array(z.string().uuid()).min(1),
  status: z.enum(["Open", "Remediated", "FalsePositive", "NoFixAvailable", "InProgress", "InProgressWithCR", "Sunset"]).optional(),
  assigneeId: z.string().uuid().nullable().optional(),
  groupId: z.string().uuid().nullable().optional(),
  crNumber: z.string().optional(),
});

const ACTIVE_STATUSES = ["Open", "InProgress", "InProgressWithCR", "Sunset"];

export async function POST(request: NextRequest) {
  const rate = await enforceRateLimit(request);
  if (!rate.allowed) {
    return NextResponse.json({ error: "Too many requests" }, { status: 429 });
  }

  const session = await requireUser();
  const userId = session.user.id!;
  const roles = session.user.roles || [];
  if (!canWriteWebApp({ roles })) {
    return NextResponse.json({ error: "Read-only role cannot modify vulnerabilities" }, { status: 403 });
  }
  const isAdmin = roles.some(role => (WEB_APP_ADMIN_ROLES as readonly string[]).includes(role));

  const payload = bulkSchema.parse(await request.json());

  // Load every targeted vuln + its group/assignee so we can apply the group-aware
  // permission matrix per-item. This is the only way to honour the rule that group
  // leaders may edit/reassign within their group while still respecting the visibility
  // wall for items in OTHER groups that happened to be referenced by id.
  const ctx = await getGroupContext(userId);
  const victims = await prisma.vulnerability.findMany({
    where: { id: { in: payload.ids } },
    select: { id: true, assigneeId: true, groupId: true },
  });

  // Visibility wall: refuse the whole request if any id is unreachable to this user,
  // so non-members can't probe for the existence of group-owned items.
  if (!isAdmin) {
    const unseen = victims.find((v) => !canViewVulnerability(false, ctx, v));
    if (unseen) {
      return NextResponse.json({ error: "One or more vulnerabilities are not visible" }, { status: 404 });
    }
  }

  // Group reassignment: only admins can move items between groups in bulk.
  if (payload.groupId !== undefined && !canChangeGroup(isAdmin)) {
    return NextResponse.json(
      { error: "Only administrators can change a vulnerability's group" },
      { status: 403 }
    );
  }

  // Per-item permission checks for non-admins.
  if (!isAdmin) {
    if (payload.assigneeId !== undefined) {
      if (payload.assigneeId === null) {
        // Unassign: must be able to edit (assignee or leader).
        const blocker = victims.find((v) => !canEditVulnerability(false, ctx, userId, v));
        if (blocker) {
          return NextResponse.json(
            { error: "You don't have permission to unassign one or more selected items" },
            { status: 403 }
          );
        }
      } else if (payload.assigneeId === userId) {
        // Self-assign: each must be visible/pick-up-able for this user.
        const blocker = victims.find((v) => !canSelfAssign(false, ctx, v));
        if (blocker) {
          return NextResponse.json(
            { error: "You must be a member of the assigned group to take ownership" },
            { status: 403 }
          );
        }
      } else {
        // Reassign to someone else: only allowed when user is a leader of each
        // vuln's group AND the target is also a member of that group.
        for (const v of victims) {
          const ok = await canReassign(false, ctx, userId, v, payload.assigneeId);
          if (!ok) {
            return NextResponse.json(
              { error: "You can only reassign within groups you lead, to members of those groups" },
              { status: 403 }
            );
          }
        }
      }
    }

    if (payload.status || payload.crNumber) {
      const blocker = victims.find((v) => !canEditVulnerability(false, ctx, userId, v));
      if (blocker) {
        return NextResponse.json(
          { error: "You must take ownership (or lead the assigned group) before changing status or CR" },
          { status: 403 }
        );
      }
    }
  }

  const updateData: Record<string, unknown> = {};
  if (payload.status) {
    updateData.status = payload.status;
  }
  if (payload.assigneeId !== undefined) {
    updateData.assigneeId = payload.assigneeId;
  }
  if (payload.groupId !== undefined) {
    updateData.groupId = payload.groupId;
  }
  if (payload.crNumber !== undefined) {
    updateData.crNumber = payload.crNumber;
  }

  await prisma.$transaction(async (tx: Prisma.TransactionClient) => {
    if (payload.status && !ACTIVE_STATUSES.includes(payload.status)) {
      // Archiving logic: move to history and delete from active
      const archiveTargets = await tx.vulnerability.findMany({
        where: { id: { in: payload.ids } }
      });

      if (archiveTargets.length > 0) {
        const now = new Date();
        await tx.vulnerabilityHistory.createMany({
          data: archiveTargets.map((v: Vulnerability) => ({
            id: v.id,
            siteId: v.siteId,
            assigneeId: payload.assigneeId !== undefined ? payload.assigneeId : v.assigneeId,
            groupId: payload.groupId !== undefined ? payload.groupId : v.groupId,
            status: payload.status! as VulnerabilityStatus,
            lastSeenAt: v.lastSeenAt,
            archivedAt: now,
            createdAt: v.createdAt,
            pluginId: v.pluginId,
            cve: v.cve,
            cvssScore: v.cvssScore,
            risk: v.risk,
            host: v.host,
            protocol: v.protocol,
            port: v.port,
            name: v.name,
            synopsis: v.synopsis,
            description: v.description,
            solution: v.solution,
            seeAlso: v.seeAlso,
            pluginOutput: v.pluginOutput,
            pluginPublicationDate: v.pluginPublicationDate,
            pluginModificationDate: v.pluginModificationDate
          }))
        });

        await tx.vulnerability.deleteMany({
          where: { id: { in: archiveTargets.map((v: Vulnerability) => v.id) } }
        });
      }
    } else {
      // Normal update for Open status or just assignee/group changes
      await tx.vulnerability.updateMany({
        where: { id: { in: payload.ids } },
        data: updateData,
      });

      // If assigneeId was changed to a user (not null/unassigned), log notifications
      if (payload.assigneeId) {
        const notifications = payload.ids.map((id: string) => ({
          userId: payload.assigneeId as string,
          vulnerabilityId: id,
        }));
        await tx.assignmentNotification.createMany({
          data: notifications,
        });
      }
    }
  });

  // Compose a single audit entry that captures the kind of change applied.
  const auditAction = payload.status
    ? "vulnerability.bulk_status_changed"
    : payload.groupId !== undefined
      ? "vulnerability.bulk_group_changed"
      : "vulnerability.bulk_assigned";

  const auditValue = payload.status
    ? payload.status
    : payload.groupId !== undefined
      ? (payload.groupId ? `group:${payload.groupId}` : "none")
      : payload.assigneeId === null
        ? "unassigned"
        : payload.assigneeId
          ? `user:${payload.assigneeId}`
          : null;

  writeAuditLog({
    userId: userId!,
    userEmail: session.user.email!,
    action: auditAction,
    entityType: "Vulnerability",
    entityId: payload.ids.join(","),
    newValue: auditValue,
  });

  return NextResponse.json({ ok: true });
}
