import type { Metadata } from "next";
import { UsersClient } from "./users-client";

export const metadata: Metadata = {
    title: "User Management",
};

export default function UsersPage() {
    return <UsersClient />;
}
