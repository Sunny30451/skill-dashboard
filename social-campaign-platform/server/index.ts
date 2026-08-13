import {
  createServer as createHttpServer,
  type IncomingMessage,
  type Server,
  type ServerResponse,
} from "node:http";
import { createReadStream } from "node:fs";
import { stat } from "node:fs/promises";
import { extname, relative, resolve, sep } from "node:path";
import { pipeline } from "node:stream/promises";
import { fileURLToPath } from "node:url";
import type { ViteDevServer } from "vite";
import {
  getOllamaTimeoutMs,
  handleOllamaApiRoute,
  sendApiError,
  sendJson,
} from "./ollama.js";
import { AuthService } from "./auth.js";
import { loadRuntimeConfig, type RuntimeConfig } from "./config.js";
import { initializeDatabase, type Database } from "./database.js";
import { sendHttpError, securityHeaders } from "./http.js";
import { InvitationService } from "./invitations.js";
import { DurableWorker, JobService } from "./jobs.js";
import { StateService } from "./state.js";
import { createProviderJobExecutor } from "./publisher.js";
import { SocialService } from "./social.js";
import {
  initializeStorage,
  MediaService,
  type ObjectStorage,
} from "./storage.js";

const MIME_TYPES: Record<string, string> = {
  ".avif": "image/avif",
  ".css": "text/css; charset=utf-8",
  ".gif": "image/gif",
  ".html": "text/html; charset=utf-8",
  ".ico": "image/x-icon",
  ".jpeg": "image/jpeg",
  ".jpg": "image/jpeg",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".map": "application/json; charset=utf-8",
  ".mp3": "audio/mpeg",
  ".mp4": "video/mp4",
  ".ogg": "audio/ogg",
  ".pdf": "application/pdf",
  ".png": "image/png",
  ".svg": "image/svg+xml",
  ".txt": "text/plain; charset=utf-8",
  ".wasm": "application/wasm",
  ".webm": "video/webm",
  ".webp": "image/webp",
  ".woff": "font/woff",
  ".woff2": "font/woff2",
};

export interface AppServerOptions {
  production?: boolean;
  root?: string;
  distDirectory?: string;
}

export interface AppServer {
  server: Server;
  close: () => Promise<void>;
}

interface ServerServices {
  config: RuntimeConfig;
  database?: Database;
  storage?: ObjectStorage;
  auth?: AuthService;
  state?: StateService;
  invitations?: InvitationService;
  jobs?: JobService;
  media?: MediaService;
  social?: SocialService;
  worker?: DurableWorker;
}

export function isProductionMode(
  explicitMode: boolean | undefined,
  argv: readonly string[] = process.argv,
  nodeEnvironment: string | undefined = process.env.NODE_ENV,
): boolean {
  return (
    explicitMode ??
    (nodeEnvironment === "production" || argv.includes("--production"))
  );
}

function parseRequestUrl(request: IncomingMessage): URL {
  try {
    return new URL(request.url ?? "/", "http://localhost");
  } catch {
    throw new Error("Invalid request URL");
  }
}

function sendPlainText(
  response: ServerResponse,
  status: number,
  message: string,
): void {
  if (response.headersSent || response.writableEnded) return;
  response.writeHead(status, {
    "Cache-Control": "no-store",
    "Content-Type": "text/plain; charset=utf-8",
    "Content-Length": Buffer.byteLength(message),
    "X-Content-Type-Options": "nosniff",
  });
  response.end(message);
}

function isInsideDirectory(directory: string, filePath: string): boolean {
  const pathFromDirectory = relative(directory, filePath);
  return (
    pathFromDirectory === "" ||
    (!pathFromDirectory.startsWith(`..${sep}`) && pathFromDirectory !== "..")
  );
}

function decodePathname(pathname: string): string {
  let decoded: string;
  try {
    decoded = decodeURIComponent(pathname);
  } catch {
    throw new Error("Malformed URL encoding");
  }
  if (decoded.includes("\0")) throw new Error("Invalid path");
  return decoded;
}

async function fileExists(filePath: string): Promise<boolean> {
  try {
    return (await stat(filePath)).isFile();
  } catch {
    return false;
  }
}

