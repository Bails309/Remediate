import { NextResponse } from "next/server";
import { requirePentestAdmin } from "@/lib/rbac";
import { getPentestBackendUrl, signPentestToken } from "@/lib/pentest";

export async function GET() {
  const session = await requirePentestAdmin();
  const token = signPentestToken(session);

  const res = await fetch(`${getPentestBackendUrl()}/api/tools/config`, {
    headers: { Authorization: `Bearer ${token}` },
    cache: "no-store",
  });

  const payload = await res.json();
  return NextResponse.json(payload, { status: res.status });
}

export async function PUT(req: Request) {
  const session = await requirePentestAdmin();
  const token = signPentestToken(session);
  const body = await req.json();

  const res = await fetch(`${getPentestBackendUrl()}/api/tools/config`, {
    method: "PUT",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });

  const payload = await res.json();
  return NextResponse.json(payload, { status: res.status });
}
