import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/rbac";
import { AzureBlobIngestService } from "@/lib/azure-blob-ingest";

export async function POST() {
  await requireAdmin();

  try {
    await AzureBlobIngestService.pollAndIngest();
    return NextResponse.json({ success: true, message: "Manual poll completed successfully" });
  } catch (error: unknown) {
    console.error("[AzureBlobIngest] Manual poll failed:", error);
    const message = error instanceof Error ? error.message : String(error);
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
