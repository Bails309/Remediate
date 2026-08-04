import type { AiConfig } from "@/lib/ai/config";

export type ChatMessage = {
  role: "system" | "user" | "assistant";
  content: string;
};

export class AiProviderError extends Error {
  status?: number;
  constructor(message: string, status?: number) {
    super(message);
    this.name = "AiProviderError";
    this.status = status;
  }
}

function trimTrailingSlash(url: string): string {
  return url.replace(/\/+$/, "");
}

/**
 * Reduce an Azure AI Foundry endpoint to its resource root so we can build the
 * modern OpenAI v1 inference route. Foundry surfaces several endpoint shapes in
 * the portal that people paste verbatim; strip the ones that aren't the root:
 *   - https://res.services.ai.azure.com/api/projects/<project>  (project endpoint)
 *   - https://res.services.ai.azure.com/models                  (model inference)
 *   - https://res.services.ai.azure.com/openai/v1               (already v1)
 */
export function foundryResourceRoot(baseUrl: string): string {
  let root = trimTrailingSlash(baseUrl);
  root = root.replace(/\/api\/projects\/[^/]+$/i, "");
  root = root.replace(/\/openai\/v1$/i, "").replace(/\/openai$/i, "").replace(/\/models$/i, "");
  return trimTrailingSlash(root);
}

/**
 * Build the request URL + headers for a chat-completion call. Pure and
 * side-effect free so it can be unit tested against each provider shape.
 */
export function buildChatRequest(config: Pick<AiConfig, "providerType" | "baseUrl" | "apiKey" | "model" | "apiVersion">): {
  url: string;
  headers: Record<string, string>;
} {
  const base = trimTrailingSlash(config.baseUrl);
  const headers: Record<string, string> = { "Content-Type": "application/json" };

  if (config.providerType === "azure-openai") {
    const apiVersion = config.apiVersion || "2024-10-21";
    headers["api-key"] = config.apiKey;
    return {
      url: `${base}/openai/deployments/${encodeURIComponent(config.model)}/chat/completions?api-version=${encodeURIComponent(apiVersion)}`,
      headers,
    };
  }

  if (config.providerType === "foundry") {
    // Azure AI Foundry exposes the unified OpenAI v1 route at the resource root.
    // The model is passed in the request body; auth is the resource api-key. The
    // v1 surface expects `api-version=preview` (or `v1`), NOT a dated version.
    headers["api-key"] = config.apiKey;
    const apiVersion = config.apiVersion || "preview";
    const root = foundryResourceRoot(config.baseUrl);
    return {
      url: `${root}/openai/v1/chat/completions?api-version=${encodeURIComponent(apiVersion)}`,
      headers,
    };
  }

  // openai-compatible: baseUrl already includes the version segment (e.g. /v1).
  headers["Authorization"] = `Bearer ${config.apiKey}`;
  return { url: `${base}/chat/completions`, headers };
}

/**
 * Next-generation reasoning models (gpt-5 family, o-series) reject the classic
 * `max_tokens` field (they require `max_completion_tokens`) and only support the
 * default sampling temperature. Detect them so we can shape the body correctly.
 */
export function isReasoningModel(model: string): boolean {
  return /gpt-5|(^|[-_/])o[134]([-_]|$)/i.test(model);
}

/**
 * Whether the model name should be included in the request body. Azure OpenAI
 * encodes the deployment in the URL, but still accepts `model`; every other
 * provider requires it in the body.
 */
function bodyModel(config: Pick<AiConfig, "providerType" | "model">): string {
  return config.model;
}

export type ChatCompletionOptions = {
  config: AiConfig;
  messages: ChatMessage[];
  temperature?: number;
  maxTokens?: number;
  /** Ask the provider to return a strict JSON object when supported. */
  json?: boolean;
  /** Abort the request after this many milliseconds. */
  timeoutMs?: number;
};

/**
 * Send a chat-completion request and return the assistant message content.
 * Provider-agnostic; throws {@link AiProviderError} on transport/HTTP failure.
 */
