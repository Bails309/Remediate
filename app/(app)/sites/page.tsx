import { prisma } from "@/lib/prisma";
import { SitesClient } from "@/app/(app)/sites/sites-client";

export default async function SitesPage() {
  const sites = await prisma.site.findMany({ orderBy: { name: "asc" } });
  return <SitesClient initialSites={sites} />;
}
