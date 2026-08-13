import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { z } from "zod";
import { requireSiteAdmin } from "@/lib/rbac";
import { enforceRateLimit } from "@/lib/rate-limit";
import { getAiConfig, AI_PROVIDER_TYPES, type AiConfig } from "@/lib/ai/config";
import { chatCompletion, AiProviderError } from "@/lib/ai/provider";

const MASK = "********";

// Optional overrides let admins test unsaved form values before persisting.
const testSchema = z
  .object({
    providerType: z.enum(AI_PROVIDER_TYPES),
    baseUrl: z.string().url(),
    apiKey: z.string().min(1),
    model: z.string().min(1),
    apiVersion: z.string().optional().nullable(),
  })
  .partial();

export async function POST(request: NextRequest) {
  const rate = await enforceRateLimit(request);
  if (!rate.allowed) {
    return NextResponse.json({ error: "Too many requests" }, { status: 429 });
  }

  await requireSiteAdmin();
  const stored = await getAiConfig();
  const overrides = testSchema.safeParse(await request.json().catch(() => ({})));
  const o = overrides.success ? overrides.data : {};

  // Resolve the effective config to test: form overrides win, else stored values.
  const apiKey = o.apiKey && o.apiKey !== MASK ? o.apiKey : stored?.apiKey;
  const config: AiConfig | null =
    o.providerType && o.baseUrl && apiKey && o.model
      ? {
          providerType: o.providerType,
          baseUrl: o.baseUrl,
          apiKey,
          model: o.model,
          apiVersion: o.apiVersion || stored?.apiVersion,
          enabled: true,
          source: "db",
        }
      : stored;

  if (!config) {
    return NextResponse.json({ error: "No configuration to test. Fill in the fields first." }, { status: 400 });
  }

  try {
    const reply = await chatCompletion({
      config: { ...config, enabled: true },
      messages: [
        { role: "system", content: "You are a health check. Reply with the single word: OK" },
        { role: "user", content: "ping" },
      ],
      maxTokens: 5,
      timeoutMs: 15000,
    });
    return NextResponse.json({ ok: true, model: config.model, sample: reply.trim().slice(0, 40) });
  } catch (error) {
    const message = error instanceof AiProviderError ? error.message : "Connection test failed.";
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
