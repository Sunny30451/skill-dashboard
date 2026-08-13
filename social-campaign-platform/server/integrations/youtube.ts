import { isIP } from "node:net";

const GOOGLE_OAUTH_AUTHORIZE_URL =
  "https://accounts.google.com/o/oauth2/v2/auth";
const GOOGLE_OAUTH_TOKEN_URL = "https://oauth2.googleapis.com/token";
const GOOGLE_OAUTH_REVOKE_URL = "https://oauth2.googleapis.com/revoke";
const YOUTUBE_API_BASE_URL = "https://www.googleapis.com/youtube/v3";
const YOUTUBE_UPLOAD_URL =
  "https://www.googleapis.com/upload/youtube/v3/videos";

const DEFAULT_TIMEOUT_MS = 20_000;
const MAX_TIMEOUT_MS = 5 * 60_000;
const MAX_RESPONSE_BYTES = 2 * 1024 * 1024;
const MAX_VIDEO_BYTES = 256 * 1024 * 1024 * 1024;
const RESUMABLE_CHUNK_GRANULARITY = 256 * 1024;

const YOUTUBE_SCOPE_VALUES = [
  "https://www.googleapis.com/auth/youtube.readonly",
  "https://www.googleapis.com/auth/youtube.upload",
  "https://www.googleapis.com/auth/youtube.force-ssl",
  "https://www.googleapis.com/auth/yt-analytics.readonly",
] as const;

export const YOUTUBE_SCOPES = {
  readonly: YOUTUBE_SCOPE_VALUES[0],
  upload: YOUTUBE_SCOPE_VALUES[1],
  manage: YOUTUBE_SCOPE_VALUES[2],
  analyticsReadonly: YOUTUBE_SCOPE_VALUES[3],
} as const;

export const DEFAULT_YOUTUBE_SCOPES = [YOUTUBE_SCOPES.readonly] as const;

const ALLOWED_SCOPES = new Set<string>(YOUTUBE_SCOPE_VALUES);
const PRIVACY_STATUSES = new Set<YouTubePrivacyStatus>([
  "private",
  "unlisted",
  "public",
]);
const INPUT_TEXT_ENCODER = new TextEncoder();

export type YouTubePrivacyStatus = "private" | "unlisted" | "public";
export type YouTubeFetch = (
  input: string | URL | Request,
  init?: RequestInit,
) => Promise<Response>;

export interface YouTubeRequestOptions {
  fetch?: YouTubeFetch;
  timeoutMs?: number;
}

export interface ProviderErrorDetails {
  upstreamCode?: string;
}

export class ProviderError extends Error {
  readonly provider = "youtube";
  readonly code: string;
  readonly operation: string;
  readonly status: number;
  readonly upstreamStatus?: number;
  readonly retryable: boolean;
  readonly details?: ProviderErrorDetails;

  constructor(input: {
    code: string;
    message: string;
    operation: string;
    status: number;
    upstreamStatus?: number;
    retryable?: boolean;
    details?: ProviderErrorDetails;
  }) {
    super(input.message);
    this.name = "ProviderError";
    this.code = input.code;
    this.operation = input.operation;
    this.status = input.status;
    this.upstreamStatus = input.upstreamStatus;
    this.retryable = input.retryable ?? false;
    this.details = input.details;
  }

  toJSON(): Record<string, unknown> {
    return {
      provider: this.provider,
      code: this.code,
      operation: this.operation,
      status: this.status,
      retryable: this.retryable,
      ...(this.upstreamStatus === undefined
        ? {}
        : { upstreamStatus: this.upstreamStatus }),
      ...(this.details ? { details: this.details } : {}),
      message: this.message,
    };
  }
}

export interface YouTubeAuthorizeUrlInput {
  clientId: string;
  redirectUri: string;
  state: string;
  codeChallenge: string;
  scopes?: readonly string[];
}

export interface YouTubeAuthorizationCodeInput {
  clientId: string;
  clientSecret: string;
  code: string;
  codeVerifier: string;
  redirectUri: string;
}

export interface YouTubeRefreshTokenInput {
  clientId: string;
  clientSecret: string;
  refreshToken: string;
}

export interface YouTubeRevokeTokenInput {
  token: string;
}

export interface YouTubeTokens {
  accessToken: string;
  refreshToken?: string;
  expiresInSeconds: number;
  refreshTokenExpiresInSeconds?: number;
  tokenType: "Bearer";
  scopes?: string[];
}

export interface YouTubeChannel {
  id: string;
  title: string;
  description?: string;
  thumbnailUrl?: string;
  uploadsPlaylistId?: string;
  viewCount?: string;
  subscriberCount?: string;
  hiddenSubscriberCount?: boolean;
  videoCount?: string;
  privacyStatus?: YouTubePrivacyStatus;
  longUploadsStatus?: "allowed" | "disallowed" | "eligible";
  madeForKids?: boolean;
  selfDeclaredMadeForKids?: boolean;
}

export interface YouTubeVideo {
  id: string;
  title?: string;
  description?: string;
  channelId?: string;
  channelTitle?: string;
  publishedAt?: string;
  thumbnailUrl?: string;
  duration?: string;
  definition?: string;
  caption?: string;
  privacyStatus?: YouTubePrivacyStatus;
  publishAt?: string;
  madeForKids?: boolean;
  selfDeclaredMadeForKids?: boolean;
  uploadStatus?: string;
  failureReason?: string;
  rejectionReason?: string;
  viewCount?: string;
  likeCount?: string;
  commentCount?: string;
  processingStatus?: string;
}

export interface YouTubeAccountDiscoveryInput {
  accessToken: string;
}

export interface YouTubeUploadsSyncInput {
  accessToken: string;
  uploadsPlaylistId: string;
  pageToken?: string;
  maxPages?: number;
}

export interface YouTubeUploadsSyncResult {
  videos: YouTubeVideo[];
  missingVideoIds: string[];
  pagesFetched: number;
  nextPageToken?: string;
}

export interface YouTubePublishMetadata {
  title: string;
  description: string;
  privacyStatus: YouTubePrivacyStatus;
  madeForKids: boolean;
  publishAt?: string;
  containsSyntheticMedia?: boolean;
  tags?: string[];
  categoryId?: string;
  defaultLanguage?: string;
}

export interface YouTubeResumableUploadInput {
  accessToken: string;
  metadata: unknown;
  contentLength: number;
  contentType: string;
  notifySubscribers?: boolean;
}

