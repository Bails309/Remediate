import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/rbac";
import { enforceRateLimit } from "@/lib/rate-limit";
import { writeAuditLog } from "@/lib/audit-log";
import { loadDashboardForViewer } from "@/lib/dashboards/access";

export const dynamic = "force-dynamic";

const updateSchema = z.object({
  name: z.string().trim().min(1).max(120).optional(),
  description: z.string().trim().max(500).nullable().optional(),
  visibility: z.enum(["Private", "Published"]).optional(),
});

export async function GET(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await requireUser();
  const { id } = await params;

  const result = await loadDashboardForViewer(id, session.user);
  if (!result) return NextResponse.json({ error: "Not found" }, { status: 404 });

  return NextResponse.json({ dashboard: result.dashboard, access: result.access });
}

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await requireUser();
  const { id } = await params;

  const rate = await enforceRateLimit(request, session.user.id);
  if (!rate.allowed) {
    return NextResponse.json({ error: "Too many requests" }, { status: 429 });
  }

  const existing = await prisma.dashboard.findUnique({ where: { id } });
  if (!existing) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (existing.ownerId !== session.user.id) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const parsed = updateSchema.safeParse(await request.json().catch(() => ({})));
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid dashboard update" }, { status: 400 });
  }

  const dashboard = await prisma.dashboard.update({ where: { id }, data: parsed.data });

  if (parsed.data.visibility && parsed.data.visibility !== existing.visibility) {
    await writeAuditLog({
      userId: session.user.id!,
      userEmail: session.user.email!,
      action: "dashboard.visibility_changed",
      entityType: "Dashboard",
      entityId: id,
      oldValue: existing.visibility,
      newValue: parsed.data.visibility,
    });
  }

  return NextResponse.json(dashboard);
}

export async function DELETE(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await requireUser();
  const { id } = await params;

  const existing = await prisma.dashboard.findUnique({ where: { id } });
  if (!existing) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (existing.ownerId !== session.user.id) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  await prisma.dashboard.delete({ where: { id } });

  await writeAuditLog({
    userId: session.user.id!,
    userEmail: session.user.email!,
    action: "dashboard.deleted",
    entityType: "Dashboard",
    entityId: id,
    oldValue: JSON.stringify({ name: existing.name }),
  });

  return NextResponse.json({ ok: true });
}
