import { OperationsHubClient } from "./operations-hub-client";
import { requireAdmin } from "@/lib/rbac";

export const dynamic = "force-dynamic";

export default async function OperationsPage() {
  await requireAdmin();
  return <OperationsHubClient />;
}
