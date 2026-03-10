import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/rbac";
import { enforceRateLimit } from "@/lib/rate-limit";
import { Risk, VulnerabilityStatus } from "@prisma/client";
import type { NextRequest } from "next/server";

export async function GET(request: NextRequest) {
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
    const items = await prisma.vulnerability.findMany({
      where: ids ? { id: { in: ids } } : {
        name: gName,
        host: gHost,
        port: gPort,
        pluginId: gPluginId,
        siteId: siteId ?? undefined, // Keep site context if provided
      },
      include: { site: true, assignee: true },
      orderBy: { lastSeenAt: 'desc' }
    });
    return NextResponse.json({ items });
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

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";

    // 1. Get total number of unique groups
    const countResults = await prisma.$queryRawUnsafe<{ count: number }[]>(`
      SELECT count(*)::int as count FROM (
        SELECT DISTINCT ON (name, host, port, "pluginId") id
        FROM "Vulnerability"
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
        FROM "Vulnerability"
        ${whereClause}
        ORDER BY name, host, port, "pluginId", risk ASC, "lastSeenAt" DESC
      ) as grouped
      ORDER BY risk ASC, "lastSeenAt" DESC
      LIMIT $${valIdx++} OFFSET $${valIdx++}
    `, ...values, pageSize, skip);

    // Hydrate the items with assignee info (since group by loses relations)
    const hydratedItems = await Promise.all(items.map(async (item: Record<string, unknown>) => {
      if (item.assigneeId) {
        const assignee = await prisma.user.findUnique({ where: { id: item.assigneeId as string } });
        return { ...item, assignee };
      }
      return item;
    }));

    return NextResponse.json({ total: count, items: hydratedItems, page, pageSize });
  }

  const where = {
    ...(siteId ? { siteId } : {}),
    ...(status ? { status: status as VulnerabilityStatus } : {}),
    ...(risk ? { risk: risk as Risk } : {}),
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

  const [total, items] = await prisma.$transaction([
    prisma.vulnerability.count({ where }),
    prisma.vulnerability.findMany({
      where,
      include: { site: true, assignee: true },
      orderBy: [{ risk: "asc" }, { lastSeenAt: "desc" }],
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
  ]);

  return NextResponse.json({ total, items, page, pageSize });
}
