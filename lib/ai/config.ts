import { prisma } from "@/lib/prisma";
import { decrypt, encrypt } from "@/lib/crypto";

/**
 * Supported AI backends. All three ultimately speak the OpenAI chat-completions
 * wire format; `providerType` only changes how the request URL and auth header
 * are constructed (see lib/ai/provider.ts):
 *   - azure-openai      Azure OpenAI deployment URLs + `api-key` header.
 *   - foundry           Azure AI Foundry model inference + `api-key` header.
 *   - openai-compatible Any `/v1` endpoint (OpenAI, Ollama, LM Studio, …) with
 *                       an `Authorization: Bearer` header.
 */
export const AI_PROVIDER_TYPES = ["azure-openai", "foundry", "openai-compatible"] as const;
export type AiProviderType = (typeof AI_PROVIDER_TYPES)[number];

export function isAiProviderType(value: string): value is AiProviderType {
  return (AI_PROVIDER_TYPES as readonly string[]).includes(value);
}

export type AiConfig = {
  providerType: AiProviderType;
  /** Base endpoint. For azure-openai this is the resource root (https://x.openai.azure.com). */
  baseUrl: string;
  apiKey: string;
  /** Model name, or deployment name for Azure OpenAI. */
  model: string;
  /** Required for azure-openai / foundry; ignored otherwise. */
  apiVersion?: string;
  enabled: boolean;
  /** Where the effective config was resolved from. */
  source: "db" | "env";
};

export type AiConfigInput = {
  providerType: AiProviderType;
  baseUrl: string;
  apiKey: string;
  model: string;
  apiVersion?: string;
  enabled: boolean;
};

/**
 * Resolve the effective AI configuration. A row saved via the Admin dashboard
 * takes precedence; otherwise we fall back to environment variables so the
 * feature can be provisioned declaratively (e.g. in Container Apps).
 *
 * Returns `null` when nothing is configured.
 */
export async function getAiConfig(): Promise<AiConfig | null> {
  const row = await prisma.aiConfig.findFirst();
  if (row) {
    const providerType = isAiProviderType(row.providerType) ? row.providerType : "openai-compatible";
    return {
      providerType,
      baseUrl: decrypt(row.baseUrlEnc),
      apiKey: decrypt(row.apiKeyEnc),
      model: row.model,
      apiVersion: row.apiVersion ?? undefined,
      enabled: row.enabled,
      source: "db",
    };
  }

  const envProvider = process.env.AI_PROVIDER;
  const baseUrl = process.env.AI_BASE_URL;
  const apiKey = process.env.AI_API_KEY;
  const model = process.env.AI_MODEL;
  if (envProvider && baseUrl && apiKey && model) {
    const providerType = isAiProviderType(envProvider) ? envProvider : "openai-compatible";
    return {
      providerType,
      baseUrl,
      apiKey,
      model,
      apiVersion: process.env.AI_API_VERSION || undefined,
      enabled: process.env.AI_INSIGHTS_ENABLED !== "false",
      source: "env",
    };
  }

  return null;
}

/** True when insights are configured AND switched on. */
export async function isAiInsightsAvailable(): Promise<boolean> {
  const config = await getAiConfig();
  return Boolean(config?.enabled);
}

export async function upsertAiConfig(input: AiConfigInput) {
  const data = {
    enabled: input.enabled,
    providerType: input.providerType,
    baseUrlEnc: encrypt(input.baseUrl),
    apiKeyEnc: encrypt(input.apiKey),
    model: input.model,
    apiVersion: input.apiVersion ?? null,
  };

  const existing = await prisma.aiConfig.findFirst();
  if (!existing) {
    return prisma.aiConfig.create({ data });
  }
  return prisma.aiConfig.update({ where: { id: existing.id }, data });
}
