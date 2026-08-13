import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { z } from "zod";
import { requireSiteAdmin } from "@/lib/rbac";
import { enforceRateLimit } from "@/lib/rate-limit";
import { getAiConfig, upsertAiConfig, AI_PROVIDER_TYPES } from "@/lib/ai/config";

const MASK = "********";

const configSchema = z.object({
  providerType: z.enum(AI_PROVIDER_TYPES),
  baseUrl: z.string().url(),
  apiKey: z.string().min(1),
  model: z.string().min(1),
  apiVersion: z.string().optional().nullable(),
  enabled: z.boolean(),
});

export async function GET(request: NextRequest) {
  const rate = await enforceRateLimit(request);
  if (!rate.allowed) {
    return NextResponse.json({ error: "Too many requests" }, { status: 429 });
  }

  await requireSiteAdmin();
  const config = await getAiConfig();
  if (!config) {
    return NextResponse.json({ configured: false });
  }
  return NextResponse.json({
    configured: true,
    source: config.source,
    enabled: config.enabled,
    providerType: config.providerType,
    baseUrl: config.baseUrl,
    model: config.model,
    apiVersion: config.apiVersion ?? "",
    apiKeyMasked: MASK,
  });
}

export async function POST(request: NextRequest) {
  const rate = await enforceRateLimit(request);
  if (!rate.allowed) {
    return NextResponse.json({ error: "Too many requests" }, { status: 429 });
  }

  await requireSiteAdmin();
  const body = await request.json().catch(() => ({}));

  // Preserve the stored secret when the client submits the masked placeholder.
  if (body.apiKey === MASK) {
    const existing = await getAiConfig();
    if (existing) {
      body.apiKey = existing.apiKey;
    }
  }

  const parsed = configSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid configuration.", issues: parsed.error.flatten() }, { status: 400 });
  }

  await upsertAiConfig({
    providerType: parsed.data.providerType,
    baseUrl: parsed.data.baseUrl,
    apiKey: parsed.data.apiKey,
    model: parsed.data.model,
    apiVersion: parsed.data.apiVersion || undefined,
    enabled: parsed.data.enabled,
  });

  return NextResponse.json({ ok: true });
}
