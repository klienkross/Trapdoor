import { describe, expect, it, vi } from "vitest";

import type { LLMMessage, LLMProvider } from "../../src/llm/provider";
import {
  LLMProviderHttpError,
  LLMProviderResponseError,
  OpenAICompatibleProvider,
} from "../../src/llm/openai-compatible-provider";

function jsonResponse(body: unknown, init: ResponseInit = {}): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { "Content-Type": "application/json" },
    ...init,
  });
}

describe("OpenAICompatibleProvider", () => {
  it("satisfies LLMProvider.complete(messages, signal?) and extracts content", async () => {
    const fetch = vi.fn<typeof globalThis.fetch>(async () =>
      jsonResponse({
        choices: [
          {
            message: {
              content: "下一问",
              role: "assistant",
              extra: true,
            },
          },
        ],
        id: "ignored",
      }),
    );
    const provider: LLMProvider = new OpenAICompatibleProvider({
      endpoint: "https://example.com/v1",
      model: "test-model",
      fetch,
    });

    await expect(
      provider.complete([{ role: "user", content: "继续" }]),
    ).resolves.toBe("下一问");
  });

  it.each([
    ["https://example.com/v1", "https://example.com/v1/chat/completions"],
    ["https://example.com/v1/", "https://example.com/v1/chat/completions"],
  ])("normalizes endpoint %s", async (endpoint, expectedUrl) => {
    const fetch = vi.fn<typeof globalThis.fetch>(async () =>
      jsonResponse({ choices: [{ message: { content: "ok" } }] }),
    );
    const provider = new OpenAICompatibleProvider({
      endpoint,
      model: "test-model",
      fetch,
    });

    await provider.complete([{ role: "user", content: "hello" }]);

    expect(fetch).toHaveBeenCalledTimes(1);
    expect(fetch.mock.calls[0]?.[0]).toBe(expectedUrl);
  });

  it("posts model and immutable messages with JSON content type", async () => {
    const fetch = vi.fn<typeof globalThis.fetch>(async () =>
      jsonResponse({ choices: [{ message: { content: "ok" } }] }),
    );
    const provider = new OpenAICompatibleProvider({
      endpoint: "https://example.com/v1",
      model: "model-x",
      fetch,
    });
    const messages: readonly LLMMessage[] = [
      { role: "system", content: "system rule" },
      { role: "user", content: "first" },
      { role: "assistant", content: "second" },
    ];
    const snapshot = JSON.parse(JSON.stringify(messages));

    await provider.complete(messages);

    const [, init] = fetch.mock.calls[0] ?? [];
    expect(init?.method).toBe("POST");
    expect(new Headers(init?.headers).get("Content-Type")).toBe("application/json");
    expect(JSON.parse(String(init?.body))).toEqual({
      model: "model-x",
      messages: snapshot,
    });
    expect(messages).toEqual(snapshot);
  });

  it("adds bearer authorization only for a non-empty apiKey", async () => {
    const fetchWithKey = vi.fn<typeof globalThis.fetch>(async () =>
      jsonResponse({ choices: [{ message: { content: "ok" } }] }),
    );
    const fetchWithoutKey = vi.fn<typeof globalThis.fetch>(async () =>
      jsonResponse({ choices: [{ message: { content: "ok" } }] }),
    );

    await new OpenAICompatibleProvider({
      endpoint: "https://example.com/v1",
      model: "model-x",
      apiKey: "secret-key",
      fetch: fetchWithKey,
    }).complete([]);
    await new OpenAICompatibleProvider({
      endpoint: "https://example.com/v1",
      model: "model-x",
      apiKey: "",
      fetch: fetchWithoutKey,
    }).complete([]);

    const withKeyHeaders = new Headers(fetchWithKey.mock.calls[0]?.[1]?.headers);
    const withoutKeyHeaders = new Headers(fetchWithoutKey.mock.calls[0]?.[1]?.headers);
    expect(withKeyHeaders.get("Authorization")).toBe("Bearer secret-key");
    expect(withoutKeyHeaders.has("Authorization")).toBe(false);
  });

  it("passes AbortSignal through unchanged", async () => {
    const fetch = vi.fn<typeof globalThis.fetch>(async () =>
      jsonResponse({ choices: [{ message: { content: "ok" } }] }),
    );
    const provider = new OpenAICompatibleProvider({
      endpoint: "https://example.com/v1",
      model: "model-x",
      fetch,
    });
    const controller = new AbortController();

    await provider.complete([], controller.signal);

    expect(fetch.mock.calls[0]?.[1]?.signal).toBe(controller.signal);
  });

  it.each([400, 401, 429, 500])(
    "rejects HTTP %s with a typed HTTP error preserving status",
    async (status) => {
      const apiKey = "never-leak-this-key";
      const fetch = vi.fn<typeof globalThis.fetch>(async () =>
        new Response(JSON.stringify({ error: { message: "provider failed" } }), {
          status,
          statusText: "Failure",
          headers: { "Content-Type": "application/json" },
        }),
      );
      const provider = new OpenAICompatibleProvider({
        endpoint: "https://example.com/v1",
        model: "model-x",
        apiKey,
        fetch,
      });

      try {
        await provider.complete([]);
        throw new Error("expected complete() to reject");
      } catch (error) {
        expect(error).toBeInstanceOf(LLMProviderHttpError);
        expect((error as LLMProviderHttpError).status).toBe(status);
        expect((error as LLMProviderHttpError).statusText).toBe("Failure");
        expect(String(error)).not.toContain(apiKey);
      }
    },
  );

  it("rejects invalid JSON success responses as response errors", async () => {
    const fetch = vi.fn<typeof globalThis.fetch>(async () =>
      new Response("not-json", { status: 200 }),
    );
    const provider = new OpenAICompatibleProvider({
      endpoint: "https://example.com/v1",
      model: "model-x",
      fetch,
    });

    await expect(provider.complete([])).rejects.toBeInstanceOf(
      LLMProviderResponseError,
    );
  });

  it.each([
    ["missing choices", {}],
    ["empty choices", { choices: [] }],
    ["missing message", { choices: [{}] }],
    ["missing content", { choices: [{ message: {} }] }],
    ["non-string content", { choices: [{ message: { content: 42 } }] }],
  ])("rejects malformed success response: %s", async (_name, body) => {
    const fetch = vi.fn<typeof globalThis.fetch>(async () => jsonResponse(body));
    const provider = new OpenAICompatibleProvider({
      endpoint: "https://example.com/v1",
      model: "model-x",
      fetch,
    });

    await expect(provider.complete([])).rejects.toBeInstanceOf(
      LLMProviderResponseError,
    );
  });

  it("accepts an empty string when content is structurally valid", async () => {
    const fetch = vi.fn<typeof globalThis.fetch>(async () =>
      jsonResponse({ choices: [{ message: { content: "" } }] }),
    );
    const provider = new OpenAICompatibleProvider({
      endpoint: "https://example.com/v1",
      model: "model-x",
      fetch,
    });

    await expect(provider.complete([])).resolves.toBe("");
  });
});
