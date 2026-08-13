import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { requireUser } from "@/lib/rbac";
import { loadDashboardForViewer } from "@/lib/dashboards/access";
import { DashboardClient, type Dashboard } from "./dashboard-client";

export const metadata: Metadata = {
  title: "Dashboard",
};

export const dynamic = "force-dynamic";

export default async function DashboardPage({ params }: { params: Promise<{ id: string }> }) {
  const session = await requireUser();
  const { id } = await params;

  const result = await loadDashboardForViewer(id, session.user);
  if (!result) notFound();

  const dashboard: Dashboard = {
    id: result.dashboard.id,
    name: result.dashboard.name,
    description: result.dashboard.description,
    visibility: result.dashboard.visibility,
    owner: result.dashboard.owner,
    widgets: result.dashboard.widgets.map((widget) => ({
      id: widget.id,
      title: widget.title,
      viz: widget.viz,
      x: widget.x,
      y: widget.y,
      w: widget.w,
      h: widget.h,
    })),
  };

  return <DashboardClient dashboard={dashboard} canEdit={result.access.canEdit} />;
}
