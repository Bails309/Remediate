import { describe, expect, it, vi, beforeEach } from "vitest";

vi.mock("@/lib/ai/provider", () => ({
  chatWithTools: vi.fn(),
  AiProviderError: class AiProviderError extends Error {},
}));

vi.mock("@/lib/ai/tools", () => ({
  TOOL_DEFINITIONS: [],
  executeTool: vi.fn(),
}));

import { chatWithTools } from "@/lib/ai/provider";
import { executeTool } from "@/lib/ai/tools";
import { runChat, AiChatError } from "@/lib/ai/chat";
import type { AiConfig } from "@/lib/ai/config";

const turnMock = chatWithTools as unknown as ReturnType<typeof vi.fn>;
const toolMock = executeTool as unknown as ReturnType<typeof vi.fn>;

const CONFIG: AiConfig = {
  providerType: "openai-compatible",
  baseUrl: "https://api.openai.com/v1",
  apiKey: "secret",
  model: "gpt-4o-mini",
  assistantName: "Ask AI",
  enabled: true,
  source: "db",
};

const CTX = { isAdmin: false, memberOf: [] as string[] };

beforeEach(() => {
  vi.clearAllMocks();
});

describe("runChat", () => {
  it("returns the reply directly when the model requests no tools", async () => {
    turnMock.mockResolvedValueOnce({ content: "Here is your summary.", toolCalls: [] });

    const result = await runChat([{ role: "user", content: "summarise" }], CONFIG, CTX);

    expect(result.reply).toBe("Here is your summary.");
    expect(result.tools).toEqual([]);
    expect(toolMock).not.toHaveBeenCalled();
  });

  it("executes a requested tool then returns the follow-up answer", async () => {
    turnMock
      .mockResolvedValueOnce({
        content: null,
        toolCalls: [
          {
            id: "call_1",
            type: "function",
            function: { name: "search_vulnerabilities", arguments: '{"risk":["Critical"]}' },
          },
        ],
      })
      .mockResolvedValueOnce({ content: "You have 2 critical findings.", toolCalls: [] });

    toolMock.mockResolvedValueOnce({ ok: true, content: '{"total":2,"items":[]}' });

    const result = await runChat([{ role: "user", content: "critical?" }], CONFIG, CTX);

    expect(toolMock).toHaveBeenCalledWith(
      "search_vulnerabilities",
      { risk: ["Critical"] },
      CTX,
    );
    expect(result.tools).toEqual([
      { name: "search_vulnerabilities", arguments: { risk: ["Critical"] }, ok: true },
    ]);
    expect(result.reply).toBe("You have 2 critical findings.");

    // The second model call must include the tool result message.
    const secondCallMessages = turnMock.mock.calls[1][0].messages;
    const toolMsg = secondCallMessages.find((m: { role: string }) => m.role === "tool");
    expect(toolMsg).toMatchObject({ tool_call_id: "call_1", content: '{"total":2,"items":[]}' });
  });

  it("throws AiChatError when the final content is empty", async () => {
    turnMock.mockResolvedValueOnce({ content: "   ", toolCalls: [] });

    await expect(runChat([{ role: "user", content: "hi" }], CONFIG, CTX)).rejects.toBeInstanceOf(
      AiChatError,
    );
  });

  it("does not forward assistant turns with empty content into history", async () => {
    turnMock.mockResolvedValueOnce({ content: "answer", toolCalls: [] });

    await runChat(
      [
        { role: "user", content: "first" },
        { role: "assistant", content: "" },
        { role: "user", content: "second" },
      ],
      CONFIG,
      CTX,
    );

    const messages = turnMock.mock.calls[0][0].messages;
    // system + two non-empty user turns only.
    expect(messages.filter((m: { role: string }) => m.role === "user")).toHaveLength(2);
    expect(messages.some((m: { content: string }) => m.content === "")).toBe(false);
  });
});
