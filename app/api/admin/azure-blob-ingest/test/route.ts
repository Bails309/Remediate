import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/rbac";
import { AzureBlobIngestService } from "@/lib/azure-blob-ingest";

export async function POST(req: Request) {
  await requireAdmin();

  try {
    const config = await req.json();
    const result = await AzureBlobIngestService.validateConfig(config);

    if (result.success) {
      return NextResponse.json({ success: true, message: "Connection successful" });
    }
    return NextResponse.json({ success: false, error: result.error }, { status: 400 });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
