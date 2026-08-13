import { prisma } from "@/lib/prisma";
import { getGroupContext } from "@/lib/group-rbac";
import { checkAdmin } from "@/lib/rbac";
import type { WidgetContext } from "@/lib/dashboards/execute";

type SessionUser = { id?: string | null; roles?: string[] | null };

/** Build the RBAC context a widget executes under for the current viewer. */
export async function widgetContextFor(user: SessionUser): Promise<WidgetContext> {
  const isAdmin = checkAdmin(user);
  const ctx = user.id ? await getGroupContext(user.id) : { memberOf: [] as string[] };
  return { userId: user.id ?? "", isAdmin, memberOf: ctx.memberOf };
}

export type DashboardAccess = { canView: boolean; canEdit: boolean };

export function accessFor(
  dashboard: { ownerId: string; visibility: string },
  user: SessionUser
): DashboardAccess {
  const isOwner = dashboard.ownerId === user.id;
  return {
    canView: isOwner || dashboard.visibility === "Published",
    canEdit: isOwner,
  };
}

export async function loadDashboardForViewer(id: string, user: SessionUser) {
  const dashboard = await prisma.dashboard.findUnique({
    where: { id },
    include: {
      owner: { select: { id: true, name: true } },
      widgets: { orderBy: [{ y: "asc" }, { x: "asc" }] },
    },
  });
  if (!dashboard) return null;

  const access = accessFor(dashboard, user);
  return access.canView ? { dashboard, access } : null;
}
