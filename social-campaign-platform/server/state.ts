import { randomUUID } from "node:crypto";
import type { IncomingMessage, ServerResponse } from "node:http";
import { z } from "zod";
import type { AuthService, AuthUser, UserRole } from "./auth.js";
import type { RuntimeConfig } from "./config.js";
import type { Database, DatabaseClient } from "./database.js";
import { HttpError, readBody, requireMethod, sendJson } from "./http.js";

const id = z.string().trim().min(1).max(200);
const dateText = z.string().datetime({ offset: true });
const optionalDateText = dateText.optional();

const user = z
  .object({
    id,
    email: z.string().email().max(320),
    name: z.string().trim().min(1).max(200),
    role: z.enum(["Admin", "Worker", "Visitor", "Agent"]),
    campaignRole: z.string().max(300).optional(),
    avatar: z.string().max(4_000).optional(),
    createdAt: dateText,
    updatedAt: dateText,
  })
  .strict();

const campaign = z
  .object({
    id,
    name: z.string().trim().min(1).max(300),
    description: z.string().max(20_000),
    status: z.enum(["planning", "active", "paused", "completed", "archived"]),
    startDate: dateText,
    endDate: dateText,
    createdAt: dateText,
    updatedAt: dateText,
  })
  .strict();

const phase = z
  .object({
    id,
    campaignId: id,
    name: z.string().trim().min(1).max(300),
    description: z.string().max(20_000).optional(),
    startDate: dateText,
    endDate: dateText,
    status: z.enum(["upcoming", "current", "completed"]),
    order: z.number().int().min(0).max(10_000),
  })
  .strict();

const milestone = z
  .object({
    id,
    phaseId: id,
    name: z.string().trim().min(1).max(300),
    description: z.string().max(20_000).optional(),
    dueDate: dateText,
    status: z.enum(["pending", "in_progress", "completed", "blocked"]),
    order: z.number().int().min(0).max(10_000),
  })
  .strict();

const workPackage = z
  .object({
    id,
    milestoneId: id,
    title: z.string().trim().min(1).max(500),
    description: z.string().max(50_000),
    status: z.enum(["planned", "in_progress", "blocker", "finished"]),
    assigneeId: id.optional(),
    assigneeType: z.enum(["user", "agent"]),
    priority: z.enum(["low", "medium", "high", "critical"]),
    dueDate: optionalDateText,
    estimatedHours: z.number().min(0).max(1_000_000).optional(),
    actualHours: z.number().min(0).max(1_000_000).optional(),
    createdAt: dateText,
    updatedAt: dateText,
  })
  .strict();

const socialAccount = z
  .object({
    id,
    platform: z.string().trim().min(1).max(100),
    name: z.string().trim().min(1).max(300),
    email: z.string().max(320),
    url: z.string().url().max(2_048),
    apiEndpoint: z.string().url().max(2_048).optional(),
    connectionStatus: z.enum(["connected", "disconnected", "error"]),
    isActive: z.boolean(),
    campaignIds: z.array(id).max(1_000),
    lastSyncedAt: optionalDateText,
    createdAt: dateText,
    updatedAt: dateText,
  })
  .strict();

const socialPost = z
  .object({
    id,
    accountId: id,
    platform: z.string().min(1).max(100),
    content: z.string().max(100_000),
    mediaUrls: z.array(z.string().max(4_000)).max(20).optional(),
    postedAt: dateText,
    likes: z.number().int().min(0).optional(),
    shares: z.number().int().min(0).optional(),
    comments: z.number().int().min(0).optional(),
    engagement: z.number().min(0).optional(),
  })
  .strict();

const mediaFile = z
  .object({
    id,
    filename: z.string().min(1).max(500),
    originalName: z.string().min(1).max(500),
    mimeType: z.string().min(1).max(200),
    size: z
      .number()
      .int()
      .min(0)
      .max(20 * 1024 * 1024 * 1024),
    url: z.string().max(4_000),
    thumbnailUrl: z.string().max(4_000).optional(),
    uploadedBy: id.optional(),
    campaignId: id.optional(),
    tags: z.array(z.string().trim().min(1).max(100)).max(100).optional(),
    createdAt: dateText,
  })
  .strict();

const agent = z
  .object({
    id,
    name: z.string().trim().min(1).max(300),
    type: z.string().trim().min(1).max(200),
    description: z.string().max(20_000).optional(),
    isActive: z.boolean(),
    capabilities: z.array(z.string().max(200)).max(100),
    configuration: z.record(z.string(), z.unknown()),
    createdAt: dateText,
    updatedAt: dateText,
  })
  .strict();

