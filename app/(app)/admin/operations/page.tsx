import { HealthClient } from "@/app/(app)/admin/health/health-client";
import { requireSiteAdmin } from "@/lib/rbac";

export const dynamic = "force-dynamic";

export default async function OperationsPage() {
  await requireSiteAdmin();
  return <HealthClient />;
}
