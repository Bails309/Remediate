import { ReportSettingsClient } from "@/app/(app)/admin/reports/report-settings-client";
import { requireSiteAdmin } from "@/lib/rbac";

export const dynamic = "force-dynamic";

export default async function ReportsPage() {
  await requireSiteAdmin();
  return <ReportSettingsClient />;
}
