import { describe, expect, it, vi } from "vitest";
import {
  ProviderError,
  YOUTUBE_SCOPES,
  buildYouTubeAuthorizeUrl,
  discoverYouTubeAccounts,
  exchangeYouTubeAuthorizationCode,
  getYouTubeResumableUploadStatus,
  initiateYouTubeResumableUpload,
  refreshYouTubeAccessToken,
  revokeYouTubeToken,
  syncYouTubeUploads,
  uploadYouTubeResumableChunk,
  validateYouTubePublishMetadata,
  type YouTubeFetch,
} from "./youtube.js";

const CLIENT_ID = "client-id.apps.googleusercontent.com";
const CLIENT_SECRET = "client-secret-that-must-not-leak";
const ACCESS_TOKEN = "access-token-that-must-not-leak";
const REFRESH_TOKEN = "refresh-token-that-must-not-leak";
const REDIRECT_URI = "https://campaign.example.com/api/oauth/youtube/callback";
const CODE_VERIFIER = "v".repeat(43);
const CODE_CHALLENGE = "c".repeat(43);

function jsonResponse(value: unknown, status = 200): Response {
  return new Response(JSON.stringify(value), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function mockFetch(...responses: Response[]): {
  fetch: YouTubeFetch;
  mock: ReturnType<typeof vi.fn>;
} {
  const mock = vi.fn();
  for (const response of responses) mock.mockResolvedValueOnce(response);
  return { fetch: mock as YouTubeFetch, mock };
}

function validMetadata(): Record<string, unknown> {
  return {
    title: "Produktvorstellung",
    description: "Eine kurze Beschreibung.",
    privacyStatus: "private",
    madeForKids: false,
    publishAt: "2027-01-02T12:30:00+01:00",
    containsSyntheticMedia: true,
    tags: ["launch", "produkt"],
    categoryId: "22",
    defaultLanguage: "de-DE",
  };
}

describe("YouTube integration adapter", () => {
  it("builds a fixed Google authorization URL with PKCE and offline access", () => {
    const result = new URL(
      buildYouTubeAuthorizeUrl({
        clientId: CLIENT_ID,
        redirectUri: REDIRECT_URI,
        state: "secure-random-state-value",
        codeChallenge: CODE_CHALLENGE,
        scopes: [
          YOUTUBE_SCOPES.readonly,
          YOUTUBE_SCOPES.upload,
          YOUTUBE_SCOPES.readonly,
        ],
      }),
    );

    expect(result.origin + result.pathname).toBe(
      "https://accounts.google.com/o/oauth2/v2/auth",
    );
    expect(result.searchParams.get("response_type")).toBe("code");
    expect(result.searchParams.get("access_type")).toBe("offline");
    expect(result.searchParams.get("include_granted_scopes")).toBe("true");
    expect(result.searchParams.get("prompt")).toBe("consent");
    expect(result.searchParams.get("code_challenge_method")).toBe("S256");
    expect(result.searchParams.get("code_challenge")).toBe(CODE_CHALLENGE);
    expect(result.searchParams.get("scope")?.split(" ")).toEqual([
      YOUTUBE_SCOPES.readonly,
      YOUTUBE_SCOPES.upload,
    ]);
  });

  it("rejects unknown scopes and insecure production redirects", () => {
    expect(() =>
      buildYouTubeAuthorizeUrl({
        clientId: CLIENT_ID,
        redirectUri: REDIRECT_URI,
        state: "secure-random-state-value",
        codeChallenge: CODE_CHALLENGE,
        scopes: ["https://www.googleapis.com/auth/drive"],
      }),
    ).toThrow(/nicht erlaubten Scope/i);
    expect(() =>
      buildYouTubeAuthorizeUrl({
        clientId: CLIENT_ID,
        redirectUri: "http://campaign.example.com/callback",
        state: "secure-random-state-value",
        codeChallenge: CODE_CHALLENGE,
      }),
    ).toThrow(/HTTPS/i);
    expect(() =>
      buildYouTubeAuthorizeUrl({
        clientId: CLIENT_ID,
        redirectUri: "https://192.0.2.10/callback",
        state: "secure-random-state-value",
        codeChallenge: CODE_CHALLENGE,
      }),
    ).toThrow(/IP-Adresse/i);
  });

  it("exchanges an authorization code only at Google's fixed token endpoint", async () => {
    const { fetch, mock } = mockFetch(
      jsonResponse({
        access_token: "new-access-token",
        refresh_token: "new-refresh-token",
        expires_in: 3_600,
        refresh_token_expires_in: 86_400,
        token_type: "Bearer",
        scope: `${YOUTUBE_SCOPES.readonly} ${YOUTUBE_SCOPES.upload}`,
      }),
    );

    await expect(
      exchangeYouTubeAuthorizationCode(
        {
          clientId: CLIENT_ID,
          clientSecret: CLIENT_SECRET,
          code: "one-time-code",
          codeVerifier: CODE_VERIFIER,
          redirectUri: REDIRECT_URI,
        },
        { fetch },
      ),
    ).resolves.toEqual({
      accessToken: "new-access-token",
      refreshToken: "new-refresh-token",
      expiresInSeconds: 3_600,
      refreshTokenExpiresInSeconds: 86_400,
      tokenType: "Bearer",
      scopes: [YOUTUBE_SCOPES.readonly, YOUTUBE_SCOPES.upload],
    });

    const [url, init] = mock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("https://oauth2.googleapis.com/token");
    expect(init.method).toBe("POST");
    const body = new URLSearchParams(String(init.body));
    expect(body.get("grant_type")).toBe("authorization_code");
    expect(body.get("code_verifier")).toBe(CODE_VERIFIER);
    expect(body.get("redirect_uri")).toBe(REDIRECT_URI);
  });

  it("preserves an existing refresh token and accepts explicit rotation", async () => {
    const { fetch } = mockFetch(
      jsonResponse({
        access_token: "access-one",
        expires_in: 3_600,
        token_type: "Bearer",
      }),
      jsonResponse({
        access_token: "access-two",
        refresh_token: "rotated-refresh-token",
        expires_in: 3_600,
        token_type: "Bearer",
      }),
    );
    const input = {
      clientId: CLIENT_ID,
      clientSecret: CLIENT_SECRET,
      refreshToken: REFRESH_TOKEN,
    };

    await expect(refreshYouTubeAccessToken(input, { fetch })).resolves.toEqual({
      accessToken: "access-one",
      refreshToken: REFRESH_TOKEN,
      expiresInSeconds: 3_600,
      tokenType: "Bearer",
    });
    await expect(refreshYouTubeAccessToken(input, { fetch })).resolves.toEqual({
      accessToken: "access-two",
      refreshToken: "rotated-refresh-token",
      expiresInSeconds: 3_600,
      tokenType: "Bearer",
    });
  });

  it("returns structured OAuth errors without upstream descriptions or secrets", async () => {
    const upstreamDescription = `invalid ${CLIENT_SECRET} ${REFRESH_TOKEN}`;
    const { fetch } = mockFetch(
      jsonResponse(
        {
          error: "invalid_grant",
          error_description: upstreamDescription,
        },
        400,
      ),
    );

    let caught: unknown;
    try {
      await refreshYouTubeAccessToken(
        {
          clientId: CLIENT_ID,
          clientSecret: CLIENT_SECRET,
          refreshToken: REFRESH_TOKEN,
        },
        { fetch },
      );
    } catch (error) {
      caught = error;
    }

    expect(caught).toBeInstanceOf(ProviderError);
    const error = caught as ProviderError;
    expect(error).toMatchObject({
      provider: "youtube",
      code: "youtube_oauth_error",
      operation: "oauth_token_refresh",
      status: 400,
      upstreamStatus: 400,
      retryable: false,
      details: { upstreamCode: "invalid_grant" },
    });
    const serialized = JSON.stringify(error);
    expect(serialized).not.toContain(CLIENT_SECRET);
    expect(serialized).not.toContain(REFRESH_TOKEN);
    expect(serialized).not.toContain(upstreamDescription);
  });

  it("revokes tokens without placing them in the URL", async () => {
    const { fetch, mock } = mockFetch(new Response(null, { status: 200 }));
    await revokeYouTubeToken({ token: REFRESH_TOKEN }, { fetch });

    const [url, init] = mock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("https://oauth2.googleapis.com/revoke");
    expect(url).not.toContain(REFRESH_TOKEN);
    expect(new URLSearchParams(String(init.body)).get("token")).toBe(
      REFRESH_TOKEN,
    );
  });

  it("discovers the authorized channel and its uploads playlist", async () => {
    const { fetch, mock } = mockFetch(
      jsonResponse({
        items: [
          {
            id: "UC123",
            snippet: {
              title: "Campaign Channel",
              description: "Beschreibung",
              thumbnails: { high: { url: "https://yt.example/thumb.jpg" } },
            },
            contentDetails: { relatedPlaylists: { uploads: "UU123" } },
            statistics: {
              viewCount: "100",
              subscriberCount: "12",
              hiddenSubscriberCount: false,
              videoCount: "3",
            },
            status: {
              privacyStatus: "public",
              longUploadsStatus: "allowed",
              madeForKids: false,
              selfDeclaredMadeForKids: false,
            },
          },
        ],
      }),
    );

    await expect(
      discoverYouTubeAccounts({ accessToken: ACCESS_TOKEN }, { fetch }),
    ).resolves.toEqual([
      {
        id: "UC123",
        title: "Campaign Channel",
        description: "Beschreibung",
        thumbnailUrl: "https://yt.example/thumb.jpg",
        uploadsPlaylistId: "UU123",
        viewCount: "100",
        subscriberCount: "12",
        hiddenSubscriberCount: false,
        videoCount: "3",
        privacyStatus: "public",
        longUploadsStatus: "allowed",
        madeForKids: false,
        selfDeclaredMadeForKids: false,
      },
    ]);

    const [rawUrl, init] = mock.mock.calls[0] as [string, RequestInit];
    const url = new URL(rawUrl);
    expect(url.origin + url.pathname).toBe(
      "https://www.googleapis.com/youtube/v3/channels",
    );
    expect(url.searchParams.get("mine")).toBe("true");
    expect(new Headers(init.headers).get("Authorization")).toBe(
      `Bearer ${ACCESS_TOKEN}`,
    );
  });

  it("paginates the uploads playlist and enriches videos without search.list", async () => {
    const { fetch, mock } = mockFetch(
      jsonResponse({
        items: [
          { contentDetails: { videoId: "video-a" } },
          { contentDetails: { videoId: "video-b" } },
        ],
        nextPageToken: "page-two",
      }),
      jsonResponse({
        items: [
          {
            id: "video-a",
            snippet: { title: "A", publishedAt: "2026-01-01T00:00:00Z" },
            contentDetails: { duration: "PT1M" },
            status: { privacyStatus: "public" },
            statistics: { viewCount: "10" },
          },
        ],
      }),
      jsonResponse({
        items: [
          { contentDetails: { videoId: "video-c" } },
          { contentDetails: { videoId: "video-a" } },
        ],
      }),
      jsonResponse({
        items: [
          {
            id: "video-c",
            snippet: { title: "C" },
            status: { privacyStatus: "private" },
            processingDetails: { processingStatus: "succeeded" },
          },
        ],
      }),
    );

    await expect(
      syncYouTubeUploads(
        { accessToken: ACCESS_TOKEN, uploadsPlaylistId: "UU123" },
        { fetch },
      ),
    ).resolves.toEqual({
      videos: [
        {
          id: "video-a",
          title: "A",
          publishedAt: "2026-01-01T00:00:00Z",
          duration: "PT1M",
          privacyStatus: "public",
          viewCount: "10",
        },
        {
          id: "video-c",
          title: "C",
          privacyStatus: "private",
          processingStatus: "succeeded",
        },
      ],
      missingVideoIds: ["video-b"],
      pagesFetched: 2,
    });
    expect(mock).toHaveBeenCalledTimes(4);
    for (const [rawUrl] of mock.mock.calls as [string, RequestInit][]) {
      expect(rawUrl).not.toContain("/search");
    }
    const videosUrl = new URL(mock.mock.calls[1]?.[0] as string);
    expect(videosUrl.searchParams.get("id")).toBe("video-a,video-b");
    expect(videosUrl.searchParams.has("maxResults")).toBe(false);
    const secondPageUrl = new URL(mock.mock.calls[2]?.[0] as string);
    expect(secondPageUrl.searchParams.get("pageToken")).toBe("page-two");
  });

  it("returns a continuation token when maxPages bounds a sync", async () => {
    const { fetch } = mockFetch(
      jsonResponse({ items: [], nextPageToken: "continue-here" }),
    );
    await expect(
      syncYouTubeUploads(
        {
          accessToken: ACCESS_TOKEN,
          uploadsPlaylistId: "UU123",
          maxPages: 1,
        },
        { fetch },
      ),
    ).resolves.toEqual({
      videos: [],
      missingVideoIds: [],
      pagesFetched: 1,
      nextPageToken: "continue-here",
    });
  });

  it("validates publishing limits, privacy scheduling, and made-for-kids", () => {
    expect(validateYouTubePublishMetadata(validMetadata())).toEqual(
      validMetadata(),
    );
    expect(() =>
      validateYouTubePublishMetadata({
        ...validMetadata(),
        title: "x".repeat(101),
      }),
    ).toThrow(/title/i);
    expect(() =>
      validateYouTubePublishMetadata({
        ...validMetadata(),
        description: "ä".repeat(2_501),
      }),
    ).toThrow(/description/i);
    expect(() =>
      validateYouTubePublishMetadata({
        ...validMetadata(),
        privacyStatus: "public",
      }),
    ).toThrow(/private/i);
    expect(() =>
      validateYouTubePublishMetadata({
        ...validMetadata(),
        madeForKids: "no",
      }),
    ).toThrow(/madeForKids/i);
    expect(() =>
      validateYouTubePublishMetadata({
        ...validMetadata(),
        publishAt: "2027-02-30T12:30:00Z",
      }),
    ).toThrow(/Datum/i);
    expect(() =>
      validateYouTubePublishMetadata({
        ...validMetadata(),
        title: `ungültig${String.fromCharCode(0xd800)}`,
      }),
    ).toThrow(/title/i);
  });

  it("initiates a resumable upload and rejects a non-Google session URL", async () => {
    const officialSession =
      "https://www.googleapis.com/upload/youtube/v3/videos?uploadType=resumable&upload_id=session-id";
    const { fetch, mock } = mockFetch(
      new Response(null, {
        status: 200,
        headers: { Location: officialSession },
      }),
    );
    await expect(
      initiateYouTubeResumableUpload(
        {
          accessToken: ACCESS_TOKEN,
          metadata: validMetadata(),
          contentLength: 1_000_000,
          contentType: "video/mp4",
          notifySubscribers: false,
        },
        { fetch },
      ),
    ).resolves.toEqual({ uploadUrl: officialSession });

    const [rawUrl, init] = mock.mock.calls[0] as [string, RequestInit];
    const url = new URL(rawUrl);
    expect(url.origin + url.pathname).toBe(
      "https://www.googleapis.com/upload/youtube/v3/videos",
    );
    expect(url.searchParams.get("uploadType")).toBe("resumable");
    expect(url.searchParams.get("notifySubscribers")).toBe("false");
    const headers = new Headers(init.headers);
    expect(headers.get("X-Upload-Content-Length")).toBe("1000000");
    expect(headers.get("X-Upload-Content-Type")).toBe("video/mp4");
    expect(JSON.parse(String(init.body))).toMatchObject({
      snippet: { title: "Produktvorstellung" },
      status: {
        privacyStatus: "private",
        selfDeclaredMadeForKids: false,
        containsSyntheticMedia: true,
      },
    });

    const malicious = mockFetch(
      new Response(null, {
        status: 200,
        headers: { Location: "https://evil.example/upload?secret=x" },
      }),
    );
    await expect(
      initiateYouTubeResumableUpload(
        {
          accessToken: ACCESS_TOKEN,
          metadata: validMetadata(),
          contentLength: 1_000_000,
          contentType: "video/mp4",
        },
        { fetch: malicious.fetch },
      ),
    ).rejects.toMatchObject({ code: "youtube_invalid_input" });
  });

  it("uploads chunks and reports the next byte from a 308 response", async () => {
    const uploadUrl =
      "https://www.googleapis.com/upload/youtube/v3/videos?uploadType=resumable&upload_id=session-id";
    const { fetch, mock } = mockFetch(
      new Response(null, {
        status: 308,
        headers: { Range: "bytes=0-262143" },
      }),
    );
    const chunk = new Uint8Array(256 * 1024);

    await expect(
      uploadYouTubeResumableChunk(
        {
          accessToken: ACCESS_TOKEN,
          uploadUrl,
          chunk,
          startByte: 0,
          totalBytes: 256 * 1024 + 1,
          contentType: "video/mp4",
        },
        { fetch },
      ),
    ).resolves.toEqual({
      status: "incomplete",
      receivedBytes: 256 * 1024,
      nextByte: 256 * 1024,
    });
    const [, init] = mock.mock.calls[0] as [string, RequestInit];
    const headers = new Headers(init.headers);
    expect(headers.get("Content-Range")).toBe("bytes 0-262143/262145");
    expect(headers.get("Content-Length")).toBe("262144");
  });

  it("allows a small final chunk and validates resumable status responses", async () => {
    const uploadUrl =
      "https://www.googleapis.com/upload/youtube/v3/videos?uploadType=resumable&upload_id=session-id";
    const { fetch, mock } = mockFetch(
      jsonResponse({
        id: "completed-video",
        snippet: { title: "Fertig" },
        status: { privacyStatus: "private" },
      }),
      new Response(null, { status: 308 }),
    );
    await expect(
      uploadYouTubeResumableChunk(
        {
          accessToken: ACCESS_TOKEN,
          uploadUrl,
          chunk: new Uint8Array([1]),
          startByte: 256 * 1024,
          totalBytes: 256 * 1024 + 1,
          contentType: "video/mp4",
        },
        { fetch },
      ),
    ).resolves.toEqual({
      status: "complete",
      video: {
        id: "completed-video",
        title: "Fertig",
        privacyStatus: "private",
      },
    });
    await expect(
      getYouTubeResumableUploadStatus(
        { accessToken: ACCESS_TOKEN, uploadUrl, totalBytes: 256 * 1024 + 1 },
        { fetch },
      ),
    ).resolves.toEqual({
      status: "incomplete",
      receivedBytes: 0,
      nextByte: 0,
    });
    const [, statusInit] = mock.mock.calls[1] as [string, RequestInit];
    expect(new Headers(statusInit.headers).get("Content-Range")).toBe(
      "bytes */262145",
    );
  });

  it("maps aborts to retryable timeout errors", async () => {
    const neverFinishes: YouTubeFetch = (_input, init) =>
      new Promise((_resolve, reject) => {
        init?.signal?.addEventListener("abort", () =>
          reject(new DOMException("Aborted", "AbortError")),
        );
      });

    await expect(
      discoverYouTubeAccounts(
        { accessToken: ACCESS_TOKEN },
        { fetch: neverFinishes, timeoutMs: 100 },
      ),
    ).rejects.toMatchObject({
      code: "youtube_timeout",
      status: 504,
      retryable: true,
    });
  });
});
