import { createHash, createHmac } from "node:crypto";
import { describe, expect, it, vi } from "vitest";
import {
  ProviderError,
  TikTokClient,
  parseTikTokSignature,
  validateVideoUploadPlan,
  verifyTikTokSignature,
  type TikTokCreatorInfo,
} from "./tiktok.js";

const jsonResponse = (body: unknown, status = 200): Response =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });

const ok = (data: unknown): Response =>
  jsonResponse({
    data,
    error: { code: "ok", message: "", log_id: "log-safe" },
  });

const clientOptions = {
  clientKey: "client-key",
  clientSecret: "super-secret-value",
  redirectUri: "https://campaign.example.com/api/tiktok/callback",
};

const creatorInfo: TikTokCreatorInfo = {
  creatorUsername: "creator",
  creatorNickname: "Creator",
  privacyLevelOptions: ["SELF_ONLY", "PUBLIC_TO_EVERYONE"],
  commentDisabled: false,
  duetDisabled: false,
  stitchDisabled: true,
  maxVideoPostDurationSeconds: 600,
};

describe("TikTok OAuth", () => {
  it("builds an official Login Kit URL with state and S256 PKCE", () => {
    const codeVerifier = "a".repeat(64);
    const client = new TikTokClient(clientOptions);
    const request = client.createAuthorizationRequest({
      scopes: ["video.publish", "user.info.basic", "video.publish"],
      state: "csrf-state",
      codeVerifier,
      disableAutoAuth: true,
    });
    const url = new URL(request.url);

    expect(url.origin + url.pathname).toBe(
      "https://www.tiktok.com/v2/auth/authorize/",
    );
    expect(url.searchParams.get("client_key")).toBe("client-key");
    expect(url.searchParams.get("redirect_uri")).toBe(
      clientOptions.redirectUri,
    );
    expect(url.searchParams.get("scope")).toBe("user.info.basic,video.publish");
    expect(url.searchParams.get("state")).toBe("csrf-state");
    expect(url.searchParams.get("code_challenge_method")).toBe("S256");
    expect(url.searchParams.get("code_challenge")).toBe(
      createHash("sha256").update(codeVerifier).digest("base64url"),
    );
    expect(url.searchParams.get("disable_auto_auth")).toBe("1");
  });

  it("exchanges and refreshes tokens using form data, retaining rotation", async () => {
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(
        jsonResponse({
          access_token: "access-one",
          expires_in: 86_400,
          refresh_token: "refresh-one",
          refresh_expires_in: 31_536_000,
          open_id: "open-id",
          scope: "user.info.basic,video.list",
          token_type: "Bearer",
        }),
      )
      .mockResolvedValueOnce(
        jsonResponse({
          access_token: "access-two",
          expires_in: 86_400,
          refresh_token: "refresh-rotated",
          refresh_expires_in: 30_000_000,
          open_id: "open-id",
          scope: "user.info.basic,video.list",
          token_type: "Bearer",
        }),
      )
      .mockResolvedValueOnce(jsonResponse({}));
    const client = new TikTokClient({ ...clientOptions, fetch: fetchMock });

    const first = await client.exchangeCode(
      "authorization-code",
      "a".repeat(64),
    );
    const refreshed = await client.refreshToken(first.refreshToken);
    await client.revoke(refreshed.accessToken);

    expect(first.openId).toBe("open-id");
    expect(refreshed.refreshToken).toBe("refresh-rotated");
    expect(fetchMock).toHaveBeenCalledTimes(3);
    const tokenCall = fetchMock.mock.calls[0];
    expect(tokenCall?.[0]).toBe("https://open.tiktokapis.com/v2/oauth/token/");
    expect(tokenCall?.[1]?.body).toBeInstanceOf(URLSearchParams);
    expect(String(tokenCall?.[1]?.body)).toContain(
      "grant_type=authorization_code",
    );
    expect(String(tokenCall?.[1]?.body)).toContain("code_verifier=");
    expect(String(fetchMock.mock.calls[1]?.[1]?.body)).toContain(
      "refresh_token=refresh-one",
    );
    expect(String(fetchMock.mock.calls[2]?.[1]?.body)).toContain(
      "token=access-two",
    );
  });

  it("normalizes provider errors without including submitted secrets", async () => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(
      jsonResponse(
        {
          error: "invalid_grant",
          error_description: "Authorization code is invalid.",
          log_id: "provider-log",
        },
        400,
      ),
    );
    const client = new TikTokClient({ ...clientOptions, fetch: fetchMock });

    const error = await client
      .refreshToken("refresh-private")
      .catch((value) => value);
    expect(error).toBeInstanceOf(ProviderError);
    expect(error).toMatchObject({
      code: "invalid_grant",
      status: 400,
      logId: "provider-log",
      retryable: false,
    });
    expect(String(error)).not.toContain("refresh-private");
    expect(String(error)).not.toContain(clientOptions.clientSecret);
  });
});

