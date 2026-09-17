import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireUser, WEB_APP_ADMIN_ROLES } from "@/lib/rbac";
import { getGroupContext } from "@/lib/group-rbac";
import { enforceRateLimit } from "@/lib/rate-limit";
import { Risk, VulnerabilityStatus } from "@prisma/client";
import { serializeVulnerabilitiesToCsv, serializeVulnerabilitiesToJson } from "@/lib/export-csv";
import { generateVulnerabilitiesPdf } from "@/lib/export-pdf";

export const dynamic = "force-dynamic";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const OUTSTANDING_STATUSES: VulnerabilityStatus[] = [
  VulnerabilityStatus.Open,
  VulnerabilityStatus.InProgress,
  VulnerabilityStatus.InProgressWithCR,
  VulnerabilityStatus.AwaitingVendor,
  VulnerabilityStatus.NoFixAvailable,
];

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
    const format = (searchParams.get("format") || "csv").toLowerCase();

    // Bucket filters
    const siteId = searchParams.get("siteId") ?? undefined;
    const siteIdsParam = searchParams.get("siteIds");
    const siteIdsList = siteIdsParam
      ? siteIdsParam.split(",").map((s) => s.trim()).filter((s) => UUID_RE.test(s))
      : [];

    // Status filter:
    // If explicitly provided, parse into valid VulnerabilityStatus enum values.
    // If "includeAllStatuses" === "true", do not filter by status (all active findings).
    // Otherwise, default to actionable/outstanding statuses.
    const statusParam = searchParams.get("status");
    const includeAllStatuses = searchParams.get("includeAllStatuses") === "true";

    let statusClause: { in: VulnerabilityStatus[] } | VulnerabilityStatus | undefined;
    if (statusParam) {
      const statuses = statusParam
        .split(",")
        .map((s) => s.trim())
        .filter((s): s is VulnerabilityStatus => Object.values(VulnerabilityStatus).includes(s as VulnerabilityStatus));
      if (statuses.length === 1) {
        statusClause = statuses[0];
      } else if (statuses.length > 1) {
        statusClause = { in: statuses };
      }
    } else if (!includeAllStatuses) {
      statusClause = { in: OUTSTANDING_STATUSES };
    }

    const risk = searchParams.get("risk") as Risk | null;
    const rawQuery = searchParams.get("q") ?? undefined;
    const queryNegated = /^[!-]/.test(rawQuery ?? "");
    const query = rawQuery ? (queryNegated ? rawQuery.slice(1) : rawQuery) : undefined;
    const assigneeId = searchParams.get("assigneeId") ?? undefined;

    // Group filter
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

    // Direct IDs filter
    const idsParam = searchParams.get("ids");
    const ids = idsParam
      ? idsParam.split(",").map((s) => s.trim()).filter((s) => UUID_RE.test(s))
      : undefined;

    // Group visibility wall
    const visibilityWhere: Record<string, unknown> | undefined = isAdmin
      ? undefined
      : {
          OR: [
            { groupId: null },
            ...(ctx.memberOf.length > 0 ? [{ groupId: { in: ctx.memberOf } }] : []),
          ],
        };

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

    const baseWhere: Record<string, unknown> = {
      ...(ids && ids.length > 0 ? { id: { in: ids } } : {}),
      ...(siteIdsList.length > 0
        ? { siteId: { in: siteIdsList } }
        : siteId && UUID_RE.test(siteId)
        ? { siteId }
        : {}),
      ...(statusClause ? { status: statusClause } : {}),
      ...(risk && Object.values(Risk).includes(risk) ? { risk } : {}),
      ...(assigneeId
        ? { assigneeId: assigneeId === "unassigned" ? null : assigneeId }
        : {}),
      ...(query
        ? {
            [queryNegated ? "NOT" : "OR"]: [
              { name: { contains: query, mode: "insensitive" as const } },
              { host: { contains: query, mode: "insensitive" as const } },
              { pluginId: { contains: query, mode: "insensitive" as const } },
              { cve: { contains: query, mode: "insensitive" as const } },
            ],
          }
        : {}),
    };

    const where = mergeAnd(baseWhere, visibilityWhere, groupFilterWhere);

    // Fetch site name for friendly filename if single siteId is filtered
    let siteName: string | undefined;
    if (siteId && UUID_RE.test(siteId)) {
      const site = await prisma.site.findUnique({
        where: { id: siteId },
        select: { name: true },
      });
      if (site) {
        siteName = site.name;
      }
    }

    const items = await prisma.vulnerability.findMany({
      where,
      include: {
        site: { select: { id: true, name: true } },
        assignee: { select: { id: true, name: true, email: true } },
        group: { select: { id: true, name: true } },
      },
      orderBy: [{ risk: "asc" }, { lastSeenAt: "desc" }],
    });

    const dateStr = new Date().toISOString().split("T")[0];
    const sanitizedSiteName = siteName ? siteName.toLowerCase().replace(/[^a-z0-9_-]/g, "-") : null;
    const baseFilename = sanitizedSiteName
      ? `remediate-${sanitizedSiteName}-outstanding-vulnerabilities-${dateStr}`
      : `remediate-outstanding-vulnerabilities-${dateStr}`;

    if (format === "pdf") {
      const pdfBuffer = await generateVulnerabilitiesPdf(items, {
        bucketName: siteName,
        filters: {
          siteId,
          siteIds: siteIdsList.length > 0 ? siteIdsList : undefined,
          status: statusParam ?? (includeAllStatuses ? "all" : "outstanding"),
          risk: risk ?? undefined,
        },
      });

      return new NextResponse(new Uint8Array(pdfBuffer), {
        status: 200,
        headers: {
          "Content-Type": "application/pdf",
          "Content-Disposition": `attachment; filename="${baseFilename}.pdf"`,
          "Cache-Control": "no-store",
        },
      });
    }

    if (format === "json") {
      const jsonContent = serializeVulnerabilitiesToJson(items, {
        bucketName: siteName,
        filters: {
          siteId,
          siteIds: siteIdsList.length > 0 ? siteIdsList : undefined,
          status: statusParam ?? (includeAllStatuses ? "all" : "outstanding"),
          risk: risk ?? undefined,
        },
      });

      return new NextResponse(jsonContent, {
        status: 200,
        headers: {
          "Content-Type": "application/json; charset=utf-8",
          "Content-Disposition": `attachment; filename="${baseFilename}.json"`,
          "Cache-Control": "no-store",
        },
      });
    }

    // Default: CSV format
    const csvContent = serializeVulnerabilitiesToCsv(items);
    return new NextResponse(csvContent, {
      status: 200,
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="${baseFilename}.csv"`,
        "Cache-Control": "no-store",
      },
    });
  } catch (error) {
    console.error("Vulnerability export error:", error);
    return NextResponse.json({ error: "Failed to export vulnerabilities" }, { status: 500 });
  }
}
