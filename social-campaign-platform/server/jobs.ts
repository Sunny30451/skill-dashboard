import { randomUUID } from "node:crypto";
import type { IncomingMessage, ServerResponse } from "node:http";
import { CronExpressionParser } from "cron-parser";
import type { AuthService } from "./auth.js";
import type { Database } from "./database.js";
import { HttpError, readBody, requireMethod, sendJson } from "./http.js";

export type PublishProvider = "youtube" | "meta" | "tiktok";

export interface JobRow {
  id: string;
  job_type: "publish" | "sync" | "workflow" | "email" | "token_health";
  provider: PublishProvider | null;
  connection_id: string | null;
  campaign_id: string | null;
  status:
    "draft" | "pending" | "running" | "completed" | "failed" | "cancelled";
  payload: Record<string, unknown>;
  consent: Record<string, unknown> | null;
  scheduled_for: Date | null;
  attempts: number;
  max_attempts: number;
  created_by: string;
  approved_by: string | null;
  created_at: Date;
  updated_at: Date;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function provider(value: unknown): PublishProvider | null {
  return value === "youtube" || value === "meta" || value === "tiktok"
    ? value
    : null;
}

function validatePayload(value: unknown): Record<string, unknown> {
  if (!isRecord(value))
    throw new HttpError(400, "invalid_payload", "Job-Payload ist ungültig.");
  const serialized = JSON.stringify(value);
  if (Buffer.byteLength(serialized) > 1024 * 1024) {
    throw new HttpError(413, "payload_too_large", "Job-Payload ist zu groß.");
  }
  return value;
}

function jobJson(row: JobRow) {
  return {
    id: row.id,
    jobType: row.job_type,
    provider: row.provider,
    connectionId: row.connection_id,
    campaignId: row.campaign_id,
    status: row.status,
    payload: row.payload,
    consent: row.consent,
    scheduledFor: row.scheduled_for?.toISOString(),
    attempts: row.attempts,
    maxAttempts: row.max_attempts,
    createdBy: row.created_by,
    approvedBy: row.approved_by,
    createdAt: row.created_at.toISOString(),
    updatedAt: row.updated_at.toISOString(),
  };
}

export class JobService {
  constructor(
    private readonly database: Database,
    private readonly auth: AuthService,
  ) {}

  async handle(
    request: IncomingMessage,
    response: ServerResponse,
    pathname: string,
  ): Promise<boolean> {
    if (!pathname.startsWith("/api/jobs")) return false;
    const user = await this.auth.requireUser(request);

    if (pathname === "/api/jobs") {
      if (request.method === "GET") {
        const result = await this.database.query<JobRow>(
          `SELECT * FROM publish_jobs
           WHERE ($1 = 'Admin' OR created_by = $2)
           ORDER BY created_at DESC LIMIT 200`,
          [user.role, user.id],
        );
        sendJson(response, 200, { jobs: result.rows.map(jobJson) });
        return true;
      }
      requireMethod(request, response, ["POST"]);
      if (user.role === "Visitor" || user.role === "Agent") {
        throw new HttpError(
          403,
          "forbidden",
          "Keine Berechtigung zum Erstellen von Jobs.",
        );
      }
      const { json } = await readBody(request, 2 * 1024 * 1024);
      if (!isRecord(json))
        throw new HttpError(400, "invalid_job", "Job ist ungültig.");
      const selectedProvider = provider(json.provider);
      const connectionId =
        typeof json.connectionId === "string" ? json.connectionId : "";
      const campaignId =
        typeof json.campaignId === "string" ? json.campaignId : null;
      const scheduledFor =
        typeof json.scheduledFor === "string" && json.scheduledFor
          ? new Date(json.scheduledFor)
          : null;
      if (!selectedProvider || !/^[0-9a-f-]{36}$/i.test(connectionId)) {
        throw new HttpError(
          400,
          "invalid_job",
          "Provider oder Verbindung ist ungültig.",
        );
      }
      if (scheduledFor && !Number.isFinite(scheduledFor.getTime())) {
        throw new HttpError(400, "invalid_schedule", "Zeitpunkt ist ungültig.");
      }
      const payload = validatePayload(json.payload);
      const result = await this.database.query<JobRow>(
        `INSERT INTO publish_jobs(
           id, provider, connection_id, campaign_id, payload, scheduled_for, created_by
         ) VALUES ($1, $2, $3, $4, $5::jsonb, $6, $7) RETURNING *`,
        [
          randomUUID(),
          selectedProvider,
          connectionId,
          campaignId,
          JSON.stringify(payload),
          scheduledFor,
          user.id,
        ],
      );
      sendJson(response, 201, { job: jobJson(result.rows[0]!) });
      return true;
    }

    const approval = /^\/api\/jobs\/([0-9a-f-]+)\/approve$/.exec(pathname);
    if (approval) {
      requireMethod(request, response, ["POST"]);
      if (user.role !== "Admin" && user.role !== "Worker") {
        throw new HttpError(403, "forbidden", "Keine Freigabeberechtigung.");
      }
      const { json } = await readBody(request);
      if (!isRecord(json) || json.confirmed !== true) {
        throw new HttpError(
          400,
          "explicit_consent_required",
          "Explizite Bestätigung ist erforderlich.",
        );
      }
      const consent = {
        confirmed: true,
        confirmedAt: new Date().toISOString(),
        account:
          typeof json.account === "string" ? json.account.slice(0, 500) : "",
        contentHash:
          typeof json.contentHash === "string"
            ? json.contentHash.slice(0, 200)
            : "",
        privacy:
          typeof json.privacy === "string" ? json.privacy.slice(0, 100) : "",
      };
      const result = await this.database.query<JobRow>(
        `UPDATE publish_jobs
         SET status = 'pending', consent = $1::jsonb, approved_by = $2,
             approved_at = now(), updated_at = now()
         WHERE id = $3 AND status = 'draft'
           AND ($4 = 'Admin' OR created_by = $2)
         RETURNING *`,
        [JSON.stringify(consent), user.id, approval[1], user.role],
      );
      const row = result.rows[0];
      if (!row)
        throw new HttpError(
          409,
          "job_not_approvable",
          "Job kann nicht freigegeben werden.",
        );
      sendJson(response, 200, { job: jobJson(row) });
      return true;
    }

    const cancellation = /^\/api\/jobs\/([0-9a-f-]+)$/.exec(pathname);
    if (cancellation) {
      requireMethod(request, response, ["DELETE"]);
      const result = await this.database.query(
        `UPDATE publish_jobs SET status = 'cancelled', updated_at = now()
         WHERE id = $1 AND status IN ('draft', 'pending')
           AND ($2 = 'Admin' OR created_by = $3)`,
        [cancellation[1], user.role, user.id],
      );
      if (!result.rowCount)
        throw new HttpError(
          409,
          "job_not_cancellable",
          "Job kann nicht abgebrochen werden.",
        );
      sendJson(response, 204, null);
      return true;
    }

    throw new HttpError(404, "not_found", "Job-Endpunkt nicht gefunden.");
  }
}

export type JobExecutor = (job: JobRow) => Promise<Record<string, unknown>>;

export class DurableWorker {
  private running = false;
  private timer?: NodeJS.Timeout;
  private readonly workerId = randomUUID();

