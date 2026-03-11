import { NextResponse } from "next/server";
import { requireToolkitAdmin } from "@/lib/rbac";
import { getPentestBackendUrl, signPentestToken } from "@/lib/pentest";

export async function GET() {
  try {
    const session = await requireToolkitAdmin();
    const token = signPentestToken(session);

    const res = await fetch(`${getPentestBackendUrl()}/api/tools/config`, {
      headers: { Authorization: `Bearer ${token}` },
      cache: "no-store",
    });

    const payload = await res.json();
    return NextResponse.json(payload, { status: res.status });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Internal server error";
    console.error(`[Tools Config GET API Exception]:`, error);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function PUT(req: Request) {
  try {
    const session = await requireToolkitAdmin();
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
  } catch (error) {
    const message = error instanceof Error ? error.message : "Internal server error";
    console.error(`[Tools Config PUT API Exception]:`, error);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
