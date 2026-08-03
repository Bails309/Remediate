import { describe, expect, it, vi, beforeEach } from "vitest";

vi.mock("@/lib/prisma", () => ({
  prisma: {
    aiConfig: {
      findFirst: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
    },
  },
}));

vi.mock("@/lib/crypto", () => ({
  encrypt: vi.fn((s: string) => `enc:${s}`),
  decrypt: vi.fn((s: string) => s.replace(/^enc:/, "")),
}));

import { prisma } from "@/lib/prisma";
import {
  getAiConfig,
  isAiInsightsAvailable,
  isAiProviderType,
  upsertAiConfig,
} from "@/lib/ai/config";

const findFirst = prisma.aiConfig.findFirst as unknown as ReturnType<typeof vi.fn>;
const create = prisma.aiConfig.create as unknown as ReturnType<typeof vi.fn>;
const update = prisma.aiConfig.update as unknown as ReturnType<typeof vi.fn>;

const AI_ENV_KEYS = [
  "AI_PROVIDER",
  "AI_BASE_URL",
  "AI_API_KEY",
  "AI_MODEL",
  "AI_API_VERSION",
  "AI_INSIGHTS_ENABLED",
] as const;

function clearAiEnv() {
  for (const key of AI_ENV_KEYS) delete process.env[key];
}

beforeEach(() => {
  vi.clearAllMocks();
  clearAiEnv();
});

describe("isAiProviderType", () => {
  it("accepts the three supported providers", () => {
    expect(isAiProviderType("azure-openai")).toBe(true);
    expect(isAiProviderType("foundry")).toBe(true);
    expect(isAiProviderType("openai-compatible")).toBe(true);
  });

  it("rejects unknown providers", () => {
    expect(isAiProviderType("bedrock")).toBe(false);
    expect(isAiProviderType("")).toBe(false);
  });
});

describe("getAiConfig", () => {
  it("prefers a decrypted DB row over env vars", async () => {
    findFirst.mockResolvedValue({
      id: "1",
      providerType: "azure-openai",
      baseUrlEnc: "enc:https://res.openai.azure.com",
      apiKeyEnc: "enc:secret-key",
      model: "gpt-4o-mini",
      apiVersion: "2024-10-21",
      enabled: true,
    });

    const config = await getAiConfig();
    expect(config).toEqual({
      providerType: "azure-openai",
      baseUrl: "https://res.openai.azure.com",
      apiKey: "secret-key",
      model: "gpt-4o-mini",
      apiVersion: "2024-10-21",
      enabled: true,
      source: "db",
    });
  });

  it("coerces an unknown DB providerType to openai-compatible and maps a null apiVersion", async () => {
    findFirst.mockResolvedValue({
      id: "1",
      providerType: "mystery",
      baseUrlEnc: "enc:https://host/v1",
      apiKeyEnc: "enc:k",
      model: "m",
      apiVersion: null,
      enabled: false,
    });

    const config = await getAiConfig();
    expect(config?.providerType).toBe("openai-compatible");
    expect(config?.apiVersion).toBeUndefined();
    expect(config?.enabled).toBe(false);
    expect(config?.source).toBe("db");
  });

  it("falls back to env vars when no DB row exists", async () => {
    findFirst.mockResolvedValue(null);
    process.env.AI_PROVIDER = "openai-compatible";
    process.env.AI_BASE_URL = "https://api.openai.com/v1";
    process.env.AI_API_KEY = "env-key";
    process.env.AI_MODEL = "gpt-4o";

    const config = await getAiConfig();
    expect(config).toMatchObject({
      providerType: "openai-compatible",
      baseUrl: "https://api.openai.com/v1",
      apiKey: "env-key",
      model: "gpt-4o",
      enabled: true,
      source: "env",
    });
  });

  it("treats AI_INSIGHTS_ENABLED=false as disabled and coerces unknown env provider", async () => {
    findFirst.mockResolvedValue(null);
    process.env.AI_PROVIDER = "nope";
    process.env.AI_BASE_URL = "https://host/v1";
    process.env.AI_API_KEY = "k";
    process.env.AI_MODEL = "m";
    process.env.AI_INSIGHTS_ENABLED = "false";

    const config = await getAiConfig();
    expect(config?.providerType).toBe("openai-compatible");
    expect(config?.enabled).toBe(false);
  });

  it("returns null when neither DB nor a complete env set is present", async () => {
    findFirst.mockResolvedValue(null);
    process.env.AI_PROVIDER = "openai-compatible";
    // AI_BASE_URL / AI_API_KEY / AI_MODEL missing
    expect(await getAiConfig()).toBeNull();
  });
});

describe("isAiInsightsAvailable", () => {
  it("is true only when a config is enabled", async () => {
    findFirst.mockResolvedValue({
      id: "1",
      providerType: "openai-compatible",
      baseUrlEnc: "enc:https://host/v1",
      apiKeyEnc: "enc:k",
      model: "m",
      apiVersion: null,
      enabled: true,
    });
    expect(await isAiInsightsAvailable()).toBe(true);
  });

  it("is false when nothing is configured", async () => {
    findFirst.mockResolvedValue(null);
    expect(await isAiInsightsAvailable()).toBe(false);
  });
});

describe("upsertAiConfig", () => {
  const input = {
    providerType: "azure-openai" as const,
    baseUrl: "https://res.openai.azure.com",
    apiKey: "plain-key",
    model: "gpt-4o-mini",
    apiVersion: "2024-10-21",
    enabled: true,
  };

  it("creates a new row (encrypting secrets) when none exists", async () => {
    findFirst.mockResolvedValue(null);
    create.mockResolvedValue({ id: "new" });

    await upsertAiConfig(input);

    expect(create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        providerType: "azure-openai",
        baseUrlEnc: "enc:https://res.openai.azure.com",
        apiKeyEnc: "enc:plain-key",
        model: "gpt-4o-mini",
        apiVersion: "2024-10-21",
        enabled: true,
      }),
    });
    expect(update).not.toHaveBeenCalled();
  });

  it("updates the existing row and stores a null apiVersion when omitted", async () => {
    findFirst.mockResolvedValue({ id: "existing" });
    update.mockResolvedValue({ id: "existing" });

    await upsertAiConfig({ ...input, apiVersion: undefined });

    expect(update).toHaveBeenCalledWith({
      where: { id: "existing" },
      data: expect.objectContaining({ apiVersion: null }),
    });
    expect(create).not.toHaveBeenCalled();
  });
});