  constructor(
    private readonly database: Database,
    private readonly executor: JobExecutor,
    private readonly intervalMs = 3_000,
  ) {}

  start(): void {
    if (this.running) return;
    this.running = true;
    void this.tick();
  }

  stop(): void {
    this.running = false;
    if (this.timer) clearTimeout(this.timer);
  }

  private schedule(): void {
    if (!this.running) return;
    this.timer = setTimeout(() => void this.tick(), this.intervalMs);
    this.timer.unref();
  }

  private async claim(): Promise<JobRow | undefined> {
    return this.database.transaction(async (client) => {
      const result = await client.query<JobRow>(
        `SELECT * FROM publish_jobs
         WHERE status = 'pending' AND coalesce(scheduled_for, now()) <= now()
           AND consent IS NOT NULL
         ORDER BY coalesce(scheduled_for, created_at), created_at
         FOR UPDATE SKIP LOCKED LIMIT 1`,
      );
      const row = result.rows[0];
      if (!row) return undefined;
      const claimed = await client.query<JobRow>(
        `UPDATE publish_jobs
         SET status = 'running', locked_at = now(), locked_by = $1,
             attempts = attempts + 1, updated_at = now()
         WHERE id = $2 RETURNING *`,
        [this.workerId, row.id],
      );
      return claimed.rows[0];
    });
  }

  private async tick(): Promise<void> {
    try {
      const job = await this.claim();
      if (!job) return;
      try {
        const result = await this.executor(job);
        await this.database.query(
          `UPDATE publish_jobs SET status = 'completed', result = $1::jsonb,
           locked_at = NULL, locked_by = NULL, updated_at = now() WHERE id = $2`,
          [JSON.stringify(result), job.id],
        );
      } catch (error) {
        const retry = job.attempts < job.max_attempts;
        const delaySeconds = Math.min(
          6 * 60 * 60,
          30 * 2 ** Math.max(0, job.attempts - 1),
        );
        await this.database.query(
          `UPDATE publish_jobs SET status = $1,
           scheduled_for = CASE WHEN $1 = 'pending' THEN now() + ($2 * interval '1 second') ELSE scheduled_for END,
           error_code = $3, error_message = $4, locked_at = NULL, locked_by = NULL,
           updated_at = now() WHERE id = $5`,
          [
            retry ? "pending" : "failed",
            delaySeconds,
            error instanceof HttpError ? error.code : "provider_error",
            error instanceof Error
              ? error.message.slice(0, 2_000)
              : "Provider action failed",
            job.id,
          ],
        );
      }
    } catch (error) {
      console.error("Worker tick failed", error);
    } finally {
      this.schedule();
    }
  }
}

export function nextCronRun(
  expression: string,
  currentDate = new Date(),
): Date {
  try {
    return CronExpressionParser.parse(expression, {
      currentDate,
      tz: "UTC",
    })
      .next()
      .toDate();
  } catch {
    throw new HttpError(400, "invalid_cron", "Cron-Ausdruck ist ungültig.");
  }
}
