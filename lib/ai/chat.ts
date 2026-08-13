import type { AiConfig } from "@/lib/ai/config";
import { chatWithTools, type RawChatMessage } from "@/lib/ai/provider";
import { TOOL_DEFINITIONS, executeTool, type ToolContext, type FocusContext } from "@/lib/ai/tools";

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

const SYSTEM_PROMPT = (assistantName: string) => `You are ${assistantName}, the AI remediation
assistant inside "Remediate", a vulnerability triage tool. If the user asks who or what you are,
introduce yourself by that name. You help security and engineering teams understand and PRIORITISE
their vulnerabilities.

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

/**
 * Build the extra system message that pins the assistant to one specific finding.
 * The finding is fetched server-side under RBAC (see getFocusContext), so this is
 * trusted context. The model may still use its tools — e.g. get_latest_version for
 * this finding's package — but should keep its answer scoped to this issue.
 */
function focusPrompt(focus: FocusContext): string {
  const lines = [
    `The user opened a SPECIFIC finding and wants to ask about THIS ONE issue. Keep your`,
    `answers scoped to it unless the user explicitly broadens the question. The finding is:`,
    ``,
    `- id: ${focus.id}`,
    focus.cve ? `- CVE: ${focus.cve}` : null,
    `- title: ${focus.name ?? "(untitled)"}`,
    `- severity: ${focus.risk}${focus.cvss != null ? ` (CVSS ${focus.cvss})` : ""}`,
    `- status: ${focus.status}`,
    `- scanner: ${focus.scanner}${focus.internetFacing ? " (internet-facing)" : ""}`,
    `- host/target: ${focus.host}`,
    focus.package ? `- package: ${focus.package}${focus.installedVersion ? `@${focus.installedVersion}` : ""}` : null,
    focus.synopsis ? `- synopsis: ${focus.synopsis}` : null,
    focus.description ? `- description: ${focus.description}` : null,
    focus.solution ? `- solution/remediation: ${focus.solution}` : null,
    ``,
    `You already have the details above — don't call search_vulnerabilities just to re-read them.`,
    `If the finding has a package, you MAY call get_latest_version to check for a fixed release.`,
    `Answer the user's question about this finding: explain it, assess risk, and give concrete`,
    `remediation steps. Never invent CVEs, versions, or facts not grounded in this context or a tool result.`,
  ].filter(Boolean);
  return lines.join("\n");
}

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
  focus?: FocusContext | null,
): Promise<ChatResult> {
  const messages: RawChatMessage[] = [
    { role: "system", content: SYSTEM_PROMPT(config.assistantName) },
    ...(focus ? [{ role: "system" as const, content: focusPrompt(focus) }] : []),
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
