import { StorageSettingsClient } from "./storage-settings-client";
import { requireAdmin } from "@/lib/rbac";

export const dynamic = "force-dynamic";

export default async function StorageSettingsPage() {
    await requireAdmin();
    return <StorageSettingsClient />;
}
