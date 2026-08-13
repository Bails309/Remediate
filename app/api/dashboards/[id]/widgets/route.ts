import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/rbac";
import { enforceRateLimit } from "@/lib/rate-limit";
import { widgetSchema, assertSpecIsCoherent } from "@/lib/dashboards/spec";

export const dynamic = "force-dynamic";

const layoutSchema = z.object({
  layout: z
    .array(
      z.object({
        id: z.string().uuid(),
        x: z.number().int().min(0).max(48),
        y: z.number().int().min(0).max(500),
        w: z.number().int().min(2).max(12),
        h: z.number().int().min(2).max(20),
      })
    )
    .max(50),
});

async function requireOwnedDashboard(id: string, userId?: string | null) {
  const dashboard = await prisma.dashboard.findUnique({ where: { id } });
  if (!dashboard) return { error: NextResponse.json({ error: "Not found" }, { status: 404 }) };
  if (dashboard.ownerId !== userId) {
    return { error: NextResponse.json({ error: "Forbidden" }, { status: 403 }) };
  }
  return { dashboard };
}

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await requireUser();
  const { id } = await params;

  const rate = await enforceRateLimit(request, session.user.id);
  if (!rate.allowed) {
    return NextResponse.json({ error: "Too many requests" }, { status: 429 });
  }

  const owned = await requireOwnedDashboard(id, session.user.id);
  if (owned.error) return owned.error;

  const parsed = widgetSchema.safeParse(await request.json().catch(() => ({})));
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid widget definition" }, { status: 400 });
  }

  try {
    assertSpecIsCoherent(parsed.data.spec);
  } catch (error) {
    return NextResponse.json({ error: (error as Error).message }, { status: 400 });
  }

  const count = await prisma.dashboardWidget.count({ where: { dashboardId: id } });
  if (count >= 24) {
    return NextResponse.json({ error: "A dashboard can hold at most 24 widgets" }, { status: 400 });
  }

  const widget = await prisma.dashboardWidget.create({
    data: {
      dashboardId: id,
      title: parsed.data.title,
      viz: parsed.data.viz,
      spec: parsed.data.spec,
      x: parsed.data.x,
      y: parsed.data.y,
      w: parsed.data.w,
      h: parsed.data.h,
    },
  });

  return NextResponse.json(widget, { status: 201 });
}

// Bulk position save after a drag or resize.
export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await requireUser();
  const { id } = await params;

  const owned = await requireOwnedDashboard(id, session.user.id);
  if (owned.error) return owned.error;

  const parsed = layoutSchema.safeParse(await request.json().catch(() => ({})));
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid layout" }, { status: 400 });
  }

  await prisma.$transaction(
    parsed.data.layout.map((item) =>
      prisma.dashboardWidget.updateMany({
        where: { id: item.id, dashboardId: id },
        data: { x: item.x, y: item.y, w: item.w, h: item.h },
      })
    )
  );

  return NextResponse.json({ ok: true });
}
