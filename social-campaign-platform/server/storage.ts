import { randomUUID } from "node:crypto";
import type { IncomingMessage, ServerResponse } from "node:http";
import { Readable } from "node:stream";
import {
  CreateBucketCommand,
  DeleteObjectCommand,
  GetObjectCommand,
  HeadBucketCommand,
  PutObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import Busboy from "busboy";
import type { AuthService } from "./auth.js";
import type { RuntimeConfig } from "./config.js";
import type { Database } from "./database.js";
import { HttpError, requireMethod, sendJson } from "./http.js";

const SAFE_MIME_TYPES = new Set([
  "image/jpeg",
  "image/png",
  "image/gif",
  "image/webp",
  "video/mp4",
  "video/webm",
  "audio/mpeg",
  "audio/ogg",
  "application/pdf",
  "text/plain",
  "application/zip",
]);

function sniffMimeType(bytes: Buffer): string | undefined {
  if (bytes.subarray(0, 3).equals(Buffer.from([0xff, 0xd8, 0xff])))
    return "image/jpeg";
  if (
    bytes
      .subarray(0, 8)
      .equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))
  )
    return "image/png";
  if (["GIF87a", "GIF89a"].includes(bytes.subarray(0, 6).toString("ascii")))
    return "image/gif";
  if (
    bytes.subarray(0, 4).toString("ascii") === "RIFF" &&
    bytes.subarray(8, 12).toString("ascii") === "WEBP"
  )
    return "image/webp";
  if (bytes.subarray(4, 8).toString("ascii") === "ftyp") return "video/mp4";
  if (bytes.subarray(0, 4).equals(Buffer.from([0x1a, 0x45, 0xdf, 0xa3])))
    return "video/webm";
  if (
    bytes.subarray(0, 3).toString("ascii") === "ID3" ||
    (bytes[0] === 0xff && (bytes[1] ?? 0) >= 0xe0)
  )
    return "audio/mpeg";
  if (bytes.subarray(0, 4).toString("ascii") === "OggS") return "audio/ogg";
  if (bytes.subarray(0, 5).toString("ascii") === "%PDF-")
    return "application/pdf";
  if (bytes.subarray(0, 2).toString("ascii") === "PK") return "application/zip";
  return undefined;
}

interface StoredMedia {
  id: string;
  key: string;
  originalName: string;
  mimeType: string;
  size: number;
  campaignId?: string;
  tags: string[];
}

function cleanFilename(value: string): string {
  return (
    value
      .normalize("NFKC")
      .replace(/[\\/\0\r\n]/g, "-")
      .replace(/[^\p{L}\p{N}._ -]/gu, "-")
      .trim()
      .slice(0, 240) || "upload"
  );
}

export class ObjectStorage {
  readonly client: S3Client;

  constructor(private readonly config: RuntimeConfig) {
    const storage = config.storage;
    if (!storage.endpoint || !storage.accessKeyId || !storage.secretAccessKey) {
      throw new Error("S3 storage is not configured");
    }
    this.client = new S3Client({
      endpoint: storage.endpoint,
      region: storage.region,
      forcePathStyle: storage.forcePathStyle,
      credentials: {
        accessKeyId: storage.accessKeyId,
        secretAccessKey: storage.secretAccessKey,
      },
    });
  }

  async initialize(): Promise<void> {
    try {
      await this.client.send(
        new HeadBucketCommand({ Bucket: this.config.storage.bucket }),
      );
    } catch {
      try {
        await this.client.send(
          new CreateBucketCommand({ Bucket: this.config.storage.bucket }),
        );
      } catch (error) {
        console.error("Could not initialize media bucket", error);
        throw new Error("Der Medien-Bucket ist nicht erreichbar.");
      }
    }
  }

  async upload(
    key: string,
    body: Readable,
    mimeType: string,
    size: number,
  ): Promise<void> {
    await this.client.send(
      new PutObjectCommand({
        Bucket: this.config.storage.bucket,
        Key: key,
        Body: body,
        ContentType: mimeType,
        ContentLength: size,
        Metadata: { uploaded: new Date().toISOString() },
      }),
    );
  }

  async downloadUrl(key: string, filename: string): Promise<string> {
    return getSignedUrl(
      this.client,
      new GetObjectCommand({
        Bucket: this.config.storage.bucket,
        Key: key,
        ResponseContentDisposition: `attachment; filename*=UTF-8''${encodeURIComponent(filename)}`,
      }),
      { expiresIn: 15 * 60 },
    );
  }

