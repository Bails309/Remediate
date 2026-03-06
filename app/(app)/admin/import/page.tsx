import { ImportSettingsClient } from "./import-settings-client";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/rbac";

export const dynamic = "force-dynamic";

export default async function ImportSettingsPage() {
    await requireAdmin();
    return <ImportSettingsClient />;
}
