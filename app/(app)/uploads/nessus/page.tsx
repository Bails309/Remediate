import type { Metadata } from "next";
import { UploadsClient } from "@/app/(app)/uploads/uploads-client";
import { loadUploadsData } from "@/app/(app)/uploads/uploads-data";

export const metadata: Metadata = {
  title: "Nessus CSV Uploads",
};

export const dynamic = "force-dynamic";

export default async function NessusUploadsPage() {
  const { sites, uploads } = await loadUploadsData();

  return (
    <UploadsClient
      variant="CSV"
      mode="manual"
      initialSites={sites}
      initialUploads={uploads}
    />
  );
}
