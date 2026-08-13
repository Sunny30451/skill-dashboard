import { createHmac, timingSafeEqual } from "node:crypto";

export const META_GRAPH_API_VERSION = "v26.0";
export const META_GRAPH_ORIGIN = "https://graph.facebook.com";
export const META_AUTH_ORIGIN = "https://www.facebook.com";
export const DEFAULT_META_TIMEOUT_MS = 15_000;
export const MAX_META_RESPONSE_BYTES = 4 * 1024 * 1024;

const MAX_TOKEN_LENGTH = 8_192;
const MAX_SECRET_LENGTH = 8_192;
const MAX_TEXT_LENGTH = 20_000;
const MAX_CAPTION_LENGTH = 2_200;
const MAX_PAGES = 100;
const GRAPH_OBJECT_ID = /^[A-Za-z0-9][A-Za-z0-9_.-]{0,254}$/;
const GRAPH_FIELD = /^[A-Za-z][A-Za-z0-9_]{0,99}$/;
const GRAPH_API_ERROR_CODES_THAT_CAN_BE_RETRIED = new Set([
  1, 2, 4, 17, 32, 613, 80001,
]);

type FetchImplementation = typeof fetch;
type QueryValue = boolean | number | string | undefined;
type FormValue = boolean | number | string | undefined;

export interface ProviderErrorOptions {
  code: string;
  message: string;
  httpStatus: number;
  retryable?: boolean;
  upstreamStatus?: number;
  upstreamCode?: number;
  upstreamSubcode?: number;
  traceId?: string;
}

/** A safe, serializable provider error that never contains request secrets. */
export class ProviderError extends Error {
  readonly provider = "meta";
  readonly code: string;
  readonly httpStatus: number;
  readonly status: number;
  readonly retryable: boolean;
  readonly upstreamStatus?: number;
  readonly upstreamCode?: number;
  readonly upstreamSubcode?: number;
  readonly traceId?: string;

  constructor(options: ProviderErrorOptions) {
    super(options.message);
    this.name = "ProviderError";
    this.code = options.code;
    this.httpStatus = options.httpStatus;
    this.status = options.httpStatus;
    this.retryable = options.retryable ?? false;
    this.upstreamStatus = options.upstreamStatus;
    this.upstreamCode = options.upstreamCode;
    this.upstreamSubcode = options.upstreamSubcode;
    this.traceId = options.traceId;
  }

  toJSON(): Record<string, unknown> {
    return {
      provider: this.provider,
      code: this.code,
      message: this.message,
      httpStatus: this.httpStatus,
      retryable: this.retryable,
      ...(this.upstreamStatus === undefined
        ? {}
        : { upstreamStatus: this.upstreamStatus }),
      ...(this.upstreamCode === undefined
        ? {}
        : { upstreamCode: this.upstreamCode }),
      ...(this.upstreamSubcode === undefined
        ? {}
        : { upstreamSubcode: this.upstreamSubcode }),
      ...(this.traceId ? { traceId: this.traceId } : {}),
    };
  }
}

export interface MetaClientOptions {
  appId: string;
  appSecret: string;
  configId?: string;
  redirectUri?: string;
  timeoutMs?: number;
  fetchImpl?: FetchImplementation;
}

export interface MetaAuthorizeUrlOptions {
  appId: string;
  configId: string;
  redirectUri: string;
  state: string;
}

export interface MetaAccessToken {
  accessToken: string;
  tokenType: string;
  expiresIn?: number;
}

export interface MetaInstagramAccount {
  id: string;
  username?: string;
  name?: string;
}

export interface MetaPageAccount {
  id: string;
  name: string;
  accessToken: string;
  tasks: string[];
  instagramBusinessAccount?: MetaInstagramAccount;
}

export interface MetaPagePost {
  id: string;
  message?: string;
  createdTime?: string;
  permalinkUrl?: string;
  fullPicture?: string;
}

export interface MetaInstagramMedia {
  id: string;
  caption?: string;
  mediaType?: string;
  mediaUrl?: string;
  permalink?: string;
  thumbnailUrl?: string;
  timestamp?: string;
  likeCount?: number;
  commentsCount?: number;
}

export interface MetaCommentAuthor {
  id: string;
  name?: string;
  username?: string;
}

export interface MetaComment {
  id: string;
  message?: string;
  text?: string;
  createdTime?: string;
  timestamp?: string;
  parentId?: string;
  from?: MetaCommentAuthor;
}

export interface MetaInsight {
  id?: string;
  name: string;
  period?: string;
  title?: string;
  description?: string;
  values: unknown[];
}

export interface MetaPublishingLimit {
  quotaUsage: number;
  quotaTotal?: number;
  quotaDurationSeconds?: number;
}

export interface MetaTokenDebug {
  appId: string;
  type?: string;
  application?: string;
  userId?: string;
  isValid: boolean;
  issuedAt?: number;
  expiresAt?: number;
  dataAccessExpiresAt?: number;
  scopes: string[];
}

export type MetaContainerStatusCode =
  "ERROR" | "EXPIRED" | "FINISHED" | "IN_PROGRESS" | "PUBLISHED";

export interface MetaContainerStatus {
  id: string;
  statusCode: MetaContainerStatusCode;
  status?: string;
}

export interface MetaWebhookEnvelope {
  object: string;
  entry: unknown[];
}

export interface MetaConnectionPage<T> {
  data: T[];
  after?: string;
}

interface RequestOptions {
  accessToken?: string;
  body?: Record<string, FormValue>;
  method?: "GET" | "POST";
  operation: string;
  query?: Record<string, QueryValue>;
  useAppSecretProof?: boolean;
}

interface GraphApiErrorFields {
  code?: number;
  subcode?: number;
  traceId?: string;
}

function invalidInput(code: string, message: string): ProviderError {
  return new ProviderError({ code, message, httpStatus: 400 });
}

