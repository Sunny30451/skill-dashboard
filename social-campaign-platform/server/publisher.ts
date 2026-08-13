import { Readable } from "node:stream";
import type { RuntimeConfig } from "./config.js";
import type { Database } from "./database.js";
import {
  MetaGraphClient,
  type MetaContainerStatus,
} from "./integrations/meta.js";
import { TikTokClient } from "./integrations/tiktok.js";
import {
  initiateYouTubeResumableUpload,
  refreshYouTubeAccessToken,
  uploadYouTubeResumableChunk,
  validateYouTubePublishMetadata,
} from "./integrations/youtube.js";
import type { JobExecutor } from "./jobs.js";
import type { ObjectStorage } from "./storage.js";
import { decryptSecret, encryptSecret } from "./security.js";

interface ConnectionRow {
  id: string;
  provider: "youtube" | "meta" | "tiktok";
  account_type: string;
  provider_account_id: string;
  access_token_encrypted: string;
  refresh_token_encrypted: string | null;
  expires_at: Date | null;
  metadata: Record<string, unknown>;
}

interface MediaRow {
  object_key: string;
  mime_type: string;
  size_bytes: string;
}

function text(value: unknown, name: string, maximum = 100_000): string {
  if (typeof value !== "string" || !value.trim() || value.length > maximum) {
    throw new Error(`${name} ist ungültig.`);
  }
  return value.trim();
}

function boolean(value: unknown, fallback: boolean): boolean {
  return typeof value === "boolean" ? value : fallback;
}

function record(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("Publish-Payload ist ungültig.");
  }
  return value as Record<string, unknown>;
}

async function responseBody(response: Response): Promise<Readable> {
  if (!response.ok || !response.body) {
    throw new Error(`Medienabruf fehlgeschlagen (${response.status}).`);
  }
  return Readable.fromWeb(response.body as never);
}

async function media(
  database: Database,
  storage: ObjectStorage,
  mediaId: string,
): Promise<{ row: MediaRow; url: string }> {
  const result = await database.query<MediaRow>(
    "SELECT object_key, mime_type, size_bytes::text FROM media_objects WHERE id = $1",
    [mediaId],
  );
  const row = result.rows[0];
  if (!row) throw new Error("Mediendatei nicht gefunden.");
  return { row, url: await storage.providerUrl(row.object_key) };
}

async function accessToken(
  database: Database,
  config: RuntimeConfig,
  connection: ConnectionRow,
): Promise<string> {
  let token = decryptSecret(
    connection.access_token_encrypted,
    config.tokenEncryptionKey,
  );
  if (
    !connection.expires_at ||
    connection.expires_at.getTime() > Date.now() + 60_000
  ) {
    return token;
  }
  if (!connection.refresh_token_encrypted)
    throw new Error("Provider-Token ist abgelaufen; erneut verbinden.");
  const refresh = decryptSecret(
    connection.refresh_token_encrypted,
    config.tokenEncryptionKey,
  );
  if (connection.provider === "youtube") {
    const clientId = text(process.env.YOUTUBE_CLIENT_ID, "YOUTUBE_CLIENT_ID");
    const clientSecret = text(
      process.env.YOUTUBE_CLIENT_SECRET,
      "YOUTUBE_CLIENT_SECRET",
    );
    const next = await refreshYouTubeAccessToken({
      clientId,
      clientSecret,
      refreshToken: refresh,
    });
    token = next.accessToken;
    await database.query(
      `UPDATE provider_connections SET access_token_encrypted = $1,
       refresh_token_encrypted = $2, expires_at = now() + ($3 * interval '1 second'),
       updated_at = now() WHERE id = $4`,
      [
        encryptSecret(token, config.tokenEncryptionKey),
        encryptSecret(next.refreshToken, config.tokenEncryptionKey),
        next.expiresInSeconds,
        connection.id,
      ],
    );
    return token;
  }
  if (connection.provider === "tiktok") {
    const client = new TikTokClient({
      clientKey: text(process.env.TIKTOK_CLIENT_KEY, "TIKTOK_CLIENT_KEY"),
      clientSecret: text(
        process.env.TIKTOK_CLIENT_SECRET,
        "TIKTOK_CLIENT_SECRET",
      ),
      redirectUri: `${config.publicBaseUrl}/api/social/tiktok/callback`,
    });
    const next = await client.refreshToken(refresh);
    token = next.accessToken;
    await database.query(
      `UPDATE provider_connections SET access_token_encrypted = $1,
       refresh_token_encrypted = $2, expires_at = now() + ($3 * interval '1 second'),
       updated_at = now() WHERE id = $4`,
      [
        encryptSecret(token, config.tokenEncryptionKey),
        encryptSecret(next.refreshToken, config.tokenEncryptionKey),
        next.expiresIn,
        connection.id,
      ],
    );
    return token;
  }
  throw new Error("Meta-Token ist abgelaufen; Verbindung erneuern.");
}

