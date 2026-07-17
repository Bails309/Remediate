import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireUser, WEB_APP_ADMIN_ROLES } from "@/lib/rbac";
import { getGroupContext } from "@/lib/group-rbac";
import { enforceRateLimit } from "@/lib/rate-limit";
import { Risk, VulnerabilityStatus } from "@prisma/client";

const ALL_STATUSES = Object.values(VulnerabilityStatus) as VulnerabilityStatus[];

/**
 * Severity breakdown for the "Remediation Command Centre" pie chart.
 *
 * Intentionally narrow: this powers the at-a-glance donut that appears when
 * a user filters to their own assignments. It returns the count of items per
 * risk level for the caller's currently-visible queue, respecting the same
 * group-membership visibility wall used by `GET /api/vulnerabilities`.
 *
 * Query params:
 *   - scope=active|archived  (defaults to "active")
 *   - assigneeId=<uuid>|"unassigned"  (optional; typically the caller's own id)
 *   - statuses=Open,InProgress,...  (optional; comma-separated whitelist of
 *     VulnerabilityStatus values. Unknown values are ignored. If omitted or
 *     empty after validation, all statuses are included.)
 *
 * Deliberately does NOT accept a `risk` filter — the chart *is* the risk
 * breakdown and must show all buckets to be meaningful.
 */
export async function GET(request: NextRequest) {
  try {
    const rate = await enforceRateLimit(request);
    if (!rate.allowed) {
      return NextResponse.json({ error: "Too many requests" }, { status: 429 });
    }

    const session = await requireUser();
    const userId = session.user.id!;
    const isAdmin = (session.user.roles || []).some((r) =>
      (WEB_APP_ADMIN_ROLES as readonly string[]).includes(r),
    );
    const ctx = await getGroupContext(userId);

    const { searchParams } = new URL(request.url);
    const scope = searchParams.get("scope") === "archived" ? "archived" : "active";
    const assigneeParam = searchParams.get("assigneeId");
    const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

    const assigneeFilter =
      assigneeParam === "unassigned"
        ? { assigneeId: null }
        : assigneeParam && UUID_RE.test(assigneeParam)
          ? { assigneeId: assigneeParam }
          : {};

    // Whitelist of statuses to include. Validated against the enum so a caller
    // cannot inject arbitrary strings into the Prisma `in` clause.
    const statusesParam = searchParams.get("statuses");
    const requestedStatuses = statusesParam
      ? statusesParam
          .split(",")
          .map((s) => s.trim())
          .filter((s): s is VulnerabilityStatus =>
            (ALL_STATUSES as string[]).includes(s),
          )
      : [];
    const statusFilter =
      requestedStatuses.length > 0 && requestedStatuses.length < ALL_STATUSES.length
        ? { status: { in: requestedStatuses } }
        : {};

    const visibilityWhere = isAdmin
      ? {}
      : {
          OR: [
            { groupId: null },
            ...(ctx.memberOf.length > 0 ? [{ groupId: { in: ctx.memberOf } }] : []),
          ],
        };

    const where = {
      ...assigneeFilter,
      ...statusFilter,
      ...visibilityWhere,
    };

    const groupBy =
      scope === "archived"
        ? await prisma.vulnerabilityHistory.groupBy({
            by: ["risk"],
            where,
            _count: { _all: true },
          })
        : await prisma.vulnerability.groupBy({
            by: ["risk"],
            where,
            _count: { _all: true },
          });

    // Ensure every risk bucket is represented, even when count is zero, so the
    // chart legend stays stable across renders.
    const counts: Record<Risk, number> = {
      Critical: 0,
      High: 0,
      Medium: 0,
      Low: 0,
      None: 0,
    };
    for (const row of groupBy) {
      counts[row.risk] = row._count._all;
    }
    const total = Object.values(counts).reduce((sum, n) => sum + n, 0);

    return NextResponse.json({ counts, total, scope });
  } catch (error) {
    if (error instanceof Response) return error;
    console.error("severity-summary error", error);
    return NextResponse.json({ error: "Failed to load severity summary" }, { status: 500 });
  }
}