describe("TikTok Display API", () => {
  it("reads runtime-validated user info and paginated videos", async () => {
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(
        ok({
          user: {
            open_id: "open-id",
            display_name: "Ada",
            follower_count: 42,
          },
        }),
      )
      .mockResolvedValueOnce(
        ok({
          videos: [{ id: "video-1", title: "Launch", view_count: 120 }],
          cursor: 1_723_000_000_000,
          has_more: true,
        }),
      )
      .mockResolvedValueOnce(
        ok({
          videos: [{ id: "video-1", share_url: "https://tiktok.com/v/1" }],
        }),
      );
    const client = new TikTokClient({ ...clientOptions, fetch: fetchMock });

    await expect(
      client.getUserInfo("access-token", [
        "open_id",
        "display_name",
        "follower_count",
      ]),
    ).resolves.toEqual({
      open_id: "open-id",
      display_name: "Ada",
      follower_count: 42,
    });
    await expect(
      client.listVideos("access-token", {
        fields: ["id", "title", "view_count"],
        cursor: 1_724_000_000_000,
        maxCount: 20,
      }),
    ).resolves.toEqual({
      videos: [{ id: "video-1", title: "Launch", view_count: 120 }],
      cursor: 1_723_000_000_000,
      hasMore: true,
    });
    await expect(
      client.queryVideos("access-token", ["video-1"], ["id", "share_url"]),
    ).resolves.toEqual([
      { id: "video-1", share_url: "https://tiktok.com/v/1" },
    ]);

    expect(fetchMock.mock.calls[1]?.[0]).toContain("/v2/video/list/");
    expect(JSON.parse(String(fetchMock.mock.calls[1]?.[1]?.body))).toEqual({
      cursor: 1_724_000_000_000,
      max_count: 20,
    });
    expect(JSON.parse(String(fetchMock.mock.calls[2]?.[1]?.body))).toEqual({
      filters: { video_ids: ["video-1"] },
    });
  });

  it("rejects malformed upstream objects", async () => {
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValue(ok({ user: { follower_count: "many" } }));
    const client = new TikTokClient({ ...clientOptions, fetch: fetchMock });

    await expect(
      client.getUserInfo("access-token", ["follower_count"]),
    ).rejects.toMatchObject({ code: "invalid_response" });
  });
});

