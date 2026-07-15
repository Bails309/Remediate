import type { Metadata } from "next";
import { AzureBlobIngestClient } from "./azure-blob-ingest-client";
import { requireAdmin } from "@/lib/rbac";
import { prisma } from "@/lib/prisma";

export const metadata: Metadata = {
  title: "ACR Blob Ingest",
};

export const dynamic = "force-dynamic";

export default async function AzureBlobIngestPage() {
  await requireAdmin();

  const sites = await prisma.site.findMany({
    select: { id: true, name: true },
    orderBy: { name: "asc" },
  });

  return (
    <div className="space-y-8">
      <div>
        <h2 className="text-2xl font-semibold">ACR Blob Container Ingest</h2>
        <p className="mt-1 text-sm opacity-70">
          Automatically pull Azure Container Registry vulnerability CSV exports from a blob
          container. Files are ingested into the configured default bucket and deleted from
          the container after successful queueing.
        </p>
      </div>
      <AzureBlobIngestClient sites={sites} />
    </div>
  );
}
