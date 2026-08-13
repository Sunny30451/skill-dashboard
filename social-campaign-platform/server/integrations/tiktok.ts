import {
  createHash,
  createHmac,
  randomBytes,
  timingSafeEqual,
} from "node:crypto";

export const TIKTOK_AUTHORIZE_URL = "https://www.tiktok.com/v2/auth/authorize/";
export const TIKTOK_API_ORIGIN = "https://open.tiktokapis.com";
export const TIKTOK_TOKEN_URL = `${TIKTOK_API_ORIGIN}/v2/oauth/token/`;
export const TIKTOK_REVOKE_URL = `${TIKTOK_API_ORIGIN}/v2/oauth/revoke/`;
export const TIKTOK_DEFAULT_TIMEOUT_MS = 20_000;
export const TIKTOK_DEFAULT_SIGNATURE_MAX_AGE_SECONDS = 300;

const TIKTOK_UPLOAD_HOSTS = new Set([
  "open-upload.tiktokapis.com",
  "upload.tiktokapis.com",
  "upload.us.tiktokapis.com",
]);
const PRIVACY_LEVELS = new Set<TikTokPrivacyLevel>([
  "PUBLIC_TO_EVERYONE",
  "MUTUAL_FOLLOW_FRIENDS",
  "FOLLOWER_OF_CREATOR",
  "SELF_ONLY",
]);
const VIDEO_FIELDS = new Set<TikTokVideoField>([
  "id",
  "create_time",
  "cover_image_url",
  "share_url",
  "video_description",
  "duration",
  "height",
  "width",
  "title",
  "embed_html",
  "embed_link",
  "like_count",
  "comment_count",
  "share_count",
  "view_count",
]);
const USER_FIELDS = new Set<TikTokUserField>([
  "open_id",
  "union_id",
  "avatar_url",
  "avatar_url_100",
  "avatar_large_url",
  "display_name",
  "bio_description",
  "profile_deep_link",
  "is_verified",
  "username",
  "follower_count",
  "following_count",
  "likes_count",
  "video_count",
]);
const VIDEO_MIME_TYPES = new Set<TikTokVideoMimeType>([
  "video/mp4",
  "video/quicktime",
  "video/webm",
]);
const MIN_CHUNK_BYTES = 5_000_000;
const MAX_CHUNK_BYTES = 64_000_000;
const MAX_FINAL_CHUNK_BYTES = 128_000_000;
const MAX_VIDEO_BYTES = 4_000_000_000;
const MAX_CHUNKS = 1_000;
const MAX_ERROR_MESSAGE_LENGTH = 500;

type FetchLike = (
  input: string | URL | Request,
  init?: RequestInit,
) => Promise<Response>;

export type TikTokPrivacyLevel =
  | "PUBLIC_TO_EVERYONE"
  | "MUTUAL_FOLLOW_FRIENDS"
  | "FOLLOWER_OF_CREATOR"
  | "SELF_ONLY";
export type TikTokTransferSource = "FILE_UPLOAD" | "PULL_FROM_URL";
export type TikTokVideoMimeType =
  "video/mp4" | "video/quicktime" | "video/webm";
export type TikTokUserField =
  | "open_id"
  | "union_id"
  | "avatar_url"
  | "avatar_url_100"
  | "avatar_large_url"
  | "display_name"
  | "bio_description"
  | "profile_deep_link"
  | "is_verified"
  | "username"
  | "follower_count"
  | "following_count"
  | "likes_count"
  | "video_count";
export type TikTokVideoField =
  | "id"
  | "create_time"
  | "cover_image_url"
  | "share_url"
  | "video_description"
  | "duration"
  | "height"
  | "width"
  | "title"
  | "embed_html"
  | "embed_link"
  | "like_count"
  | "comment_count"
  | "share_count"
  | "view_count";

export interface TikTokClientOptions {
  clientKey: string;
  clientSecret: string;
  redirectUri: string;
  timeoutMs?: number;
  fetch?: FetchLike;
}

export interface TikTokAuthorizationOptions {
  scopes: readonly string[];
  state?: string;
  codeVerifier?: string;
  disableAutoAuth?: boolean;
}

export interface TikTokAuthorizationRequest {
  url: string;
  state: string;
  codeVerifier: string;
}

export interface TikTokTokenSet {
  accessToken: string;
  expiresIn: number;
  refreshToken: string;
  refreshExpiresIn: number;
  openId: string;
  scopes: string[];
  tokenType: "Bearer";
}

export interface TikTokUser {
  open_id?: string;
  union_id?: string;
  avatar_url?: string;
  avatar_url_100?: string;
  avatar_large_url?: string;
  display_name?: string;
  bio_description?: string;
  profile_deep_link?: string;
  is_verified?: boolean;
  username?: string;
  follower_count?: number;
  following_count?: number;
  likes_count?: number;
  video_count?: number;
}

export interface TikTokVideo {
  id: string;
  create_time?: number;
  cover_image_url?: string;
  share_url?: string;
  video_description?: string;
  duration?: number;
  height?: number;
  width?: number;
  title?: string;
  embed_html?: string;
  embed_link?: string;
  like_count?: number;
  comment_count?: number;
  share_count?: number;
  view_count?: number;
}

export interface TikTokVideoPage {
  videos: TikTokVideo[];
  cursor?: number;
  hasMore: boolean;
}

export interface TikTokCreatorInfo {
  creatorAvatarUrl?: string;
  creatorUsername: string;
  creatorNickname: string;
  privacyLevelOptions: TikTokPrivacyLevel[];
  commentDisabled: boolean;
  duetDisabled: boolean;
  stitchDisabled: boolean;
  maxVideoPostDurationSeconds: number;
}

export interface TikTokVideoPostInfo {
  privacyLevel: TikTokPrivacyLevel;
  title?: string;
  disableDuet: boolean;
  disableComment: boolean;
  disableStitch: boolean;
  videoCoverTimestampMs?: number;
  brandContent: boolean;
  brandOrganic: boolean;
  isAigc?: boolean;
}

