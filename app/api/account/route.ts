import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { auth } from "@/auth";
import { writeAuditLog } from "@/lib/audit-log";

// GET — Export all personal data for the authenticated user (GDPR SAR)
export async function GET() {
  const session = await auth();
  if (!session?.user?.id || !session.user.email) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const userId = session.user.id;

  const [user, comments, uploads, pentestExecutions, assignedVulns, threatSubscription] =
    await Promise.all([
      prisma.user.findUnique({
        where: { id: userId },
        select: {
          id: true,
          email: true,
          name: true,
          roles: true,
          authSource: true,
          isNewUser: true,
          lastLoginAt: true,
          completedTours: true,
          createdAt: true,
        },
      }),
      prisma.comment.findMany({
        where: { authorId: userId },
        select: { id: true, content: true, vulnerabilityId: true, isPrivate: true, createdAt: true },
        orderBy: { createdAt: "desc" },
      }),
      prisma.uploadHistory.findMany({
        where: { uploadedBy: userId },
        select: { id: true, fileName: true, uploadDate: true, status: true, rowCount: true },
        orderBy: { uploadDate: "desc" },
      }),
      prisma.pentestExecution.findMany({
        where: { userId },
        select: { id: true, toolId: true, toolName: true, status: true, startedAt: true, finishedAt: true, durationMs: true },
        orderBy: { startedAt: "desc" },
      }),
      prisma.vulnerability.findMany({
        where: { assigneeId: userId },
        select: { id: true, name: true, host: true, status: true, risk: true, createdAt: true },
        orderBy: { createdAt: "desc" },
      }),
      prisma.threatSubscription.findUnique({
        where: { userId },
        select: {
          isSubscribed: true,
          globalDigestEnabled: true,
          environmentDigestEnabled: true,
          minRisk: true,
          cisaKevOnly: true,
          scheduledHour: true,
          scheduledMinute: true
        },
      }),
    ]);

  if (!user) {
    return NextResponse.json({ error: "User not found" }, { status: 404 });
  }

  await writeAuditLog({
    userId,
    userEmail: session.user.email,
    action: "user.data_export",
    entityType: "User",
    entityId: userId,
  });

  return NextResponse.json({
    exportDate: new Date().toISOString(),
    user,
    comments,
    uploads,
    pentestExecutions,
    assignedVulnerabilities: assignedVulns,
    threatSubscription,
  });
}

// DELETE — Delete all personal data for the authenticated user (GDPR right to erasure)
// Note: site_admins cannot self-delete if they are the last admin
export async function DELETE() {
  const session = await auth();
  if (!session?.user?.id || !session.user.email) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const userId = session.user.id;

  const user = await prisma.user.findUnique({ where: { id: userId }, select: { roles: true } });
  if (!user) {
    return NextResponse.json({ error: "User not found" }, { status: 404 });
  }

  // Prevent deleting the last site_admin
  if ((user.roles as string[]).includes("site_admin")) {
    const adminCount = await prisma.user.count({ where: { roles: { has: "site_admin" } } });
    if (adminCount <= 1) {
      return NextResponse.json(
        { error: "Cannot delete the last site admin. Transfer the role first." },
        { status: 400 }
      );
    }
  }

  // Write audit log BEFORE deletion (so we have the record)
  await writeAuditLog({
    userId,
    userEmail: session.user.email,
    action: "user.self_delete",
    entityType: "User",
    entityId: userId,
  });

  // Delete user — cascading deletes handle comments, uploads, pentest executions,
  // assignment notifications, and threat subscriptions via onDelete: Cascade
  // Vulnerability assigneeId is set to null via onDelete: SetNull (Prisma default for optional relations)
  await prisma.$transaction([
    // Unassign vulnerabilities
    prisma.vulnerability.updateMany({ where: { assigneeId: userId }, data: { assigneeId: null } }),
    // Delete the user (cascade handles: comments, uploads, pentest executions, assignment notifications, threat subscription)
    prisma.user.delete({ where: { id: userId } }),
  ]);

  return NextResponse.json({ success: true, message: "Account and personal data deleted" });
}
