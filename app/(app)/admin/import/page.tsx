import type { Metadata } from "next";
import { ImportSettingsClient } from "./import-settings-client";
import { requireSiteAdmin } from "@/lib/rbac";

export const metadata: Metadata = {
    title: "Import Settings",
};

export const dynamic = "force-dynamic";

export default async function ImportSettingsPage() {
    await requireSiteAdmin();
    return <ImportSettingsClient />;
}