const workflowStep = z
  .object({
    id,
    order: z.number().int().min(0).max(10_000),
    action: z.string().trim().min(1).max(300),
    agentId: id.optional(),
    parameters: z.record(z.string(), z.unknown()),
    condition: z.string().max(2_000).optional(),
  })
  .strict();

const workflow = z
  .object({
    id,
    name: z.string().trim().min(1).max(300),
    description: z.string().max(20_000).optional(),
    steps: z.array(workflowStep).max(100),
    triggerType: z.enum(["manual", "scheduled", "event"]),
    schedule: z.string().max(300).optional(),
    isActive: z.boolean(),
    campaignId: id.optional(),
    createdAt: dateText,
    updatedAt: dateText,
  })
  .strict();

const participant = z
  .object({
    id,
    userId: id.optional(),
    agentId: id.optional(),
    name: z.string().trim().min(1).max(300),
    email: z.string().max(320).optional(),
    role: z.string().trim().min(1).max(300),
    campaignIds: z.array(id).max(1_000),
    avatar: z.string().max(4_000).optional(),
    status: z.enum(["active", "invited", "inactive"]).optional(),
  })
  .strict();

const chatMessage = z
  .object({
    id,
    senderId: id,
    senderName: z.string().trim().min(1).max(300),
    content: z.string().trim().min(1).max(100_000),
    timestamp: dateText,
    isSystem: z.boolean().optional(),
    conversationId: id.optional(),
  })
  .strict();

const credential = z
  .object({
    id,
    userId: id,
    service: z.string().trim().min(1).max(300),
    username: z.string().trim().min(1).max(500),
    notes: z.string().max(20_000).optional(),
    createdAt: dateText,
    updatedAt: dateText,
  })
  .strict();

const workflowStepResult = z
  .object({
    stepId: id,
    action: z.string().max(300),
    agentId: id.optional(),
    status: z.enum(["running", "completed", "failed", "skipped"]),
    startedAt: dateText,
    completedAt: optionalDateText,
    output: z.string().max(30_000).optional(),
    error: z.string().max(5_000).optional(),
    model: z.string().max(300).optional(),
    promptTokens: z.number().int().min(0).optional(),
    completionTokens: z.number().int().min(0).optional(),
    totalDurationMs: z.number().min(0).optional(),
  })
  .strict();

const workflowRun = z
  .object({
    id,
    workflowId: id,
    status: z.enum(["running", "completed", "failed"]),
    startedAt: dateText,
    completedAt: optionalDateText,
    message: z.string().max(5_000).optional(),
    stepResults: z.array(workflowStepResult).max(100).optional(),
  })
  .strict();

const settings = z
  .object({
    aiProvider: z.enum(["ollama", "cloud"]),
    aiModel: z.string().trim().min(1).max(300),
    aiEndpoint: z.string().url().max(2_048),
    apiKeyConfigured: z.boolean(),
    socialSyncEnabled: z.boolean(),
    workflowEngineEnabled: z.boolean(),
  })
  .strict();

const domainState = z
  .object({
    users: z.array(user).max(100_000),
    campaigns: z.array(campaign).max(10_000),
    phases: z.array(phase).max(50_000),
    milestones: z.array(milestone).max(100_000),
    workPackages: z.array(workPackage).max(200_000),
    socialMediaAccounts: z.array(socialAccount).max(10_000),
    socialMediaPosts: z.array(socialPost).max(500_000),
    mediaFiles: z.array(mediaFile).max(100_000),
    agents: z.array(agent).max(10_000),
    workflows: z.array(workflow).max(10_000),
    participants: z.array(participant).max(100_000),
    chatMessages: z.array(chatMessage).max(500_000),
    credentials: z.array(credential).max(100_000),
    workflowRuns: z.array(workflowRun).max(100_000),
    settings,
  })
  .strict();

export type DomainState = z.infer<typeof domainState>;

const commandSchema = z
  .object({
    id: z.string().uuid(),
    version: z.number().int().min(0),
    state: domainState,
  })
  .strict();

interface StateRow {
  state: unknown;
  version: string;
}

interface UserRow {
  id: string;
  email: string;
  name: string;
  role: UserRole;
  campaign_role: string | null;
  avatar: string | null;
  created_at: Date;
  updated_at: Date;
}