function invalidResponse(operation: string): ProviderError {
  return new ProviderError({
    code: "meta_invalid_response",
    message: `Meta returned an invalid response for ${operation}.`,
    httpStatus: 502,
  });
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function containsDisallowedControlCharacter(value: string): boolean {
  return [...value].some((character) => {
    const code = character.charCodeAt(0);
    return (
      code <= 8 ||
      code === 11 ||
      code === 12 ||
      (code >= 14 && code <= 31) ||
      code === 127
    );
  });
}

function requiredString(
  value: unknown,
  name: string,
  maximumLength = MAX_TEXT_LENGTH,
): string {
  if (
    typeof value !== "string" ||
    !value.trim() ||
    value.length > maximumLength ||
    containsDisallowedControlCharacter(value)
  ) {
    throw invalidInput("meta_invalid_input", `${name} is invalid.`);
  }
  return value.trim();
}

function optionalString(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value : undefined;
}

function optionalInteger(value: unknown): number | undefined {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 0
    ? value
    : undefined;
}

function graphObjectId(value: unknown, name: string): string {
  const id = requiredString(value, name, 255);
  if (!GRAPH_OBJECT_ID.test(id)) {
    throw invalidInput("meta_invalid_id", `${name} is invalid.`);
  }
  return id;
}

function graphField(value: unknown, name: string): string {
  const field = requiredString(value, name, 100);
  if (!GRAPH_FIELD.test(field)) {
    throw invalidInput("meta_invalid_field", `${name} is invalid.`);
  }
  return field;
}

function accessToken(value: unknown): string {
  return requiredString(value, "accessToken", MAX_TOKEN_LENGTH);
}

function appSecret(value: unknown): string {
  return requiredString(value, "appSecret", MAX_SECRET_LENGTH);
}

function positiveInteger(
  value: unknown,
  name: string,
  maximum: number,
): number {
  if (
    !Number.isSafeInteger(value) ||
    Number(value) < 1 ||
    Number(value) > maximum
  ) {
    throw invalidInput("meta_invalid_input", `${name} is invalid.`);
  }
  return Number(value);
}

function validateHttpsUrl(value: unknown, name: string): string {
  const candidate = requiredString(value, name, 2_048);
  let parsed: URL;
  try {
    parsed = new URL(candidate);
  } catch {
    throw invalidInput("meta_invalid_url", `${name} must be a valid URL.`);
  }
  if (
    parsed.protocol !== "https:" ||
    parsed.username ||
    parsed.password ||
    parsed.hash
  ) {
    throw invalidInput(
      "meta_invalid_url",
      `${name} must be an HTTPS URL without credentials or a fragment.`,
    );
  }
  return parsed.toString();
}

function validateTimeout(value: number | undefined): number {
  if (value === undefined) return DEFAULT_META_TIMEOUT_MS;
  if (!Number.isInteger(value) || value < 1_000 || value > 120_000) {
    throw invalidInput(
      "meta_invalid_timeout",
      "timeoutMs must be an integer between 1000 and 120000.",
    );
  }
  return value;
}

function validateMaxPages(value: number | undefined): number {
  return value === undefined
    ? 20
    : positiveInteger(value, "maxPages", MAX_PAGES);
}

function encodePathSegment(value: unknown, name: string): string {
  return encodeURIComponent(graphObjectId(value, name));
}

function setQueryValues(url: URL, values: Record<string, QueryValue>): void {
  for (const [key, value] of Object.entries(values)) {
    if (value !== undefined) url.searchParams.set(key, String(value));
  }
}

function toFormBody(values: Record<string, FormValue>): URLSearchParams {
  const body = new URLSearchParams();
  for (const [key, value] of Object.entries(values)) {
    if (value !== undefined) body.set(key, String(value));
  }
  return body;
}

function normalizeStringArray(value: unknown): string[] | undefined {
  if (!Array.isArray(value)) return undefined;
  const strings = value.filter(
    (entry): entry is string => typeof entry === "string" && Boolean(entry),
  );
  return strings.length === value.length ? strings : undefined;
}

function parseGraphError(value: unknown): GraphApiErrorFields {
  if (!isRecord(value) || !isRecord(value.error)) return {};
  return {
    code: optionalInteger(value.error.code),
    subcode: optionalInteger(value.error.error_subcode),
    traceId: optionalString(value.error.fbtrace_id),
  };
}

function providerHttpStatus(upstreamStatus: number): number {
  if (
    upstreamStatus === 400 ||
    upstreamStatus === 401 ||
    upstreamStatus === 403
  ) {
    return upstreamStatus;
  }
  if (
    upstreamStatus === 404 ||
    upstreamStatus === 409 ||
    upstreamStatus === 422
  ) {
    return upstreamStatus;
  }
  if (upstreamStatus === 408 || upstreamStatus === 504) return 504;
  if (upstreamStatus === 429) return 429;
  return 502;
}

function upstreamError(
  response: Response,
  value: unknown,
  operation: string,
): ProviderError {
  const graphError = parseGraphError(value);
  const retryable =
    response.status === 408 ||
    response.status === 429 ||
    response.status >= 500 ||
    (graphError.code !== undefined &&
      GRAPH_API_ERROR_CODES_THAT_CAN_BE_RETRIED.has(graphError.code));
  return new ProviderError({
    code: "meta_api_error",
    message: `Meta API request failed for ${operation}.`,
    httpStatus: providerHttpStatus(response.status),
    retryable,
    upstreamStatus: response.status,
    upstreamCode: graphError.code,
    upstreamSubcode: graphError.subcode,
    traceId: graphError.traceId,
  });
}

async function readLimitedResponseText(response: Response): Promise<string> {
  if (!response.body) return "";
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let byteLength = 0;
  let text = "";
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      byteLength += value.byteLength;
      if (byteLength > MAX_META_RESPONSE_BYTES) {
        await reader.cancel();
        throw new ProviderError({
          code: "meta_response_too_large",
          message: "Meta returned a response that is too large.",
          httpStatus: 502,
        });
      }
      text += decoder.decode(value, { stream: true });
    }
    text += decoder.decode();
    return text;
  } finally {
    reader.releaseLock();
  }
}

