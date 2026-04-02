import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { Prisma, Vulnerability, VulnerabilityStatus } from "@prisma/client";
import { requireUser, WEB_APP_ADMIN_ROLES } from "@/lib/rbac";
import { enforceRateLimit } from "@/lib/rate-limit";
import type { NextRequest } from "next/server";

const bulkSchema = z.object({
  ids: z.array(z.string().uuid()).min(1),
  status: z.enum(["Open", "Remediated", "FalsePositive", "NoFixAvailable", "InProgress", "InProgressWithCR", "Sunset"]).optional(),
  assigneeId: z.string().uuid().nullable().optional(),
  crNumber: z.string().optional(),
});

const ACTIVE_STATUSES = ["Open", "InProgress", "InProgressWithCR", "Sunset"];

export async function POST(request: NextRequest) {
  const rate = await enforceRateLimit(request);
  if (!rate.allowed) {
    return NextResponse.json({ error: "Too many requests" }, { status: 429 });
  }

  const session = await requireUser();
  const userId = session.user.id;
  const roles = session.user.roles || [];
  const isAdmin = roles.some(role => (WEB_APP_ADMIN_ROLES as readonly string[]).includes(role));

  const payload = bulkSchema.parse(await request.json());

  // RBAC validation for non-admins
  if (!isAdmin) {
    // 1. Assignment restriction: cannot assign to others
    if (payload.assigneeId !== undefined && payload.assigneeId !== userId && payload.assigneeId !== null) {
      return NextResponse.json({ 
        error: "Standard users can only assign to themselves or Unassigned" 
      }, { status: 403 });
    }

    // 2. Metadata restriction: must own all items to change status/CR
    if (payload.status || payload.crNumber) {
      const ownedCount = await prisma.vulnerability.count({
        where: {
          id: { in: payload.ids },
          assigneeId: userId
        }
      });
      if (ownedCount !== payload.ids.length) {
        return NextResponse.json({ 
          error: "You must take ownership of all selected items before making other changes" 
        }, { status: 403 });
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
  if (payload.crNumber !== undefined) {
    updateData.crNumber = payload.crNumber;
  }

  await prisma.$transaction(async (tx: Prisma.TransactionClient) => {
    if (payload.status && !ACTIVE_STATUSES.includes(payload.status)) {
      // Archiving logic: move to history and delete from active
      const victims = await tx.vulnerability.findMany({
        where: { id: { in: payload.ids } }
      });

      if (victims.length > 0) {
        const now = new Date();
        await tx.vulnerabilityHistory.createMany({
          data: victims.map((v: Vulnerability) => ({
            id: v.id,
            siteId: v.siteId,
            assigneeId: payload.assigneeId !== undefined ? payload.assigneeId : v.assigneeId,
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
          where: { id: { in: victims.map((v: Vulnerability) => v.id) } }
        });
      }
    } else {
      // Normal update for Open status or just assignee changes
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

  return NextResponse.json({ ok: true });
}