export type TikTokVideoSource =
  | {
      source: "FILE_UPLOAD";
      videoSize: number;
      chunkSize: number;
      totalChunkCount: number;
    }
  | { source: "PULL_FROM_URL"; videoUrl: string };

export interface TikTokDirectVideoInput {
  consent: true;
  creatorInfo: TikTokCreatorInfo;
  postInfo: TikTokVideoPostInfo;
  sourceInfo: TikTokVideoSource;
}

export interface TikTokPhotoPostInfo {
  title?: string;
  description?: string;
  privacyLevel?: TikTokPrivacyLevel;
  disableComment?: boolean;
  autoAddMusic?: boolean;
  brandContent?: boolean;
  brandOrganic?: boolean;
}

export interface TikTokPhotoInput {
  consent: true;
  postMode: "DIRECT_POST" | "MEDIA_UPLOAD";
  creatorInfo?: TikTokCreatorInfo;
  postInfo: TikTokPhotoPostInfo;
  sourceInfo: {
    source: "PULL_FROM_URL";
    photoImages: readonly string[];
    photoCoverIndex: number;
  };
}

export interface TikTokPublishInit {
  publishId: string;
  uploadUrl?: string;
}

export interface TikTokPublishStatus {
  status:
    | "PROCESSING_UPLOAD"
    | "PROCESSING_DOWNLOAD"
    | "SEND_TO_USER_INBOX"
    | "PUBLISH_COMPLETE"
    | "FAILED";
  failReason?: string;
  publiclyAvailablePostIds: string[];
  uploadedBytes?: number;
  downloadedBytes?: number;
}

export interface TikTokUploadChunkInput {
  uploadUrl: string;
  chunk: Uint8Array | ArrayBuffer;
  startByte: number;
  totalBytes: number;
  contentType: TikTokVideoMimeType;
}

export interface TikTokUploadChunkResult {
  complete: boolean;
  uploadedThroughByte: number;
}

export interface TikTokSignatureParts {
  timestamp: number;
  signatures: string[];
}

export class ProviderError extends Error {
  readonly provider = "tiktok";
  readonly code: string;
  readonly status: number;
  readonly logId?: string;
  readonly retryable: boolean;

