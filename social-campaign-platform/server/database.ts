import { randomUUID } from "node:crypto";
import pg, { type PoolClient, type QueryResultRow } from "pg";
import type { RuntimeConfig } from "./config.js";
import { hashPassword } from "./security.js";

const { Pool } = pg;

export interface DatabaseClient {
  query<Row extends QueryResultRow = QueryResultRow>(
    text: string,
    values?: unknown[],
  ): Promise<pg.QueryResult<Row>>;
}

const EMPTY_APP_STATE = {
  users: [],
  campaigns: [],
  phases: [],
  milestones: [],
  workPackages: [],
  socialMediaAccounts: [],
  socialMediaPosts: [],
  mediaFiles: [],
  agents: [],
  workflows: [],
  participants: [],
  chatMessages: [],
  credentials: [],
  workflowRuns: [],
  settings: {
    aiProvider: "ollama",
    aiModel: "gemma3",
    aiEndpoint: "http://ollama:11434",
    apiKeyConfigured: false,
    socialSyncEnabled: true,
    workflowEngineEnabled: true,
  },
};

const MIGRATIONS = [
  {
    id: "001_core",
    sql: `
      CREATE EXTENSION IF NOT EXISTS pgcrypto;

      CREATE TABLE IF NOT EXISTS users (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        email text NOT NULL UNIQUE CHECK (email = lower(email)),
        name text NOT NULL CHECK (length(name) BETWEEN 1 AND 200),
        role text NOT NULL CHECK (role IN ('Admin', 'Worker', 'Visitor', 'Agent')),
        campaign_role text,
        avatar text,
        password_hash text NOT NULL,
        active boolean NOT NULL DEFAULT true,
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now()
      );

      CREATE TABLE IF NOT EXISTS sessions (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        token_hash text NOT NULL UNIQUE,
        user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        expires_at timestamptz NOT NULL,
        user_agent text,
        ip_address inet,
        created_at timestamptz NOT NULL DEFAULT now(),
        last_seen_at timestamptz NOT NULL DEFAULT now()
      );
      CREATE INDEX IF NOT EXISTS sessions_user_id_idx ON sessions(user_id);
      CREATE INDEX IF NOT EXISTS sessions_expiry_idx ON sessions(expires_at);

      CREATE TABLE IF NOT EXISTS login_attempts (
        id bigserial PRIMARY KEY,
        identity_hash text NOT NULL,
        successful boolean NOT NULL,
        attempted_at timestamptz NOT NULL DEFAULT now()
      );
      CREATE INDEX IF NOT EXISTS login_attempts_lookup_idx
        ON login_attempts(identity_hash, attempted_at DESC);

      CREATE TABLE IF NOT EXISTS app_state (
        id text PRIMARY KEY,
        version bigint NOT NULL DEFAULT 0,
        state jsonb NOT NULL,
        updated_at timestamptz NOT NULL DEFAULT now()
      );
      INSERT INTO app_state(id, state) VALUES ('default', '${JSON.stringify(EMPTY_APP_STATE)}'::jsonb)
        ON CONFLICT (id) DO NOTHING;

      CREATE TABLE IF NOT EXISTS command_receipts (
        id uuid PRIMARY KEY,
        user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        created_at timestamptz NOT NULL DEFAULT now()
      );
      CREATE INDEX IF NOT EXISTS command_receipts_created_idx ON command_receipts(created_at);

      CREATE TABLE IF NOT EXISTS media_objects (
        id uuid PRIMARY KEY,
        object_key text NOT NULL UNIQUE,
        original_name text NOT NULL,
        mime_type text NOT NULL,
        size_bytes bigint NOT NULL CHECK (size_bytes > 0),
        campaign_id text,
        tags text[] NOT NULL DEFAULT '{}',
        uploaded_by uuid NOT NULL REFERENCES users(id),
        created_at timestamptz NOT NULL DEFAULT now()
      );
      CREATE INDEX IF NOT EXISTS media_objects_campaign_idx ON media_objects(campaign_id);

      CREATE TABLE IF NOT EXISTS oauth_states (
        state_hash text PRIMARY KEY,
        provider text NOT NULL CHECK (provider IN ('youtube', 'meta', 'tiktok')),
        user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        verifier_encrypted text,
        return_path text NOT NULL DEFAULT '/admin',
        expires_at timestamptz NOT NULL,
        created_at timestamptz NOT NULL DEFAULT now()
      );

      CREATE TABLE IF NOT EXISTS provider_connections (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        provider text NOT NULL CHECK (provider IN ('youtube', 'meta', 'tiktok')),
        account_type text NOT NULL,
        provider_account_id text NOT NULL,
        display_name text NOT NULL,
        access_token_encrypted text NOT NULL,
        refresh_token_encrypted text,
        expires_at timestamptz,
        scopes text[] NOT NULL DEFAULT '{}',
        metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
        status text NOT NULL DEFAULT 'connected' CHECK (status IN ('connected', 'expired', 'revoked', 'error')),
        created_by uuid NOT NULL REFERENCES users(id),
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now(),
        UNIQUE(provider, account_type, provider_account_id)
      );

      CREATE TABLE IF NOT EXISTS publish_jobs (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        job_type text NOT NULL DEFAULT 'publish' CHECK (job_type IN ('publish', 'sync', 'workflow', 'email', 'token_health')),
        provider text CHECK (provider IN ('youtube', 'meta', 'tiktok')),
        connection_id uuid REFERENCES provider_connections(id) ON DELETE CASCADE,
        campaign_id text,
        status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'pending', 'running', 'completed', 'failed', 'cancelled')),
        payload jsonb NOT NULL,
        consent jsonb,
        scheduled_for timestamptz,
        attempts integer NOT NULL DEFAULT 0,
        max_attempts integer NOT NULL DEFAULT 5,
        locked_at timestamptz,
        locked_by text,
        external_id text,
        result jsonb,
        error_code text,
        error_message text,
        created_by uuid NOT NULL REFERENCES users(id),
        approved_by uuid REFERENCES users(id),
        approved_at timestamptz,
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now()
      );
      CREATE INDEX IF NOT EXISTS publish_jobs_worker_idx
        ON publish_jobs(status, scheduled_for, created_at);

      CREATE TABLE IF NOT EXISTS webhook_events (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        provider text NOT NULL CHECK (provider IN ('youtube', 'meta', 'tiktok')),
        provider_event_id text,
        signature_hash text,
        payload jsonb NOT NULL,
        received_at timestamptz NOT NULL DEFAULT now(),
        processed_at timestamptz,
        UNIQUE(provider, provider_event_id)
      );

      CREATE TABLE IF NOT EXISTS invitations (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        email text NOT NULL,
        name text NOT NULL,
        role text NOT NULL CHECK (role IN ('Worker', 'Visitor', 'Agent')),
        campaign_ids text[] NOT NULL DEFAULT '{}',
        token_hash text NOT NULL UNIQUE,
        invited_by uuid NOT NULL REFERENCES users(id),
        expires_at timestamptz NOT NULL,
        accepted_at timestamptz,
        revoked_at timestamptz,
        created_at timestamptz NOT NULL DEFAULT now()
      );
    `,
  },
] as const;

