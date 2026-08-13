import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { checkAdmin, checkSiteAdmin } from "@/lib/rbac";
import { getGroupContext } from "@/lib/group-rbac";
import { enforceRateLimit } from "@/lib/rate-limit";
import { writeAuditLog } from "@/lib/audit-log";

const createSchema = z.object({
  name: z.string().trim().min(1).max(120),
  description: z.string().trim().max(1000).optional().nullable(),
});

// GET /api/groups
// - Admins: returns all groups with member counts.
// - Non-admins: returns only the groups they are a member of, with their role.
export async function GET(req: NextRequest) {
  const rate = await enforceRateLimit(req);
  if (!rate.allowed) {
    return NextResponse.json({ error: "Too many requests" }, { status: 429 });
  }

  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const isAdmin = checkAdmin(session.user);

  if (isAdmin) {
    const groups = await prisma.group.findMany({
      orderBy: { name: "asc" },
      include: {
        _count: { select: { memberships: true, vulnerabilities: true } },
      },
    });
    return NextResponse.json(
      groups.map((g) => ({
        id: g.id,
        name: g.name,
        description: g.description,
        createdAt: g.createdAt,
        memberCount: g._count.memberships,
        vulnerabilityCount: g._count.vulnerabilities,
        viewerRole: null,
      }))
    );
  }

  const ctx = await getGroupContext(session.user.id);
  if (ctx.memberOf.length === 0) {
    return NextResponse.json([]);
  }

  const groups = await prisma.group.findMany({
    where: { id: { in: ctx.memberOf } },
    orderBy: { name: "asc" },
    include: {
      _count: { select: { memberships: true, vulnerabilities: true } },
    },
  });

  return NextResponse.json(
    groups.map((g) => ({
      id: g.id,
      name: g.name,
      description: g.description,
      createdAt: g.createdAt,
      memberCount: g._count.memberships,
      vulnerabilityCount: g._count.vulnerabilities,
      viewerRole: ctx.leaderOf.includes(g.id) ? "leader" : "member",
    }))
  );
}

// POST /api/groups — create a new group (admin only).
export async function POST(req: NextRequest) {
  const rate = await enforceRateLimit(req);
  if (!rate.allowed) {
    return NextResponse.json({ error: "Too many requests" }, { status: 429 });
  }

  const session = await auth();
  if (!session?.user?.id || !checkSiteAdmin(session.user)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const parsed = createSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.format() }, { status: 400 });
  }

  try {
    const group = await prisma.group.create({
      data: {
        name: parsed.data.name,
        description: parsed.data.description ?? null,
      },
    });

    await writeAuditLog({
      userId: session.user.id,
      userEmail: session.user.email!,
      action: "group.created",
      entityType: "Group",
      entityId: group.id,
      newValue: JSON.stringify({ name: group.name }),
    });

    return NextResponse.json(group);
  } catch (err: unknown) {
    const e = err as { code?: string };
    if (e?.code === "P2002") {
      return NextResponse.json({ error: "A group with that name already exists" }, { status: 409 });
    }
    console.error("Failed to create group:", err);
    return NextResponse.json({ error: "Failed to create group" }, { status: 500 });
  }
}
