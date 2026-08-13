import type { IncomingMessage, ServerResponse } from "node:http";
import { isIP } from "node:net";

export const DEFAULT_OLLAMA_ALLOWED_HOSTS = [
  "localhost",
  "127.0.0.1",
  "::1",
] as const;
export const DEFAULT_BODY_LIMIT_BYTES = 256 * 1024;
export const DEFAULT_BODY_TIMEOUT_MS = 10_000;
export const DEFAULT_OLLAMA_TIMEOUT_MS = 120_000;
export const MAX_UPSTREAM_RESPONSE_BYTES = 2 * 1024 * 1024;

const MAX_ENDPOINT_LENGTH = 2_048;
const MAX_MODEL_LENGTH = 200;
const MAX_MESSAGES = 100;
const MAX_MESSAGE_LENGTH = 100_000;
const MAX_ERROR_MESSAGE_LENGTH = 500;

const CHAT_ROLES = new Set(["system", "user", "assistant"] as const);
const MODELS_ROUTE = "/api/ollama/models";
const CHAT_ROUTE = "/api/ollama/chat";

export interface OllamaEnvironment {
  OLLAMA_ALLOWED_HOSTS?: string;
  OLLAMA_BASE_URL?: string;
  OLLAMA_REQUEST_TIMEOUT_MS?: string;
}

export interface OllamaChatMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

export interface OllamaChatRequest {
  endpoint: string;
  model: string;
  messages: OllamaChatMessage[];
  temperature?: number;
  maxTokens?: number;
}

export interface OllamaModelsRequest {
  endpoint: string;
}

export interface OllamaModel {
  name: string;
  model: string;
  size: number;
  modifiedAt?: string;
  parameterSize?: string;
  quantizationLevel?: string;
}

export interface OllamaModelsResponse {
  models: OllamaModel[];
}

export interface OllamaChatResponse {
  model: string;
  content: string;
  doneReason?: string;
  promptTokens?: number;
  completionTokens?: number;
  totalDurationMs?: number;
}

export class ApiError extends Error {
  readonly status: number;
  readonly code: string;