  constructor(
    code: string,
    message: string,
    options: { status?: number; logId?: string; retryable?: boolean } = {},
  ) {
    super(message.slice(0, MAX_ERROR_MESSAGE_LENGTH));
    this.name = "ProviderError";
    this.code = code;
    this.status = options.status ?? 502;
    this.logId = options.logId;
    this.retryable = options.retryable ?? this.status >= 500;
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function containsControlCharacter(
  value: string,
  allowWhitespace = false,
): boolean {
  return [...value].some((character) => {
    const code = character.charCodeAt(0);
    if (allowWhitespace && (code === 9 || code === 10 || code === 13)) {
      return false;
    }
    return code <= 31 || code === 127;
  });
}

function requiredString(
  value: unknown,
  location: string,
  maximumLength = 4_096,
): string {
  if (
    typeof value !== "string" ||
    value.length === 0 ||
    value.length > maximumLength ||
    containsControlCharacter(value)
  ) {
    throw new ProviderError("invalid_response", `${location} is invalid.`);
  }
  return value;
}

function optionalString(
  value: unknown,
  location: string,
  maximumLength = 4_096,
): string | undefined {
  return value === undefined
    ? undefined
    : requiredString(value, location, maximumLength);
}

function requiredInteger(
  value: unknown,
  location: string,
  minimum = 0,
): number {
  if (!Number.isSafeInteger(value) || (value as number) < minimum) {
    throw new ProviderError("invalid_response", `${location} is invalid.`);
  }
  return value as number;
}

function requireInputString(
  value: string,
  location: string,
  maximumLength = 4_096,
): string {
  if (
    !value ||
    value.length > maximumLength ||
    containsControlCharacter(value)
  ) {
    throw new ProviderError("invalid_request", `${location} is invalid.`, {
      status: 400,
      retryable: false,
    });
  }
  return value;
}

function requireAccessToken(token: string): string {
  return requireInputString(token, "accessToken", 8_192);
}

function isPublicHttpsUrl(value: string, location: string): string {
  let parsed: URL;
  try {
    parsed = new URL(value);
  } catch {
    throw new ProviderError("invalid_request", `${location} must be a URL.`, {
      status: 400,
      retryable: false,
    });
  }
  if (
    parsed.protocol !== "https:" ||
    parsed.username ||
    parsed.password ||
    parsed.hash
  ) {
    throw new ProviderError(
      "invalid_request",
      `${location} must be a public HTTPS URL without credentials or a fragment.`,
      { status: 400, retryable: false },
    );
  }
  return parsed.toString();
}

function utf16Length(value: string): number {
  return value.length;
}

function validateOptionalText(
  value: string | undefined,
  location: string,
  maximumLength: number,
): string | undefined {
  if (value === undefined) return undefined;
  if (
    utf16Length(value) > maximumLength ||
    containsControlCharacter(value, true)
  ) {
    throw new ProviderError(
      "invalid_request",
      `${location} must not exceed ${maximumLength} UTF-16 code units.`,
      { status: 400, retryable: false },
    );
  }
  return value;
}

function validateScope(scope: string): string {
  if (!/^[a-z][a-z0-9._-]{0,99}$/u.test(scope)) {
    throw new ProviderError("invalid_scope", "An OAuth scope is invalid.", {
      status: 400,
      retryable: false,
    });
  }
  return scope;
}

function base64Url(value: Uint8Array): string {
  return Buffer.from(value).toString("base64url");
}

export function createPkceVerifier(): string {
  return base64Url(randomBytes(64));
}

export function createPkceChallenge(codeVerifier: string): string {
  const verifier = requireInputString(codeVerifier, "codeVerifier", 128);
  if (!/^[A-Za-z0-9._~-]{43,128}$/u.test(verifier)) {
    throw new ProviderError(
      "invalid_pkce_verifier",
      "codeVerifier must contain 43 to 128 RFC 7636 characters.",
      { status: 400, retryable: false },
    );
  }
  return createHash("sha256").update(verifier).digest("base64url");
}

export function verifyTikTokOAuthState(
  expectedState: string,
  receivedState: string,
): boolean {
  if (!expectedState || !receivedState) return false;
  const expected = Buffer.from(expectedState, "utf8");
  const received = Buffer.from(receivedState, "utf8");
  return (
    expected.length === received.length && timingSafeEqual(expected, received)
  );
}

function normalizeFetchError(error: unknown): ProviderError {
  if (error instanceof ProviderError) return error;
  if (error instanceof Error && error.name === "AbortError") {
    return new ProviderError("timeout", "TikTok did not respond in time.", {
      status: 504,
      retryable: true,
    });
  }
  return new ProviderError("network_error", "TikTok could not be reached.", {
    status: 502,
    retryable: true,
  });
}

async function parseJson(response: Response): Promise<unknown> {
  try {
    return await response.json();
  } catch {
    throw new ProviderError(
      "invalid_response",
      "TikTok returned an invalid response.",
      { status: 502, retryable: response.status >= 500 },
    );
  }
}

function tikTokError(
  body: unknown,
  responseStatus: number,
): ProviderError | null {
  if (!isRecord(body)) {
    return new ProviderError(
      "invalid_response",
      "TikTok returned an invalid response.",
      { status: 502 },
    );
  }

  if (typeof body.error === "string") {
    const code = requiredString(body.error, "error", 200);
    return new ProviderError(code, `TikTok rejected the request (${code}).`, {
      status: responseStatus >= 400 ? responseStatus : 502,
      logId:
        typeof body.log_id === "string" ? body.log_id.slice(0, 200) : undefined,
      retryable: responseStatus === 429 || responseStatus >= 500,
    });
  }

  if (isRecord(body.error)) {
    const code =
      typeof body.error.code === "string"
        ? body.error.code
        : "invalid_response";
    if (code !== "ok") {
      return new ProviderError(
        code.slice(0, 200),
        `TikTok rejected the request (${code.slice(0, 200)}).`,
        {
          status: responseStatus >= 400 ? responseStatus : 502,
          logId:
            typeof body.error.log_id === "string"
              ? body.error.log_id.slice(0, 200)
              : undefined,
          retryable: responseStatus === 429 || responseStatus >= 500,
        },
      );
    }
  } else if (responseStatus >= 400) {
    return new ProviderError("http_error", "TikTok rejected the request.", {
      status: responseStatus,
      retryable: responseStatus === 429 || responseStatus >= 500,
    });
  }
  return null;
}

function readData(body: unknown): Record<string, unknown> {
  if (!isRecord(body) || !isRecord(body.data)) {
    throw new ProviderError(
      "invalid_response",
      "TikTok returned an invalid response.",
    );
  }
  return body.data;
}

function normalizeTokenSet(body: unknown): TikTokTokenSet {
  if (!isRecord(body)) {
    throw new ProviderError(
      "invalid_response",
      "TikTok returned an invalid token response.",
    );
  }
  const tokenType = requiredString(body.token_type, "token_type", 20);
  if (tokenType.toLowerCase() !== "bearer") {
    throw new ProviderError(
      "invalid_response",
      "TikTok returned an unsupported token type.",
    );
  }
  const scope = requiredString(body.scope, "scope", 2_000);
  return {
    accessToken: requiredString(body.access_token, "access_token", 8_192),
    expiresIn: requiredInteger(body.expires_in, "expires_in", 1),
    refreshToken: requiredString(body.refresh_token, "refresh_token", 8_192),
    refreshExpiresIn: requiredInteger(
      body.refresh_expires_in,
      "refresh_expires_in",
      1,
    ),
    openId: requiredString(body.open_id, "open_id", 200),
    scopes: scope
      .split(",")
      .map((item) => item.trim())
      .filter(Boolean),
    tokenType: "Bearer",
  };
}

export function validateVideoUploadPlan(
  input: Pick<
    Extract<TikTokVideoSource, { source: "FILE_UPLOAD" }>,
    "videoSize" | "chunkSize" | "totalChunkCount"
  >,
): void {
  const { videoSize, chunkSize, totalChunkCount } = input;
  if (
    !Number.isSafeInteger(videoSize) ||
    videoSize <= 0 ||
    videoSize > MAX_VIDEO_BYTES ||
    !Number.isSafeInteger(chunkSize) ||
    chunkSize <= 0 ||
    !Number.isSafeInteger(totalChunkCount) ||
    totalChunkCount < 1 ||
    totalChunkCount > MAX_CHUNKS
  ) {
    throw new ProviderError(
      "invalid_upload_plan",
      "The TikTok upload plan is invalid.",
      { status: 400, retryable: false },
    );
  }
  if (videoSize < MIN_CHUNK_BYTES) {
    if (chunkSize !== videoSize || totalChunkCount !== 1) {
      throw new ProviderError(
        "invalid_upload_plan",
        "Videos smaller than 5 MB must be uploaded in one chunk.",
        { status: 400, retryable: false },
      );
    }
    return;
  }
  if (chunkSize < MIN_CHUNK_BYTES || chunkSize > MAX_CHUNK_BYTES) {
    throw new ProviderError(
      "invalid_upload_plan",
      "Each non-final chunk must be between 5 MB and 64 MB.",
      { status: 400, retryable: false },
    );
  }
  const expectedCount = Math.floor(videoSize / chunkSize);
  if (totalChunkCount !== expectedCount) {
    throw new ProviderError(
      "invalid_upload_plan",
      "totalChunkCount does not match TikTok's chunking rules.",
      { status: 400, retryable: false },
    );
  }
  if (videoSize > MAX_CHUNK_BYTES && totalChunkCount < 2) {
    throw new ProviderError(
      "invalid_upload_plan",
      "Videos larger than 64 MB must use multiple chunks.",
      { status: 400, retryable: false },
    );
  }
  const finalChunkSize = videoSize - chunkSize * (totalChunkCount - 1);
  if (finalChunkSize <= 0 || finalChunkSize > MAX_FINAL_CHUNK_BYTES) {
    throw new ProviderError(
      "invalid_upload_plan",
      "The final TikTok upload chunk is invalid.",
      { status: 400, retryable: false },
    );
  }
}

function validateCreatorChoice(
  creatorInfo: TikTokCreatorInfo,
  postInfo: TikTokVideoPostInfo,
): void {
  if (!PRIVACY_LEVELS.has(postInfo.privacyLevel)) {
    throw new ProviderError(
      "invalid_request",
      "The selected privacy level is invalid.",
      { status: 400, retryable: false },
    );
  }
  if (
    typeof postInfo.disableComment !== "boolean" ||
    typeof postInfo.disableDuet !== "boolean" ||
    typeof postInfo.disableStitch !== "boolean" ||
    typeof postInfo.brandContent !== "boolean" ||
    typeof postInfo.brandOrganic !== "boolean" ||
    (postInfo.isAigc !== undefined && typeof postInfo.isAigc !== "boolean")
  ) {
    throw new ProviderError(
      "invalid_request",
      "Privacy, interaction, and commercial-content choices must be explicit.",
      { status: 400, retryable: false },
    );
  }
  if (!creatorInfo.privacyLevelOptions.includes(postInfo.privacyLevel)) {
    throw new ProviderError(
      "privacy_level_option_mismatch",
      "The selected privacy level is not currently available to this creator.",
      { status: 400, retryable: false },
    );
  }
  if (creatorInfo.commentDisabled && !postInfo.disableComment) {
    throw new ProviderError(
      "interaction_not_allowed",
      "Comments must remain disabled for this creator.",
      { status: 400, retryable: false },
    );
  }
  if (creatorInfo.duetDisabled && !postInfo.disableDuet) {
    throw new ProviderError(
      "interaction_not_allowed",
      "Duets must remain disabled for this creator.",
      { status: 400, retryable: false },
    );
  }
  if (creatorInfo.stitchDisabled && !postInfo.disableStitch) {
    throw new ProviderError(
      "interaction_not_allowed",
      "Stitches must remain disabled for this creator.",
      { status: 400, retryable: false },
    );
  }
}

function normalizePublishInit(body: unknown): TikTokPublishInit {
  const data = readData(body);
  const uploadUrl = optionalString(data.upload_url, "upload_url", 2_048);
  if (uploadUrl) validateUploadUrl(uploadUrl);
  return {
    publishId: requiredString(data.publish_id, "publish_id", 64),
    uploadUrl,
  };
}

function validateUploadUrl(value: string): string {
  let parsed: URL;
  try {
    parsed = new URL(value);
  } catch {
    throw new ProviderError(
      "invalid_upload_url",
      "TikTok returned an invalid upload URL.",
    );
  }
  if (
    parsed.protocol !== "https:" ||
    parsed.username ||
    parsed.password ||
    parsed.hash ||
    (parsed.port !== "" && parsed.port !== "443") ||
    !TIKTOK_UPLOAD_HOSTS.has(parsed.hostname.toLowerCase())
  ) {
    throw new ProviderError(
      "invalid_upload_url",
      "TikTok returned an untrusted upload URL.",
    );
  }
  return parsed.toString();
}

export class TikTokClient {
  readonly clientKey: string;
  readonly redirectUri: string;
  readonly timeoutMs: number;
  readonly #clientSecret: string;
  readonly #fetch: FetchLike;

  constructor(options: TikTokClientOptions) {
    this.clientKey = requireInputString(options.clientKey, "clientKey", 200);
    this.#clientSecret = requireInputString(
      options.clientSecret,
      "clientSecret",
      500,
    );
    this.redirectUri = isPublicHttpsUrl(options.redirectUri, "redirectUri");
    if (new URL(this.redirectUri).search) {
      throw new ProviderError(
        "invalid_redirect_uri",
        "TikTok redirectUri must not contain query parameters.",
        { status: 400, retryable: false },
      );
    }
    this.timeoutMs = options.timeoutMs ?? TIKTOK_DEFAULT_TIMEOUT_MS;
    if (
      !Number.isInteger(this.timeoutMs) ||
      this.timeoutMs < 1_000 ||
      this.timeoutMs > 120_000
    ) {
      throw new ProviderError(
        "invalid_timeout",
        "timeoutMs must be between 1000 and 120000.",
        { status: 400, retryable: false },
      );
    }
    this.#fetch = options.fetch ?? fetch;
  }

  createAuthorizationRequest(
    options: TikTokAuthorizationOptions,
  ): TikTokAuthorizationRequest {
    const scopes = [...new Set(options.scopes.map(validateScope))].sort();
    if (scopes.length === 0 || scopes.length > 50) {
      throw new ProviderError(
        "invalid_scope",
        "At least one OAuth scope is required.",
        { status: 400, retryable: false },
      );
    }
    const state = options.state
      ? requireInputString(options.state, "state", 1_024)
      : base64Url(randomBytes(32));
    const codeVerifier = options.codeVerifier ?? createPkceVerifier();
    const url = new URL(TIKTOK_AUTHORIZE_URL);
    url.searchParams.set("client_key", this.clientKey);
    url.searchParams.set("response_type", "code");
    url.searchParams.set("scope", scopes.join(","));
    url.searchParams.set("redirect_uri", this.redirectUri);
    url.searchParams.set("state", state);
    url.searchParams.set("code_challenge", createPkceChallenge(codeVerifier));
    url.searchParams.set("code_challenge_method", "S256");
    if (options.disableAutoAuth !== undefined) {
      url.searchParams.set(
        "disable_auto_auth",
        options.disableAutoAuth ? "1" : "0",
      );
    }
    return { url: url.toString(), state, codeVerifier };
  }

  async exchangeCode(
    code: string,
    codeVerifier: string,
  ): Promise<TikTokTokenSet> {
    const fields: Record<string, string> = {
      client_key: this.clientKey,
      client_secret: this.#clientSecret,
      code: requireInputString(code, "code", 2_048),
      grant_type: "authorization_code",
      redirect_uri: this.redirectUri,
    };
    createPkceChallenge(codeVerifier);
    fields.code_verifier = codeVerifier;
    return normalizeTokenSet(await this.#formRequest(TIKTOK_TOKEN_URL, fields));
  }

  async refreshToken(refreshToken: string): Promise<TikTokTokenSet> {
    return normalizeTokenSet(
      await this.#formRequest(TIKTOK_TOKEN_URL, {
        client_key: this.clientKey,
        client_secret: this.#clientSecret,
        grant_type: "refresh_token",
        refresh_token: requireInputString(refreshToken, "refreshToken", 8_192),
      }),
    );
  }

