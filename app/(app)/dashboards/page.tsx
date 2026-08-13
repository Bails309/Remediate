import type { Metadata } from "next";
import { LayoutDashboard } from "lucide-react";
import { requireUser } from "@/lib/rbac";
import { DashboardsClient } from "./dashboards-client";

export const metadata: Metadata = {
  title: "Dashboards",
};

export const dynamic = "force-dynamic";

export default async function DashboardsPage() {
  await requireUser();

  return (
    <div className="space-y-8">
      <div>
        <h1 className="flex items-center gap-3 text-3xl font-bold tracking-tight">
          <LayoutDashboard className="h-7 w-7 text-[color:var(--color-accent)]" />
          Dashboards
        </h1>
        <p className="mt-1 text-sm opacity-60">
          Build your own views and publish them to the team. Data is always scoped to the person viewing it.
        </p>
      </div>

      <DashboardsClient />
    </div>
  );
}
