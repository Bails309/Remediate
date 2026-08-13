import type { Metadata } from "next";
import { UploadsClient } from "@/app/(app)/uploads/uploads-client";
import { loadUploadsData } from "@/app/(app)/uploads/uploads-data";

export const metadata: Metadata = {
  title: "ACR CSV Uploads",
};

export const dynamic = "force-dynamic";

export default async function AcrUploadsPage() {
  const { sites, uploads } = await loadUploadsData();

  return (
    <UploadsClient
      variant="ACR"
      mode="manual"
      initialSites={sites}
      initialUploads={uploads}
    />
  );
}