describe("TikTok Content Posting API", () => {
  it("queries creator restrictions", async () => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(
      ok({
        creator_avatar_url: "https://cdn.example/avatar.jpg",
        creator_username: "creator",
        creator_nickname: "Creator",
        privacy_level_options: ["SELF_ONLY", "PUBLIC_TO_EVERYONE"],
        comment_disabled: false,
        duet_disabled: true,
        stitch_disabled: false,
        max_video_post_duration_sec: 600,
      }),
    );
    const client = new TikTokClient({ ...clientOptions, fetch: fetchMock });

    await expect(client.getCreatorInfo("access-token")).resolves.toMatchObject({
      creatorUsername: "creator",
      duetDisabled: true,
      maxVideoPostDurationSeconds: 600,
    });
  });

  it("initializes direct FILE_UPLOAD video after consent and choices", async () => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(
      ok({
        publish_id: "publish-1",
        upload_url:
          "https://open-upload.tiktokapis.com/video/?upload_id=1&upload_token=x",
      }),
    );
    const client = new TikTokClient({ ...clientOptions, fetch: fetchMock });

    await expect(
      client.initializeDirectVideo("access-token", {
        consent: true,
        creatorInfo,
        postInfo: {
          privacyLevel: "SELF_ONLY",
          title: "A launch #video",
          disableComment: false,
          disableDuet: false,
          disableStitch: true,
          brandContent: false,
          brandOrganic: true,
          isAigc: false,
        },
        sourceInfo: {
          source: "FILE_UPLOAD",
          videoSize: 50_000_123,
          chunkSize: 10_000_000,
          totalChunkCount: 5,
        },
      }),
    ).resolves.toEqual({
      publishId: "publish-1",
      uploadUrl:
        "https://open-upload.tiktokapis.com/video/?upload_id=1&upload_token=x",
    });
    expect(fetchMock.mock.calls[0]?.[0]).toBe(
      "https://open.tiktokapis.com/v2/post/publish/video/init/",
    );
    expect(
      JSON.parse(String(fetchMock.mock.calls[0]?.[1]?.body)),
    ).toMatchObject({
      post_info: {
        privacy_level: "SELF_ONLY",
        disable_stitch: true,
        brand_organic_toggle: true,
      },
      source_info: {
        source: "FILE_UPLOAD",
        video_size: 50_000_123,
        chunk_size: 10_000_000,
        total_chunk_count: 5,
      },
    });
  });

  it("initializes PULL_FROM_URL photo direct posts and media uploads", async () => {
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(ok({ publish_id: "photo-direct" }))
      .mockResolvedValueOnce(ok({ publish_id: "photo-upload" }));
    const client = new TikTokClient({ ...clientOptions, fetch: fetchMock });

    await client.initializePhoto("access-token", {
      consent: true,
      postMode: "DIRECT_POST",
      creatorInfo,
      postInfo: {
        title: "Album",
        description: "Summer photos",
        privacyLevel: "SELF_ONLY",
        disableComment: false,
        autoAddMusic: true,
        brandContent: false,
        brandOrganic: false,
      },
      sourceInfo: {
        source: "PULL_FROM_URL",
        photoImages: ["https://media.example.com/one.jpg"],
        photoCoverIndex: 0,
      },
    });
    await client.initializePhoto("access-token", {
      consent: true,
      postMode: "MEDIA_UPLOAD",
      postInfo: { title: "Draft" },
      sourceInfo: {
        source: "PULL_FROM_URL",
        photoImages: ["https://media.example.com/draft.jpg"],
        photoCoverIndex: 0,
      },
    });

    const direct = JSON.parse(String(fetchMock.mock.calls[0]?.[1]?.body));
    const upload = JSON.parse(String(fetchMock.mock.calls[1]?.[1]?.body));
    expect(direct).toMatchObject({
      media_type: "PHOTO",
      post_mode: "DIRECT_POST",
      post_info: { privacy_level: "SELF_ONLY", auto_add_music: true },
      source_info: { source: "PULL_FROM_URL", photo_cover_index: 0 },
    });
    expect(upload).toMatchObject({
      media_type: "PHOTO",
      post_mode: "MEDIA_UPLOAD",
      post_info: { title: "Draft" },
    });
    expect(upload.post_info).not.toHaveProperty("privacy_level");
  });

  it("enforces consent, current privacy options, and interaction settings", async () => {
    const client = new TikTokClient({
      ...clientOptions,
      fetch: vi.fn<typeof fetch>(),
    });
    const base = {
      creatorInfo,
      postInfo: {
        privacyLevel: "SELF_ONLY" as const,
        disableComment: false,
        disableDuet: false,
        disableStitch: true,
        brandContent: false,
        brandOrganic: false,
      },
      sourceInfo: {
        source: "PULL_FROM_URL" as const,
        videoUrl: "https://media.example.com/video.mp4",
      },
    };

    await expect(
      client.initializeDirectVideo("access-token", {
        ...base,
        consent: false as true,
      }),
    ).rejects.toMatchObject({ code: "consent_required" });
    await expect(
      client.initializeDirectVideo("access-token", {
        ...base,
        consent: true,
        postInfo: { ...base.postInfo, privacyLevel: "FOLLOWER_OF_CREATOR" },
      }),
    ).rejects.toMatchObject({ code: "privacy_level_option_mismatch" });
    await expect(
      client.initializeDirectVideo("access-token", {
        ...base,
        consent: true,
        postInfo: { ...base.postInfo, disableStitch: false },
      }),
    ).rejects.toMatchObject({ code: "interaction_not_allowed" });
  });

  it("validates upload plans and sends exact chunk headers", async () => {
    expect(() =>
      validateVideoUploadPlan({
        videoSize: 4_000_000,
        chunkSize: 4_000_000,
        totalChunkCount: 1,
      }),
    ).not.toThrow();
    expect(() =>
      validateVideoUploadPlan({
        videoSize: 50_000_123,
        chunkSize: 10_000_000,
        totalChunkCount: 4,
      }),
    ).toThrow(/totalChunkCount/u);

    const fetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValue(new Response(null, { status: 206 }));
    const client = new TikTokClient({ ...clientOptions, fetch: fetchMock });
    await expect(
      client.uploadChunk({
        uploadUrl:
          "https://open-upload.tiktokapis.com/video/?upload_id=1&upload_token=x",
        chunk: new Uint8Array([1, 2, 3]),
        startByte: 10,
        totalBytes: 20,
        contentType: "video/mp4",
      }),
    ).resolves.toEqual({ complete: false, uploadedThroughByte: 12 });

    const headers = new Headers(fetchMock.mock.calls[0]?.[1]?.headers);
    expect(headers.get("content-length")).toBe("3");
    expect(headers.get("content-range")).toBe("bytes 10-12/20");
  });

  it("rejects an attacker-controlled upload host", async () => {
    const client = new TikTokClient({
      ...clientOptions,
      fetch: vi.fn<typeof fetch>(),
    });
    await expect(
      client.uploadChunk({
        uploadUrl: "https://evil.example/video?token=secret",
        chunk: new Uint8Array([1]),
        startByte: 0,
        totalBytes: 1,
        contentType: "video/mp4",
      }),
    ).rejects.toMatchObject({ code: "invalid_upload_url" });
  });

  it("fetches a normalized publish status", async () => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(
      ok({
        status: "PUBLISH_COMPLETE",
        publicaly_available_post_id: [123456789],
        uploaded_bytes: 10_000,
      }),
    );
    const client = new TikTokClient({ ...clientOptions, fetch: fetchMock });
    await expect(
      client.getPublishStatus("access", "publish-id"),
    ).resolves.toEqual({
      status: "PUBLISH_COMPLETE",
      failReason: undefined,
      publiclyAvailablePostIds: ["123456789"],
      uploadedBytes: 10_000,
      downloadedBytes: undefined,
    });
  });
});

