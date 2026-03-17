import { SettingsHubClient } from "./settings-hub-client";
import { requireAdmin } from "@/lib/rbac";

export const dynamic = "force-dynamic";

export default async function SettingsPage() {
  await requireAdmin();
  return <SettingsHubClient />;
}
