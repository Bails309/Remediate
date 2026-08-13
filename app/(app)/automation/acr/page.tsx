import type { Metadata } from "next";
import { UploadsClient } from "@/app/(app)/uploads/uploads-client";
import { loadUploadsData } from "@/app/(app)/uploads/uploads-data";
import { AzureBlobIngestClient } from "@/app/(app)/admin/azure-blob-ingest/azure-blob-ingest-client";
import { requireAdmin } from "@/lib/rbac";

export const metadata: Metadata = {
  title: "ACR Blob Ingest Automation",
};

export const dynamic = "force-dynamic";

export default async function AcrAutomationPage() {
  await requireAdmin();
  const { sites, uploads } = await loadUploadsData();

  return (
    <UploadsClient
      variant="ACR"
      mode="automation"
      initialSites={sites}
      initialUploads={uploads}
      automation={<AzureBlobIngestClient sites={sites.map((site) => ({ id: site.id, name: site.name }))} />}
    />
  );
}
