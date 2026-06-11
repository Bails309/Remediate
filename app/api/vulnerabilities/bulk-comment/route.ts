import { NextResponse } from "next/server";
import { z } from "zod";
import { randomUUID } from "crypto";
import type { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireUser, WEB_APP_ADMIN_ROLES } from "@/lib/rbac";
import {
  getGroupContext,
  canViewVulnerability,
  isLeaderOf,
  isMemberOf,
} from "@/lib/group-rbac";
import { enforceRateLimit } from "@/lib/rate-limit";
import { writeAuditLog } from "@/lib/audit-log";

const bulkCommentSchema = z.object({
  ids: z.array(z.string().uuid()).min(1).max(1000),
  content: z.string().min(1).max(10000),
  isPrivate: z.boolean().optional(),
});

type VulnRow = {
  id: string;
  assigneeId: string | null;
  groupId: string | null;
  askForHelp: boolean;
  collaborators: { id: string }[];
};

export async function POST(request: NextRequest) {
  const rate = await enforceRateLimit(request);
  if (!rate.allowed) {
    return NextResponse.json({ error: "Too many requests" }, { status: 429 });
  }

  const session = await requireUser();
  const userId = session.user.id!;
  const roles = session.user.roles || [];
  const isAdmin = roles.some((role) => (WEB_APP_ADMIN_ROLES as readonly string[]).includes(role));

  let payload: z.infer<typeof bulkCommentSchema>;
  try {
    payload = bulkCommentSchema.parse(await request.json());
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "Invalid payload" }, { status: 400 });
  }

  const { ids, content, isPrivate = true } = payload;

  const ctx = await getGroupContext(userId);
  const victims = await (prisma.vulnerability as unknown as {
    findMany: (a: unknown) => Promise<VulnRow[]>;
  }).findMany({
    where: { id: { in: ids } },
    select: {
      id: true,
      assigneeId: true,
      groupId: true,
      askForHelp: true,
      collaborators: { select: { id: true } },
    },
  });

  // Visibility wall: refuse the whole request if any id is unreachable to this user.
  if (!isAdmin) {
    const unseen = victims.find((v) => !canViewVulnerability(false, ctx, v));
    if (unseen) {
      return NextResponse.json({ error: "One or more vulnerabilities are not visible" }, { status: 404 });
    }
  }

  // Per-item permission: matches single-item POST in /[id]/comments/route.ts
  const canCommentOn = (v: VulnRow): boolean => {
    if (isAdmin) return true;
    if (v.assigneeId === userId) return true;
    if (isLeaderOf(ctx, v.groupId)) return true;
    if (v.askForHelp && v.collaborators.some((c) => c.id === userId)) return true;
    if (v.askForHelp && isMemberOf(ctx, v.groupId)) return true;
    return false;
  };

  const blocker = victims.find((v) => !canCommentOn(v));
  if (blocker) {
    return NextResponse.json(
      { error: "You don't have permission to comment on one or more selected items" },
      { status: 403 }
    );
  }

  // Silently skip ids that weren't found (e.g. archived between selection and submit).
  if (victims.length === 0) {
    return NextResponse.json({ ok: true, created: 0 });
  }

  const batchId = randomUUID();

  await (prisma as unknown as {
    comment: { createMany: (a: unknown) => Promise<{ count: number }> };
  }).comment.createMany({
    data: victims.map((v) => ({
      content,
      isPrivate,
      vulnerabilityId: v.id,
      authorId: userId,
      batchId,
    })),
  });

  writeAuditLog({
    userId,
    userEmail: session.user.email!,
    action: "vulnerability.bulk_commented",
    entityType: "Vulnerability",
    entityId: victims.map((v) => v.id).join(","),
    newValue: `batch:${batchId} count:${victims.length}`,
  });

  return NextResponse.json({ ok: true, created: victims.length, batchId });
}
