import { createHash } from "crypto";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { redis } from "@/lib/redis";
import { buildWhereFromSpec } from "@/lib/ai/insights";
import { assertSpecIsCoherent, MAX_WIDGET_ROWS, type WidgetSpec } from "@/lib/dashboards/spec";

/** RBAC context a widget executes under — always the *viewer*, never the author. */
export type WidgetContext = {
  userId: string;
  isAdmin: boolean;
  memberOf: string[];
};

export type WidgetData = {
  /** Single number for `stat` widgets, otherwise the total across rows. */
  total: number;
  rows: { label: string; value: number }[];
  truncated: boolean;
};

const CACHE_TTL_SECONDS = 60;

/** Group-visibility wall — identical semantics to app/api/vulnerabilities/route.ts. */
function visibilityWhere(ctx: WidgetContext): Prisma.VulnerabilityWhereInput | undefined {
  if (ctx.isAdmin) return undefined;
  return {
    OR: [{ groupId: null }, ...(ctx.memberOf.length > 0 ? [{ groupId: { in: ctx.memberOf } }] : [])],
  };
}

/** Cache key includes the viewer's scope so results can never cross RBAC boundaries. */
function cacheKey(spec: WidgetSpec, ctx: WidgetContext) {
  const scope = ctx.isAdmin ? "admin" : [...ctx.memberOf].sort().join(",");
  const hash = createHash("sha256").update(JSON.stringify({ spec, scope })).digest("hex").slice(0, 32);
  return `dashboard:widget:${hash}`;
}

function monthBuckets(months: number) {
  const now = new Date();
  return Array.from({ length: months }, (_, index) => {
    const start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - (months - 1 - index), 1));
    const end = new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth() + 1, 1));
    return {
      label: start.toLocaleDateString("en-GB", { month: "short", year: "2-digit", timeZone: "UTC" }),
      start,
      end,
    };
  });
}

function toRows(counts: Map<string, number>, limit: number): WidgetData {
  const sorted = [...counts.entries()].sort((a, b) => b[1] - a[1]);
  const capped = Math.min(limit, MAX_WIDGET_ROWS);
  return {
    total: sorted.reduce((sum, [, value]) => sum + value, 0),
    rows: sorted.slice(0, capped).map(([label, value]) => ({ label, value })),
    truncated: sorted.length > capped,
  };
}

async function executeVulnerabilities(spec: WidgetSpec, ctx: WidgetContext): Promise<WidgetData> {
  const filters = spec.filters ? buildWhereFromSpec({ ...spec.filters }) : {};
  const wall = visibilityWhere(ctx);
  const where: Prisma.VulnerabilityWhereInput = wall ? { AND: [filters, wall] } : filters;

  if (!spec.groupBy) {
    if (spec.metric === "avgCvss") {
      const result = await prisma.vulnerability.aggregate({ where, _avg: { cvssScore: true } });
      return { total: Math.round((result._avg.cvssScore ?? 0) * 10) / 10, rows: [], truncated: false };
    }
    return { total: await prisma.vulnerability.count({ where }), rows: [], truncated: false };
  }

  if (spec.groupBy === "month") {
    const buckets = monthBuckets(spec.months);
    const rows = await Promise.all(
      buckets.map(async (bucket) => ({
        label: bucket.label,
        value: await prisma.vulnerability.count({
          where: { AND: [where, { createdAt: { gte: bucket.start, lt: bucket.end } }] },
        }),
      }))
    );
    return { total: rows.reduce((sum, row) => sum + row.value, 0), rows, truncated: false };
  }

  const field = (
    {
      risk: "risk",
      status: "status",
      scanner: "scannerType",
      site: "siteId",
      assignee: "assigneeId",
      group: "groupId",
    } as const
  )[spec.groupBy as "risk" | "status" | "scanner" | "site" | "assignee" | "group"];

  const grouped = await prisma.vulnerability.groupBy({
    by: [field],
    where,
    _count: { _all: true },
    // Prisma rejects the key entirely when the value is undefined.
    ...(spec.metric === "avgCvss" ? { _avg: { cvssScore: true } } : {}),
  });

  const labels = await resolveLabels(field, grouped.map((row) => row[field] as string | null));
  const counts = new Map<string, number>();
  for (const row of grouped) {
    const key = labels.get((row[field] as string | null) ?? "") ?? "Unassigned";
    const value =
      spec.metric === "avgCvss"
        ? Math.round(((row as { _avg?: { cvssScore: number | null } })._avg?.cvssScore ?? 0) * 10) / 10
        : row._count._all;
    counts.set(key, (counts.get(key) ?? 0) + value);
  }
  return toRows(counts, spec.limit);
}

