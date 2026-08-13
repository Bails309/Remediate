import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/rbac";
import { enforceRateLimit } from "@/lib/rate-limit";
import { writeAuditLog } from "@/lib/audit-log";

export const dynamic = "force-dynamic";

const createSchema = z.object({
  name: z.string().trim().min(1).max(120),
  description: z.string().trim().max(500).optional().nullable(),
});

export async function GET() {
  const session = await requireUser();
  const userId = session.user.id!;

  const [mine, published] = await Promise.all([
    prisma.dashboard.findMany({
      where: { ownerId: userId },
      orderBy: { updatedAt: "desc" },
      include: { _count: { select: { widgets: true } } },
    }),
    prisma.dashboard.findMany({
      where: { visibility: "Published", ownerId: { not: userId } },
      orderBy: { updatedAt: "desc" },
      include: { _count: { select: { widgets: true } }, owner: { select: { name: true } } },
    }),
  ]);

  return NextResponse.json({ mine, published });
}

export async function POST(request: NextRequest) {
  const session = await requireUser();

  const rate = await enforceRateLimit(request, session.user.id);
  if (!rate.allowed) {
    return NextResponse.json({ error: "Too many requests" }, { status: 429 });
  }

  const parsed = createSchema.safeParse(await request.json().catch(() => ({})));
  if (!parsed.success) {
    return NextResponse.json({ error: "A dashboard name is required" }, { status: 400 });
  }

  const dashboard = await prisma.dashboard.create({
    data: {
      ownerId: session.user.id!,
      name: parsed.data.name,
      description: parsed.data.description ?? null,
    },
  });

  await writeAuditLog({
    userId: session.user.id!,
    userEmail: session.user.email!,
    action: "dashboard.created",
    entityType: "Dashboard",
    entityId: dashboard.id,
    newValue: JSON.stringify({ name: dashboard.name }),
  });

  return NextResponse.json(dashboard, { status: 201 });
}
