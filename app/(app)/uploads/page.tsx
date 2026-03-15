import { prisma } from "@/lib/prisma";
export const dynamic = "force-dynamic";
import { UploadsClient } from "@/app/(app)/uploads/uploads-client";

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

  const mappedUploads = uploads.map((u) => {
    const uu = u as { uploadDate: Date } & Record<string, unknown>;
    return {
      ...uu,
      uploadDate: uu.uploadDate.toISOString(),
    };
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
