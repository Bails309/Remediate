import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireUser, WEB_APP_ADMIN_ROLES } from "@/lib/rbac";
import { getGroupContext } from "@/lib/group-rbac";
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

function mapHistoryItem(item: Record<string, unknown>) {
  return {
    ...item,
    askForHelp: false,
    collaborators: [],
    recordScope: "archived" as const,
  };
}

function mapActiveItem<T>(item: T) {
  const raw = item as Record<string, unknown>;
  const count = raw._count as { comments?: number } | undefined;
  return {
    ...item,
    commentCount: count?.comments ?? 0,
    recordScope: "active" as const,
  };
}

export async function GET(request: NextRequest) {
  try {
    const rate = await enforceRateLimit(request);
    if (!rate.allowed) {
      return NextResponse.json({ error: "Too many requests" }, { status: 429 });
    }

    const session = await requireUser();
    const userId = session.user.id!;
    const isAdmin = (session.user.roles || []).some((r) =>
      (WEB_APP_ADMIN_ROLES as readonly string[]).includes(r)
    );
    const ctx = await getGroupContext(userId);

    const { searchParams } = new URL(request.url);
  const siteId = searchParams.get("siteId") ?? undefined;
  // Multi-select bucket filter: ?siteIds=uuid1,uuid2 (UUIDs only; invalid values silently dropped)
  const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  const siteIdsParam = searchParams.get("siteIds");
  const siteIdsList = siteIdsParam
    ? siteIdsParam.split(",").map((s) => s.trim()).filter((s) => UUID_RE.test(s))
    : [];
  const status = searchParams.get("status") ?? undefined;
  const risk = searchParams.get("risk") ?? undefined;
  const query = searchParams.get("q") ?? undefined;
  const assigneeId = searchParams.get("assigneeId") ?? undefined;

  // Group filter: ?groupIds=uuid1,uuid2  (or the keyword "unassigned" to include items with no group).
  // Non-admins can only filter by groups they belong to; values outside their membership are dropped.
  const groupIdsParam = searchParams.get("groupIds");
  const rawGroupTokens = groupIdsParam
    ? groupIdsParam.split(",").map((s) => s.trim()).filter(Boolean)
    : [];
  const wantsUngrouped = rawGroupTokens.includes("unassigned") || rawGroupTokens.includes("none");
  const requestedGroupIds = rawGroupTokens.filter((t) => UUID_RE.test(t));
  const allowedGroupIds = isAdmin
    ? requestedGroupIds
    : requestedGroupIds.filter((g) => ctx.memberOf.includes(g));
  const hasExplicitGroupFilter = wantsUngrouped || allowedGroupIds.length > 0;

  const scope = normalizeScope(searchParams.get("scope"));
  const isArchivedScope = scope === "archived";
  const archivedFrom = isArchivedScope ? parseDateParam(searchParams.get("archivedFrom")) : undefined;
  const archivedTo = isArchivedScope ? parseDateParam(searchParams.get("archivedTo"), true) : undefined;
  const fold = searchParams.get("fold") === "true";
  const id = searchParams.get("id");
  const ids = searchParams.get("ids")?.split(",") ?? (id ? [id] : undefined);

  // For expansion: fetch all members of a group by its attributes
  const gName = searchParams.get("gName") ?? undefined;
  const gHost = searchParams.get("gHost") ?? undefined;
  const gPort = searchParams.get("gPort") ?? undefined;
  const gPluginId = searchParams.get("gPluginId") ?? undefined;

  const page = Math.max(1, Math.min(10000, parseInt(searchParams.get("page") ?? "1") || 1));
  const pageSize = Math.max(1, Math.min(100, parseInt(searchParams.get("pageSize") ?? "25") || 25));

  // --- Group visibility wall (Prisma where fragment) ---
  // Admins see everything. Everyone else sees vulns that either have NO group, or are in
  // a group they belong to.
  const visibilityWhere: Record<string, unknown> | undefined = isAdmin
    ? undefined
    : {
        OR: [
          { groupId: null },
          ...(ctx.memberOf.length > 0 ? [{ groupId: { in: ctx.memberOf } }] : []),
        ],
      };

  // --- Explicit group filter from the UI multi-select ---
  const groupFilterWhere: Record<string, unknown> | undefined = hasExplicitGroupFilter
    ? (() => {
        if (allowedGroupIds.length > 0 && wantsUngrouped) {
          return { OR: [{ groupId: null }, { groupId: { in: allowedGroupIds } }] };
        }
        if (allowedGroupIds.length > 0) {
          return { groupId: { in: allowedGroupIds } };
        }
        return { groupId: null };
      })()
    : undefined;

  const mergeAnd = (...clauses: Array<Record<string, unknown> | undefined>) => {
    const present = clauses.filter((c): c is Record<string, unknown> => Boolean(c));
    if (present.length === 0) return {};
    if (present.length === 1) return present[0];
    return { AND: present };
  };

  if (ids || (gName && gHost && gPort && gPluginId)) {
    const baseWhere = ids ? { id: { in: ids } } : {
      name: gName,
      host: gHost,
      port: gPort,
      pluginId: gPluginId,
      siteId: siteId ?? undefined,
    };
    const activeWhere = mergeAnd(baseWhere, visibilityWhere);

    const items = isArchivedScope
      ? await prisma.vulnerabilityHistory.findMany({
        where: activeWhere,
        include: { site: true, assignee: true, group: { select: { id: true, name: true } } },
        orderBy: { lastSeenAt: "desc" },
      })
      : await prisma.vulnerability.findMany({
        where: activeWhere,
        include: { site: true, assignee: true, group: { select: { id: true, name: true } }, collaborators: { select: { id: true, name: true } }, _count: { select: { comments: true } } },
        orderBy: { lastSeenAt: "desc" },
      });

    const scopedItems = isArchivedScope ? items.map(mapHistoryItem) : items.map(mapActiveItem);
    return NextResponse.json({ 
      items: scopedItems, 
      total: scopedItems.length,
      scope 
    });
  }

  if (fold) {
    // For folding, we use raw SQL to handle grouping and pagination correctly
    // We group by name, host, port, and pluginId using DISTINCT ON
    const skip = (page - 1) * pageSize;

    // Build conditions for raw SQL
    const conditions: string[] = [];
    const values: (string | number)[] = [];
    let valIdx = 1;

    if (siteIdsList.length > 0) {
      const placeholders = siteIdsList.map(() => `$${valIdx++}::uuid`).join(", ");
      conditions.push(`"siteId" IN (${placeholders})`);
      values.push(...siteIdsList);
    } else if (siteId) {
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
      const escapedQuery = query.replace(/[%_\\]/g, '\\$&');
      conditions.push(`(name ILIKE $${valIdx} ESCAPE '\\' OR host ILIKE $${valIdx} ESCAPE '\\' OR "pluginId" ILIKE $${valIdx} ESCAPE '\\' OR cve ILIKE $${valIdx} ESCAPE '\\')`);
      values.push(`%${escapedQuery}%`);
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

    // Group visibility wall (raw-SQL twin of the Prisma fragment above).
    if (!isAdmin) {
      if (ctx.memberOf.length > 0) {
        const memberPlaceholders = ctx.memberOf.map(() => `$${valIdx++}::uuid`).join(", ");
        conditions.push(`("groupId" IS NULL OR "groupId" IN (${memberPlaceholders}))`);
        values.push(...ctx.memberOf);
      } else {
        conditions.push(`"groupId" IS NULL`);
      }
    }

    // Explicit group filter from the UI.
    if (allowedGroupIds.length > 0 && wantsUngrouped) {
      const gp = allowedGroupIds.map(() => `$${valIdx++}::uuid`).join(", ");
      conditions.push(`("groupId" IS NULL OR "groupId" IN (${gp}))`);
      values.push(...allowedGroupIds);
    } else if (allowedGroupIds.length > 0) {
      const gp = allowedGroupIds.map(() => `$${valIdx++}::uuid`).join(", ");
      conditions.push(`"groupId" IN (${gp})`);
      values.push(...allowedGroupIds);
    } else if (wantsUngrouped) {
      conditions.push(`"groupId" IS NULL`);
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
            group: { select: { id: true, name: true } },
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
          group: { select: { id: true, name: true } },
          collaborators: { select: { id: true, name: true } },
          site: true,
          _count: { select: { comments: true } },
        }
      });
      return mapActiveItem({ ...(item as Record<string, unknown>), ...(vulnWithRelations ?? {}) });
    }));

    return NextResponse.json({ total: count, items: hydratedItems, page, pageSize, scope });
  }

  const baseWhere = {
    ...(siteIdsList.length > 0
      ? { siteId: { in: siteIdsList } }
      : siteId
        ? { siteId }
        : {}),
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
  const where = mergeAnd(baseWhere, visibilityWhere, groupFilterWhere);

  if (isArchivedScope) {
    const [total, items] = await prisma.$transaction([
      prisma.vulnerabilityHistory.count({ where }),
      prisma.vulnerabilityHistory.findMany({
        where,
        include: { site: true, assignee: true, group: { select: { id: true, name: true } } },
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
        include: { site: true, assignee: true, group: { select: { id: true, name: true } }, collaborators: { select: { id: true, name: true } }, _count: { select: { comments: true } } },
        orderBy: [{ risk: "asc" }, { lastSeenAt: "desc" }],
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
    ]);

    return NextResponse.json({ total, items: items.map(mapActiveItem), page, pageSize, scope });
  } catch (err) {
    console.error("/api/vulnerabilities error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
