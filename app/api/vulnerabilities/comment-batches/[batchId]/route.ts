import { NextResponse } from "next/server";
import { z } from "zod";
import type { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireUser, WEB_APP_ADMIN_ROLES, canWriteWebApp } from "@/lib/rbac";
import { enforceRateLimit } from "@/lib/rate-limit";
import { writeAuditLog } from "@/lib/audit-log";
import { getGroupContext, isLeaderOf } from "@/lib/group-rbac";

const patchSchema = z.object({
  content: z.string().min(1).max(10000),
});

type BatchRow = {
  id: string;
  authorId: string;
  vulnerabilityId: string;
  vulnerability: { groupId: string | null };
};

async function loadBatch(batchId: string): Promise<BatchRow[]> {
  return (prisma as unknown as {
    comment: { findMany: (a: unknown) => Promise<BatchRow[]> };
  }).comment.findMany({
    where: { batchId },
    select: {
      id: true,
      authorId: true,
      vulnerabilityId: true,
      vulnerability: { select: { groupId: true } },
    },
  });
}

async function assertCanManage(
  rows: BatchRow[],
  userId: string,
  isAdmin: boolean
): Promise<true | NextResponse> {
  if (rows.length === 0) {
    return NextResponse.json({ error: "Batch not found" }, { status: 404 });
  }
  if (isAdmin) return true;
  const sampleAuthor = rows[0].authorId;
  if (rows.every((r) => r.authorId === sampleAuthor) && sampleAuthor === userId) {
    return true;
  }
  // Leader fallback: must lead every group represented in the batch (and no item
  // may be ungrouped, because leadership has no scope there).
  const ctx = await getGroupContext(userId);
  const groupIds = new Set(rows.map((r) => r.vulnerability.groupId));
  if ([...groupIds].every((g) => g !== null && isLeaderOf(ctx, g))) {
    return true;
  }
  // 404, not 403, so we don't leak the existence of batches the user can't touch.
  return NextResponse.json({ error: "Batch not found" }, { status: 404 });
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ batchId: string }> }
) {
  const rate = await enforceRateLimit(request);
  if (!rate.allowed) {
    return NextResponse.json({ error: "Too many requests" }, { status: 429 });
  }

  const { batchId } = await params;
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(batchId)) {
    return NextResponse.json({ error: "Invalid batch id" }, { status: 400 });
  }

  const session = await requireUser();
  const userId = session.user.id!;
  const roles = session.user.roles || [];
  if (!canWriteWebApp({ roles })) {
    return NextResponse.json({ error: "Read-only role cannot edit comments" }, { status: 403 });
  }
  const isAdmin = roles.some((r) => (WEB_APP_ADMIN_ROLES as readonly string[]).includes(r));

  let body: z.infer<typeof patchSchema>;
  try {
    body = patchSchema.parse(await request.json());
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "Invalid payload" }, { status: 400 });
  }

  const rows = await loadBatch(batchId);
  const check = await assertCanManage(rows, userId, isAdmin);
  if (check !== true) return check;

  const result = await (prisma as unknown as {
    comment: { updateMany: (a: unknown) => Promise<{ count: number }> };
  }).comment.updateMany({
    where: { batchId },
    data: { content: body.content },
  });

  writeAuditLog({
    userId,
    userEmail: session.user.email!,
    action: "vulnerability.bulk_comment_edited",
    entityType: "Comment",
    entityId: batchId,
    newValue: `batch:${batchId} count:${result.count}`,
  });

  return NextResponse.json({ ok: true, updated: result.count });
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ batchId: string }> }
) {
  const rate = await enforceRateLimit(request);
  if (!rate.allowed) {
    return NextResponse.json({ error: "Too many requests" }, { status: 429 });
  }

  const { batchId } = await params;
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(batchId)) {
    return NextResponse.json({ error: "Invalid batch id" }, { status: 400 });
  }

  const session = await requireUser();
  const userId = session.user.id!;
  const roles = session.user.roles || [];
  if (!canWriteWebApp({ roles })) {
    return NextResponse.json({ error: "Read-only role cannot delete comments" }, { status: 403 });
  }
  const isAdmin = roles.some((r) => (WEB_APP_ADMIN_ROLES as readonly string[]).includes(r));

  const rows = await loadBatch(batchId);
  const check = await assertCanManage(rows, userId, isAdmin);
  if (check !== true) return check;

  const result = await (prisma as unknown as {
    comment: { deleteMany: (a: unknown) => Promise<{ count: number }> };
  }).comment.deleteMany({
    where: { batchId },
  });

  writeAuditLog({
    userId,
    userEmail: session.user.email!,
    action: "vulnerability.bulk_comment_deleted",
    entityType: "Comment",
    entityId: batchId,
    newValue: `batch:${batchId} count:${result.count}`,
  });

  return NextResponse.json({ ok: true, deleted: result.count });
}
