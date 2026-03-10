import { NextResponse } from "next/server";
import { requirePentestUser } from "@/lib/rbac";
import { getPentestBackendUrl, signPentestToken } from "@/lib/pentest";

export async function GET() {
  try {
    const session = await requirePentestUser();
    const token = signPentestToken(session);

    const backendUrl = getPentestBackendUrl();
    console.log(`[Tools List] Fetching from: ${backendUrl}/api/tools/list`);

    const res = await fetch(`${backendUrl}/api/tools/list`, {
      headers: { Authorization: `Bearer ${token}` },
      cache: "no-store",
    });

    if (!res.ok) {
      const errorText = await res.text();
      console.error(`[Backend Error] Status: ${res.status}, Body: ${errorText.substring(0, 200)}`);

      // Surface the actual error if possible
      let errorMsg = "Backend service unavailable";
      try {
        const parsed = JSON.parse(errorText);
        errorMsg = parsed.error || errorMsg;
      } catch {
        // Fallback to generic if not JSON
      }

      return NextResponse.json(
        { error: `Backend Error (${res.status}): ${errorMsg}` },
        { status: res.status }
      );
    }

    const payload = await res.json();
    return NextResponse.json(payload, { status: res.status });
  } catch (error: any) {
    console.error(`[Tools List API Exception]:`, error);
    const message = error.message || "Unknown connectivity error";
    return NextResponse.json(
      { error: `Connectivity Error: ${message}` },
      { status: 502 }
    );
  }
}
