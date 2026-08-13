import { z } from "zod";
import { querySpecSchema } from "@/lib/ai/query-spec";

/**
 * The only shape a widget may describe. Everything a user (or the AI planner)
 * asks for is validated against this allowlist and then executed with Prisma —
 * no model-authored SQL ever reaches the database.
 */

export const WIDGET_SOURCES = ["vulnerabilities", "threatActors", "uploads"] as const;
export const WIDGET_METRICS = ["count", "avgCvss"] as const;
export const WIDGET_VIZ = ["stat", "bar", "line", "donut", "table"] as const;

export const VULN_GROUP_BY = ["risk", "status", "site", "assignee", "group", "scanner", "month"] as const;
export const ACTOR_GROUP_BY = ["actorType", "origin", "tactic", "sector", "region", "technology"] as const;
export const UPLOAD_GROUP_BY = ["status", "site", "month"] as const;

export const GROUP_BY_VALUES = [
  ...new Set([...VULN_GROUP_BY, ...ACTOR_GROUP_BY, ...UPLOAD_GROUP_BY]),
] as [string, ...string[]];

/** Hard ceiling so a single widget can never pull an unbounded result set. */
export const MAX_WIDGET_ROWS = 50;

export const widgetSpecSchema = z
  .object({
    source: z.enum(WIDGET_SOURCES).default("vulnerabilities"),
    metric: z.enum(WIDGET_METRICS).default("count"),
    groupBy: z.enum(GROUP_BY_VALUES).nullish(),
    /** Vulnerability filters reuse the AI query spec allowlist. */
    filters: querySpecSchema.omit({ summary: true, sortBy: true, sortDir: true, limit: true }).optional(),
    limit: z.number().int().min(1).max(MAX_WIDGET_ROWS).default(10),
    /** Months of history for month-grouped widgets. */
    months: z.number().int().min(1).max(24).default(6),
  })
  .strict();

export type WidgetSpec = z.infer<typeof widgetSpecSchema>;

export const widgetSchema = z.object({
  title: z.string().trim().min(1).max(120),
  viz: z.enum(WIDGET_VIZ),
  spec: widgetSpecSchema,
  x: z.number().int().min(0).max(48).default(0),
  y: z.number().int().min(0).max(500).default(0),
  w: z.number().int().min(2).max(12).default(4),
  h: z.number().int().min(2).max(20).default(4),
});

const GROUP_BY_BY_SOURCE: Record<(typeof WIDGET_SOURCES)[number], readonly string[]> = {
  vulnerabilities: VULN_GROUP_BY,
  threatActors: ACTOR_GROUP_BY,
  uploads: UPLOAD_GROUP_BY,
};

/** Rejects combinations that parse individually but make no sense together. */
export function assertSpecIsCoherent(spec: WidgetSpec): void {
  if (spec.groupBy && !GROUP_BY_BY_SOURCE[spec.source].includes(spec.groupBy)) {
    throw new Error(`"${spec.groupBy}" is not a valid grouping for ${spec.source}.`);
  }
  if (spec.metric === "avgCvss" && spec.source !== "vulnerabilities") {
    throw new Error("Average CVSS is only available for vulnerabilities.");
  }
  if (spec.filters && spec.source !== "vulnerabilities") {
    throw new Error("Filters are only available for vulnerabilities.");
  }
}

export function groupByOptionsFor(source: (typeof WIDGET_SOURCES)[number]) {
  return GROUP_BY_BY_SOURCE[source];
}