async function publishYouTube(
  database: Database,
  storage: ObjectStorage,
  config: RuntimeConfig,
  connection: ConnectionRow,
  payload: Record<string, unknown>,
) {
  const token = await accessToken(database, config, connection);
  const mediaId = text(payload.mediaId, "mediaId", 100);
  const stored = await media(database, storage, mediaId);
  const metadata = validateYouTubePublishMetadata({
    title: text(payload.title, "title", 100),
    description:
      typeof payload.description === "string" ? payload.description : "",
    privacyStatus:
      payload.privacyStatus === "public" || payload.privacyStatus === "unlisted"
        ? payload.privacyStatus
        : "private",
    madeForKids: boolean(payload.madeForKids, false),
    ...(typeof payload.publishAt === "string"
      ? { publishAt: payload.publishAt }
      : {}),
    ...(typeof payload.containsSyntheticMedia === "boolean"
      ? { containsSyntheticMedia: payload.containsSyntheticMedia }
      : {}),
  });
  const size = Number(stored.row.size_bytes);
  const session = await initiateYouTubeResumableUpload({
    accessToken: token,
    metadata,
    contentLength: size,
    contentType: stored.row.mime_type,
  });
  const source = await fetch(stored.url);
  const body = await responseBody(source);
  let offset = 0;
  const maximumChunk = 8 * 1024 * 1024;
  let pending = Buffer.alloc(0);
  for await (const chunk of body) {
    pending = Buffer.concat([pending, Buffer.from(chunk)]);
    while (
      pending.length >= maximumChunk ||
      (offset + pending.length === size && pending.length > 0)
    ) {
      const length = Math.min(maximumChunk, pending.length);
      const next = pending.subarray(0, length);
      pending = pending.subarray(length);
      const progress = await uploadYouTubeResumableChunk({
        accessToken: token,
        uploadUrl: session.uploadUrl,
        chunk: next,
        startByte: offset,
        totalBytes: size,
        contentType: stored.row.mime_type,
      });
      offset += length;
      if (progress.status === "complete")
        return { externalId: progress.video.id, video: progress.video };
    }
  }
  throw new Error("YouTube-Upload wurde nicht abgeschlossen.");
}

async function publishMeta(
  database: Database,
  storage: ObjectStorage,
  config: RuntimeConfig,
  connection: ConnectionRow,
  payload: Record<string, unknown>,
) {
  const token = await accessToken(database, config, connection);
  const client = new MetaGraphClient({
    appId: text(process.env.META_APP_ID, "META_APP_ID"),
    appSecret: text(process.env.META_APP_SECRET, "META_APP_SECRET"),
  });
  const message = typeof payload.content === "string" ? payload.content : "";
  if (!payload.mediaId) {
    const result =
      typeof payload.link === "string"
        ? await client.publishPageLink({
            pageId: connection.provider_account_id,
            pageAccessToken: token,
            message,
            link: payload.link,
          })
        : await client.publishPageText({
            pageId: connection.provider_account_id,
            pageAccessToken: token,
            message,
          });
    return { externalId: result.id };
  }
  const stored = await media(
    database,
    storage,
    text(payload.mediaId, "mediaId", 100),
  );
  if (connection.account_type === "instagram") {
    const container = await client.createInstagramMediaContainer({
      instagramAccountId: connection.provider_account_id,
      accessToken: token,
      mediaType: stored.row.mime_type.startsWith("video/") ? "REELS" : "IMAGE",
      ...(stored.row.mime_type.startsWith("video/")
        ? { videoUrl: stored.url }
        : { imageUrl: stored.url }),
      caption: message,
    });
    let status: MetaContainerStatus | undefined;
    for (let attempt = 0; attempt < 30; attempt += 1) {
      status = await client.getInstagramContainerStatus({
        containerId: container.id,
        accessToken: token,
      });
      if (status.statusCode === "FINISHED") break;
      if (status.statusCode === "ERROR" || status.statusCode === "EXPIRED") {
        throw new Error(`Instagram-Container: ${status.statusCode}`);
      }
      await new Promise((resolve) => {
        const timer = setTimeout(resolve, 2_000);
        timer.unref();
      });
    }
    if (status?.statusCode !== "FINISHED")
      throw new Error("Instagram-Verarbeitung dauert zu lange.");
    const result = await client.publishInstagramMedia({
      instagramAccountId: connection.provider_account_id,
      accessToken: token,
      creationId: container.id,
    });
    return { externalId: result.id };
  }
  const result = await client.publishPagePhoto({
    pageId: connection.provider_account_id,
    pageAccessToken: token,
    imageUrl: stored.url,
    caption: message,
  });
  return { externalId: result.id };
}

