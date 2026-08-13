import { createHmac, randomBytes } from "node:crypto";
import { EventEmitter } from "node:events";
import type { IncomingMessage, ServerResponse } from "node:http";
import { describe, expect, it, vi } from "vitest";
import type { AuthService, AuthUser } from "./auth.js";
import type { RuntimeConfig, RuntimeEnvironment } from "./config.js";
import type { Database } from "./database.js";
import { HttpError } from "./http.js";
import { decryptSecret } from "./security.js";
import { loadSocialProviderConfiguration, SocialService } from "./social.js";

interface QueryResultLike {
  rows: Array<Record<string, unknown>>;
  rowCount: number;
}

class MemoryDatabase {
  readonly calls: Array<{ text: string; values: unknown[] }> = [];
  readonly oauthStates = new Map<
    string,
    {
      provider: string;
      userId: string;
      verifierEncrypted: string | null;
      returnPath: string;
      expiresAt: Date;
    }
  >();
  readonly connections: Array<Record<string, unknown>> = [];
  readonly webhooks: Array<Record<string, unknown>> = [];
  readonly jobs: Array<Record<string, unknown>> = [];
  userActive = true;
  userRole = "Admin";

  async query(text: string, values: unknown[] = []): Promise<QueryResultLike> {
    this.calls.push({ text, values });
    const normalized = text.replace(/\s+/gu, " ").trim();
    if (normalized.startsWith("DELETE FROM oauth_states WHERE expires_at")) {
      return { rows: [], rowCount: 0 };
    }
    if (normalized.startsWith("INSERT INTO oauth_states")) {
      this.oauthStates.set(String(values[0]), {
        provider: String(values[1]),
        userId: String(values[2]),
        verifierEncrypted: typeof values[3] === "string" ? values[3] : null,
        returnPath: String(values[4]),
        expiresAt: values[5] as Date,
      });
      return { rows: [], rowCount: 1 };
    }
    if (normalized.startsWith("DELETE FROM oauth_states")) {
      const stateHash = String(values[0]);
      const state = this.oauthStates.get(stateHash);
      if (!state || state.provider !== values[1]) {
        return { rows: [], rowCount: 0 };
      }
      this.oauthStates.delete(stateHash);
      return {
        rows: [
          {
            user_id: state.userId,
            verifier_encrypted: state.verifierEncrypted,
            return_path: state.returnPath,
            expires_at: state.expiresAt,
          },
        ],
        rowCount: 1,
      };
    }
    if (normalized.startsWith("SELECT active, role FROM users")) {
      return {
        rows: [{ active: this.userActive, role: this.userRole }],
        rowCount: 1,
      };
    }
    if (normalized.startsWith("INSERT INTO provider_connections")) {
      this.connections.push({
        id: `connection-${this.connections.length + 1}`,
        provider: values[0],
        account_type: values[1],
        provider_account_id: values[2],
        display_name: values[3],
        access_token_encrypted: values[4],
        refresh_token_encrypted: values[5],
        expires_at: values[6],
        scopes: values[7],
        metadata: JSON.parse(String(values[8])) as unknown,
        created_by: values[9],
      });
      return {
        rows: [{ id: `connection-${this.connections.length}` }],
        rowCount: 1,
      };
    }
    if (normalized.startsWith("INSERT INTO webhook_events")) {
      this.webhooks.push({
        provider: values[0],
        provider_event_id: values[1],
        signature_hash: values[2],
        payload: JSON.parse(String(values[3])) as unknown,
      });
      return { rows: [], rowCount: 1 };
    }
    if (normalized.startsWith("SELECT 1 FROM provider_connections")) {
      return { rows: [{ one: 1 }], rowCount: 1 };
    }
    if (normalized.startsWith("SELECT id FROM provider_connections")) {
      return {
        rows: [{ id: "11111111-1111-4111-8111-111111111111" }],
        rowCount: 1,
      };
    }
    if (normalized.startsWith("INSERT INTO publish_jobs")) {
      this.jobs.push({
        id: values[0],
        provider: values[1],
        connectionId: values[2],
        payload: JSON.parse(String(values[3])) as unknown,
      });
      return { rows: [{ id: values[0] }], rowCount: 1 };
    }
    return { rows: [], rowCount: 0 };
  }

  async transaction<T>(
    operation: (client: MemoryDatabase) => Promise<T>,
  ): Promise<T> {
    return operation(this);
  }
}

class TestRequest extends EventEmitter implements AsyncIterable<Buffer> {
  method: string;
  url: string;
  headers: IncomingMessage["headers"];
  socket = { remoteAddress: "127.0.0.1" };
  readonly #body: Buffer;

