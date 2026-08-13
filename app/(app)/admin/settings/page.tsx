import { redirect } from "next/navigation";
import { requireSiteAdmin } from "@/lib/rbac";

export const dynamic = "force-dynamic";

// Settings now live on their own pages; keep this route working for old links.
export default async function SettingsPage() {
  await requireSiteAdmin();
  redirect("/admin/oidc");
}
