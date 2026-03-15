import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/rbac";
import { AzureFileShareService } from "@/lib/azure-file-share";

export async function POST() {
  await requireAdmin();

  try {
    await AzureFileShareService.pollAndIngest();
    
    return NextResponse.json({ success: true, message: "Manual poll completed successfully" });
  } catch (error: unknown) {
    console.error("[AzureFileShare] Manual poll failed:", error);
    if (error instanceof Error) {
      return NextResponse.json({ success: false, error: error.message }, { status: 500 });
    }
    return NextResponse.json({ success: false, error: String(error) }, { status: 500 });
  }
}
