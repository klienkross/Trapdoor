import type { LLMMessage, LLMProvider } from "./provider";

export type OpenAICompatibleProviderOptions = {
  endpoint: string;
  model: string;
  apiKey?: string;
  fetch?: typeof globalThis.fetch;
};

export class LLMProviderHttpError extends Error {
  readonly status: number;
  readonly statusText: string;

  constructor(status: number, statusText: string) {
    super(
      statusText
        ? `LLM provider request failed with HTTP ${status} ${statusText}`
        : `LLM provider request failed with HTTP ${status}`,
    );
    this.name = "LLMProviderHttpError";
    this.status = status;
    this.statusText = statusText;
  }
}

export class LLMProviderResponseError extends Error {
  constructor(message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = "LLMProviderResponseError";
  }
}

function normalizeEndpoint(endpoint: string): string {
  return endpoint.replace(/\/+$/, "");
}

function extractContent(body: unknown): string {
  if (typeof body !== "object" || body === null || !("choices" in body)) {
    throw new LLMProviderResponseError(
      "LLM provider response is missing choices",
    );
  }

  const choices = (body as { choices?: unknown }).choices;
  if (!Array.isArray(choices) || choices.length === 0) {
    throw new LLMProviderResponseError(
      "LLM provider response has no choices",
    );
  }

  const firstChoice = choices[0];
  if (
    typeof firstChoice !== "object" ||
    firstChoice === null ||
    !("message" in firstChoice)
  ) {
    throw new LLMProviderResponseError(
      "LLM provider response is missing the first choice message",
    );
  }

  const message = (firstChoice as { message?: unknown }).message;
  if (typeof message !== "object" || message === null || !("content" in message)) {
    throw new LLMProviderResponseError(
      "LLM provider response is missing message content",
    );
  }

  const content = (message as { content?: unknown }).content;
  if (typeof content !== "string") {
    throw new LLMProviderResponseError(
      "LLM provider response message content is not a string",
    );
  }

  return content;
}

export class OpenAICompatibleProvider implements LLMProvider {
  private readonly endpoint: string;
  private readonly model: string;
  private readonly apiKey?: string;
  private readonly fetchImpl: typeof globalThis.fetch;

  constructor(options: OpenAICompatibleProviderOptions) {
    this.endpoint = normalizeEndpoint(options.endpoint);
    this.model = options.model;
    this.apiKey = options.apiKey;
    this.fetchImpl = options.fetch ?? globalThis.fetch;
  }

  async complete(
    messages: readonly LLMMessage[],
    signal?: AbortSignal,
  ): Promise<string> {
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
    };
    if (this.apiKey) {
      headers.Authorization = `Bearer ${this.apiKey}`;
    }

    const response = await this.fetchImpl(
      `${this.endpoint}/chat/completions`,
      {
        method: "POST",
        headers,
        body: JSON.stringify({
          model: this.model,
          messages,
        }),
        signal,
      },
    );

    if (!response.ok) {
      throw new LLMProviderHttpError(response.status, response.statusText);
    }

    let body: unknown;
    try {
      body = await response.json();
    } catch (cause) {
      throw new LLMProviderResponseError(
        "LLM provider returned invalid JSON",
        { cause },
      );
    }

    return extractContent(body);
  }
}
