import { redirect } from "next/navigation";
import { requireAdmin } from "@/lib/rbac";

export const dynamic = "force-dynamic";

// ACR ingest now lives with the other upload automations.
export default async function AzureBlobIngestPage() {
  await requireAdmin();
  redirect("/automation/acr");
}
