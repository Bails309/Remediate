import type { Metadata } from "next";
import { ImportSettingsClient } from "./import-settings-client";
import { requireAdmin } from "@/lib/rbac";

export const metadata: Metadata = {
    title: "Import Settings",
};

export const dynamic = "force-dynamic";

export default async function ImportSettingsPage() {
    await requireAdmin();
    return <ImportSettingsClient />;
}
