import { prisma } from "@/lib/prisma";
import { VulnerabilitiesClient } from "@/app/(app)/vulnerabilities/vulnerabilities-client";

export default async function VulnerabilitiesPage() {
  const [sites, users] = await Promise.all([
    prisma.site.findMany({ orderBy: { name: "asc" } }),
    prisma.user.findMany({ orderBy: { name: "asc" } }),
  ]);

  return <VulnerabilitiesClient sites={sites} users={users} />;
}
