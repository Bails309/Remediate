import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/rbac";
import { AzureFileShareService } from "@/lib/azure-file-share";

export async function POST(req: Request) {
  await requireAdmin();

  try {
    const config = await req.json();
    const result = await AzureFileShareService.validateConfig(config);
    
    if (result.success) {
      return NextResponse.json({ success: true, message: "Connection successful" });
    } else {
      return NextResponse.json({ success: false, error: result.error }, { status: 400 });
    }
  } catch (error: unknown) {
    if (error instanceof Error) {
      return NextResponse.json({ success: false, error: error.message }, { status: 500 });
    }
    return NextResponse.json({ success: false, error: String(error) }, { status: 500 });
  }
}
