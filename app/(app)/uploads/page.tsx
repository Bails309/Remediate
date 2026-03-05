import { prisma } from "@/lib/prisma";
import { UploadsClient } from "@/app/(app)/uploads/uploads-client";

export default async function UploadsPage() {
  const [sites, uploads] = await Promise.all([
    prisma.site.findMany({ orderBy: { name: "asc" } }),
    prisma.uploadHistory.findMany({
      include: { site: true, uploader: true },
      orderBy: { uploadDate: "desc" },
      take: 10,
    }),
  ]);

  return <UploadsClient initialSites={sites} initialUploads={uploads} />;
}
