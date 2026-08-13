export type OllamaMessageRole = "system" | "user" | "assistant";

export interface OllamaMessage {
  role: OllamaMessageRole;
  content: string;
}

export interface OllamaModel {
  name: string;
  model: string;
  size: number;
  modifiedAt?: string;
  parameterSize?: string;
  quantizationLevel?: string;
}

export interface OllamaChatRequest {
  endpoint: string;
  model: string;
  messages: OllamaMessage[];
  temperature?: number;
  maxTokens?: number;
}

export interface OllamaChatResponse {
  model: string;
  content: string;
  doneReason?: string;
  promptTokens?: number;
  completionTokens?: number;
  totalDurationMs?: number;
}

interface ApiErrorBody {
  error?: string | { message?: string; code?: string };
  code?: string;
}

function getApiErrorMessage(body: ApiErrorBody): string | undefined {
  if (typeof body.error === "string") return body.error.trim() || undefined;
  if (body.error && typeof body.error.message === "string") {
    return body.error.message.trim() || undefined;
  }
  return undefined;
}

async function readApiResponse<T>(response: Response): Promise<T> {
  const body = (await response.json().catch(() => ({}))) as T & ApiErrorBody;
  if (response.ok) return body;

  const fallback =
    response.status === 503
      ? "Ollama ist nicht erreichbar. Starte den lokalen Ollama-Dienst."
      : "Die Ollama-Anfrage ist fehlgeschlagen.";
  throw new Error(getApiErrorMessage(body) || fallback);
}

export async function listOllamaModels(
  endpoint: string,
  signal?: AbortSignal,
): Promise<OllamaModel[]> {
  const response = await fetch("/api/ollama/models", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ endpoint }),
    signal,
  });
  const payload = await readApiResponse<{ models?: OllamaModel[] }>(response);
  return Array.isArray(payload.models) ? payload.models : [];
}

export async function chatWithOllama(
  request: OllamaChatRequest,
  signal?: AbortSignal,
): Promise<OllamaChatResponse> {
  const response = await fetch("/api/ollama/chat", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(request),
    signal,
  });
  const payload = await readApiResponse<OllamaChatResponse>(response);
  if (!payload.content?.trim()) {
    throw new Error("Ollama hat eine leere Antwort zurückgegeben.");
  }
  return payload;
}
