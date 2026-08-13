import { AuditLogClient } from "./audit-log-client";
import { requireSiteAdmin } from "@/lib/rbac";

export const dynamic = "force-dynamic";

export default async function AuditLogPage() {
  await requireSiteAdmin();
  return <AuditLogClient />;
}
