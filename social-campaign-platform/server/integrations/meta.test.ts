import { createHmac } from "node:crypto";
import { describe, expect, it, vi } from "vitest";
import {
  META_AUTH_ORIGIN,
  META_GRAPH_API_VERSION,
  META_GRAPH_ORIGIN,
  MetaGraphClient,
  ProviderError,
  buildMetaAuthorizeUrl,
  createMetaAppSecretProof,
  parseMetaWebhook,
  verifyMetaWebhookChallenge,
  verifyMetaWebhookSignature,
} from "./meta.js";

function jsonResponse(value: unknown, status = 200): Response {
  return new Response(JSON.stringify(value), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function requestUrl(input: string | URL | Request): URL {
  return new URL(input instanceof Request ? input.url : input.toString());
}

function requestHeaders(
  input: string | URL | Request,
  init?: RequestInit,
): Headers {
  return new Headers(input instanceof Request ? input.headers : init?.headers);
}

function requestBody(init?: RequestInit): URLSearchParams {
  if (typeof init?.body !== "string") {
    throw new Error("Expected a string request body.");
  }
  return new URLSearchParams(init.body);
}

function createClient(fetchImpl: typeof fetch): MetaGraphClient {
  return new MetaGraphClient({
    appId: "123456789",
    appSecret: "app-secret",
    configId: "987654321",
    redirectUri: "https://app.example.com/api/meta/callback",
    fetchImpl,
  });
}

describe("MetaGraphClient", () => {
  it("builds a strict Facebook Login for Business authorization URL", () => {
    const result = buildMetaAuthorizeUrl({
      appId: "123456789",
      configId: "987654321",
      redirectUri: "https://app.example.com/api/meta/callback",
      state: "csrf-state-with-high-entropy",
    });
    const url = new URL(result);

    expect(url.origin).toBe(META_AUTH_ORIGIN);
    expect(url.pathname).toBe(`/${META_GRAPH_API_VERSION}/dialog/oauth`);
    expect(Object.fromEntries(url.searchParams)).toEqual({
      client_id: "123456789",
      config_id: "987654321",
      redirect_uri: "https://app.example.com/api/meta/callback",
      state: "csrf-state-with-high-entropy",
      response_type: "code",
      override_default_response_type: "true",
    });
    expect(() =>
      buildMetaAuthorizeUrl({
        appId: "123456789",
        configId: "987654321",
        redirectUri: "http://app.example.com/callback",
        state: "state",
      }),
    ).toThrow(ProviderError);
  });

  it("exchanges OAuth codes and short-lived tokens only against Graph v26", async () => {
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockImplementation(async (input) => {
        const url = requestUrl(input);
        expect(url.origin).toBe(META_GRAPH_ORIGIN);
        expect(url.pathname).toBe(
          `/${META_GRAPH_API_VERSION}/oauth/access_token`,
        );
        if (url.searchParams.get("code")) {
          expect(url.searchParams.get("client_secret")).toBe("app-secret");
          expect(url.searchParams.get("redirect_uri")).toBe(
            "https://app.example.com/api/meta/callback",
          );
          return jsonResponse({
            access_token: "short-token",
            token_type: "bearer",
            expires_in: 3600,
          });
        }
        expect(url.searchParams.get("grant_type")).toBe("fb_exchange_token");
        expect(url.searchParams.get("fb_exchange_token")).toBe("short-token");
        return jsonResponse({
          access_token: "long-token",
          token_type: "bearer",
          expires_in: 5_184_000,
        });
      });
    const client = createClient(fetchMock);

    await expect(client.exchangeCode({ code: "oauth-code" })).resolves.toEqual({
      accessToken: "short-token",
      tokenType: "bearer",
      expiresIn: 3600,
    });
    await expect(
      client.exchangeLongLivedUserToken("short-token"),
    ).resolves.toEqual({
      accessToken: "long-token",
      tokenType: "bearer",
      expiresIn: 5_184_000,
    });
  });

  it("generates appsecret_proof and keeps access tokens out of Graph URLs", async () => {
    const expectedProof =
      "d8b448b9cc7d64c51098271805b3cc20b5b715e52bd587eb71b610259587c856";
    expect(createMetaAppSecretProof("page-token", "app-secret")).toBe(
      expectedProof,
    );
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockImplementation(async (input, init) => {
        const url = requestUrl(input);
        const headers = requestHeaders(input, init);
        expect(url.searchParams.get("access_token")).toBeNull();
        expect(url.searchParams.get("appsecret_proof")).toBe(expectedProof);
        expect(headers.get("Authorization")).toBe("Bearer page-token");
        expect(init?.redirect).toBe("manual");
        return jsonResponse({ data: [] });
      });

    await expect(
      createClient(fetchMock).getPageFeedPage({
        pageId: "page.123",
        pageAccessToken: "page-token",
      }),
    ).resolves.toEqual({ data: [] });
  });

  it("discovers Pages and linked Instagram professional accounts", async () => {
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockImplementation(async (input) => {
        const url = requestUrl(input);
        expect(url.pathname).toBe(`/${META_GRAPH_API_VERSION}/me/accounts`);
        expect(url.searchParams.get("fields")).toContain(
          "instagram_business_account{id,username,name}",
        );
        return jsonResponse({
          data: [
            {
              id: "page-1",
              name: "Campaign Page",
              access_token: "page-token",
              tasks: ["ANALYZE", "CREATE_CONTENT", "MODERATE"],
              instagram_business_account: {
                id: "ig-1",
                username: "campaign",
                name: "Campaign",
              },
            },
          ],
        });
      });

    await expect(
      createClient(fetchMock).discoverPageAccounts({
        userAccessToken: "user-token",
      }),
    ).resolves.toEqual([
      {
        id: "page-1",
        name: "Campaign Page",
        accessToken: "page-token",
        tasks: ["ANALYZE", "CREATE_CONTENT", "MODERATE"],
        instagramBusinessAccount: {
          id: "ig-1",
          username: "campaign",
          name: "Campaign",
        },
      },
    ]);
  });

  it("paginates Page feeds with validated cursors instead of following next URLs", async () => {
    const cursors: Array<string | null> = [];
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockImplementation(async (input) => {
        const url = requestUrl(input);
        cursors.push(url.searchParams.get("after"));
        if (!url.searchParams.get("after")) {
          return jsonResponse({
            data: [{ id: "page_post_1", message: "First" }],
            paging: {
              cursors: { after: "safe-cursor" },
              next: "https://attacker.invalid/steal?page=2",
            },
          });
        }
        expect(url.origin).toBe(META_GRAPH_ORIGIN);
        return jsonResponse({
          data: [
            {
              id: "page_post_2",
              message: "Second",
              created_time: "2026-08-13T11:00:00+0000",
            },
          ],
          // A terminal Meta page may retain cursors but has no `next` link.
          paging: { cursors: { after: "terminal-cursor" } },
        });
      });

    await expect(
      createClient(fetchMock).listPageFeed({
        pageId: "page",
        pageAccessToken: "page-token",
      }),
    ).resolves.toEqual([
      { id: "page_post_1", message: "First" },
      {
        id: "page_post_2",
        message: "Second",
        createdTime: "2026-08-13T11:00:00+0000",
      },
    ]);
    expect(cursors).toEqual([null, "safe-cursor"]);
  });

  it("publishes Page text, links, and photos with form bodies", async () => {
    const calls: Array<{ path: string; body: URLSearchParams }> = [];
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockImplementation(async (input, init) => {
        calls.push({
          path: requestUrl(input).pathname,
          body: requestBody(init),
        });
        if (requestUrl(input).pathname.endsWith("/photos")) {
          return jsonResponse({ id: "photo-1", post_id: "page_post_3" });
        }
        return jsonResponse({ id: `page_post_${calls.length}` });
      });
    const client = createClient(fetchMock);

    await client.publishPageText({
      pageId: "page",
      pageAccessToken: "page-token",
      message: "Hello",
    });
    await client.publishPageLink({
      pageId: "page",
      pageAccessToken: "page-token",
      link: "https://example.com/post",
      message: "Read this",
      scheduledPublishTime: 1_788_000_000,
    });
    await expect(
      client.publishPagePhoto({
        pageId: "page",
        pageAccessToken: "page-token",
        imageUrl: "https://cdn.example.com/photo.jpg",
        caption: "Photo caption",
      }),
    ).resolves.toEqual({ id: "photo-1", postId: "page_post_3" });

    expect(calls[0]?.body.get("message")).toBe("Hello");
    expect(calls[1]?.body.get("link")).toBe("https://example.com/post");
    expect(calls[1]?.body.get("published")).toBe("false");
    expect(calls[1]?.body.get("scheduled_publish_time")).toBe("1788000000");
    expect(calls[2]?.path).toBe(`/${META_GRAPH_API_VERSION}/page/photos`);
    expect(calls[2]?.body.get("url")).toBe("https://cdn.example.com/photo.jpg");
  });

  it("creates, checks, and publishes an Instagram Reel container", async () => {
    let requestNumber = 0;
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockImplementation(async (input, init) => {
        requestNumber += 1;
        const url = requestUrl(input);
        if (requestNumber === 1) {
          const body = requestBody(init);
          expect(url.pathname).toBe(`/${META_GRAPH_API_VERSION}/ig-1/media`);
          expect(body.get("media_type")).toBe("REELS");
          expect(body.get("video_url")).toBe(
            "https://cdn.example.com/reel.mp4",
          );
          return jsonResponse({ id: "container-1" });
        }
        if (requestNumber === 2) {
          expect(url.searchParams.get("fields")).toBe("id,status_code,status");
          return jsonResponse({
            id: "container-1",
            status_code: "FINISHED",
            status: "Ready",
          });
        }
        expect(requestBody(init).get("creation_id")).toBe("container-1");
        return jsonResponse({ id: "media-1" });
      });
    const client = createClient(fetchMock);

    await expect(
      client.createInstagramMediaContainer({
        instagramAccountId: "ig-1",
        accessToken: "page-token",
        mediaType: "REELS",
        videoUrl: "https://cdn.example.com/reel.mp4",
        caption: "New reel",
        shareToFeed: true,
      }),
    ).resolves.toEqual({ id: "container-1" });
    await expect(
      client.getInstagramContainerStatus({
        containerId: "container-1",
        accessToken: "page-token",
      }),
    ).resolves.toEqual({
      id: "container-1",
      statusCode: "FINISHED",
      status: "Ready",
    });
    await expect(
      client.publishInstagramMedia({
        instagramAccountId: "ig-1",
        accessToken: "page-token",
        creationId: "container-1",
      }),
    ).resolves.toEqual({ id: "media-1" });
  });

  it("normalizes comments, replies, insights, publishing limits, and token debug", async () => {
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockImplementation(async (input) => {
        const url = requestUrl(input);
        if (url.pathname.endsWith("/comments")) {
          return jsonResponse({
            data: [
              {
                id: "comment-1",
                text: "Nice",
                timestamp: "2026-08-13T10:00:00+0000",
                from: { id: "author-1", username: "reader" },
              },
            ],
          });
        }
        if (url.pathname.endsWith("/replies")) {
          return jsonResponse({ data: [] });
        }
        if (url.pathname.endsWith("/insights")) {
          expect(url.searchParams.get("metric")).toBe("reach,views");
          return jsonResponse({
            data: [{ name: "reach", period: "day", values: [{ value: 12 }] }],
          });
        }
        if (url.pathname.endsWith("/content_publishing_limit")) {
          return jsonResponse({
            data: [
              {
                quota_usage: 7,
                config: { quota_total: 100, quota_duration: 86_400 },
              },
            ],
          });
        }
        if (url.pathname.endsWith("/debug_token")) {
          return jsonResponse({
            data: {
              app_id: "123456789",
              is_valid: true,
              type: "USER",
              user_id: "user-1",
              scopes: ["pages_show_list", "instagram_basic"],
              expires_at: 1_800_000_000,
            },
          });
        }
        throw new Error(`Unexpected Meta request: ${url.pathname}`);
      });
    const client = createClient(fetchMock);

    await expect(
      client.listComments({ objectId: "media-1", accessToken: "page-token" }),
    ).resolves.toEqual([
      {
        id: "comment-1",
        text: "Nice",
        timestamp: "2026-08-13T10:00:00+0000",
        from: { id: "author-1", username: "reader" },
      },
    ]);
    await expect(
      client.listReplies({ commentId: "comment-1", accessToken: "page-token" }),
    ).resolves.toEqual([]);
    await expect(
      client.getInsights({
        objectId: "ig-1",
        accessToken: "page-token",
        metrics: ["reach", "views"],
        period: "day",
      }),
    ).resolves.toEqual([
      { name: "reach", period: "day", values: [{ value: 12 }] },
    ]);
    await expect(
      client.getInstagramContentPublishingLimit({
        instagramAccountId: "ig-1",
        accessToken: "page-token",
      }),
    ).resolves.toEqual({
      quotaUsage: 7,
      quotaTotal: 100,
      quotaDurationSeconds: 86_400,
    });
    await expect(client.debugToken("user-token")).resolves.toMatchObject({
      appId: "123456789",
      isValid: true,
      userId: "user-1",
      scopes: ["pages_show_list", "instagram_basic"],
    });
  });

  it("returns sanitized, structured provider errors", async () => {
    const secretMessage = "token-do-not-leak";
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(
      jsonResponse(
        {
          error: {
            message: `Invalid token ${secretMessage}`,
            type: "OAuthException",
            code: 190,
            error_subcode: 463,
            fbtrace_id: "trace-id",
          },
        },
        401,
      ),
    );

    let caught: unknown;
    try {
      await createClient(fetchMock).getPageFeedPage({
        pageId: "page",
        pageAccessToken: secretMessage,
      });
    } catch (error) {
      caught = error;
    }
    expect(caught).toBeInstanceOf(ProviderError);
    expect(caught).toMatchObject({
      provider: "meta",
      code: "meta_api_error",
      httpStatus: 401,
      upstreamStatus: 401,
      upstreamCode: 190,
      upstreamSubcode: 463,
      traceId: "trace-id",
      retryable: false,
    });
    expect(String(caught)).not.toContain(secretMessage);
    expect(JSON.stringify(caught)).not.toContain(secretMessage);
  });
});

describe("Meta webhooks", () => {
  it("verifies the GET challenge in constant-time-compatible form", () => {
    expect(
      verifyMetaWebhookChallenge(
        new URLSearchParams({
          "hub.mode": "subscribe",
          "hub.challenge": "1158201444",
          "hub.verify_token": "verify-secret",
        }),
        "verify-secret",
      ),
    ).toBe("1158201444");
    expect(() =>
      verifyMetaWebhookChallenge(
        { "hub.mode": "subscribe", "hub.verify_token": "wrong" },
        "verify-secret",
      ),
    ).toThrow(ProviderError);
  });

  it("checks the raw POST body HMAC before parsing JSON", () => {
    const rawBody = Buffer.from(
      JSON.stringify({ object: "instagram", entry: [{ id: "ig-1" }] }),
    );
    const signature = `sha256=${createHmac("sha256", "app-secret")
      .update(rawBody)
      .digest("hex")}`;

    expect(verifyMetaWebhookSignature(rawBody, signature, "app-secret")).toBe(
      true,
    );
    expect(
      verifyMetaWebhookSignature(
        Buffer.concat([rawBody, Buffer.from(" ")]),
        signature,
        "app-secret",
      ),
    ).toBe(false);
    expect(parseMetaWebhook(rawBody, signature, "app-secret")).toEqual({
      object: "instagram",
      entry: [{ id: "ig-1" }],
    });
    expect(() => parseMetaWebhook(rawBody, "sha256=00", "app-secret")).toThrow(
      /signature/i,
    );
  });
});