export interface YouTubeResumableUploadSession {
  uploadUrl: string;
}

export interface YouTubeResumableChunkInput {
  accessToken: string;
  uploadUrl: string;
  chunk: Uint8Array | ArrayBuffer;
  startByte: number;
  totalBytes: number;
  contentType: string;
}

export interface YouTubeResumableStatusInput {
  accessToken: string;
  uploadUrl: string;
  totalBytes: number;
}

export type YouTubeUploadProgress =
  | {
      status: "incomplete";
      receivedBytes: number;
      nextByte: number;
    }
  | {
      status: "complete";
      video: YouTubeVideo;
    };

function inputError(operation: string, message: string): ProviderError {
  return new ProviderError({
    code: "youtube_invalid_input",
    message,
    operation,
    status: 400,
  });
}

function responseError(operation: string): ProviderError {
  return new ProviderError({
    code: "youtube_invalid_response",
    message: "YouTube hat eine ungültige Antwort geliefert.",
    operation,
    status: 502,
  });
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function assertInputRecord(
  value: unknown,
  operation: string,
): Record<string, unknown> {
  if (!isRecord(value)) {
    throw inputError(operation, "Die Eingabe muss ein Objekt sein.");
  }
  return value;
}

function assertAllowedKeys(
  value: Record<string, unknown>,
  keys: readonly string[],
  operation: string,
): void {
  const allowed = new Set(keys);
  if (Object.keys(value).some((key) => !allowed.has(key))) {
    throw inputError(operation, "Die Eingabe enthält ein unbekanntes Feld.");
  }
}

function hasControlCharacters(value: string): boolean {
  return [...value].some((character) => {
    const code = character.charCodeAt(0);
    return code <= 31 || code === 127;
  });
}

function hasUnpairedSurrogate(value: string): boolean {
  for (let index = 0; index < value.length; index += 1) {
    const code = value.charCodeAt(index);
    if (code >= 0xd800 && code <= 0xdbff) {
      if (index + 1 >= value.length) return true;
      const next = value.charCodeAt(index + 1);
      if (next < 0xdc00 || next > 0xdfff) return true;
      index += 1;
    } else if (code >= 0xdc00 && code <= 0xdfff) {
      return true;
    }
  }
  return false;
}

function inputString(
  value: unknown,
  field: string,
  operation: string,
  options: { min?: number; max: number; controls?: boolean } = { max: 1 },
): string {
  if (typeof value !== "string") {
    throw inputError(operation, `${field} muss Text sein.`);
  }
  const min = options.min ?? 1;
  if (value.length < min || value.length > options.max) {
    throw inputError(operation, `${field} hat eine ungültige Länge.`);
  }
  if (options.controls !== true && hasControlCharacters(value)) {
    throw inputError(operation, `${field} enthält ungültige Steuerzeichen.`);
  }
  return value;
}

function inputSecret(value: unknown, field: string, operation: string): string {
  return inputString(value, field, operation, { max: 16_384 });
}

function inputAccessToken(value: unknown, operation: string): string {
  return inputSecret(value, "accessToken", operation);
}

function inputBoolean(
  value: unknown,
  field: string,
  operation: string,
): boolean {
  if (typeof value !== "boolean") {
    throw inputError(operation, `${field} muss ein boolescher Wert sein.`);
  }
  return value;
}

function inputSafeInteger(
  value: unknown,
  field: string,
  operation: string,
  minimum: number,
  maximum: number,
): number {
  if (
    typeof value !== "number" ||
    !Number.isSafeInteger(value) ||
    value < minimum ||
    value > maximum
  ) {
    throw inputError(operation, `${field} ist keine gültige Ganzzahl.`);
  }
  return value;
}

function optionalResponseString(
  record: Record<string, unknown>,
  key: string,
  operation: string,
): string | undefined {
  const value = record[key];
  if (value === undefined || value === null) return undefined;
  if (typeof value !== "string") throw responseError(operation);
  return value;
}

function requiredResponseString(
  record: Record<string, unknown>,
  key: string,
  operation: string,
): string {
  const value = optionalResponseString(record, key, operation);
  if (!value) throw responseError(operation);
  return value;
}

function optionalResponseBoolean(
  record: Record<string, unknown>,
  key: string,
  operation: string,
): boolean | undefined {
  const value = record[key];
  if (value === undefined || value === null) return undefined;
  if (typeof value !== "boolean") throw responseError(operation);
  return value;
}

function optionalResponseRecord(
  record: Record<string, unknown>,
  key: string,
  operation: string,
): Record<string, unknown> | undefined {
  const value = record[key];
  if (value === undefined || value === null) return undefined;
  if (!isRecord(value)) throw responseError(operation);
  return value;
}

function requiredResponseRecord(
  value: unknown,
  operation: string,
): Record<string, unknown> {
  if (!isRecord(value)) throw responseError(operation);
  return value;
}

function requiredResponseArray(
  record: Record<string, unknown>,
  key: string,
  operation: string,
): unknown[] {
  const value = record[key];
  if (!Array.isArray(value)) throw responseError(operation);
  return value;
}

function optionalCount(
  record: Record<string, unknown> | undefined,
  key: string,
  operation: string,
): string | undefined {
  if (!record) return undefined;
  const value = optionalResponseString(record, key, operation);
  if (value !== undefined && !/^\d+$/.test(value)) {
    throw responseError(operation);
  }
  return value;
}

function validateClientId(value: unknown, operation: string): string {
  return inputString(value, "clientId", operation, { max: 512 });
}

function validateRedirectUri(value: unknown, operation: string): string {
  const candidate = inputString(value, "redirectUri", operation, {
    max: 2_048,
  });
  let parsed: URL;
  try {
    parsed = new URL(candidate);
  } catch {
    throw inputError(operation, "redirectUri ist keine gültige URL.");
  }

  const localhost =
    parsed.hostname === "localhost" ||
    parsed.hostname === "127.0.0.1" ||
    parsed.hostname === "[::1]" ||
    parsed.hostname === "::1";
  const unbracketedHostname = parsed.hostname.replace(/^\[|\]$/g, "");
  if (
    parsed.protocol !== "https:" &&
    !(localhost && parsed.protocol === "http:")
  ) {
    throw inputError(operation, "redirectUri muss HTTPS verwenden.");
  }
  if (!localhost && isIP(unbracketedHostname) !== 0) {
    throw inputError(
      operation,
      "redirectUri darf keine rohe IP-Adresse verwenden.",
    );
  }
  if (parsed.username || parsed.password || parsed.hash) {
    throw inputError(
      operation,
      "redirectUri enthält unzulässige URL-Bestandteile.",
    );
  }
  return candidate;
}

function validateCodeVerifier(value: unknown, operation: string): string {
  const verifier = inputString(value, "codeVerifier", operation, {
    min: 43,
    max: 128,
  });
  if (!/^[A-Za-z0-9._~-]+$/.test(verifier)) {
    throw inputError(operation, "codeVerifier hat ein ungültiges PKCE-Format.");
  }
  return verifier;
}

function validateScopes(value: unknown, operation: string): string[] {
  const scopes = value === undefined ? [...DEFAULT_YOUTUBE_SCOPES] : value;
  if (!Array.isArray(scopes) || scopes.length === 0 || scopes.length > 10) {
    throw inputError(operation, "scopes muss eine nicht leere Liste sein.");
  }
  const uniqueScopes: string[] = [];
  for (const scope of scopes) {
    if (typeof scope !== "string" || !ALLOWED_SCOPES.has(scope)) {
      throw inputError(
        operation,
        "scopes enthält einen nicht erlaubten Scope.",
      );
    }
    if (!uniqueScopes.includes(scope)) uniqueScopes.push(scope);
  }
  return uniqueScopes;
}

export function buildYouTubeAuthorizeUrl(
  input: YouTubeAuthorizeUrlInput,
): string {
  const operation = "oauth_authorize";
  const record = assertInputRecord(input, operation);
  assertAllowedKeys(
    record,
    ["clientId", "redirectUri", "state", "codeChallenge", "scopes"],
    operation,
  );
  const clientId = validateClientId(record.clientId, operation);
  const redirectUri = validateRedirectUri(record.redirectUri, operation);
  const state = inputString(record.state, "state", operation, {
    min: 16,
    max: 1_024,
  });
  const codeChallenge = inputString(
    record.codeChallenge,
    "codeChallenge",
    operation,
    { min: 43, max: 43 },
  );
  if (!/^[A-Za-z0-9_-]{43}$/.test(codeChallenge)) {
    throw inputError(operation, "codeChallenge hat kein gültiges S256-Format.");
  }
  const scopes = validateScopes(record.scopes, operation);

  const url = new URL(GOOGLE_OAUTH_AUTHORIZE_URL);
  url.search = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri,
    response_type: "code",
    scope: scopes.join(" "),
    state,
    code_challenge: codeChallenge,
    code_challenge_method: "S256",
    access_type: "offline",
    include_granted_scopes: "true",
    prompt: "consent",
  }).toString();
  return url.toString();
}

