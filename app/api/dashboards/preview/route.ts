import { NextResponse, type NextRequest } from "next/server";
import { requireUser } from "@/lib/rbac";
import { enforceRateLimit } from "@/lib/rate-limit";
import { widgetSpecSchema } from "@/lib/dashboards/spec";
import { executeWidgetSpec } from "@/lib/dashboards/execute";
import { widgetContextFor } from "@/lib/dashboards/access";

export const dynamic = "force-dynamic";

/** Runs an unsaved spec so the widget builder can show a live preview. */
export async function POST(request: NextRequest) {
  const session = await requireUser();

  const rate = await enforceRateLimit(request, session.user.id);
  if (!rate.allowed) {
    return NextResponse.json({ error: "Too many requests" }, { status: 429 });
  }

  const parsed = widgetSpecSchema.safeParse(await request.json().catch(() => ({})));
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid widget spec" }, { status: 400 });
  }

  try {
    const ctx = await widgetContextFor(session.user);
    return NextResponse.json(await executeWidgetSpec(parsed.data, ctx));
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to run this widget" },
      { status: 400 }
    );
  }
}
