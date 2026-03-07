import { NextResponse } from "next/server";
import { requirePentestUser } from "@/lib/rbac";
import { getPentestBackendUrl, signPentestToken } from "@/lib/pentest";

export async function GET() {
  const session = await requirePentestUser();
  const token = signPentestToken(session);
  const res = await fetch(`${getPentestBackendUrl()}/api/tools/list`, {
    headers: { Authorization: `Bearer ${token}` },
    cache: "no-store",
  });

  const payload = await res.json();
  return NextResponse.json(payload, { status: res.status });
}