function resolveTimeout(
  options: YouTubeRequestOptions,
  operation: string,
): number {
  if (options.timeoutMs === undefined) return DEFAULT_TIMEOUT_MS;
  return inputSafeInteger(
    options.timeoutMs,
    "timeoutMs",
    operation,
    100,
    MAX_TIMEOUT_MS,
  );
}

function resolveFetch(options: YouTubeRequestOptions): YouTubeFetch {
  return options.fetch ?? fetch;
}

function mapUpstreamStatus(status: number): number {
  if (status === 401 || status === 403 || status === 429) return status;
  return status >= 400 && status < 500 ? 400 : 502;
}

function isRetryableStatus(status: number): boolean {
  return status === 408 || status === 429 || status >= 500;
}

function safeUpstreamCode(value: unknown): string | undefined {
  return typeof value === "string" && /^[A-Za-z0-9_.:-]{1,100}$/.test(value)
    ? value
    : undefined;
}

async function readLimitedText(
  response: Response,
  operation: string,
): Promise<string> {
  if (!response.body) return "";
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > MAX_RESPONSE_BYTES) {
        await reader.cancel();
        throw new ProviderError({
          code: "youtube_response_too_large",
          message: "Die Antwort von YouTube ist zu groß.",
          operation,
          status: 502,
        });
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }
  return Buffer.concat(chunks.map((chunk) => Buffer.from(chunk))).toString(
    "utf8",
  );
}

async function parseJsonResponse(
  response: Response,
  operation: string,
): Promise<unknown> {
  const text = await readLimitedText(response, operation);
  if (!text.trim()) throw responseError(operation);
  try {
    return JSON.parse(text) as unknown;
  } catch {
    throw responseError(operation);
  }
}

async function extractUpstreamCode(
  response: Response,
  operation: string,
): Promise<string | undefined> {
  try {
    const text = await readLimitedText(response, operation);
    if (!text.trim()) return undefined;
    const parsed = JSON.parse(text) as unknown;
    if (!isRecord(parsed)) return undefined;
    const direct = safeUpstreamCode(parsed.error);
    if (direct) return direct;
    if (!isRecord(parsed.error)) return undefined;
    const errors = parsed.error.errors;
    if (Array.isArray(errors) && isRecord(errors[0])) {
      const reason = safeUpstreamCode(errors[0].reason);
      if (reason) return reason;
    }
    return safeUpstreamCode(parsed.error.status);
  } catch (error) {
    if (error instanceof ProviderError) throw error;
    return undefined;
  }
}

async function fetchWithTimeout(
  url: string,
  init: RequestInit,
  operation: string,
  options: YouTubeRequestOptions,
  allowedRedirectStatuses: ReadonlySet<number> = new Set(),
): Promise<Response> {
  const controller = new AbortController();
  const timeout = setTimeout(
    () => controller.abort(),
    resolveTimeout(options, operation),
  );
  timeout.unref();

  try {
    const response = await resolveFetch(options)(url, {
      ...init,
      redirect: "manual",
      signal: controller.signal,
    });
    if (
      response.status >= 300 &&
      response.status < 400 &&
      !allowedRedirectStatuses.has(response.status)
    ) {
      throw new ProviderError({
        code: "youtube_redirect_rejected",
        message: "Eine unerwartete Weiterleitung von Google wurde abgelehnt.",
        operation,
        status: 502,
        upstreamStatus: response.status,
      });
    }
    return response;
  } catch (error) {
    if (error instanceof ProviderError) throw error;
    if (controller.signal.aborted) {
      throw new ProviderError({
        code: "youtube_timeout",
        message: "YouTube hat nicht rechtzeitig geantwortet.",
        operation,
        status: 504,
        retryable: true,
      });
    }
    throw new ProviderError({
      code: "youtube_unavailable",
      message: "YouTube ist derzeit nicht erreichbar.",
      operation,
      status: 502,
      retryable: true,
    });
  } finally {
    clearTimeout(timeout);
  }
}