  async previewUrl(key: string): Promise<string> {
    return getSignedUrl(
      this.client,
      new GetObjectCommand({
        Bucket: this.config.storage.bucket,
        Key: key,
      }),
      { expiresIn: 15 * 60 },
    );
  }

  async providerUrl(key: string): Promise<string> {
    return getSignedUrl(
      this.client,
      new GetObjectCommand({
        Bucket: this.config.storage.bucket,
        Key: key,
      }),
      { expiresIn: 60 * 60 },
    );
  }

  async delete(key: string): Promise<void> {
    await this.client.send(
      new DeleteObjectCommand({ Bucket: this.config.storage.bucket, Key: key }),
    );
  }

  async close(): Promise<void> {
    this.client.destroy();
  }
}

async function multipartUpload(
  request: IncomingMessage,
  storage: ObjectStorage,
  maximumBytes: number,
  userId: string,
): Promise<StoredMedia> {
  const declared = Number(request.headers["content-length"]);
  if (Number.isFinite(declared) && declared > maximumBytes + 1024 * 1024) {
    request.resume();
    throw new HttpError(413, "file_too_large", "Die Datei ist zu groß.");
  }

  return new Promise((resolve, reject) => {
    let settled = false;
    let fileSeen = false;
    let uploadPromise: Promise<void> | undefined;
    let result: StoredMedia | undefined;
    const fields: Record<string, string> = {};
    const parser = Busboy({
      headers: request.headers,
      limits: { files: 1, fields: 20, fileSize: maximumBytes, parts: 21 },
    });
    const fail = (error: unknown) => {
      if (settled) return;
      settled = true;
      request.unpipe(parser);
      reject(error);
    };

    parser.on("field", (name, value) => {
      if (value.length <= 10_000) fields[name] = value;
    });
    parser.on("file", (_name, stream, info) => {
      if (fileSeen) {
        stream.resume();
        fail(
          new HttpError(
            400,
            "too_many_files",
            "Nur eine Datei pro Upload ist erlaubt.",
          ),
        );
        return;
      }
      fileSeen = true;
      const mimeType = info.mimeType.toLowerCase();
      if (!SAFE_MIME_TYPES.has(mimeType)) {
        stream.resume();
        fail(
          new HttpError(
            415,
            "unsupported_file_type",
            "Dieser Dateityp ist nicht erlaubt.",
          ),
        );
        return;
      }
      const size = Number(request.headers["x-file-size"]);
      if (!Number.isSafeInteger(size) || size <= 0 || size > maximumBytes) {
        stream.resume();
        fail(
          new HttpError(
            411,
            "file_size_required",
            "X-File-Size mit der exakten Dateigröße ist erforderlich.",
          ),
        );
        return;
      }
      const mediaId = randomUUID();
      const filename = cleanFilename(info.filename);
      const key = `${userId}/${mediaId}/${filename}`;
      result = {
        id: mediaId,
        key,
        originalName: filename,
        mimeType,
        size,
        tags: [],
      };
      stream.on("limit", () =>
        fail(new HttpError(413, "file_too_large", "Die Datei ist zu groß.")),
      );
      uploadPromise = new Promise<void>((resolveUpload, rejectUpload) => {
        let seenBytes = 0;
        stream.on("data", (chunk: Buffer) => {
          seenBytes += chunk.length;
        });
        stream.once("data", (firstChunk: Buffer) => {
          const header = Buffer.from(firstChunk);
          const detected = sniffMimeType(header);
          const textSafe = mimeType === "text/plain" && !header.includes(0);
          if (detected !== mimeType && !textSafe) {
            stream.resume();
            rejectUpload(
              new HttpError(
                415,
                "file_signature_mismatch",
                "Dateiinhalt und Dateityp stimmen nicht überein.",
              ),
            );
            return;
          }
          const source = Readable.from(
            (async function* () {
              yield header;
              for await (const chunk of stream) yield chunk;
            })(),
          );
          storage.upload(key, source, mimeType, size).then(() => {
            if (seenBytes !== size) {
              rejectUpload(
                new HttpError(
                  400,
                  "file_size_mismatch",
                  "Die übertragene Dateigröße stimmt nicht.",
                ),
              );
            } else {
              resolveUpload();
            }
          }, rejectUpload);
        });
      });
    });
    parser.on("error", () =>
      fail(new HttpError(400, "invalid_multipart", "Upload ist ungültig.")),
    );
    parser.on("finish", () => {
      void (async () => {
        if (!fileSeen || !result || !uploadPromise) {
          throw new HttpError(
            400,
            "file_required",
            "Eine Datei ist erforderlich.",
          );
        }
        await uploadPromise;
        result.campaignId = fields.campaignId?.trim() || undefined;
        result.tags = (fields.tags ?? "")
          .split(",")
          .map((tag) => tag.trim())
          .filter(Boolean)
          .slice(0, 100);
        if (!settled) {
          settled = true;
          resolve(result);
        }
      })().catch(fail);
    });
    request.pipe(parser);
  });
}