function parseJson(text: string, operation: string): unknown {
  try {
    return JSON.parse(text) as unknown;
  } catch {
    throw invalidResponse(operation);
  }
}

function parseConnection<T>(
  value: unknown,
  operation: string,
  parseEntry: (entry: unknown, index: number) => T,
): MetaConnectionPage<T> {
  if (!isRecord(value) || !Array.isArray(value.data)) {
    throw invalidResponse(operation);
  }
  let after: string | undefined;
  if (
    isRecord(value.paging) &&
    optionalString(value.paging.next) &&
    isRecord(value.paging.cursors)
  ) {
    after = optionalString(value.paging.cursors.after);
  }
  return {
    data: value.data.map(parseEntry),
    ...(after ? { after } : {}),
  };
}

function parseIdResponse(value: unknown, operation: string): { id: string } {
  if (!isRecord(value) || !optionalString(value.id)) {
    throw invalidResponse(operation);
  }
  return { id: graphObjectId(value.id, "Meta response id") };
}

function parseAccount(value: unknown): MetaPageAccount {
  if (!isRecord(value)) throw invalidResponse("Page discovery");
  const id = optionalString(value.id);
  const name = optionalString(value.name);
  const token = optionalString(value.access_token);
  const tasks = normalizeStringArray(value.tasks);
  if (!id || !name || !token || !tasks) {
    throw invalidResponse("Page discovery");
  }

  let instagramBusinessAccount: MetaInstagramAccount | undefined;
  if (value.instagram_business_account !== undefined) {
    if (!isRecord(value.instagram_business_account)) {
      throw invalidResponse("Page discovery");
    }
    const instagramId = optionalString(value.instagram_business_account.id);
    if (!instagramId) throw invalidResponse("Page discovery");
    instagramBusinessAccount = {
      id: graphObjectId(instagramId, "Instagram account id"),
      ...(optionalString(value.instagram_business_account.username)
        ? {
            username: optionalString(value.instagram_business_account.username),
          }
        : {}),
      ...(optionalString(value.instagram_business_account.name)
        ? { name: optionalString(value.instagram_business_account.name) }
        : {}),
    };
  }
  return {
    id: graphObjectId(id, "Page id"),
    name,
    accessToken: accessToken(token),
    tasks,
    ...(instagramBusinessAccount ? { instagramBusinessAccount } : {}),
  };
}

function parsePagePost(value: unknown): MetaPagePost {
  if (!isRecord(value) || !optionalString(value.id)) {
    throw invalidResponse("Page feed");
  }
  return {
    id: graphObjectId(value.id, "Page post id"),
    ...(optionalString(value.message)
      ? { message: value.message as string }
      : {}),
    ...(optionalString(value.created_time)
      ? { createdTime: value.created_time as string }
      : {}),
    ...(optionalString(value.permalink_url)
      ? { permalinkUrl: value.permalink_url as string }
      : {}),
    ...(optionalString(value.full_picture)
      ? { fullPicture: value.full_picture as string }
      : {}),
  };
}

function parseInstagramMedia(value: unknown): MetaInstagramMedia {
  if (!isRecord(value) || !optionalString(value.id)) {
    throw invalidResponse("Instagram media");
  }
  const likeCount = optionalInteger(value.like_count);
  const commentsCount = optionalInteger(value.comments_count);
  return {
    id: graphObjectId(value.id, "Instagram media id"),
    ...(optionalString(value.caption)
      ? { caption: value.caption as string }
      : {}),
    ...(optionalString(value.media_type)
      ? { mediaType: value.media_type as string }
      : {}),
    ...(optionalString(value.media_url)
      ? { mediaUrl: value.media_url as string }
      : {}),
    ...(optionalString(value.permalink)
      ? { permalink: value.permalink as string }
      : {}),
    ...(optionalString(value.thumbnail_url)
      ? { thumbnailUrl: value.thumbnail_url as string }
      : {}),
    ...(optionalString(value.timestamp)
      ? { timestamp: value.timestamp as string }
      : {}),
    ...(likeCount === undefined ? {} : { likeCount }),
    ...(commentsCount === undefined ? {} : { commentsCount }),
  };
}

function parseCommentAuthor(value: unknown): MetaCommentAuthor | undefined {
  if (value === undefined || value === null) return undefined;
  if (!isRecord(value) || !optionalString(value.id)) {
    throw invalidResponse("Comments");
  }
  return {
    id: graphObjectId(value.id, "Comment author id"),
    ...(optionalString(value.name) ? { name: value.name as string } : {}),
    ...(optionalString(value.username)
      ? { username: value.username as string }
      : {}),
  };
}

function parseComment(value: unknown): MetaComment {
  if (!isRecord(value) || !optionalString(value.id)) {
    throw invalidResponse("Comments");
  }
  const author = parseCommentAuthor(value.from);
  return {
    id: graphObjectId(value.id, "Comment id"),
    ...(optionalString(value.message)
      ? { message: value.message as string }
      : {}),
    ...(optionalString(value.text) ? { text: value.text as string } : {}),
    ...(optionalString(value.created_time)
      ? { createdTime: value.created_time as string }
      : {}),
    ...(optionalString(value.timestamp)
      ? { timestamp: value.timestamp as string }
      : {}),
    ...(optionalString(value.parent_id)
      ? { parentId: graphObjectId(value.parent_id, "Parent comment id") }
      : {}),
    ...(author ? { from: author } : {}),
  };
}

function parseInsight(value: unknown): MetaInsight {
  if (
    !isRecord(value) ||
    !optionalString(value.name) ||
    !Array.isArray(value.values)
  ) {
    throw invalidResponse("Insights");
  }
  return {
    name: graphField(value.name, "Insight name"),
    values: value.values,
    ...(optionalString(value.id) ? { id: value.id as string } : {}),
    ...(optionalString(value.period) ? { period: value.period as string } : {}),
    ...(optionalString(value.title) ? { title: value.title as string } : {}),
    ...(optionalString(value.description)
      ? { description: value.description as string }
      : {}),
  };
}

