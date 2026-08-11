import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { Prisma, VulnerabilityStatus } from "@prisma/client";
import { requireUser, WEB_APP_ADMIN_ROLES } from "@/lib/rbac";
import { enforceRateLimit } from "@/lib/rate-limit";
import { writeAuditLog } from "@/lib/audit-log";
import type { NextRequest } from "next/server";

/**
 * Restore an archived finding back into the active remediation queue.
 *
 * Admin-only: archiving is the audit-visible terminal state for a finding, so
 * un-archiving is deliberately not delegated to assignees or group leaders.
 * The history row is deleted (rather than kept) so the next ingest doesn't see
 * a stale FalsePositive/NoFixAvailable determination and immediately re-archive
 * the row it just handed back.
 */
export async function POST(
    request: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    const { id: vulnerabilityId } = await params;

    const rate = await enforceRateLimit(request);
    if (!rate.allowed) {
        return NextResponse.json({ error: "Too many requests" }, { status: 429 });
    }

    const session = await requireUser();
    const roles = session.user.roles || [];
    const isAdmin = roles.some((role) => (WEB_APP_ADMIN_ROLES as readonly string[]).includes(role));
    if (!isAdmin) {
        return NextResponse.json(
            { error: "Only administrators can restore archived findings" },
            { status: 403 }
        );
    }

    const history = await prisma.vulnerabilityHistory.findUnique({
        where: { id: vulnerabilityId },
    });

    if (!history) {
        return NextResponse.json({ error: "Archived finding not found" }, { status: 404 });
    }

    // A later scan may already have re-created this finding as a live row under a
    // new id. Restoring would then produce a duplicate in the triage queue.
    const existing = await prisma.vulnerability.findFirst({
        where: {
            siteId: history.siteId,
            scannerType: history.scannerType,
            pluginId: history.pluginId,
            host: history.host,
            port: history.port,
        },
        select: { id: true },
    });

    if (existing) {
        return NextResponse.json(
            { error: "This finding is already in the active queue", activeId: existing.id },
            { status: 409 }
        );
    }

    const restored = await prisma.$transaction(async (tx: Prisma.TransactionClient) => {
        const created = await tx.vulnerability.create({
            data: {
                id: history.id,
                siteId: history.siteId,
                assigneeId: history.assigneeId,
                groupId: history.groupId,
                status: VulnerabilityStatus.Open,
                isCurrent: true,
                lastSeenAt: history.lastSeenAt,
                createdAt: history.createdAt,
                scannerType: history.scannerType,
                pluginId: history.pluginId,
                cve: history.cve,
                cvssScore: history.cvssScore,
                risk: history.risk,
                host: history.host,
                protocol: history.protocol,
                port: history.port,
                name: history.name,
                synopsis: history.synopsis,
                description: history.description,
                solution: history.solution,
                seeAlso: history.seeAlso,
                pluginOutput: history.pluginOutput,
                pluginPublicationDate: history.pluginPublicationDate,
                pluginModificationDate: history.pluginModificationDate,
                crNumber: history.crNumber,
                registryName: history.registryName,
                repository: history.repository,
                imageDigest: history.imageDigest,
                imageTag: history.imageTag,
                packageName: history.packageName,
                installedVersion: history.installedVersion,
                remediation: history.remediation,
                timeGenerated: history.timeGenerated,
            },
            include: {
                assignee: { select: { id: true, name: true } },
                group: { select: { id: true, name: true } },
                collaborators: { select: { id: true, name: true, email: true } },
            },
        });

        await tx.vulnerabilityHistory.delete({ where: { id: vulnerabilityId } });

        return created;
    });

    writeAuditLog({
        userId: session.user.id!,
        userEmail: session.user.email!,
        action: "vulnerability.restored",
        entityType: "Vulnerability",
        entityId: vulnerabilityId,
        oldValue: history.status,
        newValue: VulnerabilityStatus.Open,
    });

    return NextResponse.json({ ...restored, recordScope: "active", commentCount: 0 });
}
