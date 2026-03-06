import { prisma } from "@/lib/prisma";
export const dynamic = "force-dynamic";
import { UploadsClient } from "@/app/(app)/uploads/uploads-client";

export default async function UploadsPage() {
  const [sites, uploads] = await Promise.all([
    prisma.site.findMany({ orderBy: { name: "asc" } }),
    prisma.uploadHistory.findMany({
      include: { site: true, uploader: true },
      orderBy: { uploadDate: "desc" },
      take: 5,
    }),
  ]);

  const mappedUploads = uploads.map((u) => ({
    ...u,
    uploadDate: u.uploadDate.toISOString()
  }));

  return <UploadsClient initialSites={sites} initialUploads={mappedUploads} />;
}