describe("TikTok webhook signatures", () => {
  it("parses repeated signatures and verifies timestamp.rawBody HMAC", () => {
    const timestamp = 1_723_555_000;
    const rawBody = '{"event":"post.publish.complete"}';
    const signature = createHmac("sha256", clientOptions.clientSecret)
      .update(`${timestamp}.${rawBody}`)
      .digest("hex");
    const header = `t=${timestamp},s=${"0".repeat(64)},s=${signature}`;

    expect(parseTikTokSignature(header)).toEqual({
      timestamp,
      signatures: ["0".repeat(64), signature],
    });
    expect(
      verifyTikTokSignature({
        header,
        rawBody,
        clientSecret: clientOptions.clientSecret,
        now: timestamp * 1_000 + 10_000,
      }),
    ).toBe(true);
    expect(
      verifyTikTokSignature({
        header,
        rawBody: `${rawBody} `,
        clientSecret: clientOptions.clientSecret,
        now: timestamp * 1_000,
      }),
    ).toBe(false);
  });

  it("rejects replayed and malformed signatures", () => {
    const timestamp = 1_723_555_000;
    const signature = createHmac("sha256", clientOptions.clientSecret)
      .update(`${timestamp}.{}`)
      .digest("hex");

    expect(
      verifyTikTokSignature({
        header: `t=${timestamp},s=${signature}`,
        rawBody: "{}",
        clientSecret: clientOptions.clientSecret,
        now: (timestamp + 301) * 1_000,
      }),
    ).toBe(false);
    expect(() => parseTikTokSignature("t=bad,s=nope")).toThrow(ProviderError);
  });
});