  constructor(status: number, code: string, message: string) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.code = code;
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function containsControlCharacter(value: string): boolean {
  return [...value].some((character) => {
    const code = character.charCodeAt(0);
    return code <= 31 || code === 127;
  });
}

function assertAllowedKeys(
  value: Record<string, unknown>,
  allowedKeys: ReadonlySet<string>,
  location: string,
): void {
  const unexpectedKey = Object.keys(value).find((key) => !allowedKeys.has(key));
  if (unexpectedKey) {
    throw new ApiError(
      400,
      "invalid_request",
      `${location} enthält das unbekannte Feld „${unexpectedKey}“.`,
    );
  }
}

function normalizeHostname(hostname: string): string {
  let normalized = hostname.trim().toLowerCase();
  if (normalized.startsWith("[") && normalized.endsWith("]")) {
    normalized = normalized.slice(1, -1);
  }
  if (isIP(normalized) === 0) normalized = normalized.replace(/\.+$/, "");
  return normalized;
}

function normalizeAllowedHostEntry(value: string): string | null {
  const candidate = value.trim();
  if (!candidate) return null;

  const unbracketed =
    candidate.startsWith("[") && candidate.endsWith("]")
      ? candidate.slice(1, -1)
      : candidate;
  if (isIP(unbracketed) !== 0) return normalizeHostname(unbracketed);

  try {
    const parsed = new URL(`http://${candidate}`);
    if (
      parsed.username ||
      parsed.password ||
      (parsed.pathname !== "/" && parsed.pathname !== "") ||
      parsed.search ||
      parsed.hash
    ) {
      return null;
    }
    return normalizeHostname(parsed.hostname);
  } catch {
    return null;
  }
}

export function getAllowedOllamaHosts(
  environment: OllamaEnvironment = process.env,
): ReadonlySet<string> {
  const configuredHosts = (environment.OLLAMA_ALLOWED_HOSTS ?? "")
    .split(",")
    .map(normalizeAllowedHostEntry)
    .filter((host): host is string => Boolean(host));

  return new Set([
    ...DEFAULT_OLLAMA_ALLOWED_HOSTS.map(normalizeHostname),
    ...configuredHosts,
  ]);
}

export function normalizeOllamaBaseUrl(
  endpoint: unknown,
  environment: OllamaEnvironment = process.env,
): string {
  if (endpoint !== undefined && typeof endpoint !== "string") {
    throw new ApiError(
      400,
      "invalid_endpoint",
      "Der Ollama-Endpunkt muss eine URL als Text sein.",
    );
  }
  const configuredFallback = environment.OLLAMA_BASE_URL?.trim();
  const candidate =
    typeof endpoint === "string" && endpoint.trim()
      ? endpoint.trim()
      : configuredFallback;

  if (!candidate) {
    throw new ApiError(
      400,
      "missing_endpoint",
      "Ein Ollama-Endpunkt ist erforderlich.",
    );
  }
  if (candidate.length > MAX_ENDPOINT_LENGTH) {
    throw new ApiError(
      400,
      "invalid_endpoint",
      "Der Ollama-Endpunkt ist zu lang.",
    );
  }

  let parsed: URL;
  try {
    parsed = new URL(candidate);
  } catch {
    throw new ApiError(
      400,
      "invalid_endpoint",
      "Der Ollama-Endpunkt ist keine gültige URL.",
    );
  }

  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    throw new ApiError(
      400,
      "invalid_endpoint_protocol",
      "Der Ollama-Endpunkt muss HTTP oder HTTPS verwenden.",
    );
  }
  if (parsed.username || parsed.password) {
    throw new ApiError(
      400,
      "endpoint_credentials_not_allowed",
      "Zugangsdaten sind in der Ollama-URL nicht erlaubt.",
    );
  }
  if (parsed.search || parsed.hash) {
    throw new ApiError(
      400,
      "invalid_endpoint",
      "Der Ollama-Endpunkt darf weder Query-Parameter noch ein Fragment enthalten.",
    );
  }

  const hostname = normalizeHostname(parsed.hostname);
  if (!getAllowedOllamaHosts(environment).has(hostname)) {
    throw new ApiError(
      403,
      "endpoint_host_not_allowed",
      "Der Host des Ollama-Endpunkts ist nicht freigegeben.",
    );
  }

  let basePath = parsed.pathname.replace(/\/+$/, "");
  if (basePath.toLowerCase().endsWith("/api")) {
    basePath = basePath.slice(0, -4);
  }
  parsed.pathname = `${basePath}/api`.replace(/\/{2,}/g, "/");
  parsed.search = "";
  parsed.hash = "";

  return parsed.toString().replace(/\/$/, "");
}

export function getOllamaTimeoutMs(
  environment: OllamaEnvironment = process.env,
): number {
  const configured = Number(environment.OLLAMA_REQUEST_TIMEOUT_MS);
  if (
    Number.isInteger(configured) &&
    configured >= 1_000 &&
    configured <= 300_000
  ) {
    return configured;
  }
  return DEFAULT_OLLAMA_TIMEOUT_MS;
}

export function validateModelsRequest(
  value: unknown,
  environment: OllamaEnvironment = process.env,
): OllamaModelsRequest {
  if (!isRecord(value)) {
    throw new ApiError(
      400,
      "invalid_request",
      "Der Request-Body muss ein JSON-Objekt sein.",
    );
  }
  assertAllowedKeys(value, new Set(["endpoint"]), "Der Request-Body");
  return {
    endpoint: normalizeOllamaBaseUrl(value.endpoint, environment),
  };
}

