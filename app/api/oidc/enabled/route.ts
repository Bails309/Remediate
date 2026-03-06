import { NextResponse } from "next/server";
import { getOidcConfigFromDb } from "@/lib/oidc";

export async function GET() {
  try {
    const cfg = await getOidcConfigFromDb();
    return NextResponse.json({ enabled: !!cfg });
  } catch (err) {
    return NextResponse.json({ enabled: false });
  }
}
