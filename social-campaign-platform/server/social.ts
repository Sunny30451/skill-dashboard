import {
  createHash,
  createHmac,
  randomUUID,
  timingSafeEqual,
} from "node:crypto";
import type { IncomingMessage, ServerResponse } from "node:http";
import type { AuthService } from "./auth.js";
import type { RuntimeConfig, RuntimeEnvironment } from "./config.js";
import type { Database } from "./database.js";
import { HttpError, readBody, requireMethod, sendJson } from "./http.js";
import {
  createMetaAppSecretProof,
  MetaGraphClient,
  parseMetaWebhook,
  ProviderError as MetaProviderError,
  verifyMetaWebhookChallenge,
} from "./integrations/meta.js";
import {
  ProviderError as TikTokProviderError,
  TikTokClient,
  verifyTikTokSignature,
} from "./integrations/tiktok.js";
import {
  buildYouTubeAuthorizeUrl,
  discoverYouTubeAccounts,
  exchangeYouTubeAuthorizationCode,
  ProviderError as YouTubeProviderError,
  revokeYouTubeToken,
  YOUTUBE_SCOPES,
} from "./integrations/youtube.js";
import {
  constantTimeTextEqual,
  decryptSecret,
  encryptSecret,
  randomToken,
  sha256,
} from "./security.js";

export type SocialProvider = "meta" | "tiktok" | "youtube";

const SOCIAL_PROVIDERS = new Set<SocialProvider>(["meta", "tiktok", "youtube"]);
const OAUTH_STATE_TTL_MS = 10 * 60 * 1_000;
const MAX_RETURN_PATH_LENGTH = 2_048;
const MAX_CALLBACK_VALUE_LENGTH = 4_096;
const MAX_WEBHOOK_BYTES = 1024 * 1024;
const META_GRAPH_ORIGIN = "https://graph.facebook.com";
const META_GRAPH_VERSION = "v26.0";
const TIKTOK_SCOPES = [
  "user.info.basic",
  "video.list",
  "video.publish",
  "video.upload",
] as const;
const YOUTUBE_OAUTH_SCOPES = [
  YOUTUBE_SCOPES.readonly,
  YOUTUBE_SCOPES.upload,
  YOUTUBE_SCOPES.manage,
  YOUTUBE_SCOPES.analyticsReadonly,
] as const;

type SocialFetch = (
  input: string | URL | Request,
  init?: RequestInit,
) => Promise<Response>;

export interface SocialProviderConfiguration {
  meta?: {
    appId: string;
    appSecret: string;
    configId: string;
    webhookVerifyToken?: string;
  };
  tiktok?: {
    clientKey: string;
    clientSecret: string;
    webhookSecret?: string;
  };
  youtube?: {
    clientId: string;
    clientSecret: string;
    webSubSecret?: string;
    webSubVerifyToken?: string;
  };
}

export interface SocialServiceOptions {
  environment?: RuntimeEnvironment;
  fetch?: SocialFetch;
  now?: () => Date;
}

interface OAuthStateRow {
  user_id: string;
  verifier_encrypted: string | null;
  return_path: string;
  expires_at: Date;
}

interface OAuthStateContext {
  userId: string;
  verifier?: string;
  returnPath: string;
}

interface UserAuthorizationRow {
  active: boolean;
  role: string;
}

interface ConnectionInput {
  provider: SocialProvider;
  accountType: string;
  providerAccountId: string;
  displayName: string;
  accessToken: string;
  refreshToken?: string;
  expiresAt?: Date;
  scopes: readonly string[];
  metadata: Record<string, unknown>;
  createdBy: string;
}

interface ConnectionIdRow {
  id: string;
}

interface ConnectionListRow {
  id: string;
  provider: SocialProvider;
  account_type: string;
  provider_account_id: string;
  display_name: string;
  expires_at: Date | null;
  scopes: string[];
  metadata: unknown;
  status: string;
  created_at: Date;
  updated_at: Date;
}

interface SecretConnectionRow {
  id: string;
  account_type: string;
  provider_account_id: string;
  access_token_encrypted: string;
  refresh_token_encrypted: string | null;
}

interface SyncConnectionRow {
  id: string;
}

interface JobIdRow {
  id: string;
}

function optionalEnvironmentText(
  environment: RuntimeEnvironment,
  name: string,
  maximumLength = 8_192,
): string | undefined {
  const value = environment[name]?.trim();
  if (!value) return undefined;
  if (value.length > maximumLength || containsControlCharacter(value)) {
    throw new Error(`${name} ist ungültig.`);
  }
  return value;
}

function completeCredentials(
  provider: string,
  values: readonly (string | undefined)[],
): boolean {
  const configured = values.filter(Boolean).length;
  if (configured !== 0 && configured !== values.length) {
    throw new Error(`Die ${provider}-OAuth-Konfiguration ist unvollständig.`);
  }
  return configured === values.length;
}