export async function chatCompletion(options: ChatCompletionOptions): Promise<string> {
  const { config, messages, temperature = 0, maxTokens = 500, json = false, timeoutMs = 20000 } = options;
  const { url, headers } = buildChatRequest(config);

  const body: Record<string, unknown> = {
    model: bodyModel(config),
    messages,
  };
  if (isReasoningModel(config.model)) {
    // gpt-5 / o-series: use `max_completion_tokens` and leave temperature at the
    // default. Reserve extra headroom so reasoning tokens don't starve the
    // visible completion (which would surface as an "empty response").
    body.max_completion_tokens = Math.max(maxTokens, 2048);
  } else {
    body.temperature = temperature;
    body.max_tokens = maxTokens;
  }
  if (json) {
    body.response_format = { type: "json_object" };
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  let response: Response;
  try {
    response = await fetch(url, {
      method: "POST",
      headers,
      body: JSON.stringify(body),
      signal: controller.signal,
    });
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") {
      throw new AiProviderError("The AI provider timed out.", 504);
    }
    throw new AiProviderError("Could not reach the AI provider.");
  } finally {
    clearTimeout(timer);
  }

  if (!response.ok) {
    const detail = await response.text().catch(() => "");
    throw new AiProviderError(
      `AI provider returned ${response.status}${detail ? `: ${detail.slice(0, 200)}` : ""}`,
      response.status,
    );
  }

  const payload = (await response.json().catch(() => null)) as
    | { choices?: Array<{ message?: { content?: string } }> }
    | null;
  const content = payload?.choices?.[0]?.message?.content;
  if (!content || typeof content !== "string") {
    throw new AiProviderError("AI provider returned an empty response.");
  }
  return content;
}

/** A tool call the model asked us to run. */
export type ToolCall = {
  id: string;
  type: "function";
  function: { name: string; arguments: string };
};

/**
 * A message on the wire. Extends {@link ChatMessage} with the roles/fields needed
 * for a tool-calling loop: assistant messages may carry `tool_calls`, and `tool`
 * messages carry the result of a call keyed by `tool_call_id`.
 */
export type RawChatMessage = {
  role: "system" | "user" | "assistant" | "tool";
  content: string | null;
  tool_calls?: ToolCall[];
  tool_call_id?: string;
  name?: string;
};

export type ToolDefinition = {
  type: "function";
  function: { name: string; description: string; parameters: Record<string, unknown> };
};

export type ChatWithToolsOptions = {
  config: AiConfig;
  messages: RawChatMessage[];
  tools: readonly ToolDefinition[];
  temperature?: number;
  maxTokens?: number;
  timeoutMs?: number;
};

export type AssistantTurn = {
  content: string | null;
  toolCalls: ToolCall[];
};

/**
 * Single round-trip of a tool-calling chat completion. Returns the assistant
 * message (which may contain `tool_calls` instead of, or alongside, content).
 * The caller drives the loop: execute the tools, append `tool` messages, and
 * call again until no more tool calls are returned.
 */
export async function chatWithTools(options: ChatWithToolsOptions): Promise<AssistantTurn> {
  const { config, messages, tools, temperature = 0.2, maxTokens = 1200, timeoutMs = 30000 } = options;
  const { url, headers } = buildChatRequest(config);

  const body: Record<string, unknown> = {
    model: bodyModel(config),
    messages,
    tools,
    tool_choice: "auto",
  };
  if (isReasoningModel(config.model)) {
    body.max_completion_tokens = Math.max(maxTokens, 2048);
  } else {
    body.temperature = temperature;
    body.max_tokens = maxTokens;
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  let response: Response;
  try {
    response = await fetch(url, {
      method: "POST",
      headers,
      body: JSON.stringify(body),
      signal: controller.signal,
    });
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") {
      throw new AiProviderError("The AI provider timed out.", 504);
    }
    throw new AiProviderError("Could not reach the AI provider.");
  } finally {
    clearTimeout(timer);
  }

  if (!response.ok) {
    const detail = await response.text().catch(() => "");
    throw new AiProviderError(
      `AI provider returned ${response.status}${detail ? `: ${detail.slice(0, 200)}` : ""}`,
      response.status,
    );
  }

  const payload = (await response.json().catch(() => null)) as
    | { choices?: Array<{ message?: { content?: string | null; tool_calls?: ToolCall[] } }> }
    | null;
  const message = payload?.choices?.[0]?.message;
  if (!message) {
    throw new AiProviderError("AI provider returned an empty response.");
  }
  return {
    content: typeof message.content === "string" ? message.content : null,
    toolCalls: Array.isArray(message.tool_calls) ? message.tool_calls : [],
  };
}
