import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/rbac";
import { widgetSchema, assertSpecIsCoherent } from "@/lib/dashboards/spec";

export const dynamic = "force-dynamic";

const patchSchema = widgetSchema.partial();

async function loadOwnedWidget(dashboardId: string, widgetId: string, userId?: string | null) {
  const widget = await prisma.dashboardWidget.findFirst({
    where: { id: widgetId, dashboardId },
    include: { dashboard: { select: { ownerId: true } } },
  });
  if (!widget) return { error: NextResponse.json({ error: "Not found" }, { status: 404 }) };
  if (widget.dashboard.ownerId !== userId) {
    return { error: NextResponse.json({ error: "Forbidden" }, { status: 403 }) };
  }
  return { widget };
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; widgetId: string }> }
) {
  const session = await requireUser();
  const { id, widgetId } = await params;

  const owned = await loadOwnedWidget(id, widgetId, session.user.id);
  if (owned.error) return owned.error;

  const parsed = patchSchema.safeParse(await request.json().catch(() => ({})));
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid widget update" }, { status: 400 });
  }
  if (parsed.data.spec) {
    try {
      assertSpecIsCoherent(parsed.data.spec);
    } catch (error) {
      return NextResponse.json({ error: (error as Error).message }, { status: 400 });
    }
  }

  const widget = await prisma.dashboardWidget.update({
    where: { id: widgetId },
    data: parsed.data as z.infer<typeof patchSchema>,
  });

  return NextResponse.json(widget);
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string; widgetId: string }> }
) {
  const session = await requireUser();
  const { id, widgetId } = await params;

  const owned = await loadOwnedWidget(id, widgetId, session.user.id);
  if (owned.error) return owned.error;

  await prisma.dashboardWidget.delete({ where: { id: widgetId } });
  return NextResponse.json({ ok: true });
}
