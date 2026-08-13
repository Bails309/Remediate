import type { Metadata } from "next";
import { GroupsClient } from "./groups-client";
import { requireSiteAdmin } from "@/lib/rbac";

export const metadata: Metadata = {
    title: "Groups",
};

export const dynamic = "force-dynamic";

export default async function GroupsPage() {
    await requireSiteAdmin();
    return <GroupsClient />;
}
