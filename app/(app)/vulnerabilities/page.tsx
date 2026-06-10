import type { Metadata } from "next";
import { prisma } from "@/lib/prisma";
import { VulnerabilitiesClient } from "@/app/(app)/vulnerabilities/vulnerabilities-client";

import { auth } from "@/auth";
import { WEB_APP_ADMIN_ROLES } from "@/lib/rbac";

export const metadata: Metadata = {
  title: "Vulnerabilities",
};

export const dynamic = "force-dynamic";

export default async function VulnerabilitiesPage() {
  const sites = await prisma.site.findMany();
  const users = await prisma.user.findMany();
  const session = await auth();

  const userId = session?.user?.id;
  const roles = session?.user?.roles ?? [];
  const isAdmin = roles.some((r) => (WEB_APP_ADMIN_ROLES as readonly string[]).includes(r));

  type GroupRow = { id: string; name: string };
  type MembershipRow = { groupId: string; role: "member" | "leader"; group: GroupRow };

  let groups: { id: string; name: string; viewerRole: "member" | "leader" | null }[] = [];
  if (isAdmin) {
    const allGroups = await (prisma as unknown as { group: { findMany: (a: unknown) => Promise<GroupRow[]> } }).group.findMany({
      select: { id: true, name: true },
      orderBy: { name: "asc" },
    });
    const myMemberships = userId
      ? await (prisma as unknown as { groupMembership: { findMany: (a: unknown) => Promise<{ groupId: string; role: "member" | "leader" }[]> } }).groupMembership.findMany({
          where: { userId },
          select: { groupId: true, role: true },
        })
      : [];
    const roleByGroup = new Map(myMemberships.map((m) => [m.groupId, m.role]));
    groups = allGroups.map((g) => ({ id: g.id, name: g.name, viewerRole: roleByGroup.get(g.id) ?? null }));
  } else if (userId) {
    const memberships = await (prisma as unknown as { groupMembership: { findMany: (a: unknown) => Promise<MembershipRow[]> } }).groupMembership.findMany({
      where: { userId },
      include: { group: { select: { id: true, name: true } } },
      orderBy: { group: { name: "asc" } },
    });
    groups = memberships.map((m) => ({ id: m.group.id, name: m.group.name, viewerRole: m.role }));
  }

  return <VulnerabilitiesClient sites={sites} users={users} groups={groups} session={session} />;
}