export class MediaService {
  constructor(
    private readonly database: Database,
    private readonly auth: AuthService,
    private readonly storage: ObjectStorage,
    private readonly config: RuntimeConfig,
  ) {}

  async handle(
    request: IncomingMessage,
    response: ServerResponse,
    pathname: string,
  ): Promise<boolean> {
    if (!pathname.startsWith("/api/media")) return false;
    const user = await this.auth.requireUser(request);

    if (pathname === "/api/media/upload") {
      requireMethod(request, response, ["POST"]);
      const origin = Array.isArray(request.headers.origin)
        ? undefined
        : request.headers.origin;
      if (
        !origin ||
        new URL(origin).origin !== new URL(this.config.publicBaseUrl).origin
      ) {
        throw new HttpError(403, "invalid_origin", "Ungültiger Request-Ursprung.");
      }
      if (user.role === "Visitor" || user.role === "Agent") {
        throw new HttpError(403, "forbidden", "Keine Upload-Berechtigung.");
      }
      const media = await multipartUpload(
        request,
        this.storage,
        this.config.storage.maxUploadBytes,
        user.id,
      );
      await this.database.query(
        `INSERT INTO media_objects(
          id, object_key, original_name, mime_type, size_bytes,
          campaign_id, tags, uploaded_by
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
        [
          media.id,
          media.key,
          media.originalName,
          media.mimeType,
          media.size,
          media.campaignId ?? null,
          media.tags,
          user.id,
        ],
      );
      const preview = await this.storage.previewUrl(media.key);
      sendJson(response, 201, {
        media: {
          id: media.id,
          filename: media.key,
          originalName: media.originalName,
          mimeType: media.mimeType,
          size: media.size,
          url: preview,
          uploadedBy: user.id,
          ...(media.campaignId ? { campaignId: media.campaignId } : {}),
          tags: media.tags,
          createdAt: new Date().toISOString(),
        },
      });
      return true;
    }

    const match = /^\/api\/media\/([0-9a-f-]+)\/(download|preview)$/.exec(
      pathname,
    );
    if (match) {
      requireMethod(request, response, ["GET"]);
      const mediaId = match[1];
      const mediaResult = await this.database.query<{
        object_key: string;
        original_name: string;
      }>("SELECT object_key, original_name FROM media_objects WHERE id = $1", [
        mediaId,
      ]);
      const media = mediaResult.rows[0];
      if (!media)
        throw new HttpError(404, "media_not_found", "Datei nicht gefunden.");
      const location =
        match[2] === "download"
          ? await this.storage.downloadUrl(
              media.object_key,
              media.original_name,
            )
          : await this.storage.previewUrl(media.object_key);
      response.writeHead(302, {
        Location: location,
        "Cache-Control": "no-store",
      });
      response.end();
      return true;
    }

    const deleteMatch = /^\/api\/media\/([0-9a-f-]+)$/.exec(pathname);
    if (deleteMatch) {
      requireMethod(request, response, ["DELETE"]);
      const origin = Array.isArray(request.headers.origin)
        ? undefined
        : request.headers.origin;
      if (
        !origin ||
        new URL(origin).origin !== new URL(this.config.publicBaseUrl).origin
      ) {
        throw new HttpError(403, "invalid_origin", "Ungültiger Request-Ursprung.");
      }
      if (user.role === "Visitor" || user.role === "Agent") {
        throw new HttpError(403, "forbidden", "Keine Löschberechtigung.");
      }
      const result = await this.database.query<{ object_key: string }>(
        "DELETE FROM media_objects WHERE id = $1 RETURNING object_key",
        [deleteMatch[1]],
      );
      const row = result.rows[0];
      if (!row)
        throw new HttpError(404, "media_not_found", "Datei nicht gefunden.");
      await this.storage.delete(row.object_key);
      sendJson(response, 204, null);
      return true;
    }

    throw new HttpError(404, "not_found", "Medien-Endpunkt nicht gefunden.");
  }
}

export async function initializeStorage(
  config: RuntimeConfig,
): Promise<ObjectStorage | undefined> {
  if (
    !config.storage.endpoint ||
    !config.storage.accessKeyId ||
    !config.storage.secretAccessKey
  ) {
    return undefined;
  }
  const storage = new ObjectStorage(config);
  await storage.initialize();
  return storage;
}
