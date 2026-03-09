import { NextResponse } from "next/server";
import { getOidcConfigFromDb } from "@/lib/oidc";

export async function GET() {
  const localEnabled = process.env.LOCAL_AUTH_ENABLED === "true";
  try {
    const cfg = await getOidcConfigFromDb();
    return NextResponse.json({
      ssoEnabled: !!cfg,
      localEnabled
    });
  } catch {
    return NextResponse.json({
      ssoEnabled: false,
      localEnabled
    });
  }
}
