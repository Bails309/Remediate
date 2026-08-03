import type { Prisma } from "@prisma/client";
import type { AiConfig } from "@/lib/ai/config";
import { chatCompletion } from "@/lib/ai/provider";
import {
  querySpecSchema,
  type QuerySpec,
  RISK_VALUES,
  STATUS_VALUES,
  SCANNER_VALUES,
  SORT_FIELDS,
} from "@/lib/ai/query-spec";

export class AiPlanError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AiPlanError";
  }
}

const SYSTEM_PROMPT = `You are a query planner for "Remediate", a vulnerability remediation triage tool.
Translate the user's question into a JSON object that selects vulnerabilities. You do NOT see any
data — you only produce a filter/sort plan. Respond with a SINGLE JSON object and nothing else.

Available fields (all optional — include only what the question implies):
- "summary": string. A one-sentence restatement of what you selected, e.g. "Critical vulnerabilities that already have a fix available, most severe first."
- "risk": array of ${RISK_VALUES.join(", ")}. Severity levels.
- "status": array of ${STATUS_VALUES.join(", ")}. Remediation lifecycle states. "Open" = not yet fixed.
- "scannerType": one of ${SCANNER_VALUES.join(", ")}. ACR = container image packages; NESSUS = host/network scans.
- "hasFix": boolean. true when the user wants findings that already have a fix/remediation/patch available.
- "internetFacing": boolean. true when the user wants internet-facing or pentest findings.
- "cveContains" / "nameContains" / "hostContains" / "packageContains": substrings to match.
- "minCvss": number 0-10. Minimum CVSS score.
- "sortBy": one of ${SORT_FIELDS.join(", ")}. "sortDir": "asc" or "desc".
- "limit": integer 1-100. Default to 50 for broad questions.

Domain guidance:
- "critical" -> risk ["Critical"]; "critical and high" -> ["Critical","High"].
- "already have fixes / patches available", "fixable" -> hasFix true.
- "which packages should I prioritise/update first" -> scannerType "ACR", sortBy "cvssScore", sortDir "desc", and set a limit.
- "most critical/severe/important first" -> sortBy "cvssScore", sortDir "desc".
- "still open / not fixed / outstanding" -> status ["Open"].
- Omit any field you are unsure about. Never invent field names or enum values.`;

/** Extract the first balanced JSON object from a model response (tolerates code fences / prose). */
export function extractJson(raw: string): unknown {
  const trimmed = raw.trim();
  const fenceMatch = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const candidate = fenceMatch ? fenceMatch[1].trim() : trimmed;

  const start = candidate.indexOf("{");
  const end = candidate.lastIndexOf("}");
  if (start === -1 || end === -1 || end <= start) {
    throw new AiPlanError("The AI response did not contain a JSON object.");
  }
  try {
    return JSON.parse(candidate.slice(start, end + 1));
  } catch {
    throw new AiPlanError("The AI response was not valid JSON.");
  }
}

/** Ask the configured model to plan a query, then validate it against the schema. */
export async function planQuery(question: string, config: AiConfig): Promise<QuerySpec> {
  const content = await chatCompletion({
    config,
    json: true,
    messages: [
      { role: "system", content: SYSTEM_PROMPT },
      { role: "user", content: question },
    ],
  });

  const parsed = querySpecSchema.safeParse(extractJson(content));
  if (!parsed.success) {
    throw new AiPlanError("Could not turn that question into a valid query. Try rephrasing.");
  }
  return parsed.data;
}

const NONEMPTY = { not: null } as const;

/**
 * Translate a validated {@link QuerySpec} into a Prisma `where` fragment. This is
 * the ONLY place a spec touches the database, and it never emits raw SQL. Callers
 * MUST combine the result with their RBAC/visibility fragment via AND.
 */
export function buildWhereFromSpec(spec: QuerySpec): Prisma.VulnerabilityWhereInput {
  const and: Prisma.VulnerabilityWhereInput[] = [];

  if (spec.risk?.length) and.push({ risk: { in: spec.risk } });
  if (spec.status?.length) and.push({ status: { in: spec.status } });
  if (spec.scannerType) and.push({ scannerType: spec.scannerType });
  if (typeof spec.minCvss === "number") and.push({ cvssScore: { gte: spec.minCvss } });

  if (spec.cveContains) and.push({ cve: { contains: spec.cveContains, mode: "insensitive" } });
  if (spec.nameContains) and.push({ name: { contains: spec.nameContains, mode: "insensitive" } });
  if (spec.hostContains) and.push({ host: { contains: spec.hostContains, mode: "insensitive" } });
  if (spec.packageContains) {
    and.push({ packageName: { contains: spec.packageContains, mode: "insensitive" } });
  }

  if (spec.internetFacing === true) {
    and.push({ pluginId: { startsWith: "PT", mode: "insensitive" } });
  } else if (spec.internetFacing === false) {
    and.push({ NOT: { pluginId: { startsWith: "PT", mode: "insensitive" } } });
  }

  // "Fix available" = not explicitly flagged NoFixAvailable AND some remediation
  // text is populated (solution for Nessus, remediation for ACR).
  if (spec.hasFix === true) {
    and.push({ status: { not: "NoFixAvailable" } });
    and.push({
      OR: [
        { solution: NONEMPTY },
        { remediation: NONEMPTY },
      ],
    });
  } else if (spec.hasFix === false) {
    and.push({
      OR: [
        { status: "NoFixAvailable" },
        { AND: [{ solution: null }, { remediation: null }] },
      ],
    });
  }

  return and.length ? { AND: and } : {};
}

/** Build a Prisma orderBy from the spec, defaulting to severity-first. */
export function buildOrderBy(spec: QuerySpec): Prisma.VulnerabilityOrderByWithRelationInput[] {
  const dir: Prisma.SortOrder = spec.sortDir === "asc" ? "asc" : "desc";
  if (spec.sortBy === "cvssScore") {
    return [{ cvssScore: dir }, { lastSeenAt: "desc" }];
  }
  if (spec.sortBy === "lastSeenAt") {
    return [{ lastSeenAt: dir }];
  }
  if (spec.sortBy === "risk") {
    // Prisma orders enum by declaration order (Critical..None); asc = most severe first.
    return [{ risk: spec.sortDir === "desc" ? "desc" : "asc" }, { cvssScore: "desc" }];
  }
  // Default: most severe, then highest CVSS, then most recent.
  return [{ risk: "asc" }, { cvssScore: "desc" }, { lastSeenAt: "desc" }];
}
