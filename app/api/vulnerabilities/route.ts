import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/rbac";
import { enforceRateLimit } from "@/lib/rate-limit";
import { Risk, VulnerabilityStatus } from "@prisma/client";
import type { NextRequest } from "next/server";

type VulnerabilityScope = "active" | "archived";

function normalizeScope(value: string | null): VulnerabilityScope {
  return value === "archived" ? "archived" : "active";
}

function parseDateParam(value: string | null, endOfDay = false) {
  if (!value) return undefined;

  const normalized = endOfDay ? `${value}T23:59:59.999Z` : `${value}T00:00:00.000Z`;
  const parsed = new Date(normalized);
  if (Number.isNaN(parsed.getTime())) {
    return undefined;
  }

  return parsed;
}

function mapHistoryItem(item: any) {
  return {
    ...item,
    askForHelp: false,
    collaborators: [],
    recordScope: "archived" as const,
  };
}

function mapActiveItem<T>(item: T) {
  return {
    ...item,
    recordScope: "active" as const,
  };
}

export async function GET(request: NextRequest) {
  try {
    const rate = await enforceRateLimit(request);
    if (!rate.allowed) {
      return NextResponse.json({ error: "Too many requests" }, { status: 429 });
    }

    await requireUser();
    const { searchParams } = new URL(request.url);
  const siteId = searchParams.get("siteId") ?? undefined;
  const status = searchParams.get("status") ?? undefined;
  const risk = searchParams.get("risk") ?? undefined;
  const query = searchParams.get("q") ?? undefined;
  const assigneeId = searchParams.get("assigneeId") ?? undefined;
  const scope = normalizeScope(searchParams.get("scope"));
  const isArchivedScope = scope === "archived";
  const archivedFrom = isArchivedScope ? parseDateParam(searchParams.get("archivedFrom")) : undefined;
  const archivedTo = isArchivedScope ? parseDateParam(searchParams.get("archivedTo"), true) : undefined;
  const fold = searchParams.get("fold") === "true";
  const ids = searchParams.get("ids")?.split(",") ?? undefined;

  // For expansion: fetch all members of a group by its attributes
  const gName = searchParams.get("gName") ?? undefined;
  const gHost = searchParams.get("gHost") ?? undefined;
  const gPort = searchParams.get("gPort") ?? undefined;
  const gPluginId = searchParams.get("gPluginId") ?? undefined;

  const page = Math.max(1, parseInt(searchParams.get("page") ?? "1") || 1);
  const pageSize = Math.max(1, Math.min(100, parseInt(searchParams.get("pageSize") ?? "25") || 25));

  if (ids || (gName && gHost && gPort && gPluginId)) {
    const activeWhere = ids ? { id: { in: ids } } : {
      name: gName,
      host: gHost,
      port: gPort,
      pluginId: gPluginId,
      siteId: siteId ?? undefined,
    };

    const items = isArchivedScope
      ? await prisma.vulnerabilityHistory.findMany({
        where: activeWhere,
        include: { site: true, assignee: true },
        orderBy: { lastSeenAt: "desc" },
      })
      : await prisma.vulnerability.findMany({
        where: activeWhere,
        include: { site: true, assignee: true, collaborators: { select: { id: true, name: true } } },
        orderBy: { lastSeenAt: "desc" },
      });

    const scopedItems = isArchivedScope ? items.map(mapHistoryItem) : items.map(mapActiveItem);
    return NextResponse.json({ items: scopedItems, scope });
  }

  if (fold) {
    // For folding, we use raw SQL to handle grouping and pagination correctly
    // We group by name, host, port, and pluginId using DISTINCT ON
    const skip = (page - 1) * pageSize;

    // Build conditions for raw SQL
    const conditions: string[] = [];
    const values: (string | number)[] = [];
    let valIdx = 1;

    if (siteId) {
      conditions.push(`"siteId" = $${valIdx++}::uuid`);
      values.push(siteId);
    }
    if (status) {
      conditions.push(`"status"::text = $${valIdx++}`);
      values.push(status);
    }
    if (risk) {
      conditions.push(`"risk"::text = $${valIdx++}`);
      values.push(risk);
    }
    if (assigneeId) {
      if (assigneeId === "unassigned") {
        conditions.push(`"assigneeId" IS NULL`);
      } else {
        conditions.push(`"assigneeId" = $${valIdx++}::uuid`);
        values.push(assigneeId);
      }
    }
    if (query) {
      conditions.push(`(name ILIKE $${valIdx} OR host ILIKE $${valIdx} OR "pluginId" ILIKE $${valIdx} OR cve ILIKE $${valIdx})`);
      values.push(`%${query}%`);
      valIdx++;
    }
    if (archivedFrom) {
      conditions.push(`"archivedAt" >= $${valIdx++}::timestamp`);
      values.push(archivedFrom.toISOString());
    }
    if (archivedTo) {
      conditions.push(`"archivedAt" <= $${valIdx++}::timestamp`);
      values.push(archivedTo.toISOString());
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";

    // 1. Get total number of unique groups
    const sourceTable = isArchivedScope ? '"VulnerabilityHistory"' : '"Vulnerability"';

    const countResults = await prisma.$queryRawUnsafe<{ count: number }[]>(`
      SELECT count(*)::int as count FROM (
        SELECT DISTINCT ON (name, host, port, "pluginId") id
        FROM ${sourceTable}
        ${whereClause}
      ) as groups
    `, ...values);
    const count = countResults[0]?.count ?? 0;

    // 2. Get the representative row for each group with groupCount and groupIds
    const items = await prisma.$queryRawUnsafe<Record<string, unknown>[]>(`
      SELECT * FROM (
        SELECT DISTINCT ON (name, host, port, "pluginId") 
          *,
          COUNT(*) OVER (PARTITION BY name, host, port, "pluginId")::int as "groupCount",
          STRING_AGG(id::text, ',') OVER (PARTITION BY name, host, port, "pluginId") as "groupIds",
          STRING_AGG(COALESCE(cve, ''), ', ') OVER (PARTITION BY name, host, port, "pluginId") as "groupCves"
        FROM ${sourceTable}
        ${whereClause}
        ORDER BY name, host, port, "pluginId", risk ASC, "lastSeenAt" DESC
      ) as grouped
      ORDER BY risk ASC, "lastSeenAt" DESC
      LIMIT $${valIdx++} OFFSET $${valIdx++}
    `, ...values, pageSize, skip);

    // Hydrate the items with assignee info (since group by loses relations)
    const hydratedItems = await Promise.all(items.map(async (item: Record<string, unknown>) => {
      if (isArchivedScope) {
        const vulnWithRelations = await prisma.vulnerabilityHistory.findUnique({
          where: { id: item.id as string },
          include: {
            assignee: { select: { id: true, name: true } },
            site: true,
          }
        });
        // vulnWithRelations can be null if the record was removed between the raw query and now.
        return mapHistoryItem({ ...(item as Record<string, unknown>), ...(vulnWithRelations ?? {}) });
      }

      const vulnWithRelations = await prisma.vulnerability.findUnique({
        where: { id: item.id as string },
        include: {
          assignee: { select: { id: true, name: true } },
          collaborators: { select: { id: true, name: true } },
          site: true,
        }
      });
      return mapActiveItem({ ...(item as Record<string, unknown>), ...(vulnWithRelations ?? {}) });
    }));

    return NextResponse.json({ total: count, items: hydratedItems, page, pageSize, scope });
  }

  const where = {
    ...(siteId ? { siteId } : {}),
    ...(status ? { status: status as VulnerabilityStatus } : {}),
    ...(risk ? { risk: risk as Risk } : {}),
    ...(isArchivedScope && (archivedFrom || archivedTo)
      ? {
        archivedAt: {
          ...(archivedFrom ? { gte: archivedFrom } : {}),
          ...(archivedTo ? { lte: archivedTo } : {}),
        },
      }
      : {}),
    ...(assigneeId
      ? {
        assigneeId: assigneeId === "unassigned" ? null : assigneeId,
      }
      : {}),
    ...(query
      ? {
        OR: [
          { name: { contains: query, mode: "insensitive" as const } },
          { host: { contains: query, mode: "insensitive" as const } },
          { pluginId: { contains: query, mode: "insensitive" as const } },
          { cve: { contains: query, mode: "insensitive" as const } },
        ],
      }
      : {}),
  };

  if (isArchivedScope) {
    const [total, items] = await prisma.$transaction([
      prisma.vulnerabilityHistory.count({ where }),
      prisma.vulnerabilityHistory.findMany({
        where,
        include: { site: true, assignee: true },
        orderBy: [{ risk: "asc" }, { lastSeenAt: "desc" }],
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
    ]);

    return NextResponse.json({ total, items: items.map(mapHistoryItem), page, pageSize, scope });
  }

    const [total, items] = await prisma.$transaction([
      prisma.vulnerability.count({ where }),
      prisma.vulnerability.findMany({
        where,
        include: { site: true, assignee: true, collaborators: { select: { id: true, name: true } } },
        orderBy: [{ risk: "asc" }, { lastSeenAt: "desc" }],
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
    ]);

    return NextResponse.json({ total, items: items.map(mapActiveItem), page, pageSize, scope });
  } catch (err) {
    // Log the error server-side and return details to the client for debugging in dev
    console.error("/api/vulnerabilities error:", err);
    const message = err instanceof Error ? err.message : String(err);
    const stack = err instanceof Error ? err.stack : undefined;
    return NextResponse.json({ error: message, stack }, { status: 500 });
  }
}
