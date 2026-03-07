import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requirePentestUser, hasAnyRole, PENTEST_ADMIN_ROLES } from "@/lib/rbac";

export async function GET() {
  const session = await requirePentestUser();
  const isAdmin = hasAnyRole(session.user, PENTEST_ADMIN_ROLES);

  const logs = await prisma.pentestExecution.findMany({
    where: isAdmin ? undefined : { userId: session.user.id as string },
    orderBy: { startedAt: "desc" },
    take: 50,
  });

  return NextResponse.json({ logs });
}
