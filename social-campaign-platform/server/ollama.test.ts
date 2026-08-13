import { describe, expect, it } from "vitest";
import {
  ApiError,
  normalizeChatResponse,
  normalizeModelsResponse,
  normalizeOllamaBaseUrl,
  validateChatRequest,
} from "./ollama.js";

describe("Ollama server adapter", () => {
  it("normalizes a local endpoint with or without the API suffix", () => {
    expect(normalizeOllamaBaseUrl("http://127.0.0.1:11434")).toBe(
      "http://127.0.0.1:11434/api",
    );
    expect(normalizeOllamaBaseUrl("http://localhost:11434/api/")).toBe(
      "http://localhost:11434/api",
    );
  });

  it("blocks untrusted hosts and credentials", () => {
    expect(() => normalizeOllamaBaseUrl("http://example.com:11434")).toThrow(
      ApiError,
    );
    expect(() =>
      normalizeOllamaBaseUrl("http://user:password@127.0.0.1:11434"),
    ).toThrow(/Zugangsdaten/i);
  });

  it("permits explicitly trusted private hosts", () => {
    expect(
      normalizeOllamaBaseUrl("http://ollama.lan:11434", {
        OLLAMA_ALLOWED_HOSTS: "ollama.lan",
      }),
    ).toBe("http://ollama.lan:11434/api");
  });

  it("validates chat options and messages", () => {
    expect(
      validateChatRequest({
        endpoint: "http://127.0.0.1:11434",
        model: "gemma3",
        messages: [{ role: "user", content: "Hallo" }],
        temperature: 0.4,
        maxTokens: 500,
      }),
    ).toMatchObject({
      endpoint: "http://127.0.0.1:11434/api",
      model: "gemma3",
      temperature: 0.4,
      maxTokens: 500,
    });
    expect(() =>
      validateChatRequest({
        endpoint: "http://127.0.0.1:11434",
        model: "gemma3",
        messages: [{ role: "tool", content: "unsafe" }],
      }),
    ).toThrow(/ungültige Rolle/i);
  });

  it("normalizes official Ollama response fields", () => {
    expect(
      normalizeModelsResponse({
        models: [
          {
            name: "gemma3:4b",
            model: "gemma3:4b",
            size: 3_000,
            modified_at: "2026-08-13T10:00:00Z",
            details: {
              parameter_size: "4.3B",
              quantization_level: "Q4_K_M",
            },
          },
        ],
      }),
    ).toEqual({
      models: [
        {
          name: "gemma3:4b",
          model: "gemma3:4b",
          size: 3_000,
          modifiedAt: "2026-08-13T10:00:00Z",
          parameterSize: "4.3B",
          quantizationLevel: "Q4_K_M",
        },
      ],
    });
    expect(
      normalizeChatResponse({
        model: "gemma3",
        message: { role: "assistant", content: "Antwort" },
        done_reason: "stop",
        prompt_eval_count: 20,
        eval_count: 7,
        total_duration: 1_250_000_000,
      }),
    ).toEqual({
      model: "gemma3",
      content: "Antwort",
      doneReason: "stop",
      promptTokens: 20,
      completionTokens: 7,
      totalDurationMs: 1250,
    });
  });
});