async function assertOkResponse(
  response: Response,
  operation: string,
  successStatuses: ReadonlySet<number> = new Set([200]),
): Promise<void> {
  if (successStatuses.has(response.status)) return;
  const upstreamCode = await extractUpstreamCode(response, operation);
  throw new ProviderError({
    code: operation.startsWith("oauth_")
      ? "youtube_oauth_error"
      : "youtube_api_error",
    message: operation.startsWith("oauth_")
      ? "Google hat die OAuth-Anfrage abgelehnt."
      : "YouTube hat die API-Anfrage abgelehnt.",
    operation,
    status: mapUpstreamStatus(response.status),
    upstreamStatus: response.status,
    retryable: isRetryableStatus(response.status),
    ...(upstreamCode ? { details: { upstreamCode } } : {}),
  });
}

async function requestJson(
  url: string,
  init: RequestInit,
  operation: string,
  options: YouTubeRequestOptions,
): Promise<unknown> {
  const response = await fetchWithTimeout(url, init, operation, options);
  await assertOkResponse(response, operation);
  return parseJsonResponse(response, operation);
}

function tokenRequestHeaders(): Record<string, string> {
  return {
    Accept: "application/json",
    "Content-Type": "application/x-www-form-urlencoded",
  };
}

function parseTokenResponse(
  value: unknown,
  operation: string,
  preservedRefreshToken?: string,
): YouTubeTokens {
  const record = requiredResponseRecord(value, operation);
  const accessToken = requiredResponseString(record, "access_token", operation);
  const tokenType = requiredResponseString(record, "token_type", operation);
  if (tokenType.toLowerCase() !== "bearer") throw responseError(operation);
  if (
    typeof record.expires_in !== "number" ||
    !Number.isSafeInteger(record.expires_in) ||
    record.expires_in <= 0
  ) {
    throw responseError(operation);
  }
  const refreshToken =
    optionalResponseString(record, "refresh_token", operation) ??
    preservedRefreshToken;
  const refreshTokenExpiresIn = record.refresh_token_expires_in;
  if (
    refreshTokenExpiresIn !== undefined &&
    (typeof refreshTokenExpiresIn !== "number" ||
      !Number.isSafeInteger(refreshTokenExpiresIn) ||
      refreshTokenExpiresIn <= 0)
  ) {
    throw responseError(operation);
  }
  const scope = optionalResponseString(record, "scope", operation);
  return {
    accessToken,
    ...(refreshToken ? { refreshToken } : {}),
    expiresInSeconds: record.expires_in,
    ...(typeof refreshTokenExpiresIn === "number"
      ? { refreshTokenExpiresInSeconds: refreshTokenExpiresIn }
      : {}),
    tokenType: "Bearer",
    ...(scope ? { scopes: scope.split(/\s+/).filter(Boolean) } : {}),
  };
}

export async function exchangeYouTubeAuthorizationCode(
  input: YouTubeAuthorizationCodeInput,
  options: YouTubeRequestOptions = {},
): Promise<YouTubeTokens> {
  const operation = "oauth_code_exchange";
  const record = assertInputRecord(input, operation);
  assertAllowedKeys(
    record,
    ["clientId", "clientSecret", "code", "codeVerifier", "redirectUri"],
    operation,
  );
  const body = new URLSearchParams({
    client_id: validateClientId(record.clientId, operation),
    client_secret: inputSecret(record.clientSecret, "clientSecret", operation),
    code: inputSecret(record.code, "code", operation),
    code_verifier: validateCodeVerifier(record.codeVerifier, operation),
    redirect_uri: validateRedirectUri(record.redirectUri, operation),
    grant_type: "authorization_code",
  });
  const value = await requestJson(
    GOOGLE_OAUTH_TOKEN_URL,
    { method: "POST", headers: tokenRequestHeaders(), body },
    operation,
    options,
  );
  return parseTokenResponse(value, operation);
}

export async function refreshYouTubeAccessToken(
  input: YouTubeRefreshTokenInput,
  options: YouTubeRequestOptions = {},
): Promise<YouTubeTokens & { refreshToken: string }> {
  const operation = "oauth_token_refresh";
  const record = assertInputRecord(input, operation);
  assertAllowedKeys(
    record,
    ["clientId", "clientSecret", "refreshToken"],
    operation,
  );
  const refreshToken = inputSecret(
    record.refreshToken,
    "refreshToken",
    operation,
  );
  const body = new URLSearchParams({
    client_id: validateClientId(record.clientId, operation),
    client_secret: inputSecret(record.clientSecret, "clientSecret", operation),
    refresh_token: refreshToken,
    grant_type: "refresh_token",
  });
  const value = await requestJson(
    GOOGLE_OAUTH_TOKEN_URL,
    { method: "POST", headers: tokenRequestHeaders(), body },
    operation,
    options,
  );
  const tokens = parseTokenResponse(value, operation, refreshToken);
  if (!tokens.refreshToken) throw responseError(operation);
  return { ...tokens, refreshToken: tokens.refreshToken };
}

export async function revokeYouTubeToken(
  input: YouTubeRevokeTokenInput,
  options: YouTubeRequestOptions = {},
): Promise<void> {
  const operation = "oauth_token_revoke";
  const record = assertInputRecord(input, operation);
  assertAllowedKeys(record, ["token"], operation);
  const body = new URLSearchParams({
    token: inputSecret(record.token, "token", operation),
  });
  const response = await fetchWithTimeout(
    GOOGLE_OAUTH_REVOKE_URL,
    { method: "POST", headers: tokenRequestHeaders(), body },
    operation,
    options,
  );
  await assertOkResponse(response, operation);
}

function youtubeHeaders(accessToken: string): Record<string, string> {
  return {
    Accept: "application/json",
    Authorization: `Bearer ${accessToken}`,
  };
}

function pickThumbnailUrl(
  snippet: Record<string, unknown> | undefined,
  operation: string,
): string | undefined {
  if (!snippet) return undefined;
  const thumbnails = optionalResponseRecord(snippet, "thumbnails", operation);
  if (!thumbnails) return undefined;
  for (const key of ["maxres", "standard", "high", "medium", "default"]) {
    const thumbnail = optionalResponseRecord(thumbnails, key, operation);
    if (!thumbnail) continue;
    const url = optionalResponseString(thumbnail, "url", operation);
    if (url) return url;
  }
  return undefined;
}

