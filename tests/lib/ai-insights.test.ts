import { describe, it, expect } from "vitest";
import {
  buildWhereFromSpec,
  buildOrderBy,
  extractJson,
  AiPlanError,
} from "../../lib/ai/insights";
import { querySpecSchema } from "../../lib/ai/query-spec";
import { buildChatRequest } from "../../lib/ai/provider";

describe("buildWhereFromSpec", () => {
  it("returns an empty filter for an empty spec", () => {
    expect(buildWhereFromSpec({})).toEqual({});
  });

  it("maps risk and status arrays to `in` filters", () => {
    const where = buildWhereFromSpec({ risk: ["Critical", "High"], status: ["Open"] });
    expect(where).toEqual({
      AND: [{ risk: { in: ["Critical", "High"] } }, { status: { in: ["Open"] } }],
    });
  });

  it("maps hasFix=true to a not-NoFixAvailable + remediation-present filter", () => {
    const where = buildWhereFromSpec({ hasFix: true });
    expect(where).toEqual({
      AND: [
        { status: { not: "NoFixAvailable" } },
        { OR: [{ solution: { not: null } }, { remediation: { not: null } }] },
      ],
    });
  });

  it("maps hasFix=false to the inverse filter", () => {
    const where = buildWhereFromSpec({ hasFix: false });
    expect(where).toEqual({
      AND: [
        {
          OR: [
            { status: "NoFixAvailable" },
            { AND: [{ solution: null }, { remediation: null }] },
          ],
        },
      ],
    });
  });

  it("maps internetFacing=true to a PT plugin prefix match", () => {
    expect(buildWhereFromSpec({ internetFacing: true })).toEqual({
      AND: [{ pluginId: { startsWith: "PT", mode: "insensitive" } }],
    });
  });

  it("maps internetFacing=false to a negated PT plugin prefix match", () => {
    expect(buildWhereFromSpec({ internetFacing: false })).toEqual({
      AND: [{ NOT: { pluginId: { startsWith: "PT", mode: "insensitive" } } }],
    });
  });

  it("maps substring and numeric fields", () => {
    const where = buildWhereFromSpec({
      cveContains: "CVE-2024",
      packageContains: "openssl",
      minCvss: 7,
      scannerType: "ACR",
    });
    expect(where).toEqual({
      AND: [
        { scannerType: "ACR" },
        { cvssScore: { gte: 7 } },
        { cve: { contains: "CVE-2024", mode: "insensitive" } },
        { packageName: { contains: "openssl", mode: "insensitive" } },
      ],
    });
  });
});

describe("buildOrderBy", () => {
  it("defaults to severity-first ordering", () => {
    expect(buildOrderBy({})).toEqual([
      { risk: "asc" },
      { cvssScore: "desc" },
      { lastSeenAt: "desc" },
    ]);
  });

  it("honours an explicit cvssScore sort", () => {
    expect(buildOrderBy({ sortBy: "cvssScore", sortDir: "desc" })).toEqual([
      { cvssScore: "desc" },
      { lastSeenAt: "desc" },
    ]);
  });
});

describe("extractJson", () => {
  it("parses a bare JSON object", () => {
    expect(extractJson('{"risk":["Critical"]}')).toEqual({ risk: ["Critical"] });
  });

  it("parses JSON wrapped in a code fence with prose", () => {
    const raw = 'Here you go:\n```json\n{"limit": 10}\n```';
    expect(extractJson(raw)).toEqual({ limit: 10 });
  });

  it("throws AiPlanError when no JSON object is present", () => {
    expect(() => extractJson("no json here")).toThrow(AiPlanError);
  });
});

describe("querySpecSchema", () => {
  it("strips unknown keys emitted by the model", () => {
    const parsed = querySpecSchema.parse({ risk: ["Critical"], dropTable: true, sql: "DROP" });
    expect(parsed).toEqual({ risk: ["Critical"] });
  });

  it("rejects invalid enum values", () => {
    expect(querySpecSchema.safeParse({ risk: ["Nope"] }).success).toBe(false);
  });

  it("rejects an out-of-range limit", () => {
    expect(querySpecSchema.safeParse({ limit: 9999 }).success).toBe(false);
  });
});

describe("buildChatRequest", () => {
  it("builds an Azure OpenAI deployment URL with api-key auth", () => {
    const { url, headers } = buildChatRequest({
      providerType: "azure-openai",
      baseUrl: "https://res.openai.azure.com/",
      apiKey: "secret",
      model: "gpt-4o-mini",
      apiVersion: "2024-10-21",
    });
    expect(url).toBe(
      "https://res.openai.azure.com/openai/deployments/gpt-4o-mini/chat/completions?api-version=2024-10-21",
    );
    expect(headers["api-key"]).toBe("secret");
    expect(headers.Authorization).toBeUndefined();
  });

  it("builds a Foundry v1 URL from the resource root with api-key auth", () => {
    const { url, headers } = buildChatRequest({
      providerType: "foundry",
      baseUrl: "https://res.services.ai.azure.com/models",
      apiKey: "secret",
      model: "gpt-4o-mini",
      apiVersion: "preview",
    });
    expect(url).toBe(
      "https://res.services.ai.azure.com/openai/v1/chat/completions?api-version=preview",
    );
    expect(headers["api-key"]).toBe("secret");
  });

  it("normalises a Foundry project endpoint and defaults api-version to preview", () => {
    const { url } = buildChatRequest({
      providerType: "foundry",
      baseUrl: "https://res.services.ai.azure.com/api/projects/remediate",
      apiKey: "secret",
      model: "gpt-5-mini",
    });
    expect(url).toBe(
      "https://res.services.ai.azure.com/openai/v1/chat/completions?api-version=preview",
    );
  });

  it("builds an OpenAI-compatible URL with Bearer auth", () => {
    const { url, headers } = buildChatRequest({
      providerType: "openai-compatible",
      baseUrl: "https://api.openai.com/v1",
      apiKey: "secret",
      model: "gpt-4o-mini",
    });
    expect(url).toBe("https://api.openai.com/v1/chat/completions");
    expect(headers.Authorization).toBe("Bearer secret");
    expect(headers["api-key"]).toBeUndefined();
  });
});