async function serveFile(
  request: IncomingMessage,
  response: ServerResponse,
  filePath: string,
  immutable: boolean,
): Promise<void> {
  const fileStat = await stat(filePath);
  const etag = `W/"${fileStat.size.toString(16)}-${Math.trunc(fileStat.mtimeMs).toString(16)}"`;
  if (request.headers["if-none-match"] === etag) {
    response.writeHead(304, {
      ETag: etag,
      "Cache-Control": immutable
        ? "public, max-age=31536000, immutable"
        : "no-cache",
    });
    response.end();
    return;
  }

  response.writeHead(200, {
    "Cache-Control": immutable
      ? "public, max-age=31536000, immutable"
      : "no-cache",
    "Content-Length": fileStat.size,
    "Content-Type":
      MIME_TYPES[extname(filePath).toLowerCase()] ?? "application/octet-stream",
    ETag: etag,
    "Last-Modified": fileStat.mtime.toUTCString(),
    "X-Content-Type-Options": "nosniff",
  });
  if (request.method === "HEAD") {
    response.end();
    return;
  }

  await pipeline(createReadStream(filePath), response);
}

async function serveProductionAsset(
  request: IncomingMessage,
  response: ServerResponse,
  pathname: string,
  distDirectory: string,
): Promise<void> {
  if (request.method !== "GET" && request.method !== "HEAD") {
    sendJson(
      response,
      405,
      {
        error: {
          code: "method_not_allowed",
          message: "Statische Inhalte unterstützen nur GET und HEAD.",
        },
      },
      { Allow: "GET, HEAD" },
    );
    return;
  }

  let decodedPathname: string;
  try {
    decodedPathname = decodePathname(pathname);
  } catch {
    sendPlainText(response, 400, "Bad Request");
    return;
  }

  const requestedPath = resolve(distDirectory, `.${decodedPathname}`);
  if (!isInsideDirectory(distDirectory, requestedPath)) {
    sendPlainText(response, 403, "Forbidden");
    return;
  }

  if (await fileExists(requestedPath)) {
    await serveFile(
      request,
      response,
      requestedPath,
      decodedPathname.startsWith("/assets/"),
    );
    return;
  }

  const indexPath = resolve(distDirectory, "index.html");
  if (!(await fileExists(indexPath))) {
    sendPlainText(
      response,
      500,
      "Production build missing. Run the frontend build first.",
    );
    return;
  }
  await serveFile(request, response, indexPath, false);
}

function passToVite(
  vite: ViteDevServer,
  request: IncomingMessage,
  response: ServerResponse,
): void {
  vite.middlewares(request, response, (error?: unknown) => {
    if (error) {
      if (error instanceof Error) vite.ssrFixStacktrace(error);
      sendApiError(response, error);
      return;
    }
    if (!response.writableEnded) sendPlainText(response, 404, "Not Found");
  });
}