function parsePrivacyStatus(
  value: string | undefined,
  operation: string,
): YouTubePrivacyStatus | undefined {
  if (value === undefined) return undefined;
  if (!PRIVACY_STATUSES.has(value as YouTubePrivacyStatus)) {
    throw responseError(operation);
  }
  return value as YouTubePrivacyStatus;
}

function parseChannel(value: unknown, operation: string): YouTubeChannel {
  const record = requiredResponseRecord(value, operation);
  const snippet = optionalResponseRecord(record, "snippet", operation);
  if (!snippet) throw responseError(operation);
  const contentDetails = optionalResponseRecord(
    record,
    "contentDetails",
    operation,
  );
  const relatedPlaylists = contentDetails
    ? optionalResponseRecord(contentDetails, "relatedPlaylists", operation)
    : undefined;
  const statistics = optionalResponseRecord(record, "statistics", operation);
  const status = optionalResponseRecord(record, "status", operation);
  const longUploadsStatus = status
    ? optionalResponseString(status, "longUploadsStatus", operation)
    : undefined;
  if (
    longUploadsStatus !== undefined &&
    !["allowed", "disallowed", "eligible"].includes(longUploadsStatus)
  ) {
    throw responseError(operation);
  }
  return {
    id: requiredResponseString(record, "id", operation),
    title: requiredResponseString(snippet, "title", operation),
    ...(optionalResponseString(snippet, "description", operation) === undefined
      ? {}
      : {
          description: optionalResponseString(
            snippet,
            "description",
            operation,
          ),
        }),
    ...(pickThumbnailUrl(snippet, operation)
      ? { thumbnailUrl: pickThumbnailUrl(snippet, operation) }
      : {}),
    ...(relatedPlaylists &&
    optionalResponseString(relatedPlaylists, "uploads", operation)
      ? {
          uploadsPlaylistId: optionalResponseString(
            relatedPlaylists,
            "uploads",
            operation,
          ),
        }
      : {}),
    ...(optionalCount(statistics, "viewCount", operation)
      ? { viewCount: optionalCount(statistics, "viewCount", operation) }
      : {}),
    ...(optionalCount(statistics, "subscriberCount", operation)
      ? {
          subscriberCount: optionalCount(
            statistics,
            "subscriberCount",
            operation,
          ),
        }
      : {}),
    ...(statistics &&
    optionalResponseBoolean(statistics, "hiddenSubscriberCount", operation) !==
      undefined
      ? {
          hiddenSubscriberCount: optionalResponseBoolean(
            statistics,
            "hiddenSubscriberCount",
            operation,
          ),
        }
      : {}),
    ...(optionalCount(statistics, "videoCount", operation)
      ? { videoCount: optionalCount(statistics, "videoCount", operation) }
      : {}),
    ...(status && optionalResponseString(status, "privacyStatus", operation)
      ? {
          privacyStatus: parsePrivacyStatus(
            optionalResponseString(status, "privacyStatus", operation),
            operation,
          ),
        }
      : {}),
    ...(longUploadsStatus
      ? {
          longUploadsStatus: longUploadsStatus as
            "allowed" | "disallowed" | "eligible",
        }
      : {}),
    ...(status &&
    optionalResponseBoolean(status, "madeForKids", operation) !== undefined
      ? {
          madeForKids: optionalResponseBoolean(
            status,
            "madeForKids",
            operation,
          ),
        }
      : {}),
    ...(status &&
    optionalResponseBoolean(status, "selfDeclaredMadeForKids", operation) !==
      undefined
      ? {
          selfDeclaredMadeForKids: optionalResponseBoolean(
            status,
            "selfDeclaredMadeForKids",
            operation,
          ),
        }
      : {}),
  };
}

export async function discoverYouTubeAccounts(
  input: YouTubeAccountDiscoveryInput,
  options: YouTubeRequestOptions = {},
): Promise<YouTubeChannel[]> {
  const operation = "channels_list_mine";
  const record = assertInputRecord(input, operation);
  assertAllowedKeys(record, ["accessToken"], operation);
  const accessToken = inputAccessToken(record.accessToken, operation);
  const url = new URL(`${YOUTUBE_API_BASE_URL}/channels`);
  url.search = new URLSearchParams({
    part: "id,snippet,contentDetails,statistics,status",
    mine: "true",
    maxResults: "50",
  }).toString();
  const value = await requestJson(
    url.toString(),
    { method: "GET", headers: youtubeHeaders(accessToken) },
    operation,
    options,
  );
  const response = requiredResponseRecord(value, operation);
  return requiredResponseArray(response, "items", operation).map((item) =>
    parseChannel(item, operation),
  );
}