/** Turn foreign keys into display names in a single round trip per field. */
async function resolveLabels(field: string, ids: (string | null)[]): Promise<Map<string, string>> {
  const map = new Map<string, string>();
  map.set("", "Unassigned");

  const present = ids.filter((id): id is string => Boolean(id));
  if (present.length === 0 || !["siteId", "assigneeId", "groupId"].includes(field)) {
    ids.forEach((id) => map.set(id ?? "", id ?? "Unassigned"));
    return map;
  }

  if (field === "siteId") {
    const sites = await prisma.site.findMany({ where: { id: { in: present } }, select: { id: true, name: true } });
    sites.forEach((site) => map.set(site.id, site.name));
  } else if (field === "assigneeId") {
    const users = await prisma.user.findMany({ where: { id: { in: present } }, select: { id: true, name: true } });
    users.forEach((user) => map.set(user.id, user.name));
  } else {
    const groups = await prisma.group.findMany({ where: { id: { in: present } }, select: { id: true, name: true } });
    groups.forEach((group) => map.set(group.id, group.name));
  }
  return map;
}

async function executeThreatActors(spec: WidgetSpec): Promise<WidgetData> {
  const actors = await prisma.threatActor.findMany({
    select: {
      actorType: true,
      origin: true,
      tactics: true,
      targetSectors: true,
      targetRegions: true,
      targetTechnologies: true,
    },
  });

  if (!spec.groupBy) {
    return { total: actors.length, rows: [], truncated: false };
  }

  const counts = new Map<string, number>();
  for (const actor of actors) {
    const values: string[] =
      spec.groupBy === "actorType"
        ? [actor.actorType ?? "Unattributed"]
        : spec.groupBy === "origin"
          ? [actor.origin ?? "Unattributed"]
          : spec.groupBy === "tactic"
            ? actor.tactics
            : spec.groupBy === "sector"
              ? actor.targetSectors
              : spec.groupBy === "region"
                ? actor.targetRegions
                : actor.targetTechnologies;

    for (const value of values) counts.set(value, (counts.get(value) ?? 0) + 1);
  }
  return toRows(counts, spec.limit);
}

async function executeUploads(spec: WidgetSpec): Promise<WidgetData> {
  if (!spec.groupBy) {
    return { total: await prisma.uploadHistory.count(), rows: [], truncated: false };
  }

  if (spec.groupBy === "month") {
    const buckets = monthBuckets(spec.months);
    const rows = await Promise.all(
      buckets.map(async (bucket) => ({
        label: bucket.label,
        value: await prisma.uploadHistory.count({ where: { uploadDate: { gte: bucket.start, lt: bucket.end } } }),
      }))
    );
    return { total: rows.reduce((sum, row) => sum + row.value, 0), rows, truncated: false };
  }

  const field = spec.groupBy === "site" ? "siteId" : "status";
  const grouped = await prisma.uploadHistory.groupBy({ by: [field], _count: { _all: true } });
  const labels = await resolveLabels(field, grouped.map((row) => row[field] as string | null));

  const counts = new Map<string, number>();
  for (const row of grouped) {
    const key = labels.get((row[field] as string | null) ?? "") ?? "Unknown";
    counts.set(key, (counts.get(key) ?? 0) + row._count._all);
  }
  return toRows(counts, spec.limit);
}

/**
 * Runs a widget spec for a specific viewer. Results are cached briefly per
 * (spec, viewer scope) — never stored on the widget itself.
 */
export async function executeWidgetSpec(spec: WidgetSpec, ctx: WidgetContext): Promise<WidgetData> {
  assertSpecIsCoherent(spec);

  const key = cacheKey(spec, ctx);
  try {
    const cached = await redis.get(key);
    if (cached) return JSON.parse(cached) as WidgetData;
  } catch {
    // Cache is best-effort; fall through to a live query.
  }

  const data =
    spec.source === "threatActors"
      ? await executeThreatActors(spec)
      : spec.source === "uploads"
        ? await executeUploads(spec)
        : await executeVulnerabilities(spec, ctx);

  try {
    await redis.set(key, JSON.stringify(data), "EX", CACHE_TTL_SECONDS);
  } catch {
    // Ignore cache write failures.
  }

  return data;
}