export async function createAppServer(
  options: AppServerOptions = {},
): Promise<AppServer> {
  const root = resolve(options.root ?? process.cwd());
  const production = isProductionMode(options.production);
  const distDirectory = resolve(
    options.distDirectory ?? process.env.STATIC_DIR ?? resolve(root, "dist"),
  );
  let vite: ViteDevServer | undefined;
  const config = loadRuntimeConfig(production);
  const database = await initializeDatabase(config);
  const storage = await initializeStorage(config);
  const services: ServerServices = { config, database, storage };
  if (database) {
    const auth = new AuthService(database, config);
    services.auth = auth;
    services.state = new StateService(database, auth, config);
    services.invitations = new InvitationService(database, auth, config);
    services.jobs = new JobService(database, auth);
    services.social = new SocialService(database, auth, config);
    if (storage)
      services.media = new MediaService(database, auth, storage, config);
    services.worker = new DurableWorker(
      database,
      storage
        ? createProviderJobExecutor(database, storage, config)
        : async () => {
            throw new Error("Objektspeicher ist nicht konfiguriert.");
          },
    );
    if (process.env.WORKER_ENABLED !== "false") services.worker.start();
  }

  const server = createHttpServer((request, response) => {
    void (async () => {
      securityHeaders(response);
      let requestUrl: URL;
      try {
        requestUrl = parseRequestUrl(request);
      } catch {
        sendPlainText(response, 400, "Bad Request");
        return;
      }

      if (requestUrl.pathname === "/api/health/live") {
        sendJson(response, 200, { status: "ok" });
        return;
      }
      if (requestUrl.pathname === "/api/health/ready") {
        if (production && !database) {
          sendJson(response, 503, { status: "not_ready", database: false });
          return;
        }
        if (database) await database.query("SELECT 1");
        sendJson(response, 200, {
          status: "ready",
          database: Boolean(database),
          storage: Boolean(storage),
        });
        return;
      }

      if (
        await handleOllamaApiRoute(
          request,
          response,
          requestUrl.pathname,
          process.env,
        )
      ) {
        return;
      }

      if (
        services.social &&
        (await services.social.handle(request, response, requestUrl.pathname))
      )
        return;

      if (
        services.auth &&
        (await services.auth.handle(request, response, requestUrl.pathname))
      )
        return;
      if (
        services.state &&
        (await services.state.handle(request, response, requestUrl.pathname))
      )
        return;
      if (
        services.invitations &&
        (await services.invitations.handle(
          request,
          response,
          requestUrl.pathname,
        ))
      )
        return;
      if (
        services.jobs &&
        (await services.jobs.handle(request, response, requestUrl.pathname))
      )
        return;
      if (
        services.media &&
        (await services.media.handle(request, response, requestUrl.pathname))
      )
        return;

      if (requestUrl.pathname.startsWith("/api/")) {
        sendJson(response, database ? 404 : 503, {
          error: {
            code: database ? "not_found" : "backend_not_configured",
            message: database
              ? "API-Endpunkt nicht gefunden."
              : "Der persistente Backend-Modus benötigt DATABASE_URL.",
          },
        });
        return;
      }

      if (production) {
        await serveProductionAsset(
          request,
          response,
          requestUrl.pathname,
          distDirectory,
        );
      } else if (vite) {
        passToVite(vite, request, response);
      } else {
        sendPlainText(response, 503, "Development server is starting.");
      }
    })().catch((error: unknown) => {
      if (
        error &&
        typeof error === "object" &&
        "status" in error &&
        "code" in error
      ) {
        sendHttpError(response, error);
      } else {
        sendApiError(response, error);
      }
    });
  });

  server.headersTimeout = 15_000;
  server.requestTimeout = getOllamaTimeoutMs(process.env) + 5_000;
  server.keepAliveTimeout = 5_000;

  if (!production) {
    const { createServer: createViteServer } = await import("vite");
    vite = await createViteServer({
      root,
      appType: "spa",
      server: {
        middlewareMode: true,
        hmr: { server },
      },
    });
  }

  return {
    server,
    close: async () => {
      services.worker?.stop();
      if (server.listening) {
        await new Promise<void>((resolveClose, rejectClose) => {
          server.close((error) => {
            if (error) rejectClose(error);
            else resolveClose();
          });
        });
      }
      await vite?.close();
      await services.storage?.close();
      await services.database?.close();
    },
  };
}

export function parsePort(value: string | undefined, fallback = 5173): number {
  const port = Number(value);
  return Number.isInteger(port) && port >= 1 && port <= 65_535
    ? port
    : fallback;
}

export async function startServer(): Promise<AppServer> {
  const appServer = await createAppServer();
  const port = parsePort(process.env.PORT);
  const host = process.env.HOST?.trim() || "127.0.0.1";

  try {
    await new Promise<void>((resolveListen, rejectListen) => {
      appServer.server.once("error", rejectListen);
      appServer.server.listen(port, host, () => {
        appServer.server.off("error", rejectListen);
        resolveListen();
      });
    });
  } catch (error) {
    await appServer.close();
    throw error;
  }
  console.log(`CampaignHub server listening on http://${host}:${port}`);

  let shuttingDown = false;
  const shutdown = () => {
    if (shuttingDown) return;
    shuttingDown = true;
    void appServer
      .close()
      .then(() => process.exit(0))
      .catch((error: unknown) => {
        console.error(error);
        process.exit(1);
      });
  };
  process.once("SIGINT", shutdown);
  process.once("SIGTERM", shutdown);

  return appServer;
}

const entryPoint = process.argv[1] ? resolve(process.argv[1]) : "";
if (entryPoint && fileURLToPath(import.meta.url) === entryPoint) {
  void startServer().catch((error: unknown) => {
    console.error(error);
    process.exitCode = 1;
  });
}