export class Database {
  readonly pool: pg.Pool;

  constructor(config: RuntimeConfig) {
    if (!config.databaseUrl) throw new Error("DATABASE_URL is not configured");
    this.pool = new Pool({
      connectionString: config.databaseUrl,
      max: 12,
      idleTimeoutMillis: 30_000,
      connectionTimeoutMillis: 10_000,
      ssl: config.databaseSsl ? { rejectUnauthorized: true } : undefined,
    });
  }

  async migrate(): Promise<void> {
    const client = await this.pool.connect();
    try {
      await client.query("SELECT pg_advisory_lock($1)", [821_042_771]);
      await client.query(`
        CREATE TABLE IF NOT EXISTS schema_migrations (
          id text PRIMARY KEY,
          applied_at timestamptz NOT NULL DEFAULT now()
        )
      `);
      for (const migration of MIGRATIONS) {
        const exists = await client.query<{ exists: boolean }>(
          "SELECT EXISTS(SELECT 1 FROM schema_migrations WHERE id = $1) AS exists",
          [migration.id],
        );
        if (exists.rows[0]?.exists) continue;
        await client.query("BEGIN");
        try {
          await client.query(migration.sql);
          await client.query("INSERT INTO schema_migrations(id) VALUES ($1)", [
            migration.id,
          ]);
          await client.query("COMMIT");
        } catch (error) {
          await client.query("ROLLBACK");
          throw error;
        }
      }
    } finally {
      await client.query("SELECT pg_advisory_unlock($1)", [821_042_771]);
      client.release();
    }
  }

  async bootstrapAdmin(config: RuntimeConfig): Promise<void> {
    if (!config.bootstrapAdminEmail && !config.bootstrapAdminPassword) return;
    if (!config.bootstrapAdminEmail || !config.bootstrapAdminPassword) {
      throw new Error(
        "BOOTSTRAP_ADMIN_EMAIL und BOOTSTRAP_ADMIN_PASSWORD müssen gemeinsam gesetzt werden.",
      );
    }
    const existing = await this.pool.query<{ count: string }>(
      "SELECT count(*)::text AS count FROM users",
    );
    if (Number(existing.rows[0]?.count ?? 0) > 0) return;
    const passwordHash = await hashPassword(config.bootstrapAdminPassword);
    await this.pool.query(
      `INSERT INTO users(id, email, name, role, password_hash)
       VALUES ($1, $2, $3, 'Admin', $4)`,
      [
        randomUUID(),
        config.bootstrapAdminEmail,
        config.bootstrapAdminName,
        passwordHash,
      ],
    );
  }

  async transaction<T>(
    operation: (client: PoolClient) => Promise<T>,
  ): Promise<T> {
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");
      const result = await operation(client);
      await client.query("COMMIT");
      return result;
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  }

  async query<Row extends QueryResultRow = QueryResultRow>(
    text: string,
    values: unknown[] = [],
  ): Promise<pg.QueryResult<Row>> {
    return this.pool.query<Row>(text, values);
  }

  async close(): Promise<void> {
    await this.pool.end();
  }
}

export async function initializeDatabase(
  config: RuntimeConfig,
): Promise<Database | undefined> {
  if (!config.databaseUrl) return undefined;
  const database = new Database(config);
  await database.migrate();
  await database.bootstrapAdmin(config);
  return database;
}