  async revoke(accessToken: string): Promise<void> {
    await this.#formRequest(
      TIKTOK_REVOKE_URL,
      {
        client_key: this.clientKey,
        client_secret: this.#clientSecret,
        token: requireAccessToken(accessToken),
      },
      true,
    );
  }

  async getUserInfo(
    accessToken: string,
    fields: readonly TikTokUserField[] = [
      "open_id",
      "display_name",
      "avatar_url",
    ],
  ): Promise<TikTokUser> {
    const selectedFields = validateFields(fields, USER_FIELDS, "user fields");
    const body = await this.#apiRequest(
      `/v2/user/info/?fields=${encodeURIComponent(selectedFields.join(","))}`,
      accessToken,
    );
    const data = readData(body);
    if (!isRecord(data.user)) {
      throw new ProviderError(
        "invalid_response",
        "TikTok returned invalid user information.",
      );
    }
    const user: TikTokUser = {};
    for (const field of selectedFields) {
      const value = data.user[field];
      if (value === undefined) continue;
      const numericField = [
        "follower_count",
        "following_count",
        "likes_count",
        "video_count",
      ].includes(field);
      const valid =
        (field === "is_verified" && typeof value === "boolean") ||
        (numericField &&
          Number.isSafeInteger(value) &&
          (value as number) >= 0) ||
        (!numericField && field !== "is_verified" && typeof value === "string");
      if (!valid) {
        throw new ProviderError(
          "invalid_response",
          `TikTok returned an invalid ${field} field.`,
        );
      }
      (user as Record<string, unknown>)[field] = value;
    }
    return user;
  }

  async listVideos(
    accessToken: string,
    options: {
      fields?: readonly TikTokVideoField[];
      cursor?: number;
      maxCount?: number;
    } = {},
  ): Promise<TikTokVideoPage> {
    const fields = validateFields(
      options.fields ?? ["id", "create_time", "title", "share_url"],
      VIDEO_FIELDS,
      "video fields",
    );
    const maxCount = options.maxCount ?? 10;
    if (!Number.isInteger(maxCount) || maxCount < 1 || maxCount > 20) {
      throw new ProviderError(
        "invalid_request",
        "maxCount must be between 1 and 20.",
        { status: 400, retryable: false },
      );
    }
    if (
      options.cursor !== undefined &&
      (!Number.isSafeInteger(options.cursor) || options.cursor < 0)
    ) {
      throw new ProviderError("invalid_request", "cursor is invalid.", {
        status: 400,
        retryable: false,
      });
    }
    const requestBody: Record<string, number> = { max_count: maxCount };
    if (options.cursor !== undefined) requestBody.cursor = options.cursor;
    const body = await this.#apiRequest(
      `/v2/video/list/?fields=${encodeURIComponent(fields.join(","))}`,
      accessToken,
      requestBody,
    );
    const data = readData(body);
    if (!Array.isArray(data.videos) || typeof data.has_more !== "boolean") {
      throw new ProviderError(
        "invalid_response",
        "TikTok returned an invalid video list.",
      );
    }
    return {
      videos: data.videos.map(normalizeVideo),
      cursor:
        data.cursor === undefined
          ? undefined
          : requiredInteger(data.cursor, "cursor"),
      hasMore: data.has_more,
    };
  }

  async queryVideos(
    accessToken: string,
    videoIds: readonly string[],
    fields: readonly TikTokVideoField[] = ["id", "title", "share_url"],
  ): Promise<TikTokVideo[]> {
    if (videoIds.length < 1 || videoIds.length > 20) {
      throw new ProviderError(
        "invalid_request",
        "Between 1 and 20 video IDs are required.",
        { status: 400, retryable: false },
      );
    }
    const normalizedIds = videoIds.map((id) =>
      requireInputString(id, "video ID", 200),
    );
    const selectedFields = validateFields(fields, VIDEO_FIELDS, "video fields");
    const body = await this.#apiRequest(
      `/v2/video/query/?fields=${encodeURIComponent(selectedFields.join(","))}`,
      accessToken,
      { filters: { video_ids: normalizedIds } },
    );
    const data = readData(body);
    if (!Array.isArray(data.videos)) {
      throw new ProviderError(
        "invalid_response",
        "TikTok returned an invalid video result.",
      );
    }
    return data.videos.map(normalizeVideo);
  }

  async getCreatorInfo(accessToken: string): Promise<TikTokCreatorInfo> {
    const body = await this.#apiRequest(
      "/v2/post/publish/creator_info/query/",
      accessToken,
      {},
    );
    const data = readData(body);
    if (
      !Array.isArray(data.privacy_level_options) ||
      typeof data.comment_disabled !== "boolean" ||
      typeof data.duet_disabled !== "boolean" ||
      typeof data.stitch_disabled !== "boolean"
    ) {
      throw new ProviderError(
        "invalid_response",
        "TikTok returned invalid creator information.",
      );
    }
    const privacyLevelOptions = data.privacy_level_options.map((value) => {
      if (
        typeof value !== "string" ||
        !PRIVACY_LEVELS.has(value as TikTokPrivacyLevel)
      ) {
        throw new ProviderError(
          "invalid_response",
          "TikTok returned an unknown privacy option.",
        );
      }
      return value as TikTokPrivacyLevel;
    });
    return {
      creatorAvatarUrl: optionalString(
        data.creator_avatar_url,
        "creator_avatar_url",
        2_048,
      ),
      creatorUsername: requiredString(
        data.creator_username,
        "creator_username",
        200,
      ),
      creatorNickname: requiredString(
        data.creator_nickname,
        "creator_nickname",
        200,
      ),
      privacyLevelOptions,
      commentDisabled: data.comment_disabled,
      duetDisabled: data.duet_disabled,
      stitchDisabled: data.stitch_disabled,
      maxVideoPostDurationSeconds: requiredInteger(
        data.max_video_post_duration_sec,
        "max_video_post_duration_sec",
        1,
      ),
    };
  }

  async initializeDirectVideo(
    accessToken: string,
    input: TikTokDirectVideoInput,
  ): Promise<TikTokPublishInit> {
    if (input.consent !== true) {
      throw new ProviderError(
        "consent_required",
        "Explicit user consent is required immediately before publishing.",
        { status: 400, retryable: false },
      );
    }
    validateCreatorChoice(input.creatorInfo, input.postInfo);
    const title = validateOptionalText(input.postInfo.title, "title", 2_200);
    if (
      input.postInfo.videoCoverTimestampMs !== undefined &&
      (!Number.isSafeInteger(input.postInfo.videoCoverTimestampMs) ||
        input.postInfo.videoCoverTimestampMs < 0)
    ) {
      throw new ProviderError(
        "invalid_request",
        "videoCoverTimestampMs is invalid.",
        { status: 400, retryable: false },
      );
    }
    const sourceInfo = normalizeVideoSource(input.sourceInfo);
    const body = await this.#apiRequest(
      "/v2/post/publish/video/init/",
      accessToken,
      {
        post_info: {
          privacy_level: input.postInfo.privacyLevel,
          ...(title === undefined ? {} : { title }),
          disable_duet: input.postInfo.disableDuet,
          disable_comment: input.postInfo.disableComment,
          disable_stitch: input.postInfo.disableStitch,
          ...(input.postInfo.videoCoverTimestampMs === undefined
            ? {}
            : {
                video_cover_timestamp_ms: input.postInfo.videoCoverTimestampMs,
              }),
          brand_content_toggle: input.postInfo.brandContent,
          brand_organic_toggle: input.postInfo.brandOrganic,
          ...(input.postInfo.isAigc === undefined
            ? {}
            : { is_aigc: input.postInfo.isAigc }),
        },
        source_info: sourceInfo,
      },
    );
    return normalizePublishInit(body);
  }

  async initializePhoto(
    accessToken: string,
    input: TikTokPhotoInput,
  ): Promise<TikTokPublishInit> {
    if (input.consent !== true) {
      throw new ProviderError(
        "consent_required",
        "Explicit user consent is required immediately before publishing.",
        { status: 400, retryable: false },
      );
    }
    const directPost = input.postMode === "DIRECT_POST";
    if (directPost) {
      if (!input.creatorInfo || !input.postInfo.privacyLevel) {
        throw new ProviderError(
          "creator_info_required",
          "Current creator information and a privacy choice are required.",
          { status: 400, retryable: false },
        );
      }
      if (
        !input.creatorInfo.privacyLevelOptions.includes(
          input.postInfo.privacyLevel,
        )
      ) {
        throw new ProviderError(
          "privacy_level_option_mismatch",
          "The selected privacy level is not currently available to this creator.",
          { status: 400, retryable: false },
        );
      }
      if (
        input.creatorInfo.commentDisabled &&
        input.postInfo.disableComment !== true
      ) {
        throw new ProviderError(
          "interaction_not_allowed",
          "Comments must remain disabled for this creator.",
          { status: 400, retryable: false },
        );
      }
      if (
        typeof input.postInfo.disableComment !== "boolean" ||
        typeof input.postInfo.autoAddMusic !== "boolean" ||
        typeof input.postInfo.brandContent !== "boolean" ||
        typeof input.postInfo.brandOrganic !== "boolean"
      ) {
        throw new ProviderError(
          "invalid_request",
          "Privacy, interaction, music, and commercial-content choices must be explicit.",
          { status: 400, retryable: false },
        );
      }
    }
    const photoImages = input.sourceInfo.photoImages.map((url, index) =>
      isPublicHttpsUrl(url, `photoImages[${index}]`),
    );
    if (photoImages.length < 1 || photoImages.length > 35) {
      throw new ProviderError(
        "invalid_request",
        "TikTok photo posts require between 1 and 35 images.",
        { status: 400, retryable: false },
      );
    }
    if (
      !Number.isInteger(input.sourceInfo.photoCoverIndex) ||
      input.sourceInfo.photoCoverIndex < 0 ||
      input.sourceInfo.photoCoverIndex >= photoImages.length
    ) {
      throw new ProviderError(
        "invalid_request",
        "photoCoverIndex is out of range.",
        { status: 400, retryable: false },
      );
    }
    const postInfo = {
      ...(validateOptionalText(input.postInfo.title, "title", 90) === undefined
        ? {}
        : { title: input.postInfo.title }),
      ...(validateOptionalText(
        input.postInfo.description,
        "description",
        4_000,
      ) === undefined
        ? {}
        : { description: input.postInfo.description }),
      ...(directPost
        ? {
            privacy_level: input.postInfo.privacyLevel,
            disable_comment: input.postInfo.disableComment ?? false,
            auto_add_music: input.postInfo.autoAddMusic ?? false,
            brand_content_toggle: input.postInfo.brandContent ?? false,
            brand_organic_toggle: input.postInfo.brandOrganic ?? false,
          }
        : {}),
    };
    const body = await this.#apiRequest(
      "/v2/post/publish/content/init/",
      accessToken,
      {
        media_type: "PHOTO",
        post_mode: directPost ? "DIRECT_POST" : "MEDIA_UPLOAD",
        post_info: postInfo,
        source_info: {
          source: "PULL_FROM_URL",
          photo_images: photoImages,
          photo_cover_index: input.sourceInfo.photoCoverIndex,
        },
      },
    );
    return normalizePublishInit(body);
  }

  async uploadChunk(
    input: TikTokUploadChunkInput,
  ): Promise<TikTokUploadChunkResult> {
    const uploadUrl = validateUploadUrl(input.uploadUrl);
    if (!VIDEO_MIME_TYPES.has(input.contentType)) {
      throw new ProviderError(
        "invalid_content_type",
        "TikTok does not accept this video MIME type.",
        { status: 400, retryable: false },
      );
    }
    const chunk =
      input.chunk instanceof Uint8Array
        ? input.chunk
        : new Uint8Array(input.chunk);
    if (
      chunk.byteLength < 1 ||
      !Number.isSafeInteger(input.startByte) ||
      input.startByte < 0 ||
      !Number.isSafeInteger(input.totalBytes) ||
      input.totalBytes < 1 ||
      input.startByte + chunk.byteLength > input.totalBytes
    ) {
      throw new ProviderError(
        "invalid_upload_chunk",
        "The TikTok upload chunk range is invalid.",
        { status: 400, retryable: false },
      );
    }
    const endByte = input.startByte + chunk.byteLength - 1;
    const response = await this.#rawRequest(uploadUrl, {
      method: "PUT",
      headers: {
        "Content-Type": input.contentType,
        "Content-Length": String(chunk.byteLength),
        "Content-Range": `bytes ${input.startByte}-${endByte}/${input.totalBytes}`,
      },
      body: chunk,
    });
    if (response.status !== 201 && response.status !== 206) {
      throw new ProviderError(
        "upload_failed",
        "TikTok rejected the media upload chunk.",
        {
          status: response.status,
          retryable: response.status >= 500,
        },
      );
    }
    return {
      complete: response.status === 201,
      uploadedThroughByte: endByte,
    };
  }

  async getPublishStatus(
    accessToken: string,
    publishId: string,
  ): Promise<TikTokPublishStatus> {
    const body = await this.#apiRequest(
      "/v2/post/publish/status/fetch/",
      accessToken,
      { publish_id: requireInputString(publishId, "publishId", 64) },
    );
    const data = readData(body);
    const allowedStatuses = new Set<TikTokPublishStatus["status"]>([
      "PROCESSING_UPLOAD",
      "PROCESSING_DOWNLOAD",
      "SEND_TO_USER_INBOX",
      "PUBLISH_COMPLETE",
      "FAILED",
    ]);
    if (
      typeof data.status !== "string" ||
      !allowedStatuses.has(data.status as TikTokPublishStatus["status"])
    ) {
      throw new ProviderError(
        "invalid_response",
        "TikTok returned an unknown publish status.",
      );
    }
    const rawIds = data.publicaly_available_post_id ?? [];
    if (!Array.isArray(rawIds)) {
      throw new ProviderError(
        "invalid_response",
        "TikTok returned invalid post identifiers.",
      );
    }
    return {
      status: data.status as TikTokPublishStatus["status"],
      failReason: optionalString(data.fail_reason, "fail_reason", 200),
      publiclyAvailablePostIds: rawIds.map((value) => {
        if (typeof value !== "string" && typeof value !== "number") {
          throw new ProviderError(
            "invalid_response",
            "TikTok returned an invalid post identifier.",
          );
        }
        return String(value);
      }),
      uploadedBytes:
        data.uploaded_bytes === undefined
          ? undefined
          : requiredInteger(data.uploaded_bytes, "uploaded_bytes"),
      downloadedBytes:
        data.downloaded_bytes === undefined
          ? undefined
          : requiredInteger(data.downloaded_bytes, "downloaded_bytes"),
    };
  }

  async #formRequest(
    url: string,
    fields: Record<string, string>,
    allowEmptySuccess = false,
  ): Promise<unknown> {
    const response = await this.#rawRequest(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        "Cache-Control": "no-cache",
      },
      body: new URLSearchParams(fields),
    });
    const text = await response.text();
    if (!text.trim()) {
      if (allowEmptySuccess && response.ok) return {};
      throw new ProviderError(
        "invalid_response",
        "TikTok returned an invalid response.",
        { status: 502, retryable: response.status >= 500 },
      );
    }
    let body: unknown;
    try {
      body = JSON.parse(text) as unknown;
    } catch {
      throw new ProviderError(
        "invalid_response",
        "TikTok returned an invalid response.",
        { status: 502, retryable: response.status >= 500 },
      );
    }
    const error = tikTokError(body, response.status);
    if (error) throw error;
    return body;
  }

  async #apiRequest(
    path: string,
    accessToken: string,
    jsonBody?: unknown,
  ): Promise<unknown> {
    if (!path.startsWith("/v2/")) {
      throw new ProviderError(
        "invalid_request",
        "TikTok API path is invalid.",
        {
          status: 400,
          retryable: false,
        },
      );
    }
    const response = await this.#rawRequest(`${TIKTOK_API_ORIGIN}${path}`, {
      method: jsonBody === undefined ? "GET" : "POST",
      headers: {
        Authorization: `Bearer ${requireAccessToken(accessToken)}`,
        ...(jsonBody === undefined
          ? {}
          : { "Content-Type": "application/json; charset=UTF-8" }),
      },
      ...(jsonBody === undefined ? {} : { body: JSON.stringify(jsonBody) }),
    });
    const body = await parseJson(response);
    const error = tikTokError(body, response.status);
    if (error) throw error;
    return body;
  }

  async #rawRequest(url: string, init: RequestInit): Promise<Response> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.timeoutMs);
    timeout.unref?.();
    try {
      return await this.#fetch(url, { ...init, signal: controller.signal });
    } catch (error) {
      throw normalizeFetchError(error);
    } finally {
      clearTimeout(timeout);
    }
  }
}

