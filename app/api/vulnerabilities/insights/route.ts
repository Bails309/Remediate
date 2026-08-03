import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { z } from "zod";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { requireUser, WEB_APP_ADMIN_ROLES } from "@/lib/rbac";
import { getGroupContext } from "@/lib/group-rbac";
import { enforceRateLimit } from "@/lib/rate-limit";
import { writeAuditLog } from "@/lib/audit-log";
import { getAiConfig } from "@/lib/ai/config";
import { planQuery, buildWhereFromSpec, buildOrderBy, AiPlanError } from "@/lib/ai/insights";
import { AiProviderError } from "@/lib/ai/provider";

const bodySchema = z.object({
  question: z.string().trim().min(3).max(500),
});

const INCLUDE = {
  site: true,
  assignee: true,
  group: { select: { id: true, name: true } },
  collaborators: { select: { id: true, name: true } },
  _count: { select: { comments: true } },
} satisfies Prisma.VulnerabilityInclude;

function mapActiveItem(item: Record<string, unknown>) {
  const count = item._count as { comments?: number } | undefined;
  return { ...item, commentCount: count?.comments ?? 0, recordScope: "active" as const };
}

/** Group visibility wall — mirrors app/api/vulnerabilities/route.ts. */
function visibilityWhere(isAdmin: boolean, memberOf: string[]): Prisma.VulnerabilityWhereInput | undefined {
  if (isAdmin) return undefined;
  return {
    OR: [
      { groupId: null },
      ...(memberOf.length > 0 ? [{ groupId: { in: memberOf } }] : []),
    ],
  };
}

/** GET reports whether the natural-language bar should be shown. */
export async function GET(request: NextRequest) {
  const rate = await enforceRateLimit(request);
  if (!rate.allowed) {
    return NextResponse.json({ error: "Too many requests" }, { status: 429 });
  }
  await requireUser();
  const config = await getAiConfig();
  return NextResponse.json({ available: Boolean(config?.enabled) });
}

export async function POST(request: NextRequest) {
  const rate = await enforceRateLimit(request);
  if (!rate.allowed) {
    return NextResponse.json({ error: "Too many requests" }, { status: 429 });
  }

  const session = await requireUser();
  const userId = session.user.id!;
  const isAdmin = (session.user.roles || []).some((r) =>
    (WEB_APP_ADMIN_ROLES as readonly string[]).includes(r),
  );

  const config = await getAiConfig();
  if (!config || !config.enabled) {
    return NextResponse.json(
      { error: "AI insights are not configured. Ask an administrator to enable them in Settings." },
      { status: 400 },
    );
  }

  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "Please enter a question between 3 and 500 characters." }, { status: 400 });
  }

  let spec;
  try {
    spec = await planQuery(parsed.data.question, config);
  } catch (error) {
    if (error instanceof AiPlanError) {
      return NextResponse.json({ error: error.message }, { status: 422 });
    }
    if (error instanceof AiProviderError) {
      return NextResponse.json({ error: error.message }, { status: 502 });
    }
    return NextResponse.json({ error: "Failed to interpret the question." }, { status: 500 });
  }

  const ctx = await getGroupContext(userId);
  const specWhere = buildWhereFromSpec(spec);
  const wall = visibilityWhere(isAdmin, ctx.memberOf);
  const where: Prisma.VulnerabilityWhereInput = wall ? { AND: [specWhere, wall] } : specWhere;
  const take = spec.limit ?? 50;

  const items = await prisma.vulnerability.findMany({
    where,
    include: INCLUDE,
    orderBy: buildOrderBy(spec),
    take,
  });

  writeAuditLog({
    userId,
    userEmail: session.user.email!,
    action: "ai_insight_query",
    entityType: "Vulnerability",
    newValue: { question: parsed.data.question, spec },
    ipAddress:
      request.headers.get("x-real-ip") ??
      request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
      undefined,
  });

  return NextResponse.json({
    summary: spec.summary ?? null,
    spec,
    items: items.map((item) => mapActiveItem(item as unknown as Record<string, unknown>)),
    total: items.length,
    limited: items.length >= take,
  });
}
