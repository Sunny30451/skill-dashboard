import { randomUUID } from "node:crypto";
import type { IncomingMessage, ServerResponse } from "node:http";
import nodemailer, { type Transporter } from "nodemailer";
import type { AuthService } from "./auth.js";
import type { RuntimeConfig } from "./config.js";
import type { Database } from "./database.js";
import { HttpError, readBody, requireMethod, sendJson } from "./http.js";
import { hashPassword, randomToken, sha256 } from "./security.js";

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function htmlEscape(value: string): string {
  return value.replace(/[&<>"']/g, (character) => {
    const entities: Record<string, string> = {
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&#39;",
    };
    return entities[character] ?? character;
  });
}

interface InvitationRow {
  id: string;
  email: string;
  name: string;
  role: "Worker" | "Visitor" | "Agent";
  campaign_ids: string[];
  invited_by: string;
  expires_at: Date;
  accepted_at: Date | null;
  revoked_at: Date | null;
}

export class InvitationService {
  private readonly mailer?: Transporter;

  constructor(
    private readonly database: Database,
    private readonly auth: AuthService,
    private readonly config: RuntimeConfig,
  ) {
    if (config.smtp) {
      this.mailer = nodemailer.createTransport({
        host: config.smtp.host,
        port: config.smtp.port,
        secure: config.smtp.secure,
        auth:
          config.smtp.user && config.smtp.password
            ? { user: config.smtp.user, pass: config.smtp.password }
            : undefined,
        pool: true,
        maxConnections: 3,
      });
    }
  }

  private async sendInvitation(
    email: string,
    name: string,
    token: string,
  ): Promise<void> {
    if (!this.mailer || !this.config.smtp) {
      throw new HttpError(
        503,
        "smtp_not_configured",
        "SMTP ist nicht konfiguriert; die Einladung wurde nicht versendet.",
      );
    }
    const link = `${this.config.publicBaseUrl}/?invitation=${encodeURIComponent(token)}`;
    await this.mailer.sendMail({
      from: this.config.smtp.from,
      to: email,
      subject: "Einladung zu CampaignHub",
      text: `Hallo ${name},\n\ndu wurdest zu CampaignHub eingeladen. Einladung annehmen: ${link}\n\nDer Link ist 7 Tage gültig.`,
      html: `<p>Hallo ${htmlEscape(name)},</p><p>du wurdest zu CampaignHub eingeladen.</p><p><a href="${htmlEscape(link)}">Einladung annehmen</a></p><p>Der Link ist 7 Tage gültig.</p>`,
    });
  }

  async handle(
    request: IncomingMessage,
    response: ServerResponse,
    pathname: string,
  ): Promise<boolean> {
    if (!pathname.startsWith("/api/invitations")) return false;

    if (pathname === "/api/invitations") {
      requireMethod(request, response, ["POST"]);
      const user = await this.auth.requireUser(request, ["Admin"]);
      const { json } = await readBody(request);
      if (!isRecord(json))
        throw new HttpError(
          400,
          "invalid_invitation",
          "Einladung ist ungültig.",
        );
      const email =
        typeof json.email === "string" ? json.email.trim().toLowerCase() : "";
      const name = typeof json.name === "string" ? json.name.trim() : "";
      const role = ["Worker", "Visitor", "Agent"].includes(String(json.role))
        ? (json.role as "Worker" | "Visitor" | "Agent")
        : null;
      const campaignIds = Array.isArray(json.campaignIds)
        ? json.campaignIds
            .filter((entry): entry is string => typeof entry === "string")
            .slice(0, 1_000)
        : [];
      if (
        !/^\S+@\S+\.\S+$/.test(email) ||
        !name ||
        name.length > 200 ||
        !role
      ) {
        throw new HttpError(
          400,
          "invalid_invitation",
          "Name, E-Mail oder Rolle ist ungültig.",
        );
      }
      const token = randomToken();
      const invitationId = randomUUID();
      await this.database.query(
        `INSERT INTO invitations(
           id, email, name, role, campaign_ids, token_hash, invited_by, expires_at
         ) VALUES ($1, $2, $3, $4, $5, $6, $7, now() + interval '7 days')`,
        [invitationId, email, name, role, campaignIds, sha256(token), user.id],
      );
      try {
        await this.sendInvitation(email, name, token);
      } catch (error) {
        await this.database.query("DELETE FROM invitations WHERE id = $1", [
          invitationId,
        ]);
        throw error;
      }
      sendJson(response, 201, { id: invitationId, expiresInSeconds: 604_800 });
      return true;
    }

    if (pathname === "/api/invitations/accept") {
      requireMethod(request, response, ["POST"]);
      const { json } = await readBody(request);
      if (
        !isRecord(json) ||
        typeof json.token !== "string" ||
        typeof json.password !== "string"
      ) {
        throw new HttpError(
          400,
          "invalid_invitation",
          "Token und Passwort sind erforderlich.",
        );
      }
      const invitationToken = json.token;
      const passwordHash = await hashPassword(json.password);
      await this.database.transaction(async (client) => {
        const result = await client.query<InvitationRow>(
          `SELECT * FROM invitations
           WHERE token_hash = $1 AND expires_at > now()
             AND accepted_at IS NULL AND revoked_at IS NULL
           FOR UPDATE`,
          [sha256(invitationToken)],
        );
        const invitation = result.rows[0];
        if (!invitation) {
          throw new HttpError(
            410,
            "invitation_invalid",
            "Die Einladung ist ungültig oder abgelaufen.",
          );
        }
        const userId = randomUUID();
        try {
          await client.query(
            `INSERT INTO users(id, email, name, role, password_hash)
             VALUES ($1, $2, $3, $4, $5)`,
            [
              userId,
              invitation.email,
              invitation.name,
              invitation.role,
              passwordHash,
            ],
          );
        } catch (error) {
          if (isRecord(error) && error.code === "23505") {
            throw new HttpError(
              409,
              "email_exists",
              "Für diese E-Mail existiert bereits ein Konto.",
            );
          }
          throw error;
        }
        await client.query(
          "UPDATE invitations SET accepted_at = now() WHERE id = $1",
          [invitation.id],
        );
        // App-state participant creation is deliberately performed by the
        // authenticated admin UI after login; the identity itself is canonical.
      });
      sendJson(response, 204, null);
      return true;
    }

    const revoke = /^\/api\/invitations\/([0-9a-f-]+)$/.exec(pathname);
    if (revoke) {
      requireMethod(request, response, ["DELETE"]);
      await this.auth.requireUser(request, ["Admin"]);
      await this.database.query(
        "UPDATE invitations SET revoked_at = now() WHERE id = $1 AND accepted_at IS NULL",
        [revoke[1]],
      );
      sendJson(response, 204, null);
      return true;
    }

    throw new HttpError(
      404,
      "not_found",
      "Einladungs-Endpunkt nicht gefunden.",
    );
  }
}
