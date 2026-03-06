import { DeadLetterClient } from "@/app/(app)/admin/dead-letter/dead-letter-client";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/rbac";

export const dynamic = "force-dynamic";

export default async function DeadLetterPage() {
  await requireAdmin();
  return <DeadLetterClient />;
}
