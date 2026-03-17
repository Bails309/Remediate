import { prisma } from "@/lib/prisma";
import { BucketsClient } from "@/app/(app)/buckets/buckets-client";
export const dynamic = "force-dynamic";

export default async function BucketsPage() {
  const buckets = await prisma.site.findMany({ orderBy: { name: "asc" } });
  return <BucketsClient initialBuckets={buckets} />;
}
