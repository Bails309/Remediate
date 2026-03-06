import { NextResponse } from "next/server";
import { z } from "zod";
import { requireAdmin } from "@/lib/rbac";
import { getOidcConfigFromDb, upsertOidcConfig } from "@/lib/oidc";
import { enforceRateLimit } from "@/lib/rate-limit";
import type { NextRequest } from "next/server";

const oidcSchema = z.object({
  clientId: z.string().min(3),
  clientSecret: z.string().min(8),
  issuerUrl: z.string().url(),
});

export async function GET(request: NextRequest) {
  const rate = await enforceRateLimit(request);
  if (!rate.allowed) {
    return NextResponse.json({ error: "Too many requests" }, { status: 429 });
  }

  await requireAdmin();
  const config = await getOidcConfigFromDb();
  if (!config) {
    return NextResponse.json({ configured: false });
  }
  return NextResponse.json({
    configured: true,
    clientId: config.clientId,
    issuerUrl: config.issuerUrl,
    clientSecretMasked: "********",
  });
}

export async function POST(request: NextRequest) {
  const rate = await enforceRateLimit(request);
  if (!rate.allowed) {
    return NextResponse.json({ error: "Too many requests" }, { status: 429 });
  }

  await requireAdmin();
  const body = await request.json();

  // If the secret is the placeholder, we need to fetch the existing one to pass schema validation and upsert
  if (body.clientSecret === "********") {
    const existing = await getOidcConfigFromDb();
    if (existing) {
      body.clientSecret = existing.clientSecret;
    }
  }

  const payload = oidcSchema.parse(body);
  await upsertOidcConfig(payload);
  return NextResponse.json({ ok: true });
}