function secureStringEqual(actual: string, expected: string): boolean {
  const actualBuffer = Buffer.from(actual, "utf8");
  const expectedBuffer = Buffer.from(expected, "utf8");
  return (
    actualBuffer.length === expectedBuffer.length &&
    timingSafeEqual(actualBuffer, expectedBuffer)
  );
}

export function createMetaAppSecretProof(
  tokenValue: string,
  secretValue: string,
): string {
  const token = accessToken(tokenValue);
  const secret = appSecret(secretValue);
  return createHmac("sha256", secret).update(token, "utf8").digest("hex");
}

export function buildMetaAuthorizeUrl(
  options: MetaAuthorizeUrlOptions,
): string {
  const appId = graphObjectId(options.appId, "appId");
  const configId = graphObjectId(options.configId, "configId");
  const redirectUri = validateHttpsUrl(options.redirectUri, "redirectUri");
  const state = requiredString(options.state, "state", 1_024);
  const url = new URL(
    `/${META_GRAPH_API_VERSION}/dialog/oauth`,
    META_AUTH_ORIGIN,
  );
  setQueryValues(url, {
    client_id: appId,
    config_id: configId,
    redirect_uri: redirectUri,
    state,
    response_type: "code",
    override_default_response_type: true,
  });
  return url.toString();
}

export class MetaGraphClient {
  readonly appId: string;
  readonly configId?: string;
  readonly redirectUri?: string;
  readonly timeoutMs: number;

  readonly #appSecret: string;
  readonly #fetch: FetchImplementation;

  constructor(options: MetaClientOptions) {
    this.appId = graphObjectId(options.appId, "appId");
    this.#appSecret = appSecret(options.appSecret);
    this.configId = options.configId
      ? graphObjectId(options.configId, "configId")
      : undefined;
    this.redirectUri = options.redirectUri
      ? validateHttpsUrl(options.redirectUri, "redirectUri")
      : undefined;
    this.timeoutMs = validateTimeout(options.timeoutMs);
    this.#fetch = options.fetchImpl ?? fetch;
  }

  createAuthorizeUrl(options: {
    state: string;
    configId?: string;
    redirectUri?: string;
  }): string {
    const configId = options.configId ?? this.configId;
    const redirectUri = options.redirectUri ?? this.redirectUri;
    if (!configId || !redirectUri) {
      throw invalidInput(
        "meta_missing_oauth_configuration",
        "configId and redirectUri are required.",
      );
    }
    return buildMetaAuthorizeUrl({
      appId: this.appId,
      configId,
      redirectUri,
      state: options.state,
    });
  }

