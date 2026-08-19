import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { requireUser, WEB_APP_ADMIN_ROLES, isAuditor } from "@/lib/rbac";
import { getGroupContext, canViewVulnerability, canEditVulnerability } from "@/lib/group-rbac";
import { prisma } from "@/lib/prisma";
import { enforceRateLimit } from "@/lib/rate-limit";
import { writeAuditLog } from "@/lib/audit-log";
import { getAiConfig } from "@/lib/ai/config";
import {
  generateRemediationPlan,
  RemediationPlanError,
  type PlanFinding,
} from "@/lib/ai/remediation-plan";
import { AiProviderError } from "@/lib/ai/provider";

/**
 * Generate an AI remediation package (plan, change-request draft, rollback,
 * validation and evidence pointers) for ONE finding.
 *
 * Gating: the caller must be able to see the finding (group wall) AND own the
 * work — assignee, group leader, or admin. Nothing is persisted; the plan is
 * returned to the caller and rendered in the side sheet.
 */
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const session = await requireUser();
  const userId = session.user.id!;

  const rate = await enforceRateLimit(request, userId);
  if (!rate.allowed) {
    return NextResponse.json({ error: "Too many requests" }, { status: 429 });
  }

  const config = await getAiConfig();
  if (!config || !config.enabled) {
    return NextResponse.json(
      { error: "AI is not configured. Ask an administrator to enable it in Settings." },
      { status: 400 },
    );
  }

  const vuln = await prisma.vulnerability.findUnique({
    where: { id },
    select: {
      id: true,
      assigneeId: true,
      groupId: true,
      cve: true,
      name: true,
      risk: true,
      cvssScore: true,
      status: true,
      scannerType: true,
      host: true,
      protocol: true,
      port: true,
      packageName: true,
      installedVersion: true,
      registryName: true,
      repository: true,
      imageTag: true,
      imageDigest: true,
      synopsis: true,
      description: true,
      solution: true,
      remediation: true,
      seeAlso: true,
      crNumber: true,
      pluginId: true,
      createdAt: true,
      lastSeenAt: true,
    },
  });

  const roles = (session.user.roles || []) as string[];
  const isAdmin = roles.some((r) => (WEB_APP_ADMIN_ROLES as readonly string[]).includes(r));
  const ctx = await getGroupContext(userId);

  // Don't reveal the existence of findings outside the caller's group wall.
  if (!vuln || !canViewVulnerability(isAdmin, ctx, vuln)) {
    return NextResponse.json({ error: "Vulnerability not found" }, { status: 404 });
  }

  if (isAuditor(session.user) || !canEditVulnerability(isAdmin, ctx, userId, vuln)) {
    return NextResponse.json(
      {
        error:
          "Only the assignee, a leader of the owning group, or an administrator can generate a remediation plan for this finding.",
      },
      { status: 403 },
    );
  }

  const finding: PlanFinding = {
    id: vuln.id,
    cve: vuln.cve,
    name: vuln.name,
    risk: vuln.risk,
    cvss: vuln.cvssScore,
    status: vuln.status,
    scanner: vuln.scannerType,
    host: vuln.host,
    protocol: vuln.protocol,
    port: vuln.port,
    package: vuln.packageName,
    installedVersion: vuln.installedVersion,
    registry: vuln.registryName,
    repository: vuln.repository,
    imageTag: vuln.imageTag,
    imageDigest: vuln.imageDigest,
    synopsis: vuln.synopsis,
    description: vuln.description,
    solution: vuln.solution ?? vuln.remediation,
    seeAlso: vuln.seeAlso,
    crNumber: vuln.crNumber,
    internetFacing: /^PT/i.test(vuln.pluginId),
    firstSeen: vuln.createdAt.toISOString().slice(0, 10),
    lastSeen: vuln.lastSeenAt.toISOString().slice(0, 10),
  };

  let plan;
  try {
    plan = await generateRemediationPlan(finding, config);
  } catch (error) {
    if (error instanceof RemediationPlanError || error instanceof AiProviderError) {
      return NextResponse.json({ error: error.message }, { status: 502 });
    }
    return NextResponse.json({ error: "The AI request failed." }, { status: 500 });
  }

  writeAuditLog({
    userId,
    userEmail: session.user.email!,
    action: "ai_remediation_plan",
    entityType: "Vulnerability",
    entityId: vuln.id,
    ipAddress:
      request.headers.get("x-real-ip") ??
      request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
      undefined,
  });

  return NextResponse.json({ plan, generatedAt: new Date().toISOString() });
}