export function loadSocialProviderConfiguration(
  environment: RuntimeEnvironment = process.env,
): SocialProviderConfiguration {
  const metaAppId = optionalEnvironmentText(environment, "META_APP_ID", 500);
  const metaAppSecret = optionalEnvironmentText(environment, "META_APP_SECRET");
  const metaConfigId = optionalEnvironmentText(
    environment,
    "META_CONFIG_ID",
    500,
  );
  const metaConfigured = completeCredentials("Meta", [
    metaAppId,
    metaAppSecret,
    metaConfigId,
  ]);

  const tikTokClientKey = optionalEnvironmentText(
    environment,
    "TIKTOK_CLIENT_KEY",
    500,
  );
  const tikTokClientSecret = optionalEnvironmentText(
    environment,
    "TIKTOK_CLIENT_SECRET",
  );
  const tikTokConfigured = completeCredentials("TikTok", [
    tikTokClientKey,
    tikTokClientSecret,
  ]);

  const youTubeClientId = optionalEnvironmentText(
    environment,
    "YOUTUBE_CLIENT_ID",
    1_000,
  );
  const youTubeClientSecret = optionalEnvironmentText(
    environment,
    "YOUTUBE_CLIENT_SECRET",
  );
  const youTubeConfigured = completeCredentials("YouTube", [
    youTubeClientId,
    youTubeClientSecret,
  ]);

  return {
    ...(metaConfigured
      ? {
          meta: {
            appId: metaAppId!,
            appSecret: metaAppSecret!,
            configId: metaConfigId!,
            ...(optionalEnvironmentText(
              environment,
              "META_WEBHOOK_VERIFY_TOKEN",
            )
              ? {
                  webhookVerifyToken: optionalEnvironmentText(
                    environment,
                    "META_WEBHOOK_VERIFY_TOKEN",
                  ),
                }
              : {}),
          },
        }
      : {}),
    ...(tikTokConfigured
      ? {
          tiktok: {
            clientKey: tikTokClientKey!,
            clientSecret: tikTokClientSecret!,
            ...(optionalEnvironmentText(environment, "TIKTOK_WEBHOOK_SECRET")
              ? {
                  webhookSecret: optionalEnvironmentText(
                    environment,
                    "TIKTOK_WEBHOOK_SECRET",
                  ),
                }
              : {}),
          },
        }
      : {}),
    ...(youTubeConfigured
      ? {
          youtube: {
            clientId: youTubeClientId!,
            clientSecret: youTubeClientSecret!,
            ...(optionalEnvironmentText(environment, "YOUTUBE_WEBSUB_SECRET")
              ? {
                  webSubSecret: optionalEnvironmentText(
                    environment,
                    "YOUTUBE_WEBSUB_SECRET",
                  ),
                }
              : {}),
            ...(optionalEnvironmentText(
              environment,
              "YOUTUBE_WEBSUB_VERIFY_TOKEN",
            )
              ? {
                  webSubVerifyToken: optionalEnvironmentText(
                    environment,
                    "YOUTUBE_WEBSUB_VERIFY_TOKEN",
                  ),
                }
              : {}),
          },
        }
      : {}),
  };
}

