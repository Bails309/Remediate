import type { Metadata } from "next";
import { prisma } from "@/lib/prisma";
import { VulnerabilitiesClient } from "@/app/(app)/vulnerabilities/vulnerabilities-client";

import { auth } from "@/auth";

export const metadata: Metadata = {
  title: "Vulnerabilities",
};

export const dynamic = "force-dynamic";

export default async function VulnerabilitiesPage() {
  const sites = await prisma.site.findMany();
  const users = await prisma.user.findMany();
  const session = await auth();

  return <VulnerabilitiesClient sites={sites} users={users} session={session} />;
}
