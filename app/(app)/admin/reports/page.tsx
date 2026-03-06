import { ReportSettingsClient } from "@/app/(app)/admin/reports/report-settings-client";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/rbac";

export const dynamic = "force-dynamic";

export default async function ReportsPage() {
  await requireAdmin();
  return <ReportSettingsClient />;
}