function stateUser(row: UserRow): DomainState["users"][number] {
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

function campaignIdsForUser(
  state: DomainState,
  user: AuthUser,
): Set<string> | null {
  if (user.role === "Admin") return null;
  const participant = state.participants.find(
    (candidate) =>
      candidate.userId === user.id && candidate.status !== "inactive",
  );
  return new Set(participant?.campaignIds ?? []);
}

function redactForUser(state: DomainState, user: AuthUser): DomainState {
  const campaignIds = campaignIdsForUser(state, user);
  const visibleCampaigns = campaignIds
    ? state.campaigns.filter((entry) => campaignIds.has(entry.id))
    : state.campaigns;
  const visibleCampaignIds = new Set(visibleCampaigns.map((entry) => entry.id));
  const phases = state.phases.filter((entry) =>
    visibleCampaignIds.has(entry.campaignId),
  );
  const phaseIds = new Set(phases.map((entry) => entry.id));
  const milestones = state.milestones.filter((entry) =>
    phaseIds.has(entry.phaseId),
  );
  const milestoneIds = new Set(milestones.map((entry) => entry.id));
  const accounts = state.socialMediaAccounts.filter((entry) =>
    entry.campaignIds.some((campaignId) => visibleCampaignIds.has(campaignId)),
  );
  const accountIds = new Set(accounts.map((entry) => entry.id));
  const workflows = state.workflows.filter(
    (entry) => !entry.campaignId || visibleCampaignIds.has(entry.campaignId),
  );
  const workflowIds = new Set(workflows.map((entry) => entry.id));

  return {
    ...state,
    campaigns: visibleCampaigns,
    phases,
    milestones,
    workPackages: state.workPackages.filter((entry) =>
      milestoneIds.has(entry.milestoneId),
    ),
    socialMediaAccounts: accounts,
    socialMediaPosts: state.socialMediaPosts.filter((entry) =>
      accountIds.has(entry.accountId),
    ),
    mediaFiles: state.mediaFiles.filter(
      (entry) => !entry.campaignId || visibleCampaignIds.has(entry.campaignId),
    ),
    workflows,
    workflowRuns: state.workflowRuns.filter((entry) =>
      workflowIds.has(entry.workflowId),
    ),
    participants: state.participants.filter((entry) =>
      entry.campaignIds.some((campaignId) =>
        visibleCampaignIds.has(campaignId),
      ),
    ),
    credentials: state.credentials.filter((entry) => entry.userId === user.id),
  };
}

function assertUniqueIds(state: DomainState): void {
  for (const [name, collection] of Object.entries(state)) {
    if (!Array.isArray(collection)) continue;
    const ids = collection.flatMap((entry) => {
      if (!entry || typeof entry !== "object" || !("id" in entry)) return [];
      const entryId = (entry as { id?: unknown }).id;
      return typeof entryId === "string" ? [entryId] : [];
    });
    if (new Set(ids).size !== ids.length) {
      throw new HttpError(400, "duplicate_ids", `Doppelte IDs in ${name}.`);
    }
  }
}

function assertReferences(state: DomainState): void {
  const campaignIds = new Set(state.campaigns.map((entry) => entry.id));
  const phaseIds = new Set(state.phases.map((entry) => entry.id));
  const milestoneIds = new Set(state.milestones.map((entry) => entry.id));
  const userIds = new Set(state.users.map((entry) => entry.id));
  const agentIds = new Set(state.agents.map((entry) => entry.id));
  const accountIds = new Set(
    state.socialMediaAccounts.map((entry) => entry.id),
  );
  const workflowIds = new Set(state.workflows.map((entry) => entry.id));

  if (state.phases.some((entry) => !campaignIds.has(entry.campaignId))) {
    throw new HttpError(
      400,
      "invalid_reference",
      "Eine Phase verweist auf eine unbekannte Kampagne.",
    );
  }
  if (state.milestones.some((entry) => !phaseIds.has(entry.phaseId))) {
    throw new HttpError(
      400,
      "invalid_reference",
      "Ein Meilenstein verweist auf eine unbekannte Phase.",
    );
  }
  if (
    state.workPackages.some((entry) => !milestoneIds.has(entry.milestoneId))
  ) {
    throw new HttpError(
      400,
      "invalid_reference",
      "Ein Arbeitspaket verweist auf einen unbekannten Meilenstein.",
    );
  }
  if (
    state.socialMediaPosts.some((entry) => !accountIds.has(entry.accountId))
  ) {
    throw new HttpError(
      400,
      "invalid_reference",
      "Ein Social Post verweist auf ein unbekanntes Konto.",
    );
  }
  if (
    state.workflows.some(
      (entry) => entry.campaignId && !campaignIds.has(entry.campaignId),
    )
  ) {
    throw new HttpError(
      400,
      "invalid_reference",
      "Ein Workflow verweist auf eine unbekannte Kampagne.",
    );
  }
  if (
    state.workflows.some((entry) =>
      entry.steps.some((step) => step.agentId && !agentIds.has(step.agentId)),
    )
  ) {
    throw new HttpError(
      400,
      "invalid_reference",
      "Ein Workflow verweist auf einen unbekannten Agenten.",
    );
  }
  if (state.workflowRuns.some((entry) => !workflowIds.has(entry.workflowId))) {
    throw new HttpError(
      400,
      "invalid_reference",
      "Ein Lauf verweist auf einen unbekannten Workflow.",
    );
  }
  if (
    state.participants.some(
      (entry) => entry.userId && !userIds.has(entry.userId),
    )
  ) {
    throw new HttpError(
      400,
      "invalid_reference",
      "Ein Teilnehmer verweist auf einen unbekannten Nutzer.",
    );
  }
  for (const entry of [...state.participants, ...state.socialMediaAccounts]) {
    if (entry.campaignIds.some((campaignId) => !campaignIds.has(campaignId))) {
      throw new HttpError(
        400,
        "invalid_reference",
        "Eine Kampagnenzuordnung ist ungültig.",
      );
    }
  }
}

function roleCanWrite(role: UserRole): boolean {
  return role === "Admin" || role === "Worker";
}

function assertScopedWrite(
  current: DomainState,
  next: DomainState,
  user: AuthUser,
): void {
  if (user.role === "Admin") return;
  if (!roleCanWrite(user.role)) {
    throw new HttpError(403, "read_only", "Diese Rolle hat nur Lesezugriff.");
  }
  const allowed = campaignIdsForUser(current, user) ?? new Set<string>();
  const currentById = new Map(
    current.campaigns.map((entry) => [entry.id, entry]),
  );
  for (const entry of next.campaigns) {
    const before = currentById.get(entry.id);
    if (!before || JSON.stringify(before) !== JSON.stringify(entry)) {
      if (!allowed.has(entry.id)) {
        throw new HttpError(
          403,
          "campaign_forbidden",
          "Kampagne nicht zugewiesen.",
        );
      }
    }
  }
  for (const entry of current.campaigns) {
    if (
      !next.campaigns.some((candidate) => candidate.id === entry.id) &&
      !allowed.has(entry.id)
    ) {
      throw new HttpError(
        403,
        "campaign_forbidden",
        "Kampagne nicht zugewiesen.",
      );
    }
  }
  // Global administration and secrets stay admin-only. Workers can modify
  // campaign-scoped domain entities, but never identities or system settings.
  if (
    JSON.stringify(current.settings) !== JSON.stringify(next.settings) ||
    JSON.stringify(current.agents) !== JSON.stringify(next.agents) ||
    JSON.stringify(current.credentials) !== JSON.stringify(next.credentials)
  ) {
    throw new HttpError(
      403,
      "admin_required",
      "Diese Änderung erfordert Admin-Rechte.",
    );
  }
}

export class StateService {
  constructor(
    private readonly database: Database,
    private readonly auth: AuthService,
    private readonly config: RuntimeConfig,
  ) {}

  private async load(
    client: DatabaseClient = this.database,
  ): Promise<{ state: DomainState; version: number }> {
    const [result, users] = await Promise.all([
      client.query<StateRow>(
        "SELECT state, version::text AS version FROM app_state WHERE id = 'default'",
      ),
      client.query<UserRow>(
        `SELECT id, email, name, role, campaign_role, avatar, created_at, updated_at
         FROM users WHERE active = true ORDER BY created_at`,
      ),
    ]);
    const row = result.rows[0];
    if (!row) throw new Error("Application state is missing");
    const stored = domainState.parse(row.state);
    return {
      state: { ...stored, users: users.rows.map(stateUser) },
      version: Number(row.version),
    };
  }

  private async syncUsers(
    client: DatabaseClient,
    current: DomainState,
    next: DomainState,
    actor: AuthUser,
  ): Promise<void> {
    if (JSON.stringify(current.users) === JSON.stringify(next.users)) return;
    if (actor.role !== "Admin") {
      throw new HttpError(
        403,
        "admin_required",
        "Nutzerverwaltung erfordert Admin-Rechte.",
      );
    }
    const nextIds = new Set(next.users.map((entry) => entry.id));
    const adminCount = next.users.filter(
      (entry) => entry.role === "Admin",
    ).length;
    if (adminCount < 1) {
      throw new HttpError(
        409,
        "last_admin",
        "Mindestens ein Admin muss erhalten bleiben.",
      );
    }
    if (!nextIds.has(actor.id)) {
      throw new HttpError(
        409,
        "cannot_delete_self",
        "Das eigene Konto kann nicht gelöscht werden.",
      );
    }
    for (const entry of next.users) {
      await client.query(
        `INSERT INTO users(
          id, email, name, role, campaign_role, avatar, password_hash, active,
          created_at, updated_at
        ) VALUES ($1, lower($2), $3, $4, $5, $6, 'disabled', false, $7, now())
        ON CONFLICT (id) DO UPDATE SET
          email = lower(EXCLUDED.email), name = EXCLUDED.name,
          role = EXCLUDED.role, campaign_role = EXCLUDED.campaign_role,
          avatar = EXCLUDED.avatar, updated_at = now()`,
        [
          entry.id,
          entry.email,
          entry.name,
          entry.role,
          entry.campaignRole ?? null,
          entry.avatar ?? null,
          entry.createdAt,
        ],
      );
    }
    const removedIds = current.users
      .filter((entry) => !nextIds.has(entry.id))
      .map((entry) => entry.id);
    if (removedIds.length) {
      await client.query("DELETE FROM users WHERE id = ANY($1::uuid[])", [
        removedIds,
      ]);
    }
  }

  async handle(
    request: IncomingMessage,
    response: ServerResponse,
    pathname: string,
  ): Promise<boolean> {
    if (pathname !== "/api/state") return false;
    if (request.method === "GET") {
      const user = await this.auth.requireUser(request);
      const { state, version } = await this.load();
      sendJson(response, 200, { state: redactForUser(state, user), version });
      return true;
    }
    requireMethod(request, response, ["PUT"]);
    const origin = Array.isArray(request.headers.origin)
      ? undefined
      : request.headers.origin;
    if (
      !origin ||
      new URL(origin).origin !== new URL(this.config.publicBaseUrl).origin
    ) {
      throw new HttpError(403, "invalid_origin", "Ungültiger Request-Ursprung.");
    }
    const user = await this.auth.requireUser(request);
    const { json } = await readBody(request, 20 * 1024 * 1024);
    const parsed = commandSchema.safeParse(json);
    if (!parsed.success) {
      throw new HttpError(
        400,
        "invalid_state",
        "Der Datenstand ist ungültig.",
        {
          issues: parsed.error.issues.slice(0, 20).map((issue) => ({
            path: issue.path.join("."),
            message: issue.message,
          })),
        },
      );
    }
    assertUniqueIds(parsed.data.state);
    assertReferences(parsed.data.state);

    const result = await this.database.transaction(async (client) => {
      const duplicate = await client.query(
        "SELECT 1 FROM command_receipts WHERE id = $1",
        [parsed.data.id],
      );
      const locked = await client.query<StateRow>(
        "SELECT state, version::text AS version FROM app_state WHERE id = 'default' FOR UPDATE",
      );
      const row = locked.rows[0];
      if (!row) throw new Error("Application state is missing");
      const storedCurrent = domainState.parse(row.state);
      const currentUsers = await client.query<UserRow>(
        `SELECT id, email, name, role, campaign_role, avatar, created_at, updated_at
         FROM users WHERE active = true ORDER BY created_at`,
      );
      const current: DomainState = {
        ...storedCurrent,
        users: currentUsers.rows.map(stateUser),
      };
      const currentVersion = Number(row.version);
      if (duplicate.rowCount)
        return { state: current, version: currentVersion };
      if (currentVersion !== parsed.data.version) {
        throw new HttpError(
          409,
          "version_conflict",
          "Daten wurden zwischenzeitlich geändert.",
          {
            version: currentVersion,
          },
        );
      }
      assertScopedWrite(current, parsed.data.state, user);
      await this.syncUsers(client, current, parsed.data.state, user);
      await client.query(
        `UPDATE app_state SET state = $1::jsonb, version = version + 1, updated_at = now()
         WHERE id = 'default'`,
        [JSON.stringify(parsed.data.state)],
      );
      await client.query(
        "INSERT INTO command_receipts(id, user_id) VALUES ($1, $2)",
        [parsed.data.id || randomUUID(), user.id],
      );
      return { state: parsed.data.state, version: currentVersion + 1 };
    });
    sendJson(response, 200, {
      state: redactForUser(result.state, user),
      version: result.version,
    });
    return true;
  }
}
