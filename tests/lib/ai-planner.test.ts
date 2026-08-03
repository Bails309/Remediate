import { describe, expect, it, vi, beforeEach } from "vitest";

vi.mock("@/lib/ai/provider", () => ({
  chatCompletion: vi.fn(),
}));

import { chatCompletion } from "@/lib/ai/provider";
import { planQuery, AiPlanError } from "@/lib/ai/insights";
import type { AiConfig } from "@/lib/ai/config";

const chatMock = chatCompletion as unknown as ReturnType<typeof vi.fn>;

const CONFIG: AiConfig = {
  providerType: "openai-compatible",
  baseUrl: "https://api.openai.com/v1",
  apiKey: "secret",
  model: "gpt-4o-mini",
  enabled: true,
  source: "db",
};

beforeEach(() => {
  vi.clearAllMocks();
});

describe("planQuery", () => {
  it("returns a validated spec from the model response", async () => {
    chatMock.mockResolvedValue('{"risk":["Critical"],"hasFix":true,"limit":10}');

    const spec = await planQuery("critical fixable vulns", CONFIG);

    expect(spec).toEqual({ risk: ["Critical"], hasFix: true, limit: 10 });
    expect(chatMock).toHaveBeenCalledWith(
      expect.objectContaining({ config: CONFIG, json: true }),
    );
  });

  it("strips unknown keys the model might emit before returning", async () => {
    chatMock.mockResolvedValue('{"status":["Open"],"sql":"DROP TABLE","evil":true}');

    const spec = await planQuery("still open", CONFIG);

    expect(spec).toEqual({ status: ["Open"] });
  });

  it("throws AiPlanError when the model produces an invalid spec", async () => {
    chatMock.mockResolvedValue('{"risk":["NotARealRisk"]}');

    await expect(planQuery("bad", CONFIG)).rejects.toBeInstanceOf(AiPlanError);
  });

  it("propagates AiPlanError when the response has no JSON", async () => {
    chatMock.mockResolvedValue("I cannot help with that.");

    await expect(planQuery("no json", CONFIG)).rejects.toBeInstanceOf(AiPlanError);
  });
});
