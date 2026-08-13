import { prisma } from "@/lib/prisma";
import type { Upload } from "./uploads-client";

export async function loadUploadsData() {
  const [sites, uploads, azureConfig] = await Promise.all([
    prisma.site.findMany({ orderBy: { name: "asc" } }),
    prisma.uploadHistory.findMany({
      include: { site: true, uploader: true },
      orderBy: { uploadDate: "desc" },
      take: 5,
    }),
    prisma.azureFileShareConfig.findUnique({ where: { id: "singleton" } }),
  ]);

  const mappedUploads: Upload[] = uploads.map((u) => ({
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
  }));

  const mappedAzureConfig = azureConfig
    ? {
      ...azureConfig,
      lastPollAt: azureConfig.lastPollAt?.toISOString() || null,
      updatedAt: azureConfig.updatedAt.toISOString(),
    }
    : null;

  return { sites, uploads: mappedUploads, azureConfig: mappedAzureConfig };
}
