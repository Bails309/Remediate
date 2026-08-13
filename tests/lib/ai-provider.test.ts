import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { chatCompletion, chatWithTools, AiProviderError } from "@/lib/ai/provider";
import type { AiConfig } from "@/lib/ai/config";

const BASE_CONFIG: AiConfig = {
  providerType: "openai-compatible",
  baseUrl: "https://api.openai.com/v1",
  apiKey: "secret",
  model: "gpt-4o-mini",
  assistantName: "Ask AI",
  enabled: true,
  source: "db",
};

function jsonResponse(body: unknown, init?: { ok?: boolean; status?: number }): Response {
  return {
    ok: init?.ok ?? true,
    status: init?.status ?? 200,
    json: async () => body,
    text: async () => (typeof body === "string" ? body : JSON.stringify(body)),
  } as unknown as Response;
}

beforeEach(() => {
  vi.restoreAllMocks();
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("chatCompletion", () => {
  it("posts to the built URL and returns the assistant message content", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      jsonResponse({ choices: [{ message: { content: "hello world" } }] }),
    );
    vi.stubGlobal("fetch", fetchMock);

    const content = await chatCompletion({
      config: BASE_CONFIG,
      messages: [{ role: "user", content: "hi" }],
    });

    expect(content).toBe("hello world");
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("https://api.openai.com/v1/chat/completions");
    expect(init.method).toBe("POST");
    const body = JSON.parse(init.body as string);
    expect(body.model).toBe("gpt-4o-mini");
    expect(body.temperature).toBe(0);
    expect(body.response_format).toBeUndefined();
  });

  it("adds a json response_format when json is requested", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      jsonResponse({ choices: [{ message: { content: "{}" } }] }),
    );
    vi.stubGlobal("fetch", fetchMock);

    await chatCompletion({
      config: BASE_CONFIG,
      messages: [{ role: "user", content: "hi" }],
      json: true,
    });

    const body = JSON.parse(fetchMock.mock.calls[0][1].body as string);
    expect(body.response_format).toEqual({ type: "json_object" });
  });

  it("shapes the body for reasoning models (max_completion_tokens, no temperature)", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      jsonResponse({ choices: [{ message: { content: "ok" } }] }),
    );
    vi.stubGlobal("fetch", fetchMock);

    await chatCompletion({
      config: { ...BASE_CONFIG, model: "gpt-5-mini" },
      messages: [{ role: "user", content: "hi" }],
    });

    const body = JSON.parse(fetchMock.mock.calls[0][1].body as string);
    expect(body.temperature).toBeUndefined();
    expect(body.max_tokens).toBeUndefined();
    expect(body.max_completion_tokens).toBeGreaterThanOrEqual(2048);
  });

  it("throws AiProviderError with the status on a non-ok response", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(jsonResponse("rate limited", { ok: false, status: 429 })),
    );

    await expect(
      chatCompletion({ config: BASE_CONFIG, messages: [{ role: "user", content: "hi" }] }),
    ).rejects.toMatchObject({ name: "AiProviderError", status: 429 });
  });

  it("maps an aborted request to a 504 AiProviderError", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockRejectedValue(Object.assign(new Error("aborted"), { name: "AbortError" })),
    );

    await expect(
      chatCompletion({
        config: BASE_CONFIG,
        messages: [{ role: "user", content: "hi" }],
        timeoutMs: 5,
      }),
    ).rejects.toMatchObject({ name: "AiProviderError", status: 504 });
  });

  it("maps a network failure to a generic AiProviderError", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("ECONNREFUSED")));

    await expect(
      chatCompletion({ config: BASE_CONFIG, messages: [{ role: "user", content: "hi" }] }),
    ).rejects.toBeInstanceOf(AiProviderError);
  });

  it("throws when the provider returns no message content", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(jsonResponse({ choices: [{ message: {} }] })),
    );

    await expect(
      chatCompletion({ config: BASE_CONFIG, messages: [{ role: "user", content: "hi" }] }),
    ).rejects.toThrow(/empty response/i);
  });
});

describe("chatWithTools", () => {
  const TOOLS = [
    {
      type: "function" as const,
      function: { name: "noop", description: "does nothing", parameters: { type: "object", properties: {} } },
    },
  ];

  it("sends the tools and tool_choice, and returns parsed tool_calls", async () => {
    const toolCalls = [
      { id: "call_1", type: "function", function: { name: "noop", arguments: "{}" } },
    ];
    const fetchMock = vi.fn().mockResolvedValue(
      jsonResponse({ choices: [{ message: { content: null, tool_calls: toolCalls } }] }),
    );
    vi.stubGlobal("fetch", fetchMock);

    const turn = await chatWithTools({
      config: BASE_CONFIG,
      messages: [{ role: "user", content: "go" }],
      tools: TOOLS,
    });

    expect(turn.content).toBeNull();
    expect(turn.toolCalls).toEqual(toolCalls);
    const body = JSON.parse(fetchMock.mock.calls[0][1].body as string);
    expect(body.tools).toEqual(TOOLS);
    expect(body.tool_choice).toBe("auto");
    expect(body.response_format).toBeUndefined();
  });

  it("returns content with an empty toolCalls array when the model answers", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(jsonResponse({ choices: [{ message: { content: "done" } }] })),
    );

    const turn = await chatWithTools({
      config: BASE_CONFIG,
      messages: [{ role: "user", content: "go" }],
      tools: TOOLS,
    });

    expect(turn.content).toBe("done");
    expect(turn.toolCalls).toEqual([]);
  });
});