export function validateChatRequest(
  value: unknown,
  environment: OllamaEnvironment = process.env,
): OllamaChatRequest {
  if (!isRecord(value)) {
    throw new ApiError(
      400,
      "invalid_request",
      "Der Request-Body muss ein JSON-Objekt sein.",
    );
  }
  assertAllowedKeys(
    value,
    new Set(["endpoint", "model", "messages", "temperature", "maxTokens"]),
    "Der Request-Body",
  );

  const endpoint = normalizeOllamaBaseUrl(value.endpoint, environment);
  if (
    typeof value.model !== "string" ||
    !value.model.trim() ||
    value.model.length > MAX_MODEL_LENGTH ||
    containsControlCharacter(value.model)
  ) {
    throw new ApiError(
      400,
      "invalid_model",
      "Das Modell muss ein nicht leerer, gültiger Modellname sein.",
    );
  }
  if (
    !Array.isArray(value.messages) ||
    value.messages.length === 0 ||
    value.messages.length > MAX_MESSAGES
  ) {
    throw new ApiError(
      400,
      "invalid_messages",
      `Es sind zwischen 1 und ${MAX_MESSAGES} Nachrichten erforderlich.`,
    );
  }

  const messages = value.messages.map((message, index): OllamaChatMessage => {
    if (!isRecord(message)) {
      throw new ApiError(
        400,
        "invalid_messages",
        `Nachricht ${index + 1} muss ein JSON-Objekt sein.`,
      );
    }
    assertAllowedKeys(
      message,
      new Set(["role", "content"]),
      `Nachricht ${index + 1}`,
    );
    if (
      typeof message.role !== "string" ||
      !CHAT_ROLES.has(message.role as OllamaChatMessage["role"])
    ) {
      throw new ApiError(
        400,
        "invalid_messages",
        `Nachricht ${index + 1} hat eine ungültige Rolle.`,
      );
    }
    if (
      typeof message.content !== "string" ||
      !message.content.trim() ||
      message.content.length > MAX_MESSAGE_LENGTH
    ) {
      throw new ApiError(
        400,
        "invalid_messages",
        `Nachricht ${index + 1} benötigt einen nicht leeren Inhalt.`,
      );
    }
    return {
      role: message.role as OllamaChatMessage["role"],
      content: message.content,
    };
  });

  let temperature: number | undefined;
  if (value.temperature !== undefined) {
    if (
      typeof value.temperature !== "number" ||
      !Number.isFinite(value.temperature) ||
      value.temperature < 0 ||
      value.temperature > 2
    ) {
      throw new ApiError(
        400,
        "invalid_temperature",
        "Die Temperatur muss zwischen 0 und 2 liegen.",
      );
    }
    temperature = value.temperature;
  }

  let maxTokens: number | undefined;
  if (value.maxTokens !== undefined) {
    if (
      typeof value.maxTokens !== "number" ||
      !Number.isInteger(value.maxTokens) ||
      value.maxTokens < 1 ||
      value.maxTokens > 131_072
    ) {
      throw new ApiError(
        400,
        "invalid_max_tokens",
        "Max. Tokens muss eine ganze Zahl zwischen 1 und 131.072 sein.",
      );
    }
    maxTokens = value.maxTokens;
  }

  return {
    endpoint,
    model: value.model.trim(),
    messages,
    ...(temperature === undefined ? {} : { temperature }),
    ...(maxTokens === undefined ? {} : { maxTokens }),
  };
}

function optionalString(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value : undefined;
}

function optionalNonNegativeInteger(value: unknown): number | undefined {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 0
    ? value
    : undefined;
}

