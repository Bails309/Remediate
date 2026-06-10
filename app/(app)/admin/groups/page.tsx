import type { Metadata } from "next";
import { GroupsClient } from "./groups-client";

export const metadata: Metadata = {
    title: "Groups",
};

export const dynamic = "force-dynamic";

export default function GroupsPage() {
    return <GroupsClient />;
}