  async exchangeCode(options: {
    code: string;
    redirectUri?: string;
  }): Promise<MetaAccessToken> {
    const code = requiredString(options.code, "code", 4_096);
    const redirectUri = options.redirectUri ?? this.redirectUri;
    if (!redirectUri) {
      throw invalidInput(
        "meta_missing_redirect_uri",
        "redirectUri is required.",
      );
    }
    const url = this.#graphUrl("/oauth/access_token", {
      client_id: this.appId,
      client_secret: this.#appSecret,
      redirect_uri: validateHttpsUrl(redirectUri, "redirectUri"),
      code,
    });
    return this.#parseAccessToken(
      await this.#requestUrl(url, { method: "GET" }, "OAuth code exchange"),
      "OAuth code exchange",
    );
  }

  async exchangeLongLivedUserToken(
    shortLivedAccessToken: string,
  ): Promise<MetaAccessToken> {
    const token = accessToken(shortLivedAccessToken);
    const url = this.#graphUrl("/oauth/access_token", {
      grant_type: "fb_exchange_token",
      client_id: this.appId,
      client_secret: this.#appSecret,
      fb_exchange_token: token,
    });
    return this.#parseAccessToken(
      await this.#requestUrl(
        url,
        { method: "GET" },
        "long-lived token exchange",
      ),
      "long-lived token exchange",
    );
  }

  async discoverPageAccounts(options: {
    userAccessToken: string;
    limit?: number;
    maxPages?: number;
  }): Promise<MetaPageAccount[]> {
    return this.#collectConnection(
      "/me/accounts",
      {
        accessToken: options.userAccessToken,
        operation: "Page discovery",
        query: {
          fields:
            "id,name,access_token,tasks,instagram_business_account{id,username,name}",
          limit:
            options.limit === undefined
              ? 100
              : positiveInteger(options.limit, "limit", 100),
        },
      },
      parseAccount,
      options.maxPages,
    );
  }

  async getPageFeedPage(options: {
    pageId: string;
    pageAccessToken: string;
    after?: string;
    limit?: number;
  }): Promise<MetaConnectionPage<MetaPagePost>> {
    const pageId = encodePathSegment(options.pageId, "pageId");
    const response = await this.#requestGraph(`/${pageId}/feed`, {
      accessToken: options.pageAccessToken,
      operation: "Page feed",
      query: {
        fields: "id,message,created_time,permalink_url,full_picture",
        limit:
          options.limit === undefined
            ? 50
            : positiveInteger(options.limit, "limit", 100),
        after: options.after
          ? requiredString(options.after, "after", 2_048)
          : undefined,
      },
    });
    return parseConnection(response, "Page feed", parsePagePost);
  }

  async listPageFeed(options: {
    pageId: string;
    pageAccessToken: string;
    limit?: number;
    maxPages?: number;
  }): Promise<MetaPagePost[]> {
    const pageId = graphObjectId(options.pageId, "pageId");
    return this.#collectConnection(
      `/${encodeURIComponent(pageId)}/feed`,
      {
        accessToken: options.pageAccessToken,
        operation: "Page feed",
        query: {
          fields: "id,message,created_time,permalink_url,full_picture",
          limit:
            options.limit === undefined
              ? 50
              : positiveInteger(options.limit, "limit", 100),
        },
      },
      parsePagePost,
      options.maxPages,
    );
  }

  async listInstagramMedia(options: {
    instagramAccountId: string;
    accessToken: string;
    limit?: number;
    maxPages?: number;
  }): Promise<MetaInstagramMedia[]> {
    const instagramAccountId = graphObjectId(
      options.instagramAccountId,
      "instagramAccountId",
    );
    return this.#collectConnection(
      `/${encodeURIComponent(instagramAccountId)}/media`,
      {
        accessToken: options.accessToken,
        operation: "Instagram media",
        query: {
          fields:
            "id,caption,media_type,media_url,permalink,thumbnail_url,timestamp,like_count,comments_count",
          limit:
            options.limit === undefined
              ? 50
              : positiveInteger(options.limit, "limit", 100),
        },
      },
      parseInstagramMedia,
      options.maxPages,
    );
  }

  async publishPageText(options: {
    pageId: string;
    pageAccessToken: string;
    message: string;
    published?: boolean;
    scheduledPublishTime?: number;
  }): Promise<{ id: string }> {
    return this.#publishPageFeed({
      ...options,
      message: requiredString(options.message, "message", MAX_TEXT_LENGTH),
    });
  }

  async publishPageLink(options: {
    pageId: string;
    pageAccessToken: string;
    link: string;
    message?: string;
    published?: boolean;
    scheduledPublishTime?: number;
  }): Promise<{ id: string }> {
    return this.#publishPageFeed({
      ...options,
      link: validateHttpsUrl(options.link, "link"),
      message: options.message
        ? requiredString(options.message, "message", MAX_TEXT_LENGTH)
        : undefined,
    });
  }

  async publishPagePhoto(options: {
    pageId: string;
    pageAccessToken: string;
    imageUrl: string;
    caption?: string;
    published?: boolean;
    scheduledPublishTime?: number;
  }): Promise<{ id: string; postId?: string }> {
    const publication = this.#publicationFields(
      options.published,
      options.scheduledPublishTime,
    );
    const pageId = encodePathSegment(options.pageId, "pageId");
    const response = await this.#requestGraph(`/${pageId}/photos`, {
      accessToken: options.pageAccessToken,
      method: "POST",
      operation: "Page photo publishing",
      body: {
        url: validateHttpsUrl(options.imageUrl, "imageUrl"),
        caption: options.caption
          ? requiredString(options.caption, "caption", MAX_TEXT_LENGTH)
          : undefined,
        ...publication,
      },
    });
    if (!isRecord(response) || !optionalString(response.id)) {
      throw invalidResponse("Page photo publishing");
    }
    return {
      id: graphObjectId(response.id, "Photo id"),
      ...(optionalString(response.post_id)
        ? { postId: graphObjectId(response.post_id, "Page post id") }
        : {}),
    };
  }

  async createInstagramMediaContainer(options: {
    instagramAccountId: string;
    accessToken: string;
    mediaType?: "CAROUSEL" | "IMAGE" | "REELS" | "STORIES" | "VIDEO";
    imageUrl?: string;
    videoUrl?: string;
    caption?: string;
    children?: string[];
    isCarouselItem?: boolean;
    altText?: string;
    shareToFeed?: boolean;
    isAiGenerated?: boolean;
  }): Promise<{ id: string }> {
    const mediaType =
      options.mediaType ?? (options.videoUrl ? "VIDEO" : "IMAGE");
    const allowedTypes = new Set([
      "CAROUSEL",
      "IMAGE",
      "REELS",
      "STORIES",
      "VIDEO",
    ]);
    if (!allowedTypes.has(mediaType)) {
      throw invalidInput("meta_invalid_media", "mediaType is invalid.");
    }

    const children = options.children?.map((id) =>
      graphObjectId(id, "child id"),
    );
    if (mediaType === "CAROUSEL") {
      if (!children || children.length < 2 || children.length > 10) {
        throw invalidInput(
          "meta_invalid_media",
          "A carousel requires between 2 and 10 child containers.",
        );
      }
      if (options.imageUrl || options.videoUrl) {
        throw invalidInput(
          "meta_invalid_media",
          "A carousel container cannot include imageUrl or videoUrl.",
        );
      }
    } else if (children) {
      throw invalidInput(
        "meta_invalid_media",
        "children are only valid for carousel containers.",
      );
    } else if (
      mediaType === "IMAGE" &&
      (!options.imageUrl || options.videoUrl)
    ) {
      throw invalidInput(
        "meta_invalid_media",
        "An image container requires imageUrl only.",
      );
    } else if (
      (mediaType === "VIDEO" || mediaType === "REELS") &&
      (!options.videoUrl || options.imageUrl)
    ) {
      throw invalidInput(
        "meta_invalid_media",
        "A video or reel container requires videoUrl only.",
      );
    } else if (
      mediaType === "STORIES" &&
      Boolean(options.imageUrl) === Boolean(options.videoUrl)
    ) {
      throw invalidInput(
        "meta_invalid_media",
        "A story container requires exactly one media URL.",
      );
    }

    const instagramAccountId = encodePathSegment(
      options.instagramAccountId,
      "instagramAccountId",
    );
    const response = await this.#requestGraph(`/${instagramAccountId}/media`, {
      accessToken: options.accessToken,
      method: "POST",
      operation: "Instagram media container creation",
      body: {
        media_type: mediaType === "IMAGE" ? undefined : mediaType,
        image_url: options.imageUrl
          ? validateHttpsUrl(options.imageUrl, "imageUrl")
          : undefined,
        video_url: options.videoUrl
          ? validateHttpsUrl(options.videoUrl, "videoUrl")
          : undefined,
        caption: options.caption
          ? requiredString(options.caption, "caption", MAX_CAPTION_LENGTH)
          : undefined,
        children: children?.join(","),
        is_carousel_item: options.isCarouselItem,
        alt_text: options.altText
          ? requiredString(options.altText, "altText", 1_000)
          : undefined,
        share_to_feed: options.shareToFeed,
        is_ai_generated: options.isAiGenerated,
      },
    });
    return parseIdResponse(response, "Instagram media container creation");
  }

  async getInstagramContainerStatus(options: {
    containerId: string;
    accessToken: string;
  }): Promise<MetaContainerStatus> {
    const containerId = encodePathSegment(options.containerId, "containerId");
    const response = await this.#requestGraph(`/${containerId}`, {
      accessToken: options.accessToken,
      operation: "Instagram media container status",
      query: { fields: "id,status_code,status" },
    });
    if (!isRecord(response) || !optionalString(response.id)) {
      throw invalidResponse("Instagram media container status");
    }
    const statusCode = optionalString(response.status_code);
    const allowedStatusCodes = new Set<MetaContainerStatusCode>([
      "ERROR",
      "EXPIRED",
      "FINISHED",
      "IN_PROGRESS",
      "PUBLISHED",
    ]);
    if (
      !statusCode ||
      !allowedStatusCodes.has(statusCode as MetaContainerStatusCode)
    ) {
      throw invalidResponse("Instagram media container status");
    }
    return {
      id: graphObjectId(response.id, "Container id"),
      statusCode: statusCode as MetaContainerStatusCode,
      ...(optionalString(response.status)
        ? { status: response.status as string }
        : {}),
    };
  }

  async publishInstagramMedia(options: {
    instagramAccountId: string;
    accessToken: string;
    creationId: string;
  }): Promise<{ id: string }> {
    const instagramAccountId = encodePathSegment(
      options.instagramAccountId,
      "instagramAccountId",
    );
    const response = await this.#requestGraph(
      `/${instagramAccountId}/media_publish`,
      {
        accessToken: options.accessToken,
        method: "POST",
        operation: "Instagram media publishing",
        body: { creation_id: graphObjectId(options.creationId, "creationId") },
      },
    );
    return parseIdResponse(response, "Instagram media publishing");
  }

  async listComments(options: {
    objectId: string;
    accessToken: string;
    limit?: number;
    maxPages?: number;
  }): Promise<MetaComment[]> {
    const objectId = encodePathSegment(options.objectId, "objectId");
    return this.#collectConnection(
      `/${objectId}/comments`,
      {
        accessToken: options.accessToken,
        operation: "Comments",
        query: {
          fields: "id,message,text,created_time,timestamp,parent_id,from",
          limit:
            options.limit === undefined
              ? 50
              : positiveInteger(options.limit, "limit", 100),
        },
      },
      parseComment,
      options.maxPages,
    );
  }

  async listReplies(options: {
    commentId: string;
    accessToken: string;
    limit?: number;
    maxPages?: number;
  }): Promise<MetaComment[]> {
    const commentId = encodePathSegment(options.commentId, "commentId");
    return this.#collectConnection(
      `/${commentId}/replies`,
      {
        accessToken: options.accessToken,
        operation: "Comment replies",
        query: {
          fields: "id,message,text,created_time,timestamp,parent_id,from",
          limit:
            options.limit === undefined
              ? 50
              : positiveInteger(options.limit, "limit", 100),
        },
      },
      parseComment,
      options.maxPages,
    );
  }

  async createPageComment(options: {
    objectId: string;
    pageAccessToken: string;
    message: string;
  }): Promise<{ id: string }> {
    return this.#createCommentOnEdge(
      options.objectId,
      "comments",
      options.pageAccessToken,
      options.message,
      "Page comment publishing",
    );
  }

  async replyToInstagramComment(options: {
    commentId: string;
    accessToken: string;
    message: string;
  }): Promise<{ id: string }> {
    return this.#createCommentOnEdge(
      options.commentId,
      "replies",
      options.accessToken,
      options.message,
      "Instagram comment reply",
    );
  }

  async getInsights(options: {
    objectId: string;
    accessToken: string;
    metrics: string[];
    period?: string;
    since?: number | string;
    until?: number | string;
  }): Promise<MetaInsight[]> {
    if (
      !Array.isArray(options.metrics) ||
      options.metrics.length < 1 ||
      options.metrics.length > 50
    ) {
      throw invalidInput(
        "meta_invalid_metrics",
        "metrics must contain between 1 and 50 metric names.",
      );
    }
    const metrics = options.metrics.map((metric) =>
      graphField(metric, "metric"),
    );
    const period = options.period
      ? graphField(options.period, "period")
      : undefined;
    const since = this.#timeRangeValue(options.since, "since");
    const until = this.#timeRangeValue(options.until, "until");
    const objectId = encodePathSegment(options.objectId, "objectId");
    const response = await this.#requestGraph(`/${objectId}/insights`, {
      accessToken: options.accessToken,
      operation: "Insights",
      query: {
        metric: metrics.join(","),
        period,
        since,
        until,
      },
    });
    return parseConnection(response, "Insights", parseInsight).data;
  }

  async getInstagramContentPublishingLimit(options: {
    instagramAccountId: string;
    accessToken: string;
  }): Promise<MetaPublishingLimit> {
    const instagramAccountId = encodePathSegment(
      options.instagramAccountId,
      "instagramAccountId",
    );
    const response = await this.#requestGraph(
      `/${instagramAccountId}/content_publishing_limit`,
      {
        accessToken: options.accessToken,
        operation: "Instagram content publishing limit",
        query: { fields: "config,quota_usage" },
      },
    );
    if (
      !isRecord(response) ||
      !Array.isArray(response.data) ||
      response.data.length !== 1
    ) {
      throw invalidResponse("Instagram content publishing limit");
    }
    const entry = response.data[0];
    if (!isRecord(entry) || optionalInteger(entry.quota_usage) === undefined) {
      throw invalidResponse("Instagram content publishing limit");
    }
    const config = isRecord(entry.config) ? entry.config : undefined;
    return {
      quotaUsage: entry.quota_usage as number,
      ...(optionalInteger(config?.quota_total) === undefined
        ? {}
        : { quotaTotal: config?.quota_total as number }),
      ...(optionalInteger(config?.quota_duration) === undefined
        ? {}
        : { quotaDurationSeconds: config?.quota_duration as number }),
    };
  }

  async debugToken(inputToken: string): Promise<MetaTokenDebug> {
    const token = accessToken(inputToken);
    const url = this.#graphUrl("/debug_token", { input_token: token });
    const response = await this.#requestUrl(
      url,
      {
        method: "GET",
        headers: {
          Accept: "application/json",
          Authorization: `Bearer ${this.appId}|${this.#appSecret}`,
        },
      },
      "token debugging",
    );
    if (!isRecord(response) || !isRecord(response.data)) {
      throw invalidResponse("token debugging");
    }
    const data = response.data;
    const debugAppId = optionalString(data.app_id);
    if (!debugAppId || typeof data.is_valid !== "boolean") {
      throw invalidResponse("token debugging");
    }
    const scopes =
      data.scopes === undefined ? [] : normalizeStringArray(data.scopes);
    if (!scopes) throw invalidResponse("token debugging");
    return {
      appId: graphObjectId(debugAppId, "Debug app id"),
      isValid: data.is_valid,
      scopes,
      ...(optionalString(data.type) ? { type: data.type as string } : {}),
      ...(optionalString(data.application)
        ? { application: data.application as string }
        : {}),
      ...(optionalString(data.user_id)
        ? { userId: data.user_id as string }
        : {}),
      ...(optionalInteger(data.issued_at) === undefined
        ? {}
        : { issuedAt: data.issued_at as number }),
      ...(optionalInteger(data.expires_at) === undefined
        ? {}
        : { expiresAt: data.expires_at as number }),
      ...(optionalInteger(data.data_access_expires_at) === undefined
        ? {}
        : { dataAccessExpiresAt: data.data_access_expires_at as number }),
    };
  }

  async #publishPageFeed(options: {
    pageId: string;
    pageAccessToken: string;
    message?: string;
    link?: string;
    published?: boolean;
    scheduledPublishTime?: number;
  }): Promise<{ id: string }> {
    const pageId = encodePathSegment(options.pageId, "pageId");
    const publication = this.#publicationFields(
      options.published,
      options.scheduledPublishTime,
    );
    const response = await this.#requestGraph(`/${pageId}/feed`, {
      accessToken: options.pageAccessToken,
      method: "POST",
      operation: "Page feed publishing",
      body: {
        message: options.message,
        link: options.link,
        ...publication,
      },
    });
    return parseIdResponse(response, "Page feed publishing");
  }

  #publicationFields(
    published: boolean | undefined,
    scheduledPublishTime: number | undefined,
  ): Record<string, FormValue> {
    if (published !== undefined && typeof published !== "boolean") {
      throw invalidInput(
        "meta_invalid_publication",
        "published must be boolean.",
      );
    }
    if (scheduledPublishTime !== undefined) {
      positiveInteger(
        scheduledPublishTime,
        "scheduledPublishTime",
        9_999_999_999,
      );
      if (published === true) {
        throw invalidInput(
          "meta_invalid_publication",
          "A scheduled post cannot be published immediately.",
        );
      }
      return {
        published: false,
        scheduled_publish_time: scheduledPublishTime,
      };
    }
    return published === undefined ? {} : { published };
  }

  async #createCommentOnEdge(
    objectIdValue: string,
    edge: "comments" | "replies",
    tokenValue: string,
    messageValue: string,
    operation: string,
  ): Promise<{ id: string }> {
    const objectId = encodePathSegment(objectIdValue, "objectId");
    const response = await this.#requestGraph(`/${objectId}/${edge}`, {
      accessToken: tokenValue,
      method: "POST",
      operation,
      body: {
        message: requiredString(messageValue, "message", MAX_TEXT_LENGTH),
      },
    });
    return parseIdResponse(response, operation);
  }

  #timeRangeValue(
    value: number | string | undefined,
    name: string,
  ): string | undefined {
    if (value === undefined) return undefined;
    if (typeof value === "number") {
      return String(positiveInteger(value, name, 9_999_999_999));
    }
    return requiredString(value, name, 100);
  }

  #parseAccessToken(value: unknown, operation: string): MetaAccessToken {
    if (!isRecord(value) || !optionalString(value.access_token)) {
      throw invalidResponse(operation);
    }
    const expiresIn = optionalInteger(value.expires_in);
    return {
      accessToken: accessToken(value.access_token),
      tokenType: optionalString(value.token_type) ?? "bearer",
      ...(expiresIn === undefined ? {} : { expiresIn }),
    };
  }

  async #collectConnection<T>(
    path: string,
    request: Omit<RequestOptions, "query"> & {
      query?: Record<string, QueryValue>;
    },
    parseEntry: (entry: unknown, index: number) => T,
    maxPagesValue: number | undefined,
  ): Promise<T[]> {
    const maxPages = validateMaxPages(maxPagesValue);
    const entries: T[] = [];
    const seenCursors = new Set<string>();
    let after: string | undefined;

    for (let pageNumber = 0; pageNumber < maxPages; pageNumber += 1) {
      const response = await this.#requestGraph(path, {
        ...request,
        query: { ...request.query, after },
      });
      const page = parseConnection(response, request.operation, parseEntry);
      entries.push(...page.data);
      if (!page.after) return entries;
      if (seenCursors.has(page.after)) {
        throw new ProviderError({
          code: "meta_invalid_pagination",
          message: `Meta returned a repeated cursor for ${request.operation}.`,
          httpStatus: 502,
        });
      }
      seenCursors.add(page.after);
      after = page.after;
    }

    throw new ProviderError({
      code: "meta_pagination_limit",
      message: `Meta pagination exceeded maxPages for ${request.operation}.`,
      httpStatus: 502,
    });
  }

  #graphUrl(path: string, query: Record<string, QueryValue> = {}): URL {
    if (!path.startsWith("/") || path.includes("//") || path.includes("?")) {
      throw new ProviderError({
        code: "meta_invalid_internal_path",
        message: "The Meta request path is invalid.",
        httpStatus: 500,
      });
    }
    const url = new URL(`/${META_GRAPH_API_VERSION}${path}`, META_GRAPH_ORIGIN);
    setQueryValues(url, query);
    return url;
  }

  async #requestGraph(path: string, options: RequestOptions): Promise<unknown> {
    const token = options.accessToken
      ? accessToken(options.accessToken)
      : undefined;
    const url = this.#graphUrl(path, options.query);
    if (token && options.useAppSecretProof !== false) {
      url.searchParams.set(
        "appsecret_proof",
        createMetaAppSecretProof(token, this.#appSecret),
      );
    }
    const body = options.body ? toFormBody(options.body) : undefined;
    return this.#requestUrl(
      url,
      {
        method: options.method ?? "GET",
        headers: {
          Accept: "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
          ...(body
            ? { "Content-Type": "application/x-www-form-urlencoded" }
            : {}),
        },
        ...(body ? { body: body.toString() } : {}),
      },
      options.operation,
    );
  }

  async #requestUrl(
    url: URL,
    init: RequestInit,
    operation: string,
  ): Promise<unknown> {
    if (
      url.protocol !== "https:" ||
      url.origin !== META_GRAPH_ORIGIN ||
      !url.pathname.startsWith(`/${META_GRAPH_API_VERSION}/`) ||
      url.username ||
      url.password
    ) {
      throw new ProviderError({
        code: "meta_host_rejected",
        message: "The Meta API host was rejected.",
        httpStatus: 500,
      });
    }

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.timeoutMs);
    timeout.unref();
    try {
      const response = await this.#fetch(url, {
        ...init,
        redirect: "manual",
        signal: controller.signal,
      });
      if (response.status >= 300 && response.status < 400) {
        throw new ProviderError({
          code: "meta_redirect_rejected",
          message: `Meta returned an unexpected redirect for ${operation}.`,
          httpStatus: 502,
          upstreamStatus: response.status,
        });
      }
      const responseText = await readLimitedResponseText(response);
      const responseValue = responseText
        ? parseJson(responseText, operation)
        : null;
      if (!response.ok) throw upstreamError(response, responseValue, operation);
      if (responseValue === null) throw invalidResponse(operation);
      return responseValue;
    } catch (error) {
      if (controller.signal.aborted) {
        throw new ProviderError({
          code: "meta_timeout",
          message: `Meta did not respond in time for ${operation}.`,
          httpStatus: 504,
          retryable: true,
        });
      }
      if (error instanceof ProviderError) throw error;
      throw new ProviderError({
        code: "meta_unavailable",
        message: `Meta is unavailable for ${operation}.`,
        httpStatus: 502,
        retryable: true,
      });
    } finally {
      clearTimeout(timeout);
    }
  }
}

