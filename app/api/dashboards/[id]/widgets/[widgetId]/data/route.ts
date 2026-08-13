import { NextResponse, type NextRequest } from "next/server";
import { requireUser } from "@/lib/rbac";
import { widgetSpecSchema } from "@/lib/dashboards/spec";
import { executeWidgetSpec } from "@/lib/dashboards/execute";
import { widgetContextFor, loadDashboardForViewer } from "@/lib/dashboards/access";
import { enforceRateLimit } from "@/lib/rate-limit";

export const dynamic = "force-dynamic";

/**
 * Executes a saved widget for the *current viewer*. The stored spec is re-run
 * under the caller's own RBAC scope, so a published dashboard never leaks the
 * author's data.
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; widgetId: string }> }
) {
  const session = await requireUser();
  const { id, widgetId } = await params;

  const rate = await enforceRateLimit(request, session.user.id);
  if (!rate.allowed) {
    return NextResponse.json({ error: "Too many requests" }, { status: 429 });
  }

  const result = await loadDashboardForViewer(id, session.user);
  if (!result) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const widget = result.dashboard.widgets.find((item) => item.id === widgetId);
  if (!widget) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const spec = widgetSpecSchema.safeParse(widget.spec);
  if (!spec.success) {
    return NextResponse.json({ error: "This widget's query is no longer valid" }, { status: 422 });
  }

  try {
    const ctx = await widgetContextFor(session.user);
    return NextResponse.json(await executeWidgetSpec(spec.data, ctx));
  } catch (error) {
    console.error("[WIDGET_DATA]", error);
    return NextResponse.json({ error: "Failed to run this widget" }, { status: 500 });
  }
}
