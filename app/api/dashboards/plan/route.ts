import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { requireUser } from "@/lib/rbac";
import { enforceRateLimit } from "@/lib/rate-limit";
import { writeAuditLog } from "@/lib/audit-log";
import { getAiConfig } from "@/lib/ai/config";
import { AiPlanError } from "@/lib/ai/insights";
import { AiProviderError } from "@/lib/ai/provider";
import { planWidget } from "@/lib/dashboards/plan";
import { executeWidgetSpec } from "@/lib/dashboards/execute";
import { widgetContextFor } from "@/lib/dashboards/access";

export const dynamic = "force-dynamic";

const bodySchema = z.object({
  request: z.string().trim().min(3).max(500),
});

/** Reports whether the AI widget planner can be offered in the UI. */
export async function GET() {
  await requireUser();
  const config = await getAiConfig();
  return NextResponse.json({ available: Boolean(config?.enabled) });
}

/** Natural language -> validated widget definition (+ a preview of its data). */
export async function POST(request: NextRequest) {
  const session = await requireUser();

  const rate = await enforceRateLimit(request, session.user.id);
  if (!rate.allowed) {
    return NextResponse.json({ error: "Too many requests" }, { status: 429 });
  }

  const config = await getAiConfig();
  if (!config || !config.enabled) {
    return NextResponse.json(
      { error: "AI is not configured. Ask an administrator to enable it in Settings." },
      { status: 400 }
    );
  }

  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "Describe the widget you want in a sentence." }, { status: 400 });
  }

  try {
    const planned = await planWidget(parsed.data.request, config);
    const ctx = await widgetContextFor(session.user);
    const data = await executeWidgetSpec(planned.spec, ctx);

    await writeAuditLog({
      userId: session.user.id!,
      userEmail: session.user.email!,
      action: "dashboard.widget_planned",
      entityType: "Dashboard",
      newValue: JSON.stringify({ request: parsed.data.request, spec: planned.spec }),
    });

    return NextResponse.json({ ...planned, data });
  } catch (error) {
    if (error instanceof AiPlanError || error instanceof AiProviderError) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    console.error("[WIDGET_PLAN]", error);
    return NextResponse.json({ error: "Failed to plan that widget" }, { status: 500 });
  }
}
