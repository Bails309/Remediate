import { prisma } from "@/lib/prisma";
export const dynamic = "force-dynamic";
import { UploadsClient } from "@/app/(app)/uploads/uploads-client";
import type { Upload } from "@/app/(app)/uploads/uploads-client";

export default async function UploadsPage() {
  const [sites, uploads, azureConfig] = await Promise.all([
    prisma.site.findMany({ orderBy: { name: "asc" } }),
    prisma.uploadHistory.findMany({
      include: { site: true, uploader: true },
      orderBy: { uploadDate: "desc" },
      take: 5,
    }),
    prisma.azureFileShareConfig.findUnique({ where: { id: "singleton" } }),
  ]);

  const mappedUploads: Upload[] = uploads.map((u) => {
    return {
      id: u.id,
      status: u.status,
      uploadDate: (u.uploadDate as Date).toISOString(),
      fileName: u.fileName ?? null,
      rowCount: u.rowCount ?? null,
      site: {
        id: u.site.id,
        name: u.site.name,
        importPattern: u.site.importPattern ?? null,
        importAliases: u.site.importAliases ?? [],
        autoImportEnabled: u.site.autoImportEnabled,
      },
    } as Upload;
  });

  const mappedAzureConfig = azureConfig ? {
    ...azureConfig,
    lastPollAt: azureConfig.lastPollAt?.toISOString() || null,
    updatedAt: azureConfig.updatedAt.toISOString(),
  } : null;

  return (
    <UploadsClient 
      initialSites={sites} 
      initialUploads={mappedUploads} 
      initialAzureConfig={mappedAzureConfig} 
    />
  );
}