function parseVideo(value: unknown, operation: string): YouTubeVideo {
  const record = requiredResponseRecord(value, operation);
  const snippet = optionalResponseRecord(record, "snippet", operation);
  const contentDetails = optionalResponseRecord(
    record,
    "contentDetails",
    operation,
  );
  const status = optionalResponseRecord(record, "status", operation);
  const statistics = optionalResponseRecord(record, "statistics", operation);
  const processingDetails = optionalResponseRecord(
    record,
    "processingDetails",
    operation,
  );
  const stringField = (
    source: Record<string, unknown> | undefined,
    key: string,
  ): string | undefined =>
    source ? optionalResponseString(source, key, operation) : undefined;
  const boolField = (
    source: Record<string, unknown> | undefined,
    key: string,
  ): boolean | undefined =>
    source ? optionalResponseBoolean(source, key, operation) : undefined;

  return {
    id: requiredResponseString(record, "id", operation),
    ...(stringField(snippet, "title") !== undefined
      ? { title: stringField(snippet, "title") }
      : {}),
    ...(stringField(snippet, "description") !== undefined
      ? { description: stringField(snippet, "description") }
      : {}),
    ...(stringField(snippet, "channelId")
      ? { channelId: stringField(snippet, "channelId") }
      : {}),
    ...(stringField(snippet, "channelTitle")
      ? { channelTitle: stringField(snippet, "channelTitle") }
      : {}),
    ...(stringField(snippet, "publishedAt")
      ? { publishedAt: stringField(snippet, "publishedAt") }
      : {}),
    ...(pickThumbnailUrl(snippet, operation)
      ? { thumbnailUrl: pickThumbnailUrl(snippet, operation) }
      : {}),
    ...(stringField(contentDetails, "duration")
      ? { duration: stringField(contentDetails, "duration") }
      : {}),
    ...(stringField(contentDetails, "definition")
      ? { definition: stringField(contentDetails, "definition") }
      : {}),
    ...(stringField(contentDetails, "caption")
      ? { caption: stringField(contentDetails, "caption") }
      : {}),
    ...(stringField(status, "privacyStatus")
      ? {
          privacyStatus: parsePrivacyStatus(
            stringField(status, "privacyStatus"),
            operation,
          ),
        }
      : {}),
    ...(stringField(status, "publishAt")
      ? { publishAt: stringField(status, "publishAt") }
      : {}),
    ...(boolField(status, "madeForKids") !== undefined
      ? { madeForKids: boolField(status, "madeForKids") }
      : {}),
    ...(boolField(status, "selfDeclaredMadeForKids") !== undefined
      ? {
          selfDeclaredMadeForKids: boolField(status, "selfDeclaredMadeForKids"),
        }
      : {}),
    ...(stringField(status, "uploadStatus")
      ? { uploadStatus: stringField(status, "uploadStatus") }
      : {}),
    ...(stringField(status, "failureReason")
      ? { failureReason: stringField(status, "failureReason") }
      : {}),
    ...(stringField(status, "rejectionReason")
      ? { rejectionReason: stringField(status, "rejectionReason") }
      : {}),
    ...(optionalCount(statistics, "viewCount", operation)
      ? { viewCount: optionalCount(statistics, "viewCount", operation) }
      : {}),
    ...(optionalCount(statistics, "likeCount", operation)
      ? { likeCount: optionalCount(statistics, "likeCount", operation) }
      : {}),
    ...(optionalCount(statistics, "commentCount", operation)
      ? { commentCount: optionalCount(statistics, "commentCount", operation) }
      : {}),
    ...(stringField(processingDetails, "processingStatus")
      ? {
          processingStatus: stringField(processingDetails, "processingStatus"),
        }
      : {}),
  };
}

function validatePageToken(
  value: unknown,
  operation: string,
): string | undefined {
  if (value === undefined) return undefined;
  return inputString(value, "pageToken", operation, { max: 2_048 });
}

function parsePlaylistPage(
  value: unknown,
  operation: string,
): { videoIds: string[]; nextPageToken?: string } {
  const response = requiredResponseRecord(value, operation);
  const items = requiredResponseArray(response, "items", operation);
  const videoIds = items.map((item) => {
    const record = requiredResponseRecord(item, operation);
    const contentDetails = optionalResponseRecord(
      record,
      "contentDetails",
      operation,
    );
    if (!contentDetails) throw responseError(operation);
    return requiredResponseString(contentDetails, "videoId", operation);
  });
  const nextPageToken = optionalResponseString(
    response,
    "nextPageToken",
    operation,
  );
  return { videoIds, ...(nextPageToken ? { nextPageToken } : {}) };
}

async function fetchVideoDetails(
  accessToken: string,
  videoIds: string[],
  options: YouTubeRequestOptions,
): Promise<YouTubeVideo[]> {
  if (videoIds.length === 0) return [];
  const operation = "videos_list";
  const url = new URL(`${YOUTUBE_API_BASE_URL}/videos`);
  url.search = new URLSearchParams({
    part: "id,snippet,contentDetails,status,statistics,processingDetails",
    id: videoIds.join(","),
  }).toString();
  const value = await requestJson(
    url.toString(),
    { method: "GET", headers: youtubeHeaders(accessToken) },
    operation,
    options,
  );
  const response = requiredResponseRecord(value, operation);
  return requiredResponseArray(response, "items", operation).map((item) =>
    parseVideo(item, operation),
  );
}

export async function syncYouTubeUploads(
  input: YouTubeUploadsSyncInput,
  options: YouTubeRequestOptions = {},
): Promise<YouTubeUploadsSyncResult> {
  const operation = "playlist_uploads_sync";
  const record = assertInputRecord(input, operation);
  assertAllowedKeys(
    record,
    ["accessToken", "uploadsPlaylistId", "pageToken", "maxPages"],
    operation,
  );
  const accessToken = inputAccessToken(record.accessToken, operation);
  const playlistId = inputString(
    record.uploadsPlaylistId,
    "uploadsPlaylistId",
    operation,
    { max: 256 },
  );
  let pageToken = validatePageToken(record.pageToken, operation);
  const maxPages =
    record.maxPages === undefined
      ? 100
      : inputSafeInteger(record.maxPages, "maxPages", operation, 1, 1_000);
  const videos: YouTubeVideo[] = [];
  const missingVideoIds: string[] = [];
  const seenVideoIds = new Set<string>();
  const seenPageTokens = new Set<string>();
  let pagesFetched = 0;

  while (pagesFetched < maxPages) {
    const url = new URL(`${YOUTUBE_API_BASE_URL}/playlistItems`);
    const search = new URLSearchParams({
      part: "contentDetails",
      playlistId,
      maxResults: "50",
    });
    if (pageToken) search.set("pageToken", pageToken);
    url.search = search.toString();
    const value = await requestJson(
      url.toString(),
      { method: "GET", headers: youtubeHeaders(accessToken) },
      operation,
      options,
    );
    const page = parsePlaylistPage(value, operation);
    pagesFetched += 1;
    const orderedIds = page.videoIds.filter((videoId) => {
      if (seenVideoIds.has(videoId)) return false;
      seenVideoIds.add(videoId);
      return true;
    });
    const details = await fetchVideoDetails(accessToken, orderedIds, options);
    const byId = new Map(details.map((video) => [video.id, video]));
    for (const videoId of orderedIds) {
      const video = byId.get(videoId);
      if (video) videos.push(video);
      else missingVideoIds.push(videoId);
    }

    if (!page.nextPageToken) {
      pageToken = undefined;
      break;
    }
    if (seenPageTokens.has(page.nextPageToken)) throw responseError(operation);
    seenPageTokens.add(page.nextPageToken);
    pageToken = page.nextPageToken;
  }

  return {
    videos,
    missingVideoIds,
    pagesFetched,
    ...(pageToken ? { nextPageToken: pageToken } : {}),
  };
}

function countUnicodeCharacters(value: string): number {
  return [...value].length;
}

