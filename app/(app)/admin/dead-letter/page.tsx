import type { Metadata } from "next";
import { DeadLetterClient } from "@/app/(app)/admin/dead-letter/dead-letter-client";
import { requireAdmin } from "@/lib/rbac";

export const metadata: Metadata = {
  title: "Dead Letter Queue",
};

export const dynamic = "force-dynamic";

export default async function DeadLetterPage() {
  await requireAdmin();
  return <DeadLetterClient />;
}
