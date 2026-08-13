import type { AiConfig } from "@/lib/ai/config";
import { chatCompletion } from "@/lib/ai/provider";
import { AiPlanError, extractJson } from "@/lib/ai/insights";
import { RISK_VALUES, STATUS_VALUES, SCANNER_VALUES } from "@/lib/ai/query-spec";
import {
  widgetSpecSchema,
  assertSpecIsCoherent,
  WIDGET_VIZ,
  VULN_GROUP_BY,
  ACTOR_GROUP_BY,
  UPLOAD_GROUP_BY,
  type WidgetSpec,
} from "@/lib/dashboards/spec";
import { z } from "zod";

const plannedWidgetSchema = z.object({
  title: z.string().trim().min(1).max(120),
  viz: z.enum(WIDGET_VIZ),
  spec: widgetSpecSchema,
});

export type PlannedWidget = z.infer<typeof plannedWidgetSchema>;

const SYSTEM_PROMPT = `You are a dashboard widget planner for "Remediate", a vulnerability remediation tool.
Translate the user's request into a SINGLE JSON object describing one widget. You never see data and you
never write SQL — you only choose a source, a metric and a grouping from the lists below.

Respond with JSON only, in this shape:
{ "title": string, "viz": one of ${WIDGET_VIZ.join(", ")}, "spec": { ... } }

spec fields:
- "source": "vulnerabilities" | "threatActors" | "uploads".
- "metric": "count" (default) or "avgCvss" (vulnerabilities only).
- "groupBy": omit for a single number. For vulnerabilities: ${VULN_GROUP_BY.join(", ")}.
  For threatActors: ${ACTOR_GROUP_BY.join(", ")}. For uploads: ${UPLOAD_GROUP_BY.join(", ")}.
- "filters" (vulnerabilities only, all optional): risk (array of ${RISK_VALUES.join(", ")}),
  status (array of ${STATUS_VALUES.join(", ")}), scannerType (${SCANNER_VALUES.join(" or ")}),
  hasFix (boolean), internetFacing (boolean), minCvss (0-10),
  cveContains / nameContains / hostContains / packageContains (substrings).
- "limit": integer 1-50, how many groups to show. Default 10.
- "months": integer 1-24, only for groupBy "month". Default 6.

Guidance:
- A single headline number -> viz "stat" and omit groupBy.
- Comparisons across categories -> viz "bar" or "donut" with a groupBy.
- Anything over time -> groupBy "month" and viz "line".
- "open"/"outstanding" -> filters.status ["Open"]. "critical" -> filters.risk ["Critical"].
- Give the widget a short human title, e.g. "Open critical findings by bucket".
- Never invent fields or enum values. Omit anything you are unsure about.`;

/** Ask the model for a widget definition, then validate it against the allowlist. */
export async function planWidget(request: string, config: AiConfig): Promise<PlannedWidget> {
  const content = await chatCompletion({
    config,
    json: true,
    messages: [
      { role: "system", content: SYSTEM_PROMPT },
      { role: "user", content: request },
    ],
  });

  const parsed = plannedWidgetSchema.safeParse(extractJson(content));
  if (!parsed.success) {
    throw new AiPlanError("Could not turn that into a valid widget. Try rephrasing.");
  }

  try {
    assertSpecIsCoherent(parsed.data.spec as WidgetSpec);
  } catch (error) {
    throw new AiPlanError(error instanceof Error ? error.message : "The planned widget was not valid.");
  }

  return parsed.data;
}