function validateFields<T extends string>(
  fields: readonly T[],
  allowed: ReadonlySet<T>,
  location: string,
): T[] {
  const selected = [...new Set(fields)];
  if (
    selected.length === 0 ||
    selected.length > allowed.size ||
    selected.some((field) => !allowed.has(field))
  ) {
    throw new ProviderError("invalid_request", `${location} are invalid.`, {
      status: 400,
      retryable: false,
    });
  }
  return selected;
}

function normalizeVideo(value: unknown): TikTokVideo {
  if (!isRecord(value)) {
    throw new ProviderError(
      "invalid_response",
      "TikTok returned invalid video information.",
    );
  }
  const video: TikTokVideo = {
    id: requiredString(value.id, "video.id", 200),
  };
  for (const [key, fieldValue] of Object.entries(value)) {
    if (key === "id") continue;
    if (!VIDEO_FIELDS.has(key as TikTokVideoField)) continue;
    if (
      [
        "create_time",
        "duration",
        "height",
        "width",
        "like_count",
        "comment_count",
        "share_count",
        "view_count",
      ].includes(key)
    ) {
      if (!Number.isSafeInteger(fieldValue) || (fieldValue as number) < 0) {
        throw new ProviderError(
          "invalid_response",
          `TikTok returned an invalid video.${key} field.`,
        );
      }
    } else if (typeof fieldValue !== "string") {
      throw new ProviderError(
        "invalid_response",
        `TikTok returned an invalid video.${key} field.`,
      );
    }
    (video as unknown as Record<string, unknown>)[key] = fieldValue;
  }
  return video;
}