export function normalizeModelsResponse(value: unknown): OllamaModelsResponse {
  if (!isRecord(value) || !Array.isArray(value.models)) {
    throw new ApiError(
      502,
      "invalid_upstream_response",
      "Ollama hat eine ungültige Modellliste zurückgegeben.",
    );
  }

  const models = value.models.map((entry, index): OllamaModel => {
    if (!isRecord(entry)) {
      throw new ApiError(
        502,
        "invalid_upstream_response",
        `Ollama-Modell ${index + 1} ist ungültig.`,
      );
    }
    const name = optionalString(entry.name);
    const model = optionalString(entry.model) ?? name;
    if (
      !name ||
      !model ||
      typeof entry.size !== "number" ||
      !Number.isSafeInteger(entry.size) ||
      entry.size < 0
    ) {
      throw new ApiError(
        502,
        "invalid_upstream_response",
        `Ollama-Modell ${index + 1} enthält ungültige Metadaten.`,
      );
    }

    const details = isRecord(entry.details) ? entry.details : undefined;
    const modifiedAt = optionalString(entry.modified_at);
    const parameterSize = optionalString(details?.parameter_size);
    const quantizationLevel = optionalString(details?.quantization_level);

    return {
      name,
      model,
      size: entry.size,
      ...(modifiedAt ? { modifiedAt } : {}),
      ...(parameterSize ? { parameterSize } : {}),
      ...(quantizationLevel ? { quantizationLevel } : {}),
    };
  });

  return { models };
}

export function normalizeChatResponse(
  value: unknown,
  requestedModel?: string,
): OllamaChatResponse {
  if (!isRecord(value) || !isRecord(value.message)) {
    throw new ApiError(
      502,
      "invalid_upstream_response",
      "Ollama hat eine ungültige Chat-Antwort zurückgegeben.",
    );
  }
  const content = value.message.content;
  const model = optionalString(value.model) ?? requestedModel;
  if (typeof content !== "string" || !model) {
    throw new ApiError(
      502,
      "invalid_upstream_response",
      "Ollama hat keine gültige Chat-Nachricht zurückgegeben.",
    );
  }

  const doneReason = optionalString(value.done_reason);
  const promptTokens = optionalNonNegativeInteger(value.prompt_eval_count);
  const completionTokens = optionalNonNegativeInteger(value.eval_count);
  const totalDurationMs =
    typeof value.total_duration === "number" &&
    Number.isFinite(value.total_duration) &&
    value.total_duration >= 0
      ? Number((value.total_duration / 1_000_000).toFixed(3))
      : undefined;

  return {
    model,
    content,
    ...(doneReason ? { doneReason } : {}),
    ...(promptTokens === undefined ? {} : { promptTokens }),
    ...(completionTokens === undefined ? {} : { completionTokens }),
    ...(totalDurationMs === undefined ? {} : { totalDurationMs }),
  };
}

function isJsonContentType(contentType: string | undefined): boolean {
  if (!contentType) return false;
  const mediaType = contentType.split(";", 1)[0]?.trim().toLowerCase();
  return (
    mediaType === "application/json" || Boolean(mediaType?.endsWith("+json"))
  );
}