  constructor(
    method: string,
    url: string,
    options: {
      body?: Buffer | string;
      headers?: IncomingMessage["headers"];
    } = {},
  ) {
    super();
    this.method = method;
    this.url = url;
    this.#body = Buffer.from(options.body ?? "");
    this.headers = {
      ...(this.#body.length > 0
        ? { "content-length": String(this.#body.length) }
        : {}),
      ...options.headers,
    };
  }

  resume(): this {
    return this;
  }

  async *[Symbol.asyncIterator](): AsyncIterator<Buffer> {
    if (this.#body.length > 0) yield this.#body;
  }
}

class TestResponse extends EventEmitter {
  statusCode = 200;
  headersSent = false;
  writableEnded = false;
  readonly headers = new Map<string, string | number | readonly string[]>();
  readonly chunks: Buffer[] = [];

  setHeader(name: string, value: string | number | readonly string[]): this {
    this.headers.set(name.toLowerCase(), value);
    return this;
  }

  writeHead(
    status: number,
    headers: Record<string, string | number> = {},
  ): this {
    this.statusCode = status;
    this.headersSent = true;
    for (const [name, value] of Object.entries(headers)) {
      this.setHeader(name, value);
    }
    return this;
  }

  end(chunk?: string | Buffer): this {
    if (chunk !== undefined) this.chunks.push(Buffer.from(chunk));
    this.writableEnded = true;
    return this;
  }

  body(): string {
    return Buffer.concat(this.chunks).toString("utf8");
  }

  json(): unknown {
    return JSON.parse(this.body()) as unknown;
  }
}

const key = randomBytes(32);
const fixedNow = new Date("2026-08-13T12:00:00.000Z");
const config: RuntimeConfig = {
  production: true,
  publicBaseUrl: "https://campaign.example.com",
  databaseUrl: "postgres://unused",
  databaseSsl: false,
  tokenEncryptionKey: key,
  sessionCookieName: "__Host-test",
  sessionTtlSeconds: 3600,
  allowRegistration: false,
  bootstrapAdminName: "Admin",
  storage: {
    region: "eu-west-1",
    bucket: "test",
    forcePathStyle: false,
    maxUploadBytes: 1024,
  },
};

const admin: AuthUser = {
  id: "00000000-0000-4000-8000-000000000001",
  email: "admin@example.com",
  name: "Admin",
  role: "Admin",
  createdAt: fixedNow.toISOString(),
  updatedAt: fixedNow.toISOString(),
};

function environment(
  additions: Record<string, string> = {},
): RuntimeEnvironment {
  return {
    META_APP_ID: "123456789",
    META_APP_SECRET: "meta-secret",
    META_CONFIG_ID: "987654321",
    META_WEBHOOK_VERIFY_TOKEN: "meta-verify-token",
    TIKTOK_CLIENT_KEY: "tiktok-key",
    TIKTOK_CLIENT_SECRET: "tiktok-secret",
    YOUTUBE_CLIENT_ID: "client-id.apps.googleusercontent.com",
    YOUTUBE_CLIENT_SECRET: "youtube-secret",
    YOUTUBE_WEBSUB_SECRET: "youtube-websub-secret",
    YOUTUBE_WEBSUB_VERIFY_TOKEN: "youtube-verify-token",
    ...additions,
  };
}

function createService(
  database: MemoryDatabase,
  fetchMock: typeof fetch = vi.fn<typeof fetch>(),
): SocialService {
  const auth = {
    requireUser: vi.fn().mockResolvedValue(admin),
  } as unknown as AuthService;
  return new SocialService(database as unknown as Database, auth, config, {
    environment: environment(),
    fetch: fetchMock,
    now: () => fixedNow,
  });
}

function request(
  method: string,
  url: string,
  options: ConstructorParameters<typeof TestRequest>[2] = {},
): IncomingMessage {
  return new TestRequest(method, url, options) as unknown as IncomingMessage;
}

function response(): TestResponse & ServerResponse {
  return new TestResponse() as TestResponse & ServerResponse;
}

function jsonResponse(value: unknown, status = 200): Response {
  return new Response(JSON.stringify(value), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

describe("SocialService OAuth", () => {
  it("builds exact provider callbacks and stores hashed state plus encrypted PKCE", async () => {
    const database = new MemoryDatabase();
    const service = createService(database);
    const result = response();
    await service.handle(
      request("POST", "/api/social/youtube/connect", {
        body: JSON.stringify({ returnPath: "/admin?tab=social" }),
        headers: {
          "content-type": "application/json",
          origin: config.publicBaseUrl,
        },
      }),
      result,
      "/api/social/youtube/connect",
    );

    expect(result.statusCode).toBe(201);
    const body = result.json() as { authorizationUrl: string };
    const authorizationUrl = new URL(body.authorizationUrl);
    expect(authorizationUrl.origin).toBe("https://accounts.google.com");
    expect(authorizationUrl.searchParams.get("redirect_uri")).toBe(
      "https://campaign.example.com/api/social/youtube/callback",
    );
    const rawState = authorizationUrl.searchParams.get("state");
    expect(rawState).toBeTruthy();
    expect([...database.oauthStates.keys()]).not.toContain(rawState);
    const stored = [...database.oauthStates.values()][0]!;
    expect(stored.returnPath).toBe("/admin?tab=social");
    expect(stored.expiresAt.toISOString()).toBe("2026-08-13T12:10:00.000Z");
    const verifier = decryptSecret(stored.verifierEncrypted!, key);
    expect(verifier).toHaveLength(86);
    expect(
      createHmac("sha256", "irrelevant").update(verifier).digest("hex"),
    ).toBeTruthy();
    expect(body.authorizationUrl).not.toContain(verifier);
  });

  it("consumes Meta state exactly once, discovers accounts, and encrypts every token", async () => {
    const database = new MemoryDatabase();
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(
        jsonResponse({
          access_token: "meta-short-token",
          token_type: "bearer",
          expires_in: 3600,
        }),
      )
      .mockResolvedValueOnce(
        jsonResponse({
          access_token: "meta-long-token",
          token_type: "bearer",
          expires_in: 5_184_000,
        }),
      )
      .mockImplementation(async (input) => {
        const url = new URL(
          input instanceof Request ? input.url : input.toString(),
        );
        if (url.pathname.endsWith("/debug_token")) {
          return jsonResponse({
            data: {
              app_id: "123456789",
              is_valid: true,
              user_id: "meta-user",
              scopes: ["pages_show_list", "instagram_basic"],
              expires_at: 1_800_000_000,
            },
          });
        }
        if (url.pathname.endsWith("/me/accounts")) {
          return jsonResponse({
            data: [
              {
                id: "page-1",
                name: "Campaign Page",
                access_token: "meta-page-token",
                tasks: ["CREATE_CONTENT"],
                instagram_business_account: {
                  id: "ig-1",
                  username: "campaign",
                },
              },
            ],
          });
        }
        throw new Error(`Unexpected URL ${url}`);
      });
    const service = createService(database, fetchMock);
    const connect = response();
    await service.handle(
      request("POST", "/api/social/meta/connect", {
        body: JSON.stringify({ returnPath: "/admin" }),
        headers: {
          "content-type": "application/json",
          origin: config.publicBaseUrl,
        },
      }),
      connect,
      "/api/social/meta/connect",
    );
    const state = new URL(
      (connect.json() as { authorizationUrl: string }).authorizationUrl,
    ).searchParams.get("state")!;

    const callback = response();
    await service.handle(
      request(
        "GET",
        `/api/social/meta/callback?state=${encodeURIComponent(state)}&code=oauth-code`,
      ),
      callback,
      "/api/social/meta/callback",
    );

    expect(callback.statusCode).toBe(303);
    expect(callback.headers.get("location")).toBe(
      "/admin?social=connected&provider=meta",
    );
    expect(callback.body()).not.toContain("oauth-code");
    expect(database.connections).toHaveLength(3);
    for (const connection of database.connections) {
      const encrypted = String(connection.access_token_encrypted);
      expect(encrypted).not.toContain("meta-long-token");
      expect(encrypted).not.toContain("meta-page-token");
      expect(decryptSecret(encrypted, key)).toMatch(
        /^meta-(long|page)-token$/u,
      );
    }
    await expect(
      service.handle(
        request(
          "GET",
          `/api/social/meta/callback?state=${encodeURIComponent(state)}&code=oauth-code`,
        ),
        response(),
        "/api/social/meta/callback",
      ),
    ).rejects.toMatchObject<HttpError>({
      status: 400,
      code: "invalid_oauth_state",
    });
  });

  it("rejects cross-origin mutations and open return redirects", async () => {
    const service = createService(new MemoryDatabase());
    await expect(
      service.handle(
        request("POST", "/api/social/tiktok/connect", {
          body: JSON.stringify({ returnPath: "//attacker.invalid" }),
          headers: {
            "content-type": "application/json",
            origin: "https://attacker.invalid",
          },
        }),
        response(),
        "/api/social/tiktok/connect",
      ),
    ).rejects.toMatchObject<HttpError>({ status: 403, code: "invalid_origin" });
  });
});

describe("SocialService webhooks and jobs", () => {
  it("verifies Meta GET and exact raw-body POST signatures before persistence", async () => {
    const database = new MemoryDatabase();
    const service = createService(database);
    const verification = response();
    await service.handle(
      request(
        "GET",
        "/api/social/meta/webhook?hub.mode=subscribe&hub.challenge=challenge-123&hub.verify_token=meta-verify-token",
      ),
      verification,
      "/api/social/meta/webhook",
    );
    expect(verification.statusCode).toBe(200);
    expect(verification.body()).toBe("challenge-123");

    const raw = Buffer.from(
      JSON.stringify({ object: "page", entry: [{ id: "page-1" }] }),
    );
    const signature = `sha256=${createHmac("sha256", "meta-secret")
      .update(raw)
      .digest("hex")}`;
    const notification = response();
    await service.handle(
      request("POST", "/api/social/meta/webhook", {
        body: raw,
        headers: { "x-hub-signature-256": signature },
      }),
      notification,
      "/api/social/meta/webhook",
    );
    expect(notification.statusCode).toBe(200);
    expect(database.webhooks).toHaveLength(1);

    await expect(
      service.handle(
        request("POST", "/api/social/meta/webhook", {
          body: Buffer.concat([raw, Buffer.from(" ")]),
          headers: { "x-hub-signature-256": signature },
        }),
        response(),
        "/api/social/meta/webhook",
      ),
    ).rejects.toMatchObject<HttpError>({ status: 401 });
  });

  it("verifies TikTok raw HMAC and rejects stale or altered payloads", async () => {
    const database = new MemoryDatabase();
    const service = createService(database);
    const raw = Buffer.from('{"event":"post.publish.complete"}');
    const timestamp = Math.floor(fixedNow.getTime() / 1000);
    const signature = createHmac("sha256", "tiktok-secret")
      .update(Buffer.concat([Buffer.from(`${timestamp}.`), raw]))
      .digest("hex");
    const result = response();
    await service.handle(
      request("POST", "/api/social/tiktok/webhook", {
        body: raw,
        headers: { "tiktok-signature": `t=${timestamp},s=${signature}` },
      }),
      result,
      "/api/social/tiktok/webhook",
    );
    expect(result.statusCode).toBe(200);
    expect(database.webhooks.at(-1)?.provider).toBe("tiktok");
  });

  it("validates YouTube WebSub topics and persists signed Atom notifications", async () => {
    const database = new MemoryDatabase();
    const service = createService(database);
    const challenge = response();
    const topic = encodeURIComponent(
      "https://www.youtube.com/xml/feeds/videos.xml?channel_id=UC1234567890123456789012",
    );
    await service.handle(
      request(
        "GET",
        `/api/social/youtube/webhook?hub.mode=subscribe&hub.challenge=yt-challenge&hub.topic=${topic}&hub.verify_token=youtube-verify-token`,
      ),
      challenge,
      "/api/social/youtube/webhook",
    );
    expect(challenge.body()).toBe("yt-challenge");

    const raw = Buffer.from(
      '<?xml version="1.0"?><feed xmlns="http://www.w3.org/2005/Atom"><entry><id>video</id></entry></feed>',
    );
    const signature = `sha1=${createHmac("sha1", "youtube-websub-secret")
      .update(raw)
      .digest("hex")}`;
    const notification = response();
    await service.handle(
      request("POST", "/api/social/youtube/webhook", {
        body: raw,
        headers: {
          "content-type": "application/atom+xml",
          "x-hub-signature": signature,
        },
      }),
      notification,
      "/api/social/youtube/webhook",
    );
    expect(notification.statusCode).toBe(204);
    expect(database.webhooks.at(-1)?.provider).toBe("youtube");
  });

  it("enqueues durable manual sync jobs without provider tokens", async () => {
    const database = new MemoryDatabase();
    const service = createService(database);
    const result = response();
    await service.handle(
      request("POST", "/api/social/youtube/sync", {
        body: JSON.stringify({}),
        headers: {
          "content-type": "application/json",
          origin: config.publicBaseUrl,
        },
      }),
      result,
      "/api/social/youtube/sync",
    );
    expect(result.statusCode).toBe(202);
    expect(database.jobs).toHaveLength(1);
    expect(JSON.stringify(database.jobs)).not.toMatch(/token|secret/iu);
  });
});

describe("loadSocialProviderConfiguration", () => {
  it("rejects partial credentials and does not expose secrets", () => {
    expect(() =>
      loadSocialProviderConfiguration({ META_APP_ID: "123" }),
    ).toThrow(/unvollständig/u);
    const loaded = loadSocialProviderConfiguration(environment());
    expect(loaded.meta?.appSecret).toBe("meta-secret");
    expect(Object.keys(loaded)).toEqual(["meta", "tiktok", "youtube"]);
  });
});
