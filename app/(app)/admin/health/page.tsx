import type { Metadata } from "next";
import { HealthClient } from "./health-client";

export const metadata: Metadata = {
    title: "System Health",
};

export default function HealthPage() {
    return <HealthClient />;
}
