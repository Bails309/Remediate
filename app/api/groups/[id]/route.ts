import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { checkAdmin } from "@/lib/rbac";
import { getGroupContext, canManageGroupMembership } from "@/lib/group-rbac";
import { enforceRateLimit } from "@/lib/rate-limit";
import { writeAuditLog } from "@/lib/audit-log";

const patchSchema = z.object({
  name: z.string().trim().min(1).max(120).optional(),
  description: z.string().trim().max(1000).nullable().optional(),
});

// GET /api/groups/[id] — view a single group with its members.
// Visible to admins, group members, and group leaders.
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const rate = await enforceRateLimit(req);
  if (!rate.allowed) {
    return NextResponse.json({ error: "Too many requests" }, { status: 429 });
  }

  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;
  const isAdmin = checkAdmin(session.user);
  const ctx = await getGroupContext(session.user.id);

  if (!isAdmin && !ctx.memberOf.includes(id)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const group = await prisma.group.findUnique({
    where: { id },
    include: {
      memberships: {
        include: { user: { select: { id: true, name: true, email: true } } },
      },
      _count: { select: { vulnerabilities: true } },
    },
  });

  if (!group) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  return NextResponse.json({
    id: group.id,
    name: group.name,
    description: group.description,
    createdAt: group.createdAt,
    vulnerabilityCount: group._count.vulnerabilities,
    members: group.memberships.map((m) => ({
      userId: m.userId,
      name: m.user.name,
      email: m.user.email,
      role: m.role,
    })),
    viewerCanManage: canManageGroupMembership(isAdmin, ctx, id),
  });
}

// PATCH /api/groups/[id] — rename / re-describe (admin only).
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const rate = await enforceRateLimit(req);
  if (!rate.allowed) {
    return NextResponse.json({ error: "Too many requests" }, { status: 429 });
  }

  const session = await auth();
  if (!session?.user?.id || !checkAdmin(session.user)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { id } = await params;
  let body: unknown;
  try { body = await req.json(); } catch { return NextResponse.json({ error: "Invalid JSON" }, { status: 400 }); }

  const parsed = patchSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.format() }, { status: 400 });
  }

  try {
    const updated = await prisma.group.update({
      where: { id },
      data: {
        ...(parsed.data.name !== undefined ? { name: parsed.data.name } : {}),
        ...(parsed.data.description !== undefined ? { description: parsed.data.description } : {}),
      },
    });

    await writeAuditLog({
      userId: session.user.id,
      userEmail: session.user.email!,
      action: "group.updated",
      entityType: "Group",
      entityId: id,
      newValue: JSON.stringify(parsed.data),
    });

    return NextResponse.json(updated);
  } catch (err: unknown) {
    const e = err as { code?: string };
    if (e?.code === "P2002") {
      return NextResponse.json({ error: "A group with that name already exists" }, { status: 409 });
    }
    if (e?.code === "P2025") {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }
    console.error("Failed to update group:", err);
    return NextResponse.json({ error: "Failed to update group" }, { status: 500 });
  }
}

// DELETE /api/groups/[id] — admin only.
// Vulnerabilities owned by this group have groupId set to NULL via FK ON DELETE SET NULL.
// We guard against orphaning active work by warning when there are open items.
export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const rate = await enforceRateLimit(req);
  if (!rate.allowed) {
    return NextResponse.json({ error: "Too many requests" }, { status: 429 });
  }

  const session = await auth();
  if (!session?.user?.id || !checkAdmin(session.user)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { id } = await params;
  const url = new URL(req.url);
  const force = url.searchParams.get("force") === "true";

  const activeCount = await prisma.vulnerability.count({ where: { groupId: id } });
  if (activeCount > 0 && !force) {
    return NextResponse.json(
      {
        error: "Group still owns active vulnerabilities. Reassign them first or pass ?force=true.",
        activeCount,
      },
      { status: 409 }
    );
  }

  try {
    await prisma.group.delete({ where: { id } });

    await writeAuditLog({
      userId: session.user.id,
      userEmail: session.user.email!,
      action: "group.deleted",
      entityType: "Group",
      entityId: id,
      oldValue: JSON.stringify({ activeVulnerabilitiesAtDeletion: activeCount }),
    });

    return NextResponse.json({ success: true });
  } catch (err: unknown) {
    const e = err as { code?: string };
    if (e?.code === "P2025") {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }
    console.error("Failed to delete group:", err);
    return NextResponse.json({ error: "Failed to delete group" }, { status: 500 });
  }
}
