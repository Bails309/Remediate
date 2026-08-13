import { NextResponse, type NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/rbac";
import { enforceRateLimit } from "@/lib/rate-limit";
import { loadDashboardForViewer } from "@/lib/dashboards/access";

export const dynamic = "force-dynamic";

/** Copies a published dashboard (specs only) into the caller's private set. */
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await requireUser();
  const { id } = await params;

  const rate = await enforceRateLimit(request, session.user.id);
  if (!rate.allowed) {
    return NextResponse.json({ error: "Too many requests" }, { status: 429 });
  }

  const result = await loadDashboardForViewer(id, session.user);
  if (!result) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const source = result.dashboard;
  const clone = await prisma.dashboard.create({
    data: {
      ownerId: session.user.id!,
      name: `${source.name} (copy)`,
      description: source.description,
      visibility: "Private",
      widgets: {
        create: source.widgets.map((widget) => ({
          title: widget.title,
          viz: widget.viz,
          spec: widget.spec ?? {},
          x: widget.x,
          y: widget.y,
          w: widget.w,
          h: widget.h,
        })),
      },
    },
  });

  return NextResponse.json(clone, { status: 201 });
}