function validateRfc3339(value: string, operation: string): string {
  const match =
    /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.\d{1,9})?(Z|([+-])(\d{2}):(\d{2}))$/.exec(
      value,
    );
  if (!match)
    throw inputError(operation, "publishAt muss RFC 3339 entsprechen.");
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const hour = Number(match[4]);
  const minute = Number(match[5]);
  const second = Number(match[6]);
  const offsetHour = Number(match[9] ?? 0);
  const offsetMinute = Number(match[10] ?? 0);
  const daysInMonth = new Date(Date.UTC(year, month, 0)).getUTCDate();
  if (
    year < 1 ||
    month < 1 ||
    month > 12 ||
    day < 1 ||
    day > daysInMonth ||
    hour > 23 ||
    minute > 59 ||
    second > 59 ||
    offsetHour > 23 ||
    offsetMinute > 59 ||
    !Number.isFinite(Date.parse(value))
  ) {
    throw inputError(operation, "publishAt enthält kein gültiges Datum.");
  }
  return value;
}

export function validateYouTubePublishMetadata(
  input: unknown,
): YouTubePublishMetadata {
  const operation = "publish_metadata_validate";
  const record = assertInputRecord(input, operation);
  assertAllowedKeys(
    record,
    [
      "title",
      "description",
      "privacyStatus",
      "madeForKids",
      "publishAt",
      "containsSyntheticMedia",
      "tags",
      "categoryId",
      "defaultLanguage",
    ],
    operation,
  );
  const title = inputString(record.title, "title", operation, {
    max: 10_000,
    controls: true,
  });
  if (
    title.trim().length === 0 ||
    countUnicodeCharacters(title) > 100 ||
    /[<>]/.test(title) ||
    hasUnpairedSurrogate(title)
  ) {
    throw inputError(operation, "title überschreitet die YouTube-Grenzen.");
  }
  const description = inputString(
    record.description,
    "description",
    operation,
    {
      min: 0,
      max: 20_000,
      controls: true,
    },
  );
  if (
    INPUT_TEXT_ENCODER.encode(description).byteLength > 5_000 ||
    /[<>]/.test(description) ||
    hasUnpairedSurrogate(description)
  ) {
    throw inputError(
      operation,
      "description überschreitet die YouTube-Grenzen.",
    );
  }
  if (
    typeof record.privacyStatus !== "string" ||
    !PRIVACY_STATUSES.has(record.privacyStatus as YouTubePrivacyStatus)
  ) {
    throw inputError(operation, "privacyStatus ist ungültig.");
  }
  const privacyStatus = record.privacyStatus as YouTubePrivacyStatus;
  const madeForKids = inputBoolean(
    record.madeForKids,
    "madeForKids",
    operation,
  );
  const publishAt =
    record.publishAt === undefined
      ? undefined
      : validateRfc3339(
          inputString(record.publishAt, "publishAt", operation, { max: 64 }),
          operation,
        );
  if (publishAt && privacyStatus !== "private") {
    throw inputError(
      operation,
      "publishAt ist nur mit privacyStatus=private zulässig.",
    );
  }
  const containsSyntheticMedia =
    record.containsSyntheticMedia === undefined
      ? undefined
      : inputBoolean(
          record.containsSyntheticMedia,
          "containsSyntheticMedia",
          operation,
        );
  let tags: string[] | undefined;
  if (record.tags !== undefined) {
    if (!Array.isArray(record.tags) || record.tags.length > 500) {
      throw inputError(operation, "tags ist keine gültige Liste.");
    }
    tags = record.tags.map((tag) =>
      inputString(tag, "tags[]", operation, { max: 500 }),
    );
  }
  const categoryId =
    record.categoryId === undefined
      ? undefined
      : inputString(record.categoryId, "categoryId", operation, { max: 20 });
  if (categoryId !== undefined && !/^\d+$/.test(categoryId)) {
    throw inputError(operation, "categoryId muss numerisch sein.");
  }
  const defaultLanguage =
    record.defaultLanguage === undefined
      ? undefined
      : inputString(record.defaultLanguage, "defaultLanguage", operation, {
          max: 35,
        });
  if (
    defaultLanguage !== undefined &&
    !/^[A-Za-z]{2,3}(?:-[A-Za-z0-9]{2,8})*$/.test(defaultLanguage)
  ) {
    throw inputError(operation, "defaultLanguage ist ungültig.");
  }

  return {
    title,
    description,
    privacyStatus,
    madeForKids,
    ...(publishAt ? { publishAt } : {}),
    ...(containsSyntheticMedia === undefined ? {} : { containsSyntheticMedia }),
    ...(tags ? { tags } : {}),
    ...(categoryId ? { categoryId } : {}),
    ...(defaultLanguage ? { defaultLanguage } : {}),
  };
}

