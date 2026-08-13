import { afterEach, describe, expect, it, vi } from "vitest";
import { chatWithOllama, listOllamaModels } from "./ollama";

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("Ollama API client", () => {
  it("loads locally installed models through the same-origin adapter", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          models: [
            {
              name: "gemma3:4b",
              model: "gemma3:4b",
              size: 3_000_000_000,
            },
          ],
        }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      ),
    );
    vi.stubGlobal("fetch", fetchMock);

    await expect(listOllamaModels("http://127.0.0.1:11434")).resolves.toEqual([
      {
        name: "gemma3:4b",
        model: "gemma3:4b",
        size: 3_000_000_000,
      },
    ]);
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/ollama/models",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({ endpoint: "http://127.0.0.1:11434" }),
      }),
    );
  });

  it("returns generated chat content and usage metadata", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify({
            model: "gemma3",
            content: "Lokale Antwort",
            promptTokens: 12,
            completionTokens: 4,
          }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        ),
      ),
    );

    await expect(
      chatWithOllama({
        endpoint: "http://localhost:11434/api",
        model: "gemma3",
        messages: [{ role: "user", content: "Hallo" }],
      }),
    ).resolves.toMatchObject({
      content: "Lokale Antwort",
      model: "gemma3",
      promptTokens: 12,
      completionTokens: 4,
    });
  });

  it("surfaces a safe adapter error", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify({
            error: {
              code: "ollama_unavailable",
              message: "Ollama ist nicht erreichbar.",
            },
          }),
          { status: 503, headers: { "Content-Type": "application/json" } },
        ),
      ),
    );

    await expect(listOllamaModels("http://127.0.0.1:11434")).rejects.toThrow(
      "Ollama ist nicht erreichbar.",
    );
  });

  it("rejects successful responses without assistant content", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(JSON.stringify({ model: "gemma3", content: "" }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        }),
      ),
    );

    await expect(
      chatWithOllama({
        endpoint: "http://127.0.0.1:11434",
        model: "gemma3",
        messages: [{ role: "user", content: "Hallo" }],
      }),
    ).rejects.toThrow(/leere Antwort/i);
  });
});