function normalizeVideoSource(
  source: TikTokVideoSource,
): Record<string, string | number> {
  if (source.source === "PULL_FROM_URL") {
    return {
      source: "PULL_FROM_URL",
      video_url: isPublicHttpsUrl(source.videoUrl, "videoUrl"),
    };
  }
  validateVideoUploadPlan(source);
  return {
    source: "FILE_UPLOAD",
    video_size: source.videoSize,
    chunk_size: source.chunkSize,
    total_chunk_count: source.totalChunkCount,
  };
}

export function parseTikTokSignature(header: string): TikTokSignatureParts {
  if (!header || header.length > 2_048) {
    throw new ProviderError(
      "invalid_signature",
      "TikTok-Signature is invalid.",
      { status: 400, retryable: false },
    );
  }
  let timestampText: string | undefined;
  const signatures: string[] = [];
  for (const segment of header.split(",")) {
    const separator = segment.indexOf("=");
    if (separator <= 0) continue;
    const key = segment.slice(0, separator).trim();
    const value = segment.slice(separator + 1).trim();
    if (key === "t") timestampText = value;
    if (key === "s" && /^[a-f0-9]{64}$/iu.test(value)) {
      signatures.push(value.toLowerCase());
    }
  }
  if (
    !timestampText ||
    !/^\d{1,12}$/u.test(timestampText) ||
    signatures.length === 0
  ) {
    throw new ProviderError(
      "invalid_signature",
      "TikTok-Signature is invalid.",
      { status: 400, retryable: false },
    );
  }
  const timestamp = Number(timestampText);
  if (!Number.isSafeInteger(timestamp) || timestamp <= 0) {
    throw new ProviderError(
      "invalid_signature",
      "TikTok-Signature timestamp is invalid.",
      { status: 400, retryable: false },
    );
  }
  return { timestamp, signatures };
}

