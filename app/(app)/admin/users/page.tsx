import type { Metadata } from "next";
import { UsersClient } from "./users-client";
import { requireSiteAdmin } from "@/lib/rbac";

export const metadata: Metadata = {
    title: "User Management",
};

export const dynamic = "force-dynamic";

export default async function UsersPage() {
    await requireSiteAdmin();
    return <UsersClient />;
}