type MetaWebhookQuery =
  URL | URLSearchParams | Record<string, string | string[] | undefined>;

function webhookQueryValue(
  query: MetaWebhookQuery,
  key: string,
): string | undefined {
  if (query instanceof URL) return query.searchParams.get(key) ?? undefined;
  if (query instanceof URLSearchParams) return query.get(key) ?? undefined;
  const value = query[key];
  return Array.isArray(value) ? value[0] : value;
}

export function verifyMetaWebhookChallenge(
  query: MetaWebhookQuery,
  expectedVerifyToken: string,
): string {
  const expected = requiredString(
    expectedVerifyToken,
    "expectedVerifyToken",
    MAX_SECRET_LENGTH,
  );
  const mode = webhookQueryValue(query, "hub.mode");
  const challenge = webhookQueryValue(query, "hub.challenge");
  const suppliedToken = webhookQueryValue(query, "hub.verify_token");
  if (
    mode !== "subscribe" ||
    !challenge ||
    challenge.length > 2_048 ||
    !suppliedToken ||
    !secureStringEqual(suppliedToken, expected)
  ) {
    throw new ProviderError({
      code: "meta_webhook_verification_failed",
      message: "Meta webhook verification failed.",
      httpStatus: 403,
    });
  }
  return challenge;
}