function validateContentType(value: unknown, operation: string): string {
  const contentType = inputString(value, "contentType", operation, {
    max: 200,
  });
  if (
    contentType !== "application/octet-stream" &&
    !/^video\/[A-Za-z0-9!#$&^_.+-]+$/.test(contentType)
  ) {
    throw inputError(operation, "contentType ist kein unterstützter Videotyp.");
  }
  return contentType;
}

function toVideoResource(
  metadata: YouTubePublishMetadata,
): Record<string, unknown> {
  return {
    snippet: {
      title: metadata.title,
      description: metadata.description,
      ...(metadata.tags ? { tags: metadata.tags } : {}),
      ...(metadata.categoryId ? { categoryId: metadata.categoryId } : {}),
      ...(metadata.defaultLanguage
        ? { defaultLanguage: metadata.defaultLanguage }
        : {}),
    },
    status: {
      privacyStatus: metadata.privacyStatus,
      selfDeclaredMadeForKids: metadata.madeForKids,
      ...(metadata.publishAt ? { publishAt: metadata.publishAt } : {}),
      ...(metadata.containsSyntheticMedia === undefined
        ? {}
        : { containsSyntheticMedia: metadata.containsSyntheticMedia }),
    },
  };
}

function validateUploadSessionUrl(value: unknown, operation: string): string {
  const candidate = inputString(value, "uploadUrl", operation, { max: 8_192 });
  let url: URL;
  try {
    url = new URL(candidate);
  } catch {
    throw inputError(operation, "uploadUrl ist keine gültige URL.");
  }
  if (
    url.protocol !== "https:" ||
    url.hostname !== "www.googleapis.com" ||
    (url.port !== "" && url.port !== "443") ||
    url.username ||
    url.password ||
    url.hash ||
    url.pathname !== "/upload/youtube/v3/videos"
  ) {
    throw inputError(
      operation,
      "uploadUrl ist kein erlaubter Google-Endpunkt.",
    );
  }
  return url.toString();
}

export async function initiateYouTubeResumableUpload(
  input: YouTubeResumableUploadInput,
  options: YouTubeRequestOptions = {},
): Promise<YouTubeResumableUploadSession> {
  const operation = "videos_resumable_initiate";
  const record = assertInputRecord(input, operation);
  assertAllowedKeys(
    record,
    [
      "accessToken",
      "metadata",
      "contentLength",
      "contentType",
      "notifySubscribers",
    ],
    operation,
  );
  const accessToken = inputAccessToken(record.accessToken, operation);
  const metadata = validateYouTubePublishMetadata(record.metadata);
  const contentLength = inputSafeInteger(
    record.contentLength,
    "contentLength",
    operation,
    1,
    MAX_VIDEO_BYTES,
  );
  const contentType = validateContentType(record.contentType, operation);
  const notifySubscribers =
    record.notifySubscribers === undefined
      ? true
      : inputBoolean(record.notifySubscribers, "notifySubscribers", operation);
  const url = new URL(YOUTUBE_UPLOAD_URL);
  url.search = new URLSearchParams({
    uploadType: "resumable",
    part: "snippet,status",
    notifySubscribers: String(notifySubscribers),
  }).toString();
  const response = await fetchWithTimeout(
    url.toString(),
    {
      method: "POST",
      headers: {
        ...youtubeHeaders(accessToken),
        "Content-Type": "application/json; charset=utf-8",
        "X-Upload-Content-Length": String(contentLength),
        "X-Upload-Content-Type": contentType,
      },
      body: JSON.stringify(toVideoResource(metadata)),
    },
    operation,
    options,
  );
  await assertOkResponse(response, operation, new Set([200, 201]));
  const location = response.headers.get("location");
  if (!location) throw responseError(operation);
  return { uploadUrl: validateUploadSessionUrl(location, operation) };
}

function normalizeChunk(
  value: unknown,
  operation: string,
): Uint8Array<ArrayBuffer> {
  if (value instanceof ArrayBuffer) return new Uint8Array(value);
  if (value instanceof Uint8Array) {
    return Uint8Array.from(value);
  }
  throw inputError(operation, "chunk muss Binärdaten enthalten.");
}

function parseReceivedBytes(
  range: string | null,
  totalBytes: number,
  operation: string,
): number {
  if (!range) return 0;
  const match = /^bytes=0-(\d+)$/.exec(range.trim());
  if (!match) throw responseError(operation);
  const lastByte = Number(match[1]);
  if (
    !Number.isSafeInteger(lastByte) ||
    lastByte < 0 ||
    lastByte >= totalBytes
  ) {
    throw responseError(operation);
  }
  return lastByte + 1;
}

async function parseUploadProgress(
  response: Response,
  totalBytes: number,
  operation: string,
): Promise<YouTubeUploadProgress> {
  if (response.status === 308) {
    const receivedBytes = parseReceivedBytes(
      response.headers.get("range"),
      totalBytes,
      operation,
    );
    return { status: "incomplete", receivedBytes, nextByte: receivedBytes };
  }
  await assertOkResponse(response, operation, new Set([200, 201]));
  return {
    status: "complete",
    video: parseVideo(await parseJsonResponse(response, operation), operation),
  };
}

export async function uploadYouTubeResumableChunk(
  input: YouTubeResumableChunkInput,
  options: YouTubeRequestOptions = {},
): Promise<YouTubeUploadProgress> {
  const operation = "videos_resumable_chunk";
  const record = assertInputRecord(input, operation);
  assertAllowedKeys(
    record,
    [
      "accessToken",
      "uploadUrl",
      "chunk",
      "startByte",
      "totalBytes",
      "contentType",
    ],
    operation,
  );
  const accessToken = inputAccessToken(record.accessToken, operation);
  const uploadUrl = validateUploadSessionUrl(record.uploadUrl, operation);
  const chunk = normalizeChunk(record.chunk, operation);
  if (chunk.byteLength === 0) {
    throw inputError(operation, "chunk darf nicht leer sein.");
  }
  const totalBytes = inputSafeInteger(
    record.totalBytes,
    "totalBytes",
    operation,
    1,
    MAX_VIDEO_BYTES,
  );
  const startByte = inputSafeInteger(
    record.startByte,
    "startByte",
    operation,
    0,
    totalBytes - 1,
  );
  const endByte = startByte + chunk.byteLength - 1;
  if (endByte > totalBytes - 1) {
    throw inputError(operation, "chunk überschreitet die Gesamtgröße.");
  }
  const isFinalChunk = endByte === totalBytes - 1;
  if (!isFinalChunk && chunk.byteLength % RESUMABLE_CHUNK_GRANULARITY !== 0) {
    throw inputError(
      operation,
      "Nicht finale Chunks müssen ein Vielfaches von 256 KiB groß sein.",
    );
  }
  const response = await fetchWithTimeout(
    uploadUrl,
    {
      method: "PUT",
      headers: {
        ...youtubeHeaders(accessToken),
        "Content-Type": validateContentType(record.contentType, operation),
        "Content-Length": String(chunk.byteLength),
        "Content-Range": `bytes ${startByte}-${endByte}/${totalBytes}`,
      },
      body: chunk,
    },
    operation,
    options,
    new Set([308]),
  );
  return parseUploadProgress(response, totalBytes, operation);
}

export async function getYouTubeResumableUploadStatus(
  input: YouTubeResumableStatusInput,
  options: YouTubeRequestOptions = {},
): Promise<YouTubeUploadProgress> {
  const operation = "videos_resumable_status";
  const record = assertInputRecord(input, operation);
  assertAllowedKeys(
    record,
    ["accessToken", "uploadUrl", "totalBytes"],
    operation,
  );
  const accessToken = inputAccessToken(record.accessToken, operation);
  const uploadUrl = validateUploadSessionUrl(record.uploadUrl, operation);
  const totalBytes = inputSafeInteger(
    record.totalBytes,
    "totalBytes",
    operation,
    1,
    MAX_VIDEO_BYTES,
  );
  const response = await fetchWithTimeout(
    uploadUrl,
    {
      method: "PUT",
      headers: {
        ...youtubeHeaders(accessToken),
        "Content-Length": "0",
        "Content-Range": `bytes */${totalBytes}`,
      },
    },
    operation,
    options,
    new Set([308]),
  );
  return parseUploadProgress(response, totalBytes, operation);
}