async function publishTikTok(
  database: Database,
  storage: ObjectStorage,
  config: RuntimeConfig,
  connection: ConnectionRow,
  payload: Record<string, unknown>,
) {
  const token = await accessToken(database, config, connection);
  const client = new TikTokClient({
    clientKey: text(process.env.TIKTOK_CLIENT_KEY, "TIKTOK_CLIENT_KEY"),
    clientSecret: text(
      process.env.TIKTOK_CLIENT_SECRET,
      "TIKTOK_CLIENT_SECRET",
    ),
    redirectUri: `${config.publicBaseUrl}/api/social/tiktok/callback`,
  });
  const creatorInfo = await client.getCreatorInfo(token);
  const stored = await media(
    database,
    storage,
    text(payload.mediaId, "mediaId", 100),
  );
  if (!stored.row.mime_type.startsWith("video/")) {
    const result = await client.initializePhoto(token, {
      consent: true,
      postMode: "DIRECT_POST",
      creatorInfo,
      postInfo: {
        title: typeof payload.title === "string" ? payload.title : undefined,
        description:
          typeof payload.content === "string" ? payload.content : undefined,
        privacyLevel: payload.privacyLevel as never,
        disableComment: boolean(payload.disableComment, false),
        autoAddMusic: boolean(payload.autoAddMusic, false),
        brandContent: boolean(payload.brandContent, false),
        brandOrganic: boolean(payload.brandOrganic, false),
      },
      sourceInfo: {
        source: "PULL_FROM_URL",
        photoImages: [stored.url],
        photoCoverIndex: 0,
      },
    });
    return { externalId: result.publishId };
  }
  const result = await client.initializeDirectVideo(token, {
    consent: true,
    creatorInfo,
    postInfo: {
      privacyLevel: payload.privacyLevel as never,
      title: typeof payload.title === "string" ? payload.title : undefined,
      disableDuet: boolean(payload.disableDuet, false),
      disableComment: boolean(payload.disableComment, false),
      disableStitch: boolean(payload.disableStitch, false),
      brandContent: boolean(payload.brandContent, false),
      brandOrganic: boolean(payload.brandOrganic, false),
      isAigc: boolean(payload.isAigc, false),
    },
    sourceInfo: { source: "PULL_FROM_URL", videoUrl: stored.url },
  });
  return { externalId: result.publishId };
}

export function createProviderJobExecutor(
  database: Database,
  storage: ObjectStorage,
  config: RuntimeConfig,
): JobExecutor {
  return async (job) => {
    if (!job.connection_id || !job.provider)
      throw new Error("Publish-Job hat keine Provider-Verbindung.");
    const result = await database.query<ConnectionRow>(
      "SELECT * FROM provider_connections WHERE id = $1 AND status = 'connected'",
      [job.connection_id],
    );
    const connection = result.rows[0];
    if (!connection || connection.provider !== job.provider) {
      throw new Error("Provider-Verbindung wurde nicht gefunden.");
    }
    const payload = record(job.payload);
    if (job.provider === "youtube") {
      return publishYouTube(database, storage, config, connection, payload);
    }
    if (job.provider === "meta") {
      return publishMeta(database, storage, config, connection, payload);
    }
    return publishTikTok(database, storage, config, connection, payload);
  };
}
