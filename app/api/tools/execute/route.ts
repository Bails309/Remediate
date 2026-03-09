import { NextResponse } from "next/server";
import { requirePentestUser } from "@/lib/rbac";
import { getPentestBackendUrl, signPentestToken } from "@/lib/pentest";

export async function POST(req: Request) {
  const session = await requirePentestUser();
  const token = signPentestToken(session);
  const body = await req.json();

  const res = await fetch(`${getPentestBackendUrl()}/api/tools/execute`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const errorText = await res.text();
    console.error(`[Backend Errror] Status: ${res.status}, Body: ${errorText.substring(0, 200)}`);
    return NextResponse.json({ error: "Backend service unavailable" }, { status: res.status });
  }

  const payload = await res.json();
  return NextResponse.json(payload, { status: res.status });
}
