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
    // Azure AI Foundry model inference endpoint (OpenAI-compatible). The model
    // is passed in the request body; auth is the resource api-key.
    headers["api-key"] = config.apiKey;
    const query = config.apiVersion ? `?api-version=${encodeURIComponent(config.apiVersion)}` : "";
    return { url: `${base}/chat/completions${query}`, headers };
  }

  // openai-compatible: baseUrl already includes the version segment (e.g. /v1).
  headers["Authorization"] = `Bearer ${config.apiKey}`;
  return { url: `${base}/chat/completions`, headers };
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
    temperature,
    max_tokens: maxTokens,
  };
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
