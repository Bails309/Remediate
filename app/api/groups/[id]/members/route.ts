import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { checkSiteAdmin } from "@/lib/rbac";
import { getGroupContext, canManageGroupMembership } from "@/lib/group-rbac";
import { enforceRateLimit } from "@/lib/rate-limit";
import { writeAuditLog } from "@/lib/audit-log";

const addSchema = z.object({
  userId: z.string().uuid(),
  role: z.enum(["member", "leader"]).default("member"),
});

const updateSchema = z.object({
  userId: z.string().uuid(),
  role: z.enum(["member", "leader"]),
});

const deleteSchema = z.object({
  userId: z.string().uuid(),
});

async function authoriseMembershipChange(groupId: string) {
  const session = await auth();
  if (!session?.user?.id) {
    return { error: "Unauthorized", status: 401 as const };
  }
  const isAdmin = checkSiteAdmin(session.user);
  const ctx = await getGroupContext(session.user.id);
  if (!canManageGroupMembership(isAdmin, ctx, groupId)) {
    return { error: "Forbidden", status: 403 as const };
  }
  return { session, isAdmin } as const;
}

// POST /api/groups/[id]/members — add a member (admin or leader of the group).
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const rate = await enforceRateLimit(req);
  if (!rate.allowed) {
    return NextResponse.json({ error: "Too many requests" }, { status: 429 });
  }

  const { id: groupId } = await params;
  const authz = await authoriseMembershipChange(groupId);
  if ("error" in authz) return NextResponse.json({ error: authz.error }, { status: authz.status });

  let body: unknown;
  try { body = await req.json(); } catch { return NextResponse.json({ error: "Invalid JSON" }, { status: 400 }); }

  const parsed = addSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.format() }, { status: 400 });
  }

  const user = await prisma.user.findUnique({ where: { id: parsed.data.userId }, select: { id: true } });
  if (!user) return NextResponse.json({ error: "User not found" }, { status: 404 });

  try {
    const membership = await prisma.groupMembership.create({
      data: {
        groupId,
        userId: parsed.data.userId,
        role: parsed.data.role,
      },
    });

    await writeAuditLog({
      userId: authz.session.user.id!,
      userEmail: authz.session.user.email!,
      action: "group.member_added",
      entityType: "Group",
      entityId: groupId,
      newValue: JSON.stringify({ userId: parsed.data.userId, role: parsed.data.role }),
    });

    return NextResponse.json(membership);
  } catch (err: unknown) {
    const e = err as { code?: string };
    if (e?.code === "P2002") {
      return NextResponse.json({ error: "User is already a member of this group" }, { status: 409 });
    }
    if (e?.code === "P2003") {
      return NextResponse.json({ error: "Group not found" }, { status: 404 });
    }
    console.error("Failed to add group member:", err);
    return NextResponse.json({ error: "Failed to add member" }, { status: 500 });
  }
}

// PATCH /api/groups/[id]/members — change role of an existing member.
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const rate = await enforceRateLimit(req);
  if (!rate.allowed) {
    return NextResponse.json({ error: "Too many requests" }, { status: 429 });
  }

  const { id: groupId } = await params;
  const authz = await authoriseMembershipChange(groupId);
  if ("error" in authz) return NextResponse.json({ error: authz.error }, { status: authz.status });

  let body: unknown;
  try { body = await req.json(); } catch { return NextResponse.json({ error: "Invalid JSON" }, { status: 400 }); }

  const parsed = updateSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.format() }, { status: 400 });
  }

  try {
    // If we are demoting the last leader, refuse — every group should keep at least one
    // leader (or be entirely led by admins). The cleanest rule is: a leader can never
    // demote the only leader; only an admin can.
    if (parsed.data.role === "member" && !authz.isAdmin) {
      const leaderCount = await prisma.groupMembership.count({
        where: { groupId, role: "leader" },
      });
      const targetIsLeader = await prisma.groupMembership.findUnique({
        where: { groupId_userId: { groupId, userId: parsed.data.userId } },
        select: { role: true },
      });
      if (targetIsLeader?.role === "leader" && leaderCount <= 1) {
        return NextResponse.json(
          { error: "Cannot demote the last leader of the group" },
          { status: 400 }
        );
      }
    }

    const updated = await prisma.groupMembership.update({
      where: { groupId_userId: { groupId, userId: parsed.data.userId } },
      data: { role: parsed.data.role },
    });

    await writeAuditLog({
      userId: authz.session.user.id!,
      userEmail: authz.session.user.email!,
      action: "group.member_role_changed",
      entityType: "Group",
      entityId: groupId,
      newValue: JSON.stringify({ userId: parsed.data.userId, role: parsed.data.role }),
    });

    return NextResponse.json(updated);
  } catch (err: unknown) {
    const e = err as { code?: string };
    if (e?.code === "P2025") {
      return NextResponse.json({ error: "Membership not found" }, { status: 404 });
    }
    console.error("Failed to update group member:", err);
    return NextResponse.json({ error: "Failed to update member" }, { status: 500 });
  }
}

// DELETE /api/groups/[id]/members — remove a member from the group.
export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const rate = await enforceRateLimit(req);
  if (!rate.allowed) {
    return NextResponse.json({ error: "Too many requests" }, { status: 429 });
  }

  const { id: groupId } = await params;
  const authz = await authoriseMembershipChange(groupId);
  if ("error" in authz) return NextResponse.json({ error: authz.error }, { status: authz.status });

  let body: unknown;
  try { body = await req.json(); } catch { return NextResponse.json({ error: "Invalid JSON" }, { status: 400 }); }

  const parsed = deleteSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.format() }, { status: 400 });
  }

  try {
    const target = await prisma.groupMembership.findUnique({
      where: { groupId_userId: { groupId, userId: parsed.data.userId } },
      select: { role: true },
    });
    if (!target) {
      return NextResponse.json({ error: "Membership not found" }, { status: 404 });
    }

    // Prevent removing the last leader (only admins can dissolve a group).
    if (target.role === "leader" && !authz.isAdmin) {
      const leaderCount = await prisma.groupMembership.count({
        where: { groupId, role: "leader" },
      });
      if (leaderCount <= 1) {
        return NextResponse.json(
          { error: "Cannot remove the last leader of the group" },
          { status: 400 }
        );
      }
    }

    await prisma.groupMembership.delete({
      where: { groupId_userId: { groupId, userId: parsed.data.userId } },
    });

    await writeAuditLog({
      userId: authz.session.user.id!,
      userEmail: authz.session.user.email!,
      action: "group.member_removed",
      entityType: "Group",
      entityId: groupId,
      oldValue: JSON.stringify({ userId: parsed.data.userId, role: target.role }),
    });

    return NextResponse.json({ success: true });
  } catch (err: unknown) {
    console.error("Failed to remove group member:", err);
    return NextResponse.json({ error: "Failed to remove member" }, { status: 500 });
  }
}
