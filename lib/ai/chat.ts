import type { AiConfig } from "@/lib/ai/config";
import { chatWithTools, type RawChatMessage } from "@/lib/ai/provider";
import { TOOL_DEFINITIONS, executeTool, type ToolContext } from "@/lib/ai/tools";

export class AiChatError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AiChatError";
  }
}

/** A turn in the visible conversation exchanged with the client. */
export type ChatTurn = { role: "user" | "assistant"; content: string };

/** A record of a tool the assistant invoked, surfaced for transparency/audit. */
export type ToolInvocation = { name: string; arguments: unknown; ok: boolean };

export type ChatResult = { reply: string; tools: ToolInvocation[] };

/** Hard ceiling on tool round-trips so a model can't loop indefinitely. */
const MAX_ITERATIONS = 6;

const SYSTEM_PROMPT = `You are the AI remediation assistant inside "Remediate", a vulnerability
triage tool. You help security and engineering teams understand and PRIORITISE their vulnerabilities.

You have tools:
- "search_vulnerabilities": fetch the user's findings. Results are ALREADY restricted to what this
  user is permitted to see — never claim you can see more. Call it (repeatedly if needed) to gather
  the data you need before answering. It returns a ranked, capped list and the total match count.
- "get_latest_version": look up the latest published version of a package from its public registry,
  so you can tell the user whether a newer, fixed release exists.

How to help:
- To answer questions about "the current issues", CALL search_vulnerabilities first — do not guess.
- When asked to prioritise, rank by severity (Critical > High > …), then CVSS, exploitability
  (internet-facing findings are more urgent), and whether a fix is already available.
- When asked about upgrades/new versions, use get_latest_version and compare against the installed
  version. Note when a package looks like an OS/base-image package with no public registry.
- Only state CVEs, versions, and counts that came from a tool result. NEVER invent data. If a search
  returns nothing, say so plainly.
- Be concise and scannable: short summary first, then a prioritised markdown table or bullet list.
  Call out the total match count when results were truncated.`;

function sanitizeHistory(turns: ChatTurn[]): RawChatMessage[] {
  return turns
    .filter((t) => (t.role === "user" || t.role === "assistant") && t.content.trim().length > 0)
    .map((t) => ({ role: t.role, content: t.content }));
}

/**
 * Run a multi-turn, tool-using chat and return the assistant's final reply plus
 * the list of tools it invoked. RBAC is enforced inside every tool via {@link ToolContext}.
 */
export async function runChat(
  history: ChatTurn[],
  config: AiConfig,
  ctx: ToolContext,
): Promise<ChatResult> {
  const messages: RawChatMessage[] = [
    { role: "system", content: SYSTEM_PROMPT },
    ...sanitizeHistory(history),
  ];
  const tools: ToolInvocation[] = [];

  for (let i = 0; i < MAX_ITERATIONS; i++) {
    const turn = await chatWithTools({ config, messages, tools: TOOL_DEFINITIONS });

    if (turn.toolCalls.length === 0) {
      const reply = (turn.content ?? "").trim();
      if (!reply) {
        console.error(
          `[ai-chat] empty assistant reply (finish_reason=${turn.finishReason ?? "unknown"}, iteration=${i})`,
        );
        if (turn.finishReason === "length") {
          throw new AiChatError(
            "The AI ran out of response space before answering. Try a more specific question, or ask an administrator to use a larger model.",
          );
        }
        throw new AiChatError("The AI returned an empty response.");
      }
      return { reply, tools };
    }

    // Record the assistant's tool-call message verbatim so the follow-up request
    // is well-formed (tool results must reference the assistant's call ids).
    messages.push({ role: "assistant", content: turn.content, tool_calls: turn.toolCalls });

    for (const call of turn.toolCalls) {
      let args: unknown = {};
      try {
        args = call.function.arguments ? JSON.parse(call.function.arguments) : {};
      } catch {
        args = {};
      }
      const result = await executeTool(call.function.name, args, ctx);
      tools.push({ name: call.function.name, arguments: args, ok: result.ok });
      messages.push({ role: "tool", tool_call_id: call.id, name: call.function.name, content: result.content });
    }
  }

  // Ran out of iterations — ask for a final answer with no further tools.
  const final = await chatWithTools({
    config,
    messages: [
      ...messages,
      { role: "user", content: "Summarise what you have found so far and stop calling tools." },
    ],
    tools: [],
  });
  const reply = (final.content ?? "").trim();
  if (!reply) throw new AiChatError("The AI could not complete the request.");
  return { reply, tools };
}
