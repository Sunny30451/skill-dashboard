import { randomUUID } from "node:crypto";
import type { IncomingMessage, ServerResponse } from "node:http";
import type { RuntimeConfig } from "./config.js";
import type { Database } from "./database.js";
import {
  clientIp,
  HttpError,
  parseCookies,
  readBody,
  requireMethod,
  sendJson,
} from "./http.js";
import {
  hashPassword,
  randomToken,
  sha256,
  verifyPassword,
} from "./security.js";

export type UserRole = "Admin" | "Worker" | "Visitor" | "Agent";

export interface AuthUser {
  id: string;
  email: string;
  name: string;
  role: UserRole;
  campaignRole?: string;
  avatar?: string;
  createdAt: string;
  updatedAt: string;
}

interface UserRow {
  id: string;
  email: string;
  name: string;
  role: UserRole;
  campaign_role: string | null;
  avatar: string | null;
  password_hash: string;
  active: boolean;
  created_at: Date;
  updated_at: Date;
}

function publicUser(row: UserRow): AuthUser {
  return {
    id: row.id,
    email: row.email,
    name: row.name,
    role: row.role,
    ...(row.campaign_role ? { campaignRole: row.campaign_role } : {}),
    ...(row.avatar ? { avatar: row.avatar } : {}),
    createdAt: row.created_at.toISOString(),
    updatedAt: row.updated_at.toISOString(),
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function cookie(
  config: RuntimeConfig,
  token: string,
  maximumAge: number,
): string {
  return [
    `${config.sessionCookieName}=${encodeURIComponent(token)}`,
    "Path=/",
    "HttpOnly",
    "SameSite=Lax",
    config.production ? "Secure" : "",
    `Max-Age=${maximumAge}`,
  ]
    .filter(Boolean)
    .join("; ");
}

function sameOrigin(request: IncomingMessage, config: RuntimeConfig): boolean {
  const origin = request.headers.origin;
  if (!origin || Array.isArray(origin)) return false;
  try {
    return new URL(origin).origin === new URL(config.publicBaseUrl).origin;
  } catch {
    return false;
  }
}

export class AuthService {
  constructor(
    private readonly database: Database,
    private readonly config: RuntimeConfig,
  ) {}

  async currentUser(request: IncomingMessage): Promise<AuthUser | null> {
    const token = parseCookies(request).get(this.config.sessionCookieName);
    if (!token || token.length > 500) return null;
    const result = await this.database.query<UserRow>(
      `SELECT u.* FROM sessions s
       JOIN users u ON u.id = s.user_id
       WHERE s.token_hash = $1 AND s.expires_at > now() AND u.active = true`,
      [sha256(token)],
    );
    const row = result.rows[0];
    if (!row) return null;
    void this.database.query(
      "UPDATE sessions SET last_seen_at = now() WHERE token_hash = $1 AND last_seen_at < now() - interval '15 minutes'",
      [sha256(token)],
    );
    return publicUser(row);
  }

  async requireUser(
    request: IncomingMessage,
    roles?: readonly UserRole[],
  ): Promise<AuthUser> {
    const user = await this.currentUser(request);
    if (!user)
      throw new HttpError(401, "unauthorized", "Anmeldung erforderlich.");
    if (roles && !roles.includes(user.role)) {
      throw new HttpError(
        403,
        "forbidden",
        "Keine Berechtigung für diese Aktion.",
      );
    }
    return user;
  }

  private assertMutationOrigin(request: IncomingMessage): void {
    if (!sameOrigin(request, this.config)) {
      throw new HttpError(
        403,
        "invalid_origin",
        "Ungültiger Request-Ursprung.",
      );
    }
  }

  private async createSession(
    request: IncomingMessage,
    response: ServerResponse,
    userId: string,
  ): Promise<void> {
    const token = randomToken();
    await this.database.query(
      `INSERT INTO sessions(token_hash, user_id, expires_at, user_agent, ip_address)
       VALUES ($1, $2, now() + ($3 * interval '1 second'), $4, $5)`,
      [
        sha256(token),
        userId,
        this.config.sessionTtlSeconds,
        request.headers["user-agent"]?.slice(0, 500),
        clientIp(request),
      ],
    );
    response.setHeader(
      "Set-Cookie",
      cookie(this.config, token, this.config.sessionTtlSeconds),
    );
  }

  private async isRateLimited(identity: string): Promise<boolean> {
    const result = await this.database.query<{ failures: string }>(
      `SELECT count(*)::text AS failures FROM login_attempts
       WHERE identity_hash = $1 AND successful = false
         AND attempted_at > now() - interval '15 minutes'`,
      [sha256(identity)],
    );
    return Number(result.rows[0]?.failures ?? 0) >= 8;
  }

  async handle(
    request: IncomingMessage,
    response: ServerResponse,
    pathname: string,
  ): Promise<boolean> {
    if (!pathname.startsWith("/api/auth/")) return false;

    if (pathname === "/api/auth/session") {
      requireMethod(request, response, ["GET"]);
      const user = await this.currentUser(request);
      sendJson(response, 200, { user });
      return true;
    }

    if (pathname === "/api/auth/login") {
      requireMethod(request, response, ["POST"]);
      this.assertMutationOrigin(request);
      const { json } = await readBody(request);
      if (!isRecord(json))
        throw new HttpError(400, "invalid_request", "Ungültige Anmeldung.");
      const email =
        typeof json.email === "string" ? json.email.trim().toLowerCase() : "";
      const password = typeof json.password === "string" ? json.password : "";
      const identity = `${clientIp(request) ?? "unknown"}|${email}`;
      if (await this.isRateLimited(identity)) {
        throw new HttpError(
          429,
          "login_rate_limited",
          "Zu viele Anmeldeversuche. Bitte später erneut versuchen.",
        );
      }
      if (!email || !password) {
        throw new HttpError(
          401,
          "invalid_credentials",
          "E-Mail oder Passwort ist falsch.",
        );
      }
      const found = await this.database.query<UserRow>(
        "SELECT * FROM users WHERE email = $1",
        [email],
      );
      const row = found.rows[0];
      const valid = Boolean(
        row?.active && (await verifyPassword(password, row.password_hash)),
      );
      await this.database.query(
        "INSERT INTO login_attempts(identity_hash, successful) VALUES ($1, $2)",
        [sha256(identity), valid],
      );
      if (!valid || !row) {
        throw new HttpError(
          401,
          "invalid_credentials",
          "E-Mail oder Passwort ist falsch.",
        );
      }
      await this.createSession(request, response, row.id);
      sendJson(response, 200, { user: publicUser(row) });
      return true;
    }

    if (pathname === "/api/auth/logout") {
      requireMethod(request, response, ["POST"]);
      this.assertMutationOrigin(request);
      const token = parseCookies(request).get(this.config.sessionCookieName);
      if (token) {
        await this.database.query(
          "DELETE FROM sessions WHERE token_hash = $1",
          [sha256(token)],
        );
      }
      response.setHeader("Set-Cookie", cookie(this.config, "", 0));
      sendJson(response, 204, null);
      return true;
    }

    if (pathname === "/api/auth/register") {
      requireMethod(request, response, ["POST"]);
      this.assertMutationOrigin(request);
      if (!this.config.allowRegistration) {
        throw new HttpError(
          403,
          "registration_disabled",
          "Registrierung ist deaktiviert. Bitte eine Einladung verwenden.",
        );
      }
      const { json } = await readBody(request);
      if (!isRecord(json))
        throw new HttpError(400, "invalid_request", "Ungültige Registrierung.");
      const email =
        typeof json.email === "string" ? json.email.trim().toLowerCase() : "";
      const name = typeof json.name === "string" ? json.name.trim() : "";
      const password = typeof json.password === "string" ? json.password : "";
      const role = json.role === "Visitor" ? "Visitor" : "Worker";
      if (!/^\S+@\S+\.\S+$/.test(email) || !name || name.length > 200) {
        throw new HttpError(
          400,
          "invalid_registration",
          "Name oder E-Mail ist ungültig.",
        );
      }
      const passwordHash = await hashPassword(password);
      try {
        const result = await this.database.query<UserRow>(
          `INSERT INTO users(id, email, name, role, password_hash)
           VALUES ($1, $2, $3, $4, $5) RETURNING *`,
          [randomUUID(), email, name, role, passwordHash],
        );
        const row = result.rows[0];
        if (!row) throw new Error("User insert returned no row");
        await this.createSession(request, response, row.id);
        sendJson(response, 201, { user: publicUser(row) });
      } catch (error) {
        if (isRecord(error) && error.code === "23505") {
          throw new HttpError(
            409,
            "email_exists",
            "Diese E-Mail wird bereits verwendet.",
          );
        }
        throw error;
      }
      return true;
    }

    if (pathname === "/api/auth/password") {
      requireMethod(request, response, ["PUT"]);
      this.assertMutationOrigin(request);
      const user = await this.requireUser(request);
      const { json } = await readBody(request);
      if (!isRecord(json) || typeof json.password !== "string") {
        throw new HttpError(
          400,
          "invalid_password",
          "Ein neues Passwort ist erforderlich.",
        );
      }
      const passwordHash = await hashPassword(json.password);
      await this.database.transaction(async (client) => {
        await client.query(
          "UPDATE users SET password_hash = $1, updated_at = now() WHERE id = $2",
          [passwordHash, user.id],
        );
        const token = parseCookies(request).get(this.config.sessionCookieName);
        await client.query(
          "DELETE FROM sessions WHERE user_id = $1 AND token_hash <> $2",
          [user.id, token ? sha256(token) : ""],
        );
      });
      sendJson(response, 204, null);
      return true;
    }

    const adminPassword = /^\/api\/auth\/users\/([0-9a-f-]+)\/password$/.exec(
      pathname,
    );
    if (adminPassword) {
      requireMethod(request, response, ["PUT"]);
      this.assertMutationOrigin(request);
      await this.requireUser(request, ["Admin"]);
      const { json } = await readBody(request);
      if (!isRecord(json) || typeof json.password !== "string") {
        throw new HttpError(
          400,
          "invalid_password",
          "Ein neues Passwort ist erforderlich.",
        );
      }
      const passwordHash = await hashPassword(json.password);
      const result = await this.database.query(
        `UPDATE users SET password_hash = $1, active = true, updated_at = now()
         WHERE id = $2`,
        [passwordHash, adminPassword[1]],
      );
      if (!result.rowCount)
        throw new HttpError(404, "user_not_found", "Nutzer nicht gefunden.");
      await this.database.query("DELETE FROM sessions WHERE user_id = $1", [
        adminPassword[1],
      ]);
      sendJson(response, 204, null);
      return true;
    }

    throw new HttpError(404, "not_found", "Auth-Endpunkt nicht gefunden.");
  }
}