export function readJsonBody(
  request: IncomingMessage,
  options: { maxBytes?: number; timeoutMs?: number } = {},
): Promise<unknown> {
  const maxBytes = options.maxBytes ?? DEFAULT_BODY_LIMIT_BYTES;
  const timeoutMs = options.timeoutMs ?? DEFAULT_BODY_TIMEOUT_MS;
  if (!isJsonContentType(request.headers["content-type"])) {
    throw new ApiError(
      415,
      "unsupported_media_type",
      "Der Content-Type muss application/json sein.",
    );
  }

  const declaredLength = Number(request.headers["content-length"]);
  if (Number.isFinite(declaredLength) && declaredLength > maxBytes) {
    request.resume();
    throw new ApiError(
      413,
      "request_too_large",
      `Der Request-Body darf maximal ${maxBytes} Bytes groß sein.`,
    );
  }

  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    let receivedBytes = 0;
    let settled = false;

    const cleanup = () => {
      clearTimeout(timer);
      request.off("data", onData);
      request.off("end", onEnd);
      request.off("error", onError);
      request.off("aborted", onAborted);
    };
    const fail = (error: Error) => {
      if (settled) return;
      settled = true;
      cleanup();
      reject(error);
    };
    const onData = (chunk: Buffer | string) => {
      const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
      receivedBytes += buffer.length;
      if (receivedBytes > maxBytes) {
        fail(
          new ApiError(
            413,
            "request_too_large",
            `Der Request-Body darf maximal ${maxBytes} Bytes groß sein.`,
          ),
        );
        request.resume();
        return;
      }
      chunks.push(buffer);
    };
    const onEnd = () => {
      if (settled) return;
      settled = true;
      cleanup();
      const rawBody = Buffer.concat(chunks).toString("utf8");
      if (!rawBody.trim()) {
        reject(
          new ApiError(
            400,
            "empty_request_body",
            "Der Request-Body darf nicht leer sein.",
          ),
        );
        return;
      }
      try {
        resolve(JSON.parse(rawBody) as unknown);
      } catch {
        reject(
          new ApiError(
            400,
            "invalid_json",
            "Der Request-Body enthält ungültiges JSON.",
          ),
        );
      }
    };
    const onError = () => {
      fail(
        new ApiError(
          400,
          "request_read_error",
          "Der Request-Body konnte nicht gelesen werden.",
        ),
      );
    };
    const onAborted = () => {
      fail(
        new ApiError(
          400,
          "request_aborted",
          "Der Request wurde vorzeitig abgebrochen.",
        ),
      );
    };
    const timer = setTimeout(() => {
      fail(
        new ApiError(
          408,
          "request_timeout",
          "Der Request-Body wurde nicht rechtzeitig übertragen.",
        ),
      );
      request.resume();
    }, timeoutMs);
    timer.unref();

    request.on("data", onData);
    request.once("end", onEnd);
    request.once("error", onError);
    request.once("aborted", onAborted);
  });
}

async function readLimitedText(
  response: Response,
  maxBytes = MAX_UPSTREAM_RESPONSE_BYTES,
): Promise<string> {
  if (!response.body) return "";
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let totalBytes = 0;
  let result = "";

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      totalBytes += value.byteLength;
      if (totalBytes > maxBytes) {
        await reader.cancel();
        throw new ApiError(
          502,
          "upstream_response_too_large",
          "Die Ollama-Antwort ist zu groß.",
        );
      }
      result += decoder.decode(value, { stream: true });
    }
    result += decoder.decode();
    return result;
  } finally {
    reader.releaseLock();
  }
}

async function readUpstreamJson(response: Response): Promise<unknown> {
  const rawBody = await readLimitedText(response);
  try {
    return JSON.parse(rawBody) as unknown;
  } catch {
    throw new ApiError(
      502,
      "invalid_upstream_response",
      "Ollama hat kein gültiges JSON zurückgegeben.",
    );
  }
}

function upstreamErrorStatus(status: number): number {
  if (status === 400 || status === 404 || status === 409 || status === 422) {
    return status;
  }
  if (status === 408 || status === 504) return 504;
  if (status === 429) return 429;
  return 502;
}

async function toUpstreamError(response: Response): Promise<ApiError> {
  let message = `Ollama antwortete mit HTTP ${response.status}.`;
  try {
    const rawBody = await readLimitedText(response, 64 * 1024);
    if (rawBody.trim()) {
      try {
        const parsed = JSON.parse(rawBody) as unknown;
        if (isRecord(parsed) && optionalString(parsed.error)) {
          message = optionalString(parsed.error) ?? message;
        }
      } catch {
        message = rawBody.replace(/\s+/g, " ").trim();
      }
    }
  } catch (error) {
    if (error instanceof ApiError) return error;
  }
  return new ApiError(
    upstreamErrorStatus(response.status),
    "ollama_upstream_error",
    message.slice(0, MAX_ERROR_MESSAGE_LENGTH),
  );
}

