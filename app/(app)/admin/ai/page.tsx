import type { Metadata } from "next";
import { AiSettingsClient } from "./ai-settings-client";
import { requireSiteAdmin } from "@/lib/rbac";

export const metadata: Metadata = {
  title: "AI Insights",
};

export const dynamic = "force-dynamic";

export default async function AiSettingsPage() {
  await requireSiteAdmin();
  return <AiSettingsClient />;
}
