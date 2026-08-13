import { StorageSettingsClient } from "./storage-settings-client";
import { requireSiteAdmin } from "@/lib/rbac";

export const dynamic = "force-dynamic";

export default async function StorageSettingsPage() {
    await requireSiteAdmin();
    return <StorageSettingsClient />;
}
