import { randomBytes } from "node:crypto";

export type RuntimeEnvironment = NodeJS.ProcessEnv;

export interface RuntimeConfig {
  production: boolean;
  publicBaseUrl: string;
  databaseUrl?: string;
  databaseSsl: boolean;
  tokenEncryptionKey: Buffer;
  sessionCookieName: string;
  sessionTtlSeconds: number;
  allowRegistration: boolean;
  bootstrapAdminEmail?: string;
  bootstrapAdminName: string;
  bootstrapAdminPassword?: string;
  storage: {
    endpoint?: string;
    region: string;
    bucket: string;
    accessKeyId?: string;
    secretAccessKey?: string;
    forcePathStyle: boolean;
    maxUploadBytes: number;
  };
  smtp?: {
    host: string;
    port: number;
    secure: boolean;
    user?: string;
    password?: string;
    from: string;
  };
}

function booleanValue(value: string | undefined, fallback: boolean): boolean {
  if (value === undefined || value.trim() === "") return fallback;
  if (["1", "true", "yes", "on"].includes(value.trim().toLowerCase())) {
    return true;
  }
  if (["0", "false", "no", "off"].includes(value.trim().toLowerCase())) {
    return false;
  }
  throw new Error(`Ungültiger Boolean-Wert: ${value}`);
}

function boundedInteger(
  value: string | undefined,
  fallback: number,
  minimum: number,
  maximum: number,
  name: string,
): number {
  if (value === undefined || value.trim() === "") return fallback;
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed < minimum || parsed > maximum) {
    throw new Error(
      `${name} muss eine ganze Zahl zwischen ${minimum} und ${maximum} sein.`,
    );
  }
  return parsed;
}

function normalizedBaseUrl(value: string | undefined, production: boolean) {
  const candidate =
    value?.trim() || (production ? "" : "http://127.0.0.1:5173");
  if (!candidate) {
    throw new Error("PUBLIC_BASE_URL ist im Produktionsbetrieb erforderlich.");
  }
  const parsed = new URL(candidate);
  if (parsed.username || parsed.password || parsed.search || parsed.hash) {
    throw new Error(
      "PUBLIC_BASE_URL darf keine Zugangsdaten, Query oder Fragment enthalten.",
    );
  }
  if (production && parsed.protocol !== "https:") {
    throw new Error(
      "PUBLIC_BASE_URL muss im Produktionsbetrieb HTTPS verwenden.",
    );
  }
  if (
    !production &&
    parsed.protocol !== "http:" &&
    parsed.protocol !== "https:"
  ) {
    throw new Error("PUBLIC_BASE_URL muss HTTP oder HTTPS verwenden.");
  }
  parsed.pathname = parsed.pathname.replace(/\/+$/, "");
  return parsed.toString().replace(/\/$/, "");
}

function encryptionKey(value: string | undefined, production: boolean): Buffer {
  if (!value?.trim()) {
    if (production) {
      throw new Error(
        "TOKEN_ENCRYPTION_KEY ist im Produktionsbetrieb erforderlich (32 Byte, Base64).",
      );
    }
    // Development-only ephemeral key. Persisted provider credentials are not
    // usable after a restart until a stable key is configured.
    return randomBytes(32);
  }
  const decoded = Buffer.from(value.trim(), "base64");
  if (decoded.length !== 32 || decoded.toString("base64") !== value.trim()) {
    throw new Error(
      "TOKEN_ENCRYPTION_KEY muss exakt 32 Byte Base64-kodiert sein.",
    );
  }
  return decoded;
}

function optionalText(value: string | undefined): string | undefined {
  const normalized = value?.trim();
  return normalized || undefined;
}

export function loadRuntimeConfig(
  production: boolean,
  environment: RuntimeEnvironment = process.env,
): RuntimeConfig {
  const databaseUrl = optionalText(environment.DATABASE_URL);
  if (production && !databaseUrl) {
    throw new Error("DATABASE_URL ist im Produktionsbetrieb erforderlich.");
  }

  const storageEndpoint = optionalText(environment.S3_ENDPOINT);
  const storageAccessKey = optionalText(environment.S3_ACCESS_KEY_ID);
  const storageSecret = optionalText(environment.S3_SECRET_ACCESS_KEY);
  if (production && (!storageEndpoint || !storageAccessKey || !storageSecret)) {
    throw new Error(
      "S3_ENDPOINT, S3_ACCESS_KEY_ID und S3_SECRET_ACCESS_KEY sind im Produktionsbetrieb erforderlich.",
    );
  }

  const smtpHost = optionalText(environment.SMTP_HOST);
  const smtpFrom = optionalText(environment.SMTP_FROM);
  const smtp =
    smtpHost && smtpFrom
      ? {
          host: smtpHost,
          port: boundedInteger(
            environment.SMTP_PORT,
            587,
            1,
            65_535,
            "SMTP_PORT",
          ),
          secure: booleanValue(environment.SMTP_SECURE, false),
          user: optionalText(environment.SMTP_USER),
          password: optionalText(environment.SMTP_PASSWORD),
          from: smtpFrom,
        }
      : undefined;

  return {
    production,
    publicBaseUrl: normalizedBaseUrl(environment.PUBLIC_BASE_URL, production),
    databaseUrl,
    databaseSsl: booleanValue(environment.DATABASE_SSL, false),
    tokenEncryptionKey: encryptionKey(
      environment.TOKEN_ENCRYPTION_KEY,
      production,
    ),
    sessionCookieName: production
      ? "__Host-campaignhub_session"
      : "campaignhub_session",
    sessionTtlSeconds: boundedInteger(
      environment.SESSION_TTL_SECONDS,
      14 * 24 * 60 * 60,
      15 * 60,
      90 * 24 * 60 * 60,
      "SESSION_TTL_SECONDS",
    ),
    allowRegistration: booleanValue(environment.ALLOW_REGISTRATION, false),
    bootstrapAdminEmail: optionalText(
      environment.BOOTSTRAP_ADMIN_EMAIL,
    )?.toLowerCase(),
    bootstrapAdminName:
      optionalText(environment.BOOTSTRAP_ADMIN_NAME) ?? "CampaignHub Admin",
    bootstrapAdminPassword: optionalText(environment.BOOTSTRAP_ADMIN_PASSWORD),
    storage: {
      endpoint: storageEndpoint,
      region: optionalText(environment.S3_REGION) ?? "us-east-1",
      bucket: optionalText(environment.S3_BUCKET) ?? "campaignhub-media",
      accessKeyId: storageAccessKey,
      secretAccessKey: storageSecret,
      forcePathStyle: booleanValue(environment.S3_FORCE_PATH_STYLE, true),
      maxUploadBytes: boundedInteger(
        environment.MAX_UPLOAD_BYTES,
        512 * 1024 * 1024,
        1024,
        20 * 1024 * 1024 * 1024,
        "MAX_UPLOAD_BYTES",
      ),
    },
    ...(smtp ? { smtp } : {}),
  };
}