function webhookBody(rawBody: Buffer | string | Uint8Array): Buffer {
  if (typeof rawBody === "string") return Buffer.from(rawBody, "utf8");
  return Buffer.from(rawBody);
}

export function verifyMetaWebhookSignature(
  rawBody: Buffer | string | Uint8Array,
  signatureHeader: string | string[] | undefined,
  secretValue: string,
): boolean {
  const signature = Array.isArray(signatureHeader)
    ? signatureHeader[0]
    : signatureHeader;
  if (!signature || !/^sha256=[a-f0-9]{64}$/iu.test(signature)) return false;
  const supplied = Buffer.from(signature.slice("sha256=".length), "hex");
  const expected = createHmac("sha256", appSecret(secretValue))
    .update(webhookBody(rawBody))
    .digest();
  return (
    supplied.length === expected.length && timingSafeEqual(supplied, expected)
  );
}

export function assertMetaWebhookSignature(
  rawBody: Buffer | string | Uint8Array,
  signatureHeader: string | string[] | undefined,
  secretValue: string,
): void {
  if (!verifyMetaWebhookSignature(rawBody, signatureHeader, secretValue)) {
    throw new ProviderError({
      code: "meta_webhook_signature_invalid",
      message: "Meta webhook signature validation failed.",
      httpStatus: 401,
    });
  }
}

export function parseMetaWebhook(
  rawBody: Buffer | string | Uint8Array,
  signatureHeader: string | string[] | undefined,
  secretValue: string,
): MetaWebhookEnvelope {
  assertMetaWebhookSignature(rawBody, signatureHeader, secretValue);
  const text = webhookBody(rawBody).toString("utf8");
  const parsed = parseJson(text, "webhook parsing");
  if (
    !isRecord(parsed) ||
    !optionalString(parsed.object) ||
    !Array.isArray(parsed.entry)
  ) {
    throw new ProviderError({
      code: "meta_webhook_payload_invalid",
      message: "Meta webhook payload is invalid.",
      httpStatus: 400,
    });
  }
  return { object: parsed.object, entry: parsed.entry } as MetaWebhookEnvelope;
}
