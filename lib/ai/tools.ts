import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { querySpecSchema } from "@/lib/ai/query-spec";
import { buildWhereFromSpec, buildOrderBy } from "@/lib/ai/insights";
import { getLatestVersion, REGISTRY_ECOSYSTEMS } from "@/lib/ai/registry";

/** RBAC context the tools execute under. Mirrors the vulnerabilities API wall. */
export type ToolContext = {
  isAdmin: boolean;
  memberOf: string[];
};

/** Group-visibility wall — identical semantics to app/api/vulnerabilities/route.ts. */
function visibilityWhere(ctx: ToolContext): Prisma.VulnerabilityWhereInput | undefined {
  if (ctx.isAdmin) return undefined;
  return {
    OR: [{ groupId: null }, ...(ctx.memberOf.length > 0 ? [{ groupId: { in: ctx.memberOf } }] : [])],
  };
}

/** Cap on rows returned to the model in a single tool call (token safety). */
const MAX_TOOL_ROWS = 60;

function truncate(value: string | null | undefined, max: number): string | null {
  if (!value) return null;
  const clean = value.replace(/\s+/g, " ").trim();
  return clean.length > max ? `${clean.slice(0, max)}…` : clean;
}

/** Project a Vulnerability row down to the fields the model needs (token control). */
function trimRow(row: {
  id: string;
  cve: string | null;
  name: string;
  risk: string;
  cvssScore: number | null;
  status: string;
  scannerType: string;
  host: string;
  packageName: string | null;
  installedVersion: string | null;
  solution: string | null;
  remediation: string | null;
  pluginId: string;
  lastSeenAt: Date;
}) {
  return {
    id: row.id,
    cve: row.cve,
    name: truncate(row.name, 160),
    risk: row.risk,
    cvss: row.cvssScore,
    status: row.status,
    scanner: row.scannerType,
    host: row.host,
    package: row.packageName,
    installedVersion: row.installedVersion,
    fix: truncate(row.solution ?? row.remediation, 280),
    internetFacing: /^PT/i.test(row.pluginId),
    lastSeen: row.lastSeenAt.toISOString().slice(0, 10),
  };
}

/**
 * OpenAI-format tool declarations advertised to the model. The parameter schema
 * for `search_vulnerabilities` intentionally mirrors the constrained query spec
 * so the model can only express filters we know how to execute safely.
 */
export const TOOL_DEFINITIONS = [
  {
    type: "function" as const,
    function: {
      name: "search_vulnerabilities",
      description:
        "Search the caller's vulnerabilities. Results are already restricted to what this user is allowed to see (RBAC + group visibility). Use this to gather the findings you need before summarising or prioritising. Returns a ranked, capped list plus the total match count.",
      parameters: {
        type: "object",
        additionalProperties: false,
        properties: {
          risk: {
            type: "array",
            items: { type: "string", enum: ["Critical", "High", "Medium", "Low", "None"] },
            description: "Severity levels to include.",
          },
          status: {
            type: "array",
            items: {
              type: "string",
              enum: [
                "Open",
                "Remediated",
                "FalsePositive",
                "NoFixAvailable",
                "InProgress",
                "InProgressWithCR",
                "Sunset",
                "AwaitingVendor",
              ],
            },
            description: "Remediation lifecycle states. 'Open' = not yet fixed.",
          },
          scannerType: { type: "string", enum: ["NESSUS", "ACR"], description: "ACR = container image packages; NESSUS = host/network scans." },
          hasFix: { type: "boolean", description: "true = only findings that already have a fix/remediation available." },
          internetFacing: { type: "boolean", description: "true = only internet-facing pentest findings." },
          cveContains: { type: "string" },
          nameContains: { type: "string" },
          hostContains: { type: "string" },
          packageContains: { type: "string" },
          minCvss: { type: "number", minimum: 0, maximum: 10 },
          sortBy: { type: "string", enum: ["cvssScore", "lastSeenAt", "risk"] },
          sortDir: { type: "string", enum: ["asc", "desc"] },
          limit: { type: "integer", minimum: 1, maximum: 60 },
        },
      },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "get_latest_version",
      description:
        "Look up the latest published version of a software package from its public registry. Use this to tell the user whether a vulnerable component has a newer release. For OS/container base-image packages there may be no matching registry.",
      parameters: {
        type: "object",
        additionalProperties: false,
        required: ["ecosystem", "packageName"],
        properties: {
          ecosystem: {
            type: "string",
            enum: [...REGISTRY_ECOSYSTEMS],
            description: "The package ecosystem/registry to query.",
          },
          packageName: {
            type: "string",
            description:
              "Package identifier. For Maven use 'group:artifact', for Composer use 'vendor/package', for Go use the full module path.",
          },
          currentVersion: { type: "string", description: "The currently installed version, for context." },
        },
      },
    },
  },
] as const;

