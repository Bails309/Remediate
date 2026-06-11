import { NextResponse } from "next/server";
import { z } from "zod";
import type { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireUser, WEB_APP_ADMIN_ROLES } from "@/lib/rbac";
import {
  getGroupContext,
  canViewVulnerability,
  isLeaderOf,
} from "@/lib/group-rbac";

const querySchema = z.object({
  ids: z.array(z.string().uuid()).min(1).max(1000),
});

type CommentRow = {
  id: string;
  content: string;
  createdAt: Date;
  authorId: string;
  batchId: string | null;
  vulnerabilityId: string;
  author: { name: string | null; email: string | null } | null;
  vulnerability: { id: string; groupId: string | null; assigneeId: string | null };
};

/**
 * GET /api/vulnerabilities/comment-batches?ids=uuid,uuid,...
 *
 * Returns the bulk-comment batches that touched any of the supplied vulnerability ids,
 * restricted to batches the current user can edit/delete (author OR admin OR leader of
 * every group represented in the batch).
 */
export async function GET(request: NextRequest) {
  const session = await requireUser();
  const userId = session.user.id!;
  const roles = session.user.roles || [];
  const isAdmin = roles.some((r) => (WEB_APP_ADMIN_ROLES as readonly string[]).includes(r));

  const idsParam = request.nextUrl.searchParams.get("ids") || "";
  const ids = idsParam.split(",").map((s) => s.trim()).filter(Boolean);

  const parsed = querySchema.safeParse({ ids });
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid ids parameter" }, { status: 400 });
  }

  const ctx = await getGroupContext(userId);

  // Visibility wall on selection: refuse if any selected id is unreachable to this user.
  const selectionVisibility = await (prisma.vulnerability as unknown as {
    findMany: (a: unknown) => Promise<{ id: string; groupId: string | null; assigneeId: string | null }[]>;
  }).findMany({
    where: { id: { in: parsed.data.ids } },
    select: { id: true, groupId: true, assigneeId: true },
  });

  if (!isAdmin) {
    const unseen = selectionVisibility.find((v) => !canViewVulnerability(false, ctx, v));
    if (unseen) {
      return NextResponse.json({ error: "One or more vulnerabilities are not visible" }, { status: 404 });
    }
  }

  // Find distinct batchIds among comments on the selected vulns.
  const batchIdRows = await (prisma as unknown as {
    comment: { findMany: (a: unknown) => Promise<{ batchId: string | null }[]> };
  }).comment.findMany({
    where: { vulnerabilityId: { in: parsed.data.ids }, batchId: { not: null } },
    select: { batchId: true },
    distinct: ["batchId"],
  });

  const batchIds = batchIdRows.map((r) => r.batchId).filter((b): b is string => Boolean(b));

  if (batchIds.length === 0) {
    return NextResponse.json({ batches: [] });
  }

  // Load every comment row in those batches (including rows on vulns NOT in the
  // current selection) so we can compute the full extent + permission scope.
  const rows = await (prisma as unknown as {
    comment: { findMany: (a: unknown) => Promise<CommentRow[]> };
  }).comment.findMany({
    where: { batchId: { in: batchIds } },
    include: {
      author: { select: { name: true, email: true } },
      vulnerability: { select: { id: true, groupId: true, assigneeId: true } },
    },
    orderBy: { createdAt: "desc" },
  });

  const selectedSet = new Set(parsed.data.ids);

  // Group by batchId
  const grouped = new Map<string, CommentRow[]>();
  for (const row of rows) {
    if (!row.batchId) continue;
    if (!grouped.has(row.batchId)) grouped.set(row.batchId, []);
    grouped.get(row.batchId)!.push(row);
  }

  const batches = [] as Array<{
    batchId: string;
    content: string;
    authorId: string;
    authorName: string;
    createdAt: string;
    totalCount: number;
    selectedCount: number;
  }>;

  for (const [batchId, batchRows] of grouped) {
    const sample = batchRows[0];
    const isAuthor = sample.authorId === userId;

    // Permission: author / admin / leader of every group represented in batch.
    let canManage = isAuthor || isAdmin;
    if (!canManage) {
      const groupIds = new Set(batchRows.map((r) => r.vulnerability.groupId));
      // Reject if any item is ungrouped — leaders have no scope over ungrouped items.
      if (![...groupIds].every((g) => g !== null && isLeaderOf(ctx, g))) {
        canManage = false;
      } else {
        canManage = true;
      }
    }

    if (!canManage) continue;

    batches.push({
      batchId,
      content: sample.content,
      authorId: sample.authorId,
      authorName: sample.author?.name || sample.author?.email || "Unknown",
      createdAt: sample.createdAt.toISOString(),
      totalCount: batchRows.length,
      selectedCount: batchRows.filter((r) => selectedSet.has(r.vulnerabilityId)).length,
    });
  }

  batches.sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));

  return NextResponse.json({ batches });
}
