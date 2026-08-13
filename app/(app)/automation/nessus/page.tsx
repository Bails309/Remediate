import type { Metadata } from "next";
import { UploadsClient } from "@/app/(app)/uploads/uploads-client";
import { loadUploadsData } from "@/app/(app)/uploads/uploads-data";
import { requireAdmin } from "@/lib/rbac";

export const metadata: Metadata = {
  title: "Nessus File Share Automation",
};

export const dynamic = "force-dynamic";

export default async function NessusAutomationPage() {
  await requireAdmin();
  const { sites, uploads, azureConfig } = await loadUploadsData();

  return (
    <UploadsClient
      variant="CSV"
      mode="automation"
      initialSites={sites}
      initialUploads={uploads}
      initialAzureConfig={azureConfig}
    />
  );
}
