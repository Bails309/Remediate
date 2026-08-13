import type { Metadata } from "next";
import { HealthClient } from "./health-client";
import { requireSiteAdmin } from "@/lib/rbac";

export const metadata: Metadata = {
    title: "System Health",
};

export const dynamic = "force-dynamic";

export default async function HealthPage() {
    await requireSiteAdmin();
    return <HealthClient />;
}