async function requestOllamaJson(
  url: string,
  init: { method: "GET" | "POST"; body?: string },
  environment: OllamaEnvironment,
): Promise<unknown> {
  const controller = new AbortController();
  const timeout = setTimeout(
    () => controller.abort(),
    getOllamaTimeoutMs(environment),
  );
  timeout.unref();

  try {
    const response = await fetch(url, {
      method: init.method,
      headers: {
        Accept: "application/json",
        ...(init.body ? { "Content-Type": "application/json" } : {}),
      },
      ...(init.body ? { body: init.body } : {}),
      redirect: "manual",
      signal: controller.signal,
    });
    if (response.status >= 300 && response.status < 400) {
      throw new ApiError(
        502,
        "ollama_redirect_rejected",
        "Eine Weiterleitung des Ollama-Endpunkts wurde aus Sicherheitsgründen abgelehnt.",
      );
    }
    if (!response.ok) throw await toUpstreamError(response);
    return await readUpstreamJson(response);
  } catch (error) {
    if (controller.signal.aborted) {
      throw new ApiError(
        504,
        "ollama_timeout",
        "Ollama hat nicht rechtzeitig geantwortet.",
      );
    }
    if (error instanceof ApiError) throw error;
    throw new ApiError(
      502,
      "ollama_unavailable",
      "Ollama ist nicht erreichbar.",
    );
  } finally {
    clearTimeout(timeout);
  }
}

export function sendJson(
  response: ServerResponse,
  status: number,
  value: unknown,
  extraHeaders: Record<string, string> = {},
): void {
  if (response.headersSent || response.writableEnded) return;
  const body = JSON.stringify(value);
  response.writeHead(status, {
    "Cache-Control": "no-store",
    "Content-Type": "application/json; charset=utf-8",
    "Content-Length": Buffer.byteLength(body),
    "X-Content-Type-Options": "nosniff",
    ...extraHeaders,
  });
  response.end(body);
}

export function sendApiError(response: ServerResponse, error: unknown): void {
  const apiError =
    error instanceof ApiError
      ? error
      : new ApiError(
          500,
          "internal_error",
          "Die Anfrage konnte nicht verarbeitet werden.",
        );
  sendJson(response, apiError.status, {
    error: {
      code: apiError.code,
      message: apiError.message,
    },
  });
}

async function handleModelsRequest(
  request: IncomingMessage,
  response: ServerResponse,
  environment: OllamaEnvironment,
): Promise<void> {
  const input = validateModelsRequest(await readJsonBody(request), environment);
  const upstreamResponse = await requestOllamaJson(
    `${input.endpoint}/tags`,
    { method: "GET" },
    environment,
  );
  sendJson(response, 200, normalizeModelsResponse(upstreamResponse));
}

async function handleChatRequest(
  request: IncomingMessage,
  response: ServerResponse,
  environment: OllamaEnvironment,
): Promise<void> {
  const input = validateChatRequest(await readJsonBody(request), environment);
  const options = {
    ...(input.temperature === undefined
      ? {}
      : { temperature: input.temperature }),
    ...(input.maxTokens === undefined ? {} : { num_predict: input.maxTokens }),
  };
  const upstreamResponse = await requestOllamaJson(
    `${input.endpoint}/chat`,
    {
      method: "POST",
      body: JSON.stringify({
        model: input.model,
        messages: input.messages,
        stream: false,
        ...(Object.keys(options).length === 0 ? {} : { options }),
      }),
    },
    environment,
  );
  sendJson(response, 200, normalizeChatResponse(upstreamResponse, input.model));
}

export async function handleOllamaApiRoute(
  request: IncomingMessage,
  response: ServerResponse,
  pathname: string,
  environment: OllamaEnvironment = process.env,
): Promise<boolean> {
  if (pathname !== MODELS_ROUTE && pathname !== CHAT_ROUTE) return false;

  if (request.method !== "POST") {
    sendJson(
      response,
      405,
      {
        error: {
          code: "method_not_allowed",
          message: "Diese Route unterstützt ausschließlich POST.",
        },
      },
      { Allow: "POST" },
    );
    return true;
  }

  try {
    if (pathname === MODELS_ROUTE) {
      await handleModelsRequest(request, response, environment);
    } else {
      await handleChatRequest(request, response, environment);
    }
  } catch (error) {
    sendApiError(response, error);
  }
  return true;
}
