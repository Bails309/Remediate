import { redirect } from "next/navigation";
import { requireSiteAdmin } from "@/lib/rbac";

export const dynamic = "force-dynamic";

// Queue management now lives with the uploads it belongs to.
export default async function DeadLetterPage() {
  await requireSiteAdmin();
  redirect("/uploads/dead-letter");
}