function containsControlCharacter(value: string): boolean {
  return [...value].some((character) => {
    const code = character.charCodeAt(0);
    return code <= 31 || code === 127;
  });
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function providerFromPath(value: string | undefined): SocialProvider {
  if (!value || !SOCIAL_PROVIDERS.has(value as SocialProvider)) {
    throw new HttpError(
      404,
      "social_provider_not_found",
      "Provider nicht gefunden.",
    );
  }
  return value as SocialProvider;
}

function callbackUri(config: RuntimeConfig, provider: SocialProvider): string {
  return new URL(
    `/api/social/${provider}/callback`,
    config.publicBaseUrl,
  ).toString();
}

function normalizedReturnPath(value: unknown): string {
  const candidate = value === undefined ? "/admin" : value;
  if (
    typeof candidate !== "string" ||
    candidate.length === 0 ||
    candidate.length > MAX_RETURN_PATH_LENGTH ||
    !candidate.startsWith("/") ||
    candidate.startsWith("//") ||
    candidate.includes("\\") ||
    containsControlCharacter(candidate)
  ) {
    throw new HttpError(
      400,
      "invalid_return_path",
      "Das Rücksprungziel ist ungültig.",
    );
  }
  const parsed = new URL(candidate, "https://return.invalid");
  if (parsed.origin !== "https://return.invalid") {
    throw new HttpError(
      400,
      "invalid_return_path",
      "Das Rücksprungziel ist ungültig.",
    );
  }
  return `${parsed.pathname}${parsed.search}${parsed.hash}`;
}

function requestUrl(request: IncomingMessage): URL {
  try {
    return new URL(request.url ?? "/", "http://request.invalid");
  } catch {
    throw new HttpError(
      400,
      "invalid_request_url",
      "Die Request-URL ist ungültig.",
    );
  }
}

function singleQueryValue(
  query: URLSearchParams,
  name: string,
  required = true,
): string | undefined {
  const values = query.getAll(name);
  if (values.length === 0 && !required) return undefined;
  const value = values.length === 1 ? values[0] : undefined;
  if (
    !value ||
    value.length > MAX_CALLBACK_VALUE_LENGTH ||
    containsControlCharacter(value)
  ) {
    throw new HttpError(
      400,
      "invalid_oauth_callback",
      "Der OAuth-Callback ist ungültig.",
    );
  }
  return value;
}

function assertMutationOrigin(
  request: IncomingMessage,
  config: RuntimeConfig,
): void {
  const header = request.headers.origin;
  const origin = Array.isArray(header) ? undefined : header;
  try {
    if (
      !origin ||
      new URL(origin).origin !== new URL(config.publicBaseUrl).origin
    ) {
      throw new Error("origin mismatch");
    }
  } catch {
    throw new HttpError(403, "invalid_origin", "Ungültiger Request-Ursprung.");
  }
}

function htmlEscape(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");
}

function redirectResultPath(
  returnPath: string,
  provider: SocialProvider,
  result: "connected" | "denied" | "error",
): string {
  const target = new URL(returnPath, "https://return.invalid");
  target.searchParams.set("social", result);
  target.searchParams.set("provider", provider);
  return `${target.pathname}${target.search}${target.hash}`;
}

function sendHtmlRedirect(response: ServerResponse, location: string): void {
  if (response.headersSent || response.writableEnded) return;
  const safeLocation = normalizedReturnPath(location);
  const escaped = htmlEscape(safeLocation);
  const body =
    '<!doctype html><html lang="de"><head><meta charset="utf-8">' +
    '<meta name="referrer" content="no-referrer"><title>Weiterleitung</title>' +
    `</head><body><p>Die Verbindung wurde verarbeitet. <a href="${escaped}">Weiter</a></p></body></html>`;
  response.writeHead(303, {
    "Cache-Control": "no-store",
    "Content-Length": Buffer.byteLength(body),
    "Content-Security-Policy":
      "default-src 'none'; base-uri 'none'; frame-ancestors 'none'; form-action 'none'",
    "Content-Type": "text/html; charset=utf-8",
    Location: safeLocation,
    "Referrer-Policy": "no-referrer",
    "X-Content-Type-Options": "nosniff",
  });
  response.end(body);
}

function sendPlainText(
  response: ServerResponse,
  status: number,
  value: string,
): void {
  if (response.headersSent || response.writableEnded) return;
  response.writeHead(status, {
    "Cache-Control": "no-store",
    "Content-Length": Buffer.byteLength(value),
    "Content-Type": "text/plain; charset=utf-8",
    "X-Content-Type-Options": "nosniff",
  });
  response.end(value);
}

function providerConfigurationMissing(provider: SocialProvider): HttpError {
  return new HttpError(
    503,
    "social_provider_not_configured",
    `${provider} ist nicht konfiguriert.`,
  );
}

function providerHttpError(error: unknown): unknown {
  if (error instanceof HttpError) return error;
  if (error instanceof MetaProviderError) {
    return new HttpError(
      error.httpStatus,
      error.code,
      "Die Meta-Anfrage konnte nicht verarbeitet werden.",
      { provider: "meta", retryable: error.retryable },
    );
  }
  if (error instanceof TikTokProviderError) {
    return new HttpError(
      error.status,
      error.code,
      "Die TikTok-Anfrage konnte nicht verarbeitet werden.",
      { provider: "tiktok", retryable: error.retryable },
    );
  }
  if (error instanceof YouTubeProviderError) {
    return new HttpError(
      error.status,
      error.code,
      "Die YouTube-Anfrage konnte nicht verarbeitet werden.",
      { provider: "youtube", retryable: error.retryable },
    );
  }
  return error;
}

function expiryDate(now: Date, seconds: number | undefined): Date | undefined {
  if (
    seconds === undefined ||
    !Number.isSafeInteger(seconds) ||
    seconds <= 0 ||
    seconds > 10 * 365 * 24 * 60 * 60
  ) {
    return undefined;
  }
  return new Date(now.getTime() + seconds * 1_000);
}

function safeDisplayName(value: string | undefined, fallback: string): string {
  const normalized = value?.trim();
  if (!normalized || containsControlCharacter(normalized)) return fallback;
  return normalized.slice(0, 500);
}

function safeMetadata(value: unknown): Record<string, unknown> {
  if (!isRecord(value)) return {};
  return value;
}

function isoDate(value: Date | null): string | undefined {
  if (!value) return undefined;
  const parsed = value instanceof Date ? value : new Date(value);
  return Number.isFinite(parsed.getTime()) ? parsed.toISOString() : undefined;
}

function secureHexEqual(actualHex: string, expected: Buffer): boolean {
  if (!/^[a-f0-9]+$/iu.test(actualHex)) return false;
  const actual = Buffer.from(actualHex, "hex");
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}

export class SocialService {
  readonly #configuration: SocialProviderConfiguration;
  readonly #fetch: SocialFetch;
  readonly #now: () => Date;

  constructor(
    private readonly database: Database,
    private readonly auth: AuthService,
    private readonly config: RuntimeConfig,
    options: SocialServiceOptions = {},
  ) {
    this.#configuration = loadSocialProviderConfiguration(
      options.environment ?? process.env,
    );
    this.#fetch = options.fetch ?? fetch;
    this.#now = options.now ?? (() => new Date());
  }

  async handle(
    request: IncomingMessage,
    response: ServerResponse,
    pathname: string,
  ): Promise<boolean> {
    const webhookAlias = /^\/api\/webhooks\/(meta|tiktok|youtube)$/.exec(
      pathname,
    );
    if (webhookAlias) {
      pathname = `/api/social/${webhookAlias[1]}/webhook`;
    }
    if (!pathname.startsWith("/api/social")) return false;

    try {
      if (pathname === "/api/social/meta/webhook") {
        await this.#handleMetaWebhook(request, response);
        return true;
      }
      if (pathname === "/api/social/tiktok/webhook") {
        await this.#handleTikTokWebhook(request, response);
        return true;
      }
      if (pathname === "/api/social/youtube/webhook") {
        await this.#handleYouTubeWebhook(request, response);
        return true;
      }

      const callback = /^\/api\/social\/(meta|tiktok|youtube)\/callback$/.exec(
        pathname,
      );
      if (callback) {
        await this.#handleCallback(
          providerFromPath(callback[1]),
          request,
          response,
        );
        return true;
      }

      if (pathname === "/api/social/connections") {
        requireMethod(request, response, ["GET"]);
        const user = await this.auth.requireUser(request, ["Admin"]);
        const result = await this.database.query<ConnectionListRow>(
          `SELECT id, provider, account_type, provider_account_id, display_name,
                  expires_at, scopes, metadata, status, created_at, updated_at
           FROM provider_connections
           WHERE created_by = $1 AND account_type <> 'oauth_user'
           ORDER BY provider, display_name, id`,
          [user.id],
        );
        sendJson(response, 200, {
          connections: result.rows.map((row) => ({
            id: row.id,
            provider: row.provider,
            accountType: row.account_type,
            providerAccountId: row.provider_account_id,
            displayName: row.display_name,
            ...(isoDate(row.expires_at)
              ? { expiresAt: isoDate(row.expires_at) }
              : {}),
            scopes: row.scopes,
            metadata: safeMetadata(row.metadata),
            status: row.status,
            createdAt: isoDate(row.created_at),
            updatedAt: isoDate(row.updated_at),
          })),
        });
        return true;
      }

      const action =
        /^\/api\/social\/(meta|tiktok|youtube)\/(connect|disconnect|sync)$/.exec(
          pathname,
        );
      if (action) {
        const provider = providerFromPath(action[1]);
        const operation = action[2];
        if (operation === "connect") {
          await this.#handleConnect(provider, request, response);
          return true;
        }
        if (operation === "disconnect") {
          await this.#handleDisconnect(provider, request, response);
          return true;
        }
        await this.#handleSync(provider, request, response);
        return true;
      }

      throw new HttpError(404, "not_found", "Social-Endpunkt nicht gefunden.");
    } catch (error) {
      throw providerHttpError(error);
    }
  }

  async #handleConnect(
    provider: SocialProvider,
    request: IncomingMessage,
    response: ServerResponse,
  ): Promise<void> {
    requireMethod(request, response, ["POST"]);
    assertMutationOrigin(request, this.config);
    const user = await this.auth.requireUser(request, ["Admin"]);
    const { json } = await readBody(request, 16 * 1024);
    if (!isRecord(json)) {
      throw new HttpError(
        400,
        "invalid_social_connect",
        "Die Anfrage ist ungültig.",
      );
    }
    for (const key of Object.keys(json)) {
      if (key !== "returnPath") {
        throw new HttpError(
          400,
          "invalid_social_connect",
          "Die Anfrage ist ungültig.",
        );
      }
    }
    const returnPath = normalizedReturnPath(json.returnPath);
    const state = randomToken(32);
    const codeVerifier = provider === "meta" ? undefined : randomToken(64);
    const redirectUri = callbackUri(this.config, provider);
    let authorizationUrl: string;

    if (provider === "meta") {
      const meta = this.#configuration.meta;
      if (!meta) throw providerConfigurationMissing(provider);
      authorizationUrl = new MetaGraphClient({
        appId: meta.appId,
        appSecret: meta.appSecret,
        configId: meta.configId,
        redirectUri,
        fetchImpl: this.#fetch,
      }).createAuthorizeUrl({ state });
    } else if (provider === "tiktok") {
      const tiktok = this.#configuration.tiktok;
      if (!tiktok || !codeVerifier)
        throw providerConfigurationMissing(provider);
      authorizationUrl = new TikTokClient({
        clientKey: tiktok.clientKey,
        clientSecret: tiktok.clientSecret,
        redirectUri,
        fetch: this.#fetch,
      }).createAuthorizationRequest({
        scopes: TIKTOK_SCOPES,
        state,
        codeVerifier,
      }).url;
    } else {
      const youtube = this.#configuration.youtube;
      if (!youtube || !codeVerifier)
        throw providerConfigurationMissing(provider);
      authorizationUrl = buildYouTubeAuthorizeUrl({
        clientId: youtube.clientId,
        redirectUri,
        state,
        codeChallenge: createHash("sha256")
          .update(codeVerifier, "utf8")
          .digest("base64url"),
        scopes: YOUTUBE_OAUTH_SCOPES,
      });
    }

    await this.database.query(
      "DELETE FROM oauth_states WHERE expires_at <= now()",
    );
    await this.database.query(
      `INSERT INTO oauth_states(
         state_hash, provider, user_id, verifier_encrypted, return_path, expires_at
       ) VALUES ($1, $2, $3, $4, $5, $6)`,
      [
        sha256(state),
        provider,
        user.id,
        codeVerifier
          ? encryptSecret(codeVerifier, this.config.tokenEncryptionKey)
          : null,
        returnPath,
        new Date(this.#now().getTime() + OAUTH_STATE_TTL_MS),
      ],
    );
    sendJson(response, 201, { authorizationUrl });
  }

  async #consumeOAuthState(
    provider: SocialProvider,
    state: string,
  ): Promise<OAuthStateContext> {
    const context = await this.database.transaction(async (client) => {
      const deleted = await client.query<OAuthStateRow>(
        `DELETE FROM oauth_states
         WHERE state_hash = $1 AND provider = $2
         RETURNING user_id, verifier_encrypted, return_path, expires_at`,
        [sha256(state), provider],
      );
      const row = deleted.rows[0];
      if (!row) return undefined;
      const user = await client.query<UserAuthorizationRow>(
        "SELECT active, role FROM users WHERE id = $1",
        [row.user_id],
      );
      return { row, user: user.rows[0] };
    });
    if (
      !context ||
      !context.user?.active ||
      context.user.role !== "Admin" ||
      new Date(context.row.expires_at).getTime() <= this.#now().getTime()
    ) {
      throw new HttpError(
        400,
        "invalid_oauth_state",
        "Der OAuth-State ist ungültig oder abgelaufen.",
      );
    }
    let verifier: string | undefined;
    if (context.row.verifier_encrypted) {
      try {
        verifier = decryptSecret(
          context.row.verifier_encrypted,
          this.config.tokenEncryptionKey,
        );
      } catch {
        throw new HttpError(
          400,
          "invalid_oauth_state",
          "Der OAuth-State ist ungültig oder abgelaufen.",
        );
      }
    }
    return {
      userId: context.row.user_id,
      ...(verifier ? { verifier } : {}),
      returnPath: normalizedReturnPath(context.row.return_path),
    };
  }

  async #handleCallback(
    provider: SocialProvider,
    request: IncomingMessage,
    response: ServerResponse,
  ): Promise<void> {
    requireMethod(request, response, ["GET"]);
    const query = requestUrl(request).searchParams;
    const state = singleQueryValue(query, "state")!;
    const context = await this.#consumeOAuthState(provider, state);
    try {
      if (singleQueryValue(query, "error", false)) {
        sendHtmlRedirect(
          response,
          redirectResultPath(context.returnPath, provider, "denied"),
        );
        return;
      }
      const code = singleQueryValue(query, "code")!;
      await this.#completeConnection(provider, context, code);
      sendHtmlRedirect(
        response,
        redirectResultPath(context.returnPath, provider, "connected"),
      );
    } catch {
      // The authorization code and state must disappear from the address bar,
      // even when a provider or database operation fails. Only a static result
      // is returned to the browser; callers can retry with a fresh state.
      sendHtmlRedirect(
        response,
        redirectResultPath(context.returnPath, provider, "error"),
      );
    }
  }

  async #completeConnection(
    provider: SocialProvider,
    context: OAuthStateContext,
    code: string,
  ): Promise<void> {
    const redirectUri = callbackUri(this.config, provider);
    const now = this.#now();
    if (provider === "meta") {
      const config = this.#configuration.meta;
      if (!config) throw providerConfigurationMissing(provider);
      const client = new MetaGraphClient({
        appId: config.appId,
        appSecret: config.appSecret,
        configId: config.configId,
        redirectUri,
        fetchImpl: this.#fetch,
      });
      const shortToken = await client.exchangeCode({ code });
      const token = await client.exchangeLongLivedUserToken(
        shortToken.accessToken,
      );
      const [debug, accounts] = await Promise.all([
        client.debugToken(token.accessToken),
        client.discoverPageAccounts({ userAccessToken: token.accessToken }),
      ]);
      if (!debug.isValid || !debug.userId || accounts.length === 0) {
        throw new HttpError(
          422,
          "meta_account_discovery_failed",
          "Meta hat keine nutzbaren Konten geliefert.",
        );
      }
      const expiresAt =
        debug.expiresAt && debug.expiresAt > 0
          ? new Date(debug.expiresAt * 1_000)
          : expiryDate(now, token.expiresIn);
      const connections: ConnectionInput[] = [
        {
          provider,
          accountType: "oauth_user",
          providerAccountId: debug.userId,
          displayName: "Meta OAuth User",
          accessToken: token.accessToken,
          ...(expiresAt ? { expiresAt } : {}),
          scopes: debug.scopes,
          metadata: { hidden: true },
          createdBy: context.userId,
        },
      ];
      for (const account of accounts) {
        connections.push({
          provider,
          accountType: "page",
          providerAccountId: account.id,
          displayName: safeDisplayName(account.name, `Meta Page ${account.id}`),
          accessToken: account.accessToken,
          ...(expiresAt ? { expiresAt } : {}),
          scopes: debug.scopes,
          metadata: { tasks: account.tasks },
          createdBy: context.userId,
        });
        if (account.instagramBusinessAccount) {
          const instagram = account.instagramBusinessAccount;
          connections.push({
            provider,
            accountType: "instagram",
            providerAccountId: instagram.id,
            displayName: safeDisplayName(
              instagram.username ?? instagram.name,
              `Instagram ${instagram.id}`,
            ),
            accessToken: account.accessToken,
            ...(expiresAt ? { expiresAt } : {}),
            scopes: debug.scopes,
            metadata: {
              pageId: account.id,
              pageName: account.name,
              ...(instagram.username ? { username: instagram.username } : {}),
            },
            createdBy: context.userId,
          });
        }
      }
      await this.#persistConnections(connections);
      return;
    }

    if (provider === "tiktok") {
      const config = this.#configuration.tiktok;
      if (!config || !context.verifier)
        throw providerConfigurationMissing(provider);
      const client = new TikTokClient({
        clientKey: config.clientKey,
        clientSecret: config.clientSecret,
        redirectUri,
        fetch: this.#fetch,
      });
      const token = await client.exchangeCode(code, context.verifier);
      const user = await client.getUserInfo(token.accessToken, [
        "open_id",
        "display_name",
        "username",
        "avatar_url",
      ]);
      await this.#persistConnections([
        {
          provider,
          accountType: "creator",
          providerAccountId: token.openId,
          displayName: safeDisplayName(
            user.display_name ?? user.username,
            `TikTok ${token.openId}`,
          ),
          accessToken: token.accessToken,
          refreshToken: token.refreshToken,
          expiresAt: expiryDate(now, token.expiresIn),
          scopes: token.scopes,
          metadata: {
            openId: token.openId,
            refreshExpiresAt: expiryDate(
              now,
              token.refreshExpiresIn,
            )?.toISOString(),
            ...(user.username ? { username: user.username } : {}),
            ...(user.avatar_url ? { avatarUrl: user.avatar_url } : {}),
          },
          createdBy: context.userId,
        },
      ]);
      return;
    }

    const config = this.#configuration.youtube;
    if (!config || !context.verifier)
      throw providerConfigurationMissing(provider);
    const token = await exchangeYouTubeAuthorizationCode(
      {
        clientId: config.clientId,
        clientSecret: config.clientSecret,
        code,
        codeVerifier: context.verifier,
        redirectUri,
      },
      { fetch: this.#fetch },
    );
    const channels = await discoverYouTubeAccounts(
      { accessToken: token.accessToken },
      { fetch: this.#fetch },
    );
    if (channels.length === 0) {
      throw new HttpError(
        422,
        "youtube_account_discovery_failed",
        "YouTube hat keinen nutzbaren Kanal geliefert.",
      );
    }
    const expiresAt = expiryDate(now, token.expiresInSeconds);
    await this.#persistConnections(
      channels.map((channel) => ({
        provider,
        accountType: "channel",
        providerAccountId: channel.id,
        displayName: safeDisplayName(channel.title, `YouTube ${channel.id}`),
        accessToken: token.accessToken,
        ...(token.refreshToken ? { refreshToken: token.refreshToken } : {}),
        ...(expiresAt ? { expiresAt } : {}),
        scopes: token.scopes ?? [...YOUTUBE_OAUTH_SCOPES],
        metadata: {
          ...(channel.uploadsPlaylistId
            ? { uploadsPlaylistId: channel.uploadsPlaylistId }
            : {}),
          ...(channel.thumbnailUrl
            ? { thumbnailUrl: channel.thumbnailUrl }
            : {}),
          ...(channel.description ? { description: channel.description } : {}),
        },
        createdBy: context.userId,
      })),
    );
  }

  async #persistConnections(
    connections: readonly ConnectionInput[],
  ): Promise<void> {
    await this.database.transaction(async (client) => {
      for (const connection of connections) {
        const metadata = JSON.stringify(connection.metadata);
        if (Buffer.byteLength(metadata) > 64 * 1024) {
          throw new HttpError(
            502,
            "provider_metadata_too_large",
            "Provider-Metadaten sind zu groß.",
          );
        }
        const result = await client.query<ConnectionIdRow>(
          `INSERT INTO provider_connections(
             provider, account_type, provider_account_id, display_name,
             access_token_encrypted, refresh_token_encrypted, expires_at,
             scopes, metadata, status, created_by
           ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9::jsonb, 'connected', $10)
           ON CONFLICT (provider, account_type, provider_account_id) DO UPDATE SET
             display_name = EXCLUDED.display_name,
             access_token_encrypted = EXCLUDED.access_token_encrypted,
             refresh_token_encrypted = coalesce(
               EXCLUDED.refresh_token_encrypted,
               provider_connections.refresh_token_encrypted
             ),
             expires_at = EXCLUDED.expires_at,
             scopes = EXCLUDED.scopes,
             metadata = EXCLUDED.metadata,
             status = 'connected',
             updated_at = now()
           WHERE provider_connections.created_by = EXCLUDED.created_by
           RETURNING id`,
          [
            connection.provider,
            connection.accountType,
            connection.providerAccountId,
            connection.displayName,
            encryptSecret(
              connection.accessToken,
              this.config.tokenEncryptionKey,
            ),
            connection.refreshToken
              ? encryptSecret(
                  connection.refreshToken,
                  this.config.tokenEncryptionKey,
                )
              : null,
            connection.expiresAt ?? null,
            [...new Set(connection.scopes)],
            metadata,
            connection.createdBy,
          ],
        );
        if (!result.rows[0]) {
          throw new HttpError(
            409,
            "social_account_owned_by_another_user",
            "Dieses Social-Media-Konto ist bereits verbunden.",
          );
        }
      }
    });
  }

  async #handleDisconnect(
    provider: SocialProvider,
    request: IncomingMessage,
    response: ServerResponse,
  ): Promise<void> {
    requireMethod(request, response, ["DELETE"]);
    assertMutationOrigin(request, this.config);
    const user = await this.auth.requireUser(request, ["Admin"]);
    const result = await this.database.query<SecretConnectionRow>(
      `SELECT id, account_type, provider_account_id,
              access_token_encrypted, refresh_token_encrypted
       FROM provider_connections
       WHERE provider = $1 AND created_by = $2
       ORDER BY CASE WHEN account_type = 'oauth_user' THEN 0 ELSE 1 END, created_at`,
      [provider, user.id],
    );
    if (result.rows.length === 0) {
      throw new HttpError(
        404,
        "social_connection_not_found",
        "Keine Verbindung gefunden.",
      );
    }
    let accessToken: string;
    let refreshToken: string | undefined;
    try {
      accessToken = decryptSecret(
        result.rows[0]!.access_token_encrypted,
        this.config.tokenEncryptionKey,
      );
      const encryptedRefresh = result.rows[0]!.refresh_token_encrypted;
      refreshToken = encryptedRefresh
        ? decryptSecret(encryptedRefresh, this.config.tokenEncryptionKey)
        : undefined;
    } catch {
      throw new HttpError(
        500,
        "social_token_unreadable",
        "Die gespeicherten Provider-Zugangsdaten sind nicht lesbar.",
      );
    }

    if (provider === "meta") {
      const config = this.#configuration.meta;
      if (!config) throw providerConfigurationMissing(provider);
      await this.#revokeMeta(accessToken, config.appSecret);
    } else if (provider === "tiktok") {
      const config = this.#configuration.tiktok;
      if (!config) throw providerConfigurationMissing(provider);
      await new TikTokClient({
        clientKey: config.clientKey,
        clientSecret: config.clientSecret,
        redirectUri: callbackUri(this.config, provider),
        fetch: this.#fetch,
      }).revoke(accessToken);
    } else {
      const config = this.#configuration.youtube;
      if (!config) throw providerConfigurationMissing(provider);
      await revokeYouTubeToken(
        { token: refreshToken ?? accessToken },
        { fetch: this.#fetch },
      );
    }
    await this.database.query(
      "DELETE FROM provider_connections WHERE provider = $1 AND created_by = $2",
      [provider, user.id],
    );
    sendJson(response, 204, null);
  }

  async #revokeMeta(accessToken: string, appSecret: string): Promise<void> {
    const url = new URL(
      `/${META_GRAPH_VERSION}/me/permissions`,
      META_GRAPH_ORIGIN,
    );
    url.searchParams.set(
      "appsecret_proof",
      createMetaAppSecretProof(accessToken, appSecret),
    );
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 15_000);
    timeout.unref();
    let response: Response;
    try {
      response = await this.#fetch(url, {
        method: "DELETE",
        headers: {
          Accept: "application/json",
          Authorization: `Bearer ${accessToken}`,
        },
        redirect: "manual",
        signal: controller.signal,
      });
    } catch {
      throw new HttpError(
        controller.signal.aborted ? 504 : 502,
        controller.signal.aborted ? "meta_timeout" : "meta_unavailable",
        "Die Meta-Verbindung konnte nicht widerrufen werden.",
      );
    } finally {
      clearTimeout(timeout);
    }
    if (!response.ok) {
      await response.body?.cancel().catch(() => undefined);
      throw new HttpError(
        502,
        "meta_revoke_failed",
        "Die Meta-Verbindung konnte nicht widerrufen werden.",
      );
    }
    await response.body?.cancel().catch(() => undefined);
  }

  async #handleSync(
    provider: SocialProvider,
    request: IncomingMessage,
    response: ServerResponse,
  ): Promise<void> {
    requireMethod(request, response, ["POST"]);
    assertMutationOrigin(request, this.config);
    const user = await this.auth.requireUser(request, ["Admin"]);
    const { json } = await readBody(request, 16 * 1024);
    if (!isRecord(json)) {
      throw new HttpError(
        400,
        "invalid_sync_request",
        "Die Sync-Anfrage ist ungültig.",
      );
    }
    for (const key of Object.keys(json)) {
      if (key !== "connectionId") {
        throw new HttpError(
          400,
          "invalid_sync_request",
          "Die Sync-Anfrage ist ungültig.",
        );
      }
    }
    const connectionId = json.connectionId;
    if (
      connectionId !== undefined &&
      (typeof connectionId !== "string" ||
        !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu.test(
          connectionId,
        ))
    ) {
      throw new HttpError(
        400,
        "invalid_connection_id",
        "Die Verbindung ist ungültig.",
      );
    }
    const connections = await this.database.query<SyncConnectionRow>(
      `SELECT id FROM provider_connections
       WHERE provider = $1 AND created_by = $2 AND status = 'connected'
         AND account_type <> 'oauth_user'
         AND ($3::uuid IS NULL OR id = $3::uuid)
       ORDER BY id`,
      [provider, user.id, connectionId ?? null],
    );
    if (connections.rows.length === 0) {
      throw new HttpError(
        404,
        "social_connection_not_found",
        "Keine Verbindung gefunden.",
      );
    }
    const requestedAt = this.#now().toISOString();
    const jobs = await this.database.transaction(async (client) => {
      const ids: string[] = [];
      for (const connection of connections.rows) {
        const id = randomUUID();
        const result = await client.query<JobIdRow>(
          `INSERT INTO publish_jobs(
             id, job_type, provider, connection_id, status, payload,
             consent, created_by
           ) VALUES ($1, 'sync', $2, $3, 'pending', $4::jsonb, $5::jsonb, $6)
           RETURNING id`,
          [
            id,
            provider,
            connection.id,
            JSON.stringify({ source: "manual", requestedAt }),
            JSON.stringify({ type: "manual_sync", requestedAt }),
            user.id,
          ],
        );
        ids.push(result.rows[0]?.id ?? id);
      }
      return ids;
    });
    sendJson(response, 202, {
      jobs: jobs.map((id) => ({ id, status: "pending" })),
    });
  }

  async #persistWebhook(
    provider: SocialProvider,
    rawBody: Buffer,
    signatureHeader: string | undefined,
    payload: Record<string, unknown>,
  ): Promise<void> {
    await this.database.query(
      `INSERT INTO webhook_events(
         provider, provider_event_id, signature_hash, payload
       ) VALUES ($1, $2, $3, $4::jsonb)
       ON CONFLICT (provider, provider_event_id) DO NOTHING`,
      [
        provider,
        sha256(rawBody),
        signatureHeader ? sha256(signatureHeader) : null,
        JSON.stringify(payload),
      ],
    );
  }

  async #handleMetaWebhook(
    request: IncomingMessage,
    response: ServerResponse,
  ): Promise<void> {
    const config = this.#configuration.meta;
    if (!config) throw providerConfigurationMissing("meta");
    if (request.method === "GET") {
      if (!config.webhookVerifyToken) {
        throw new HttpError(
          503,
          "meta_webhook_not_configured",
          "Der Meta-Webhook ist nicht konfiguriert.",
        );
      }
      const challenge = verifyMetaWebhookChallenge(
        requestUrl(request).searchParams,
        config.webhookVerifyToken,
      );
      sendPlainText(response, 200, challenge);
      return;
    }
    requireMethod(request, response, ["POST"]);
    const { raw } = await readBody(request, MAX_WEBHOOK_BYTES, false);
    const signature = request.headers["x-hub-signature-256"];
    const payload = parseMetaWebhook(raw, signature, config.appSecret);
    await this.#persistWebhook(
      "meta",
      raw,
      Array.isArray(signature) ? signature[0] : signature,
      {
        object: payload.object,
        entry: payload.entry,
      },
    );
    sendJson(response, 200, { received: true });
  }

  async #handleTikTokWebhook(
    request: IncomingMessage,
    response: ServerResponse,
  ): Promise<void> {
    requireMethod(request, response, ["POST"]);
    const config = this.#configuration.tiktok;
    if (!config) throw providerConfigurationMissing("tiktok");
    const { raw } = await readBody(request, MAX_WEBHOOK_BYTES, false);
    const headerValue =
      request.headers["tiktok-signature"] ??
      request.headers["x-tiktok-signature"];
    const signature = Array.isArray(headerValue) ? headerValue[0] : headerValue;
    let validSignature = false;
    try {
      validSignature = Boolean(
        signature &&
        verifyTikTokSignature({
          header: signature,
          rawBody: raw,
          clientSecret: config.webhookSecret ?? config.clientSecret,
          now: this.#now(),
        }),
      );
    } catch {
      validSignature = false;
    }
    if (!validSignature) {
      throw new HttpError(
        401,
        "tiktok_webhook_signature_invalid",
        "Die TikTok-Webhook-Signatur ist ungültig.",
      );
    }
    let payload: unknown;
    try {
      payload = JSON.parse(raw.toString("utf8")) as unknown;
    } catch {
      throw new HttpError(
        400,
        "tiktok_webhook_payload_invalid",
        "Der TikTok-Webhook ist ungültig.",
      );
    }
    if (!isRecord(payload)) {
      throw new HttpError(
        400,
        "tiktok_webhook_payload_invalid",
        "Der TikTok-Webhook ist ungültig.",
      );
    }
    await this.#persistWebhook("tiktok", raw, signature, payload);
    sendJson(response, 200, { received: true });
  }

  async #handleYouTubeWebhook(
    request: IncomingMessage,
    response: ServerResponse,
  ): Promise<void> {
    const config = this.#configuration.youtube;
    if (!config) throw providerConfigurationMissing("youtube");
    if (request.method === "GET") {
      const query = requestUrl(request).searchParams;
      const mode = singleQueryValue(query, "hub.mode");
      const challenge = singleQueryValue(query, "hub.challenge");
      const topic = singleQueryValue(query, "hub.topic");
      const suppliedVerifyToken = singleQueryValue(
        query,
        "hub.verify_token",
        false,
      );
      if (mode !== "subscribe" && mode !== "unsubscribe") {
        throw new HttpError(
          403,
          "youtube_websub_verification_failed",
          "Die YouTube-WebSub-Verifikation ist fehlgeschlagen.",
        );
      }
      if (
        config.webSubVerifyToken &&
        (!suppliedVerifyToken ||
          !constantTimeTextEqual(suppliedVerifyToken, config.webSubVerifyToken))
      ) {
        throw new HttpError(
          403,
          "youtube_websub_verification_failed",
          "Die YouTube-WebSub-Verifikation ist fehlgeschlagen.",
        );
      }
      let topicUrl: URL;
      try {
        topicUrl = new URL(topic!);
      } catch {
        throw new HttpError(
          403,
          "youtube_websub_verification_failed",
          "Die YouTube-WebSub-Verifikation ist fehlgeschlagen.",
        );
      }
      const channelIds = topicUrl.searchParams.getAll("channel_id");
      const channelId = channelIds.length === 1 ? channelIds[0] : undefined;
      if (
        topicUrl.origin !== "https://www.youtube.com" ||
        topicUrl.pathname !== "/xml/feeds/videos.xml" ||
        [...topicUrl.searchParams.keys()].some((key) => key !== "channel_id") ||
        !channelId ||
        !/^UC[A-Za-z0-9_-]{20,30}$/u.test(channelId)
      ) {
        throw new HttpError(
          403,
          "youtube_websub_verification_failed",
          "Die YouTube-WebSub-Verifikation ist fehlgeschlagen.",
        );
      }
      if (mode === "subscribe") {
        const connected = await this.database.query(
          `SELECT 1 FROM provider_connections
           WHERE provider = 'youtube' AND account_type = 'channel'
             AND provider_account_id = $1 AND status = 'connected'
           LIMIT 1`,
          [channelId],
        );
        if (!connected.rows[0]) {
          throw new HttpError(
            403,
            "youtube_websub_verification_failed",
            "Die YouTube-WebSub-Verifikation ist fehlgeschlagen.",
          );
        }
      }
      sendPlainText(response, 200, challenge!);
      return;
    }

    requireMethod(request, response, ["POST"]);
    if (!config.webSubSecret) {
      throw new HttpError(
        503,
        "youtube_websub_not_configured",
        "Der YouTube-WebSub-Webhook ist nicht vollständig konfiguriert.",
      );
    }
    const { raw } = await readBody(request, MAX_WEBHOOK_BYTES, false);
    const headerValue = request.headers["x-hub-signature"];
    const signature = Array.isArray(headerValue) ? headerValue[0] : headerValue;
    const match = /^sha1=([a-f0-9]{40})$/iu.exec(signature ?? "");
    const expected = createHmac("sha1", config.webSubSecret)
      .update(raw)
      .digest();
    if (!match || !secureHexEqual(match[1]!, expected)) {
      throw new HttpError(
        401,
        "youtube_websub_signature_invalid",
        "Die YouTube-WebSub-Signatur ist ungültig.",
      );
    }
    const contentType = request.headers["content-type"]
      ?.split(";", 1)[0]
      ?.trim()
      .toLowerCase();
    const xml = raw.toString("utf8");
    if (
      !contentType ||
      !["application/atom+xml", "application/xml", "text/xml"].includes(
        contentType,
      ) ||
      !xml.includes("<feed") ||
      !xml.includes("http://www.w3.org/2005/Atom") ||
      xml.includes("\0")
    ) {
      throw new HttpError(
        400,
        "youtube_websub_payload_invalid",
        "Die YouTube-WebSub-Nachricht ist ungültig.",
      );
    }
    await this.#persistWebhook("youtube", raw, signature, {
      contentType,
      xml,
    });
    sendJson(response, 204, null);
  }
}