export type ToolResult = { ok: boolean; content: string };

async function runSearch(args: unknown, ctx: ToolContext): Promise<ToolResult> {
  const parsed = querySpecSchema.safeParse(args ?? {});
  if (!parsed.success) {
    return { ok: false, content: JSON.stringify({ error: "Invalid search arguments." }) };
  }
  const spec = parsed.data;
  const specWhere = buildWhereFromSpec(spec);
  const wall = visibilityWhere(ctx);
  const where: Prisma.VulnerabilityWhereInput = wall ? { AND: [specWhere, wall] } : specWhere;
  const take = Math.min(spec.limit ?? MAX_TOOL_ROWS, MAX_TOOL_ROWS);

  const [rows, total] = await Promise.all([
    prisma.vulnerability.findMany({
      where,
      orderBy: buildOrderBy(spec),
      take,
      select: {
        id: true,
        cve: true,
        name: true,
        risk: true,
        cvssScore: true,
        status: true,
        scannerType: true,
        host: true,
        packageName: true,
        installedVersion: true,
        solution: true,
        remediation: true,
        pluginId: true,
        lastSeenAt: true,
      },
    }),
    prisma.vulnerability.count({ where }),
  ]);

  return {
    ok: true,
    content: JSON.stringify({
      total,
      returned: rows.length,
      truncated: total > rows.length,
      items: rows.map(trimRow),
    }),
  };
}

async function runVersionLookup(args: unknown): Promise<ToolResult> {
  const a = (args ?? {}) as { ecosystem?: unknown; packageName?: unknown };
  if (typeof a.ecosystem !== "string" || typeof a.packageName !== "string") {
    return { ok: false, content: JSON.stringify({ error: "ecosystem and packageName are required." }) };
  }
  const result = await getLatestVersion(a.ecosystem, a.packageName);
  return { ok: !result.error, content: JSON.stringify(result) };
}

/** A single finding's context, used to scope a chat to one specific issue. */
export type FocusContext = {
  id: string;
  cve: string | null;
  name: string | null;
  risk: string;
  cvss: number | null;
  status: string;
  scanner: string;
  host: string;
  package: string | null;
  installedVersion: string | null;
  synopsis: string | null;
  description: string | null;
  solution: string | null;
  internetFacing: boolean;
};

/**
 * Fetch a single finding by id for a "focused" chat, re-applying the caller's
 * group-visibility wall. Returns `null` when the id is unknown or the caller is
 * not permitted to see it — so a client can never pin the assistant to a finding
 * outside its RBAC scope. The context is built server-side from the database
 * rather than trusting anything the client sends.
 */
export async function getFocusContext(id: string, ctx: ToolContext): Promise<FocusContext | null> {
  const wall = visibilityWhere(ctx);
  const where: Prisma.VulnerabilityWhereInput = wall ? { AND: [{ id }, wall] } : { id };
  const row = await prisma.vulnerability.findFirst({
    where,
    select: {
      id: true,
      cve: true,
      name: true,
      risk: true,
      cvssScore: true,
      status: true,
      scannerType: true,
      host: true,
      packageName: true,
      installedVersion: true,
      synopsis: true,
      description: true,
      solution: true,
      remediation: true,
      pluginId: true,
    },
  });
  if (!row) return null;
  return {
    id: row.id,
    cve: row.cve,
    name: truncate(row.name, 200),
    risk: row.risk,
    cvss: row.cvssScore,
    status: row.status,
    scanner: row.scannerType,
    host: row.host,
    package: row.packageName,
    installedVersion: row.installedVersion,
    synopsis: truncate(row.synopsis, 400),
    description: truncate(row.description, 1200),
    solution: truncate(row.solution ?? row.remediation, 600),
    internetFacing: /^PT/i.test(row.pluginId),
  };
}

/** Dispatch a tool call by name. Unknown tools return a structured error. */
export async function executeTool(name: string, args: unknown, ctx: ToolContext): Promise<ToolResult> {
  switch (name) {
    case "search_vulnerabilities":
      return runSearch(args, ctx);
    case "get_latest_version":
      return runVersionLookup(args);
    default:
      return { ok: false, content: JSON.stringify({ error: `Unknown tool "${name}".` }) };
  }
}
