import type { IncomingMessage, ServerResponse } from "node:http";

export class HttpError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
    readonly details?: Record<string, unknown>,
  ) {
    super(message);
    this.name = "HttpError";
  }
}

export function sendJson(
  response: ServerResponse,
  status: number,
  value: unknown,
  headers: Record<string, string> = {},
): void {
  if (response.headersSent || response.writableEnded) return;
  const body = JSON.stringify(value);
  response.writeHead(status, {
    "Cache-Control": "no-store",
    "Content-Type": "application/json; charset=utf-8",
    "Content-Length": Buffer.byteLength(body),
    "Referrer-Policy": "same-origin",
    "X-Content-Type-Options": "nosniff",
    ...headers,
  });
  response.end(body);
}

export function sendHttpError(response: ServerResponse, error: unknown): void {
  if (error instanceof HttpError) {
    sendJson(response, error.status, {
      error: {
        code: error.code,
        message: error.message,
        ...(error.details ? { details: error.details } : {}),
      },
    });
    return;
  }
  console.error(error);
  sendJson(response, 500, {
    error: {
      code: "internal_error",
      message: "Die Anfrage konnte nicht verarbeitet werden.",
    },
  });
}

function isJsonContentType(value: string | undefined): boolean {
  return Boolean(
    value
      ?.split(";", 1)[0]
      ?.trim()
      .toLowerCase()
      .match(/^application\/(?:[a-z0-9.+-]+\+)?json$/),
  );
}

export async function readBody(
  request: IncomingMessage,
  maximumBytes = 256 * 1024,
  requireJson = true,
): Promise<{ raw: Buffer; json?: unknown }> {
  if (requireJson && !isJsonContentType(request.headers["content-type"])) {
    throw new HttpError(
      415,
      "unsupported_media_type",
      "Content-Type application/json ist erforderlich.",
    );
  }
  const length = Number(request.headers["content-length"]);
  if (Number.isFinite(length) && length > maximumBytes) {
    request.resume();
    throw new HttpError(413, "request_too_large", "Die Anfrage ist zu groß.");
  }

  const chunks: Buffer[] = [];
  let total = 0;
  for await (const chunk of request) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    total += buffer.length;
    if (total > maximumBytes) {
      request.resume();
      throw new HttpError(413, "request_too_large", "Die Anfrage ist zu groß.");
    }
    chunks.push(buffer);
  }
  const raw = Buffer.concat(chunks);
  if (!requireJson) return { raw };
  if (raw.length === 0) {
    throw new HttpError(
      400,
      "empty_body",
      "Der Request-Body darf nicht leer sein.",
    );
  }
  try {
    return { raw, json: JSON.parse(raw.toString("utf8")) as unknown };
  } catch {
    throw new HttpError(
      400,
      "invalid_json",
      "Der Request-Body ist kein gültiges JSON.",
    );
  }
}

export function requireMethod(
  request: IncomingMessage,
  response: ServerResponse,
  allowed: readonly string[],
): void {
  if (!request.method || !allowed.includes(request.method)) {
    if (!response.headersSent) response.setHeader("Allow", allowed.join(", "));
    throw new HttpError(405, "method_not_allowed", "Methode nicht erlaubt.");
  }
}

export function parseCookies(request: IncomingMessage): Map<string, string> {
  const result = new Map<string, string>();
  for (const pair of (request.headers.cookie ?? "").split(";")) {
    const separator = pair.indexOf("=");
    if (separator <= 0) continue;
    const name = pair.slice(0, separator).trim();
    const value = pair.slice(separator + 1).trim();
    try {
      result.set(name, decodeURIComponent(value));
    } catch {
      // Ignore malformed cookies independently.
    }
  }
  return result;
}

export function clientIp(request: IncomingMessage): string | undefined {
  // Traefik overwrites X-Forwarded-For for trusted upstreams. Only the final
  // address is used; it is metadata and never an authorization input.
  const forwarded = request.headers["x-forwarded-for"];
  const text = Array.isArray(forwarded) ? forwarded.at(-1) : forwarded;
  return text?.split(",").at(-1)?.trim() || request.socket.remoteAddress;
}

export function securityHeaders(response: ServerResponse): void {
  response.setHeader(
    "Permissions-Policy",
    "camera=(), microphone=(), geolocation=()",
  );
  response.setHeader("Referrer-Policy", "same-origin");
  response.setHeader("X-Content-Type-Options", "nosniff");
  response.setHeader("X-Frame-Options", "DENY");
}