export function verifyTikTokSignature(options: {
  header: string;
  rawBody: Uint8Array | string;
  clientSecret: string;
  now?: Date | number;
  maxAgeSeconds?: number;
}): boolean {
  const { timestamp, signatures } = parseTikTokSignature(options.header);
  const clientSecret = requireInputString(
    options.clientSecret,
    "clientSecret",
    500,
  );
  const maxAgeSeconds =
    options.maxAgeSeconds ?? TIKTOK_DEFAULT_SIGNATURE_MAX_AGE_SECONDS;
  if (
    !Number.isInteger(maxAgeSeconds) ||
    maxAgeSeconds < 0 ||
    maxAgeSeconds > 86_400
  ) {
    throw new ProviderError(
      "invalid_signature_age",
      "maxAgeSeconds is invalid.",
      { status: 400, retryable: false },
    );
  }
  const nowMilliseconds =
    options.now instanceof Date
      ? options.now.getTime()
      : (options.now ?? Date.now());
  if (!Number.isFinite(nowMilliseconds)) {
    throw new ProviderError("invalid_request", "now is invalid.", {
      status: 400,
      retryable: false,
    });
  }
  const age = Math.abs(Math.floor(nowMilliseconds / 1_000) - timestamp);
  if (age > maxAgeSeconds) return false;

  const body =
    typeof options.rawBody === "string"
      ? Buffer.from(options.rawBody, "utf8")
      : Buffer.from(options.rawBody);
  const signedPayload = Buffer.concat([
    Buffer.from(`${timestamp}.`, "utf8"),
    body,
  ]);
  const expected = createHmac("sha256", clientSecret)
    .update(signedPayload)
    .digest();
  return signatures.some((signature) => {
    const received = Buffer.from(signature, "hex");
    return (
      received.length === expected.length && timingSafeEqual(received, expected)
    );
  });
}
