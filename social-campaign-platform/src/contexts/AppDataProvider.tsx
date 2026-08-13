import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import {
  mockAgents,
  mockCampaigns,
  mockChatMessages,
  mockCredentials,
  mockMediaFiles,
  mockMilestones,
  mockParticipants,
  mockPhases,
  mockSocialMediaAccounts,
  mockSocialMediaPosts,
  mockUsers,
  mockWorkflows,
  mockWorkPackages,
} from "../mock-data";
import { chatWithOllama, type OllamaMessage } from "../services/ollama";
import {
  BackendError,
  fetchBackendState,
  isBackendEnabled,
  saveBackendState,
} from "../services/backend";
import type {
  Agent,
  Campaign,
  ChatMessage,
  Credential,
  MediaFile,
  Milestone,
  Participant,
  Phase,
  SocialMediaAccount,
  User,
  Workflow,
  WorkflowRun,
  WorkflowStep,
  WorkflowStepResult,
  WorkPackage,
} from "../types";
import {
  AppDataContext,
  type AppDataContextValue,
  type AppDataState,
  type NewAgent,
  type NewCampaign,
  type NewCredential,
  type NewMediaFile,
  type NewMilestone,
  type NewParticipant,
  type NewPhase,
  type NewSocialMediaAccount,
  type NewUser,
  type NewWorkflow,
  type NewWorkPackage,
} from "./app-data";

const STORAGE_KEY = "campaignhub-data";
const STORAGE_VERSION = 3;

const initialSettings: AppDataState["settings"] = {
  aiProvider: "ollama",
  aiModel: "gemma3",
  aiEndpoint: "http://127.0.0.1:11434",
  apiKeyConfigured: false,
  socialSyncEnabled: true,
  workflowEngineEnabled: true,
};

function reviveDates(key: string, value: unknown): unknown {
  if (
    typeof value === "string" &&
    (/(At|Date)$/.test(key) || key === "timestamp") &&
    /^\d{4}-\d{2}-\d{2}T/.test(value)
  ) {
    return new Date(value);
  }
  return value;
}

function cloneWithDates<T>(value: T): T {
  return JSON.parse(JSON.stringify(value), reviveDates) as T;
}

function errorMessage(error: unknown): string {
  return error instanceof Error && error.message.trim()
    ? error.message
    : "Die Ausführung ist fehlgeschlagen.";
}

function summarizeParameters(parameters: Record<string, unknown>): string {
  return Object.keys(parameters).length > 0
    ? JSON.stringify(parameters, null, 2)
    : "Keine zusätzlichen Parameter.";
}

function buildAgentSystemPrompt(agent: Agent): string {
  const capabilities = agent.capabilities.length
    ? agent.capabilities.join(", ")
    : "allgemeine Assistenz";
  return [
    `Du bist der CampaignHub-Agent „${agent.name}“ (${agent.type}).`,
    agent.description?.trim(),
    `Fähigkeiten: ${capabilities}.`,
    "Antworte konkret, wahrheitsgemäß und in der Sprache der Anfrage. Behaupte keine externen Aktionen, die du nicht wirklich ausgeführt hast.",
  ]
    .filter(Boolean)
    .join("\n");
}

const MAX_PERSISTED_OUTPUT_LENGTH = 20_000;

function capPersistedOutput(value: string): string {
  const trimmed = value.trim();
  return trimmed.length <= MAX_PERSISTED_OUTPUT_LENGTH
    ? trimmed
    : `${trimmed.slice(0, MAX_PERSISTED_OUTPUT_LENGTH)}\n\n[Ausgabe für die lokale Speicherung gekürzt]`;
}

function agentTemperature(agent: Agent): number | undefined {
  const value = agent.configuration.temperature;
  return typeof value === "number" && Number.isFinite(value)
    ? Math.min(2, Math.max(0, value))
    : undefined;
}

function agentMaxTokens(agent: Agent): number | undefined {
  const value = agent.configuration.maxTokens;
  return typeof value === "number" && Number.isFinite(value)
    ? Math.min(131_072, Math.max(1, Math.trunc(value)))
    : undefined;
}

function agentModel(agent: Agent, fallback: string): string {
  const configured = agent.configuration.model;
  return typeof configured === "string" && configured.trim()
    ? configured.trim()
    : fallback;
}

function truncatePromptPart(value: string, limit = 8_000): string {
  return value.length <= limit
    ? value
    : `${value.slice(0, limit)}\n[Kontext gekürzt]`;
}

function workPackagesForCampaign(
  snapshot: AppDataState,
  campaignId?: string,
): WorkPackage[] {
  if (!campaignId) return snapshot.workPackages;
  const phaseIds = new Set(
    snapshot.phases
      .filter((phase) => phase.campaignId === campaignId)
      .map((phase) => phase.id),
  );
  const milestoneIds = new Set(
    snapshot.milestones
      .filter((milestone) => phaseIds.has(milestone.phaseId))
      .map((milestone) => milestone.id),
  );
  return snapshot.workPackages.filter((workPackage) =>
    milestoneIds.has(workPackage.milestoneId),
  );
}

function campaignContext(snapshot: AppDataState, workflow: Workflow): string {
  const campaign = workflow.campaignId
    ? snapshot.campaigns.find((entry) => entry.id === workflow.campaignId)
    : undefined;
  if (!campaign) return "Keine Kampagne ist diesem Workflow zugeordnet.";
  const tasks = workPackagesForCampaign(snapshot, campaign.id);
  return JSON.stringify(
    {
      id: campaign.id,
      name: campaign.name,
      description: campaign.description,
      status: campaign.status,
      startDate: campaign.startDate,
      endDate: campaign.endDate,
      tasks: tasks.map((task) => ({
        title: task.title,
        status: task.status,
        priority: task.priority,
        dueDate: task.dueDate,
      })),
    },
    null,
    2,
  );
}

function executeLocalWorkflowStep(
  step: WorkflowStep,
  workflow: Workflow,
  snapshot: AppDataState,
): string {
  const action = step.action.trim().toLowerCase();
  if (action === "fetch-scheduled-content") {
    const tasks = workPackagesForCampaign(snapshot, workflow.campaignId)
      .filter((task) => task.status !== "finished")
      .sort((left, right) => {
        const leftDue = left.dueDate
          ? new Date(left.dueDate).getTime()
          : Infinity;
        const rightDue = right.dueDate
          ? new Date(right.dueDate).getTime()
          : Infinity;
        return leftDue - rightDue;
      });
    return capPersistedOutput(
      [
        "Lokale Inhaltsplanung aus offenen CampaignHub-Arbeitspaketen. Es wurden keine externen Plattformdaten abgerufen.",
        `Angefragtes Zeitfenster: ${String(step.parameters.timeWindow ?? "nicht angegeben")}`,
        JSON.stringify(
          tasks.map((task) => ({
            id: task.id,
            title: task.title,
            description: task.description,
            status: task.status,
            priority: task.priority,
            dueDate: task.dueDate,
          })),
          null,
          2,
        ),
      ].join("\n\n"),
    );
  }

  if (action === "collect-metrics") {
    const campaignAccountIds = workflow.campaignId
      ? new Set(
          snapshot.socialMediaAccounts
            .filter((account) =>
              account.campaignIds.includes(workflow.campaignId!),
            )
            .map((account) => account.id),
        )
      : null;
    const period = String(step.parameters.period ?? "")
      .trim()
      .toLowerCase();
    const periodMatch = /^(\d+)(h|d)$/.exec(period);
    const cutoff = periodMatch
      ? Date.now() -
        Number(periodMatch[1]) *
          (periodMatch[2] === "h" ? 60 * 60 * 1_000 : 24 * 60 * 60 * 1_000)
      : null;
    const posts = snapshot.socialMediaPosts.filter(
      (post) =>
        (!campaignAccountIds || campaignAccountIds.has(post.accountId)) &&
        (cutoff === null || new Date(post.postedAt).getTime() >= cutoff),
    );
    const totals = posts.reduce(
      (result, post) => ({
        likes: result.likes + (post.likes ?? 0),
        shares: result.shares + (post.shares ?? 0),
        comments: result.comments + (post.comments ?? 0),
        engagement: result.engagement + (post.engagement ?? 0),
      }),
      { likes: 0, shares: 0, comments: 0, engagement: 0 },
    );
    return capPersistedOutput(
      [
        "Lokal aggregierte Kennzahlen aus den in CampaignHub gespeicherten Posts. Es wurde keine Plattform synchronisiert.",
        JSON.stringify(
          {
            requestedPeriod: period || "gesamter lokaler Datenbestand",
            postCount: posts.length,
            likes: totals.likes,
            shares: totals.shares,
            comments: totals.comments,
            averageEngagement:
              posts.length > 0
                ? Number((totals.engagement / posts.length).toFixed(2))
                : 0,
          },
          null,
          2,
        ),
      ].join("\n\n"),
    );
  }

  if (action === "alert-team") {
    return capPersistedOutput(
      `Lokaler Team-Hinweis für Workflow „${workflow.name}“: ${JSON.stringify(step.parameters)}. Es wurde keine externe Nachricht versendet.`,
    );
  }

  if (action === "publish-to-platforms" || action === "send-email") {
    throw new Error(
      `„${step.action}“ benötigt eine nicht konfigurierte externe Integration. Aus Sicherheitsgründen wurde keine Aktion simuliert.`,
    );
  }
  throw new Error(
    `„${step.action}“ ist kein unterstützter lokaler Datenschritt und hat keinen Agenten.`,
  );
}

function shouldSkipWorkflowStep(
  condition: string | undefined,
  previousResults: WorkflowStepResult[],
): boolean {
  const normalized = condition?.trim().toLowerCase();
  if (!normalized || normalized === "always") return false;
  if (normalized === "never") return true;
  if (normalized === "previous.failed") {
    return previousResults.at(-1)?.status !== "failed";
  }
  if (normalized === "previous.completed") {
    return previousResults.at(-1)?.status !== "completed";
  }
  throw new Error(
    `Die Bedingung „${condition}“ wird nicht unterstützt. Zulässig sind: always, never, previous.completed und previous.failed.`,
  );
}

function makeInitialState(): AppDataState {
  return cloneWithDates({
    users: mockUsers,
    campaigns: mockCampaigns,
    phases: mockPhases,
    milestones: mockMilestones,
    workPackages: mockWorkPackages,
    socialMediaAccounts: mockSocialMediaAccounts,
    socialMediaPosts: mockSocialMediaPosts,
    mediaFiles: mockMediaFiles,
    agents: mockAgents,
    workflows: mockWorkflows,
    participants: mockParticipants,
    chatMessages: mockChatMessages,
    credentials: mockCredentials,
    workflowRuns: [],
    settings: initialSettings,
  });
}

function persistState(state: AppDataState): void {
  localStorage.setItem(
    STORAGE_KEY,
    JSON.stringify({ version: STORAGE_VERSION, state }),
  );
}

const stateCollectionKeys = [
  "users",
  "campaigns",
  "phases",
  "milestones",
  "workPackages",
  "socialMediaAccounts",
  "socialMediaPosts",
  "mediaFiles",
  "agents",
  "workflows",
  "participants",
  "chatMessages",
  "credentials",
  "workflowRuns",
] as const;

function isStoredState(value: unknown): value is AppDataState {
  if (!value || typeof value !== "object") return false;
  const candidate = value as Record<string, unknown>;
  const settings = candidate.settings as Record<string, unknown> | undefined;
  return (
    stateCollectionKeys.every(
      (key) =>
        Array.isArray(candidate[key]) &&
        candidate[key].every(
          (entry) =>
            Boolean(entry) &&
            typeof entry === "object" &&
            typeof (entry as Record<string, unknown>).id === "string",
        ),
    ) &&
    Boolean(settings) &&
    (settings?.aiProvider === "ollama" || settings?.aiProvider === "cloud") &&
    typeof settings.aiModel === "string" &&
    typeof settings.aiEndpoint === "string" &&
    typeof settings.apiKeyConfigured === "boolean" &&
    typeof settings.socialSyncEnabled === "boolean" &&
    typeof settings.workflowEngineEnabled === "boolean"
  );
}

function loadState(): AppDataState {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (!stored) return makeInitialState();
    const parsed = JSON.parse(stored, reviveDates) as {
      version?: number;
      state?: unknown;
    };
    let candidate = parsed.state;
    if (parsed.version === 2 && candidate && typeof candidate === "object") {
      const legacy = candidate as Record<string, unknown>;
      const settings = legacy.settings;
      if (settings && typeof settings === "object") {
        const migratedSettings = settings as Record<string, unknown>;
        if (migratedSettings.aiProvider === "local") {
          candidate = {
            ...legacy,
            settings: { ...migratedSettings, aiProvider: "ollama" },
          };
        }
      }
    }
    if (
      ![2, STORAGE_VERSION].includes(parsed.version ?? -1) ||
      !isStoredState(candidate)
    )
      return makeInitialState();
    return {
      ...candidate,
      workflowRuns: candidate.workflowRuns.map((run) =>
        run.status === "running"
          ? {
              ...run,
              status: "failed" as const,
              completedAt: new Date(),
              message: "Die Ausführung wurde durch ein Neuladen unterbrochen.",
              stepResults: run.stepResults?.map((step) =>
                step.status === "running"
                  ? {
                      ...step,
                      status: "failed" as const,
                      completedAt: new Date(),
                      error: "Durch Neuladen unterbrochen.",
                    }
                  : step,
              ),
            }
          : run,
      ),
    };
  } catch {
    return makeInitialState();
  }
}

function createId(prefix: string): string {
  const id =
    typeof crypto !== "undefined" && "randomUUID" in crypto
      ? crypto.randomUUID()
      : `${Date.now()}-${Math.random().toString(16).slice(2)}`;
  return `${prefix}-${id}`;
}

interface AppDataProviderProps {
  children: ReactNode;
}

export function AppDataProvider({ children }: AppDataProviderProps) {
  const [state, setState] = useState<AppDataState>(loadState);
  const stateRef = useRef(state);
  const backendEnabledRef = useRef(false);
  const backendVersionRef = useRef(0);
  const backendReadyRef = useRef(false);
  const backendSaveQueueRef = useRef(Promise.resolve());
  const skipNextBackendSaveRef = useRef(false);
  stateRef.current = state;

  useEffect(() => {
    let cancelled = false;
    void isBackendEnabled()
      .then(async (enabled) => {
        if (cancelled || !enabled) return;
        backendEnabledRef.current = true;
        try {
          const result = await fetchBackendState();
          if (cancelled) return;
          backendVersionRef.current = result.version;
          backendReadyRef.current = true;
          skipNextBackendSaveRef.current = true;
          setState(cloneWithDates(result.state));
        } catch (error) {
          if (!(error instanceof BackendError && error.status === 401)) {
            window.dispatchEvent(new Event("campaignhub:persistence-error"));
          }
        }
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (backendEnabledRef.current) {
      if (!backendReadyRef.current) return;
      if (skipNextBackendSaveRef.current) {
        skipNextBackendSaveRef.current = false;
        return;
      }
      const snapshot = cloneWithDates(state);
      backendSaveQueueRef.current = backendSaveQueueRef.current
        .then(async () => {
          try {
            const result = await saveBackendState(
              snapshot,
              backendVersionRef.current,
              crypto.randomUUID(),
            );
            backendVersionRef.current = result.version;
          } catch (error) {
            if (
              error instanceof BackendError &&
              error.code === "version_conflict"
            ) {
              const latest = await fetchBackendState();
              backendVersionRef.current = latest.version;
              skipNextBackendSaveRef.current = true;
              setState(cloneWithDates(latest.state));
            }
            window.dispatchEvent(new Event("campaignhub:persistence-error"));
          }
        })
        .catch(() => undefined);
      return;
    }
    try {
      persistState(state);
    } catch {
      window.dispatchEvent(new Event("campaignhub:persistence-error"));
    }
  }, [state]);

  useEffect(() => {
    const handleStorage = (event: StorageEvent) => {
      if (backendEnabledRef.current) return;
      if (event.key !== STORAGE_KEY || !event.newValue) return;
      try {
        const parsed = JSON.parse(event.newValue, reviveDates) as {
          version?: number;
          state?: AppDataState;
        };
        if (parsed.version === STORAGE_VERSION && isStoredState(parsed.state)) {
          setState(parsed.state);
        }
      } catch {
        // Ignore malformed updates from another browser tab.
      }
    };
    window.addEventListener("storage", handleStorage);
    return () => window.removeEventListener("storage", handleStorage);
  }, []);

  const value = useMemo<AppDataContextValue>(() => {
    const createCampaign = (input: NewCampaign): Campaign => {
      const now = new Date();
      const campaign: Campaign = {
        ...input,
        id: createId("campaign"),
        createdAt: now,
        updatedAt: now,
      };
      setState((current) => ({
        ...current,
        campaigns: [...current.campaigns, campaign],
      }));
      return campaign;
    };

    const updateCampaign = (id: string, patch: Partial<Campaign>) => {
      setState((current) => ({
        ...current,
        campaigns: current.campaigns.map((campaign) =>
          campaign.id === id
            ? { ...campaign, ...patch, id, updatedAt: new Date() }
            : campaign,
        ),
      }));
    };

    const deleteCampaign = (id: string) => {
      setState((current) => {
        const phaseIds = new Set(
          current.phases
            .filter((phase) => phase.campaignId === id)
            .map((phase) => phase.id),
        );
        const milestoneIds = new Set(
          current.milestones
            .filter((milestone) => phaseIds.has(milestone.phaseId))
            .map((milestone) => milestone.id),
        );
        return {
          ...current,
          campaigns: current.campaigns.filter((campaign) => campaign.id !== id),
          phases: current.phases.filter((phase) => !phaseIds.has(phase.id)),
          milestones: current.milestones.filter(
            (milestone) => !milestoneIds.has(milestone.id),
          ),
          workPackages: current.workPackages.filter(
            (workPackage) => !milestoneIds.has(workPackage.milestoneId),
          ),
          participants: current.participants.map((participant) => ({
            ...participant,
            campaignIds: participant.campaignIds.filter(
              (campaignId) => campaignId !== id,
            ),
          })),
          socialMediaAccounts: current.socialMediaAccounts.map((account) => ({
            ...account,
            campaignIds: account.campaignIds.filter(
              (campaignId) => campaignId !== id,
            ),
          })),
          mediaFiles: current.mediaFiles.map((mediaFile) =>
            mediaFile.campaignId === id
              ? { ...mediaFile, campaignId: undefined }
              : mediaFile,
          ),
          workflows: current.workflows.map((workflow) =>
            workflow.campaignId === id
              ? {
                  ...workflow,
                  campaignId: undefined,
                  updatedAt: new Date(),
                }
              : workflow,
          ),
        };
      });
    };

    const createPhase = (input: NewPhase): Phase => {
      const phase: Phase = { ...input, id: createId("phase") };
      setState((current) => ({
        ...current,
        phases: [
          ...current.phases.map((entry) =>
            input.status === "current" &&
            entry.campaignId === input.campaignId &&
            entry.status === "current"
              ? { ...entry, status: "upcoming" as const }
              : entry,
          ),
          phase,
        ],
      }));
      return phase;
    };
    const updatePhase = (id: string, patch: Partial<Phase>) =>
      setState((current) => {
        const target = current.phases.find((phase) => phase.id === id);
        return {
          ...current,
          phases: current.phases.map((phase) => {
            if (phase.id === id) return { ...phase, ...patch, id };
            if (
              patch.status === "current" &&
              target &&
              phase.campaignId === target.campaignId &&
              phase.status === "current"
            ) {
              return { ...phase, status: "upcoming" };
            }
            return phase;
          }),
        };
      });
    const deletePhase = (id: string) =>
      setState((current) => {
        const milestoneIds = new Set(
          current.milestones
            .filter((milestone) => milestone.phaseId === id)
            .map((milestone) => milestone.id),
        );
        return {
          ...current,
          phases: current.phases.filter((phase) => phase.id !== id),
          milestones: current.milestones.filter(
            (milestone) => milestone.phaseId !== id,
          ),
          workPackages: current.workPackages.filter(
            (workPackage) => !milestoneIds.has(workPackage.milestoneId),
          ),
        };
      });

    const createMilestone = (input: NewMilestone): Milestone => {
      const milestone: Milestone = { ...input, id: createId("milestone") };
      setState((current) => ({
        ...current,
        milestones: [...current.milestones, milestone],
      }));
      return milestone;
    };
    const updateMilestone = (id: string, patch: Partial<Milestone>) =>
      setState((current) => ({
        ...current,
        milestones: current.milestones.map((milestone) =>
          milestone.id === id ? { ...milestone, ...patch, id } : milestone,
        ),
      }));
    const deleteMilestone = (id: string) =>
      setState((current) => ({
        ...current,
        milestones: current.milestones.filter(
          (milestone) => milestone.id !== id,
        ),
        workPackages: current.workPackages.filter(
          (workPackage) => workPackage.milestoneId !== id,
        ),
      }));

    const createWorkPackage = (input: NewWorkPackage): WorkPackage => {
      const now = new Date();
      const workPackage: WorkPackage = {
        ...input,
        id: createId("task"),
        createdAt: now,
        updatedAt: now,
      };
      setState((current) => ({
        ...current,
        workPackages: [...current.workPackages, workPackage],
      }));
      return workPackage;
    };
    const updateWorkPackage = (id: string, patch: Partial<WorkPackage>) =>
      setState((current) => ({
        ...current,
        workPackages: current.workPackages.map((workPackage) =>
          workPackage.id === id
            ? { ...workPackage, ...patch, id, updatedAt: new Date() }
            : workPackage,
        ),
      }));
    const deleteWorkPackage = (id: string) =>
      setState((current) => ({
        ...current,
        workPackages: current.workPackages.filter(
          (workPackage) => workPackage.id !== id,
        ),
      }));

    const createMediaFile = (input: NewMediaFile): MediaFile => {
      const mediaFile: MediaFile = {
        ...input,
        id: createId("media"),
        createdAt: new Date(),
      };
      setState((current) => ({
        ...current,
        mediaFiles: [mediaFile, ...current.mediaFiles],
      }));
      return mediaFile;
    };
    const importMediaFile = (mediaFile: MediaFile) =>
      setState((current) => ({
        ...current,
        mediaFiles: [
          mediaFile,
          ...current.mediaFiles.filter((entry) => entry.id !== mediaFile.id),
        ],
      }));
    const deleteMediaFile = (id: string) =>
      setState((current) => ({
        ...current,
        mediaFiles: current.mediaFiles.filter(
          (mediaFile) => mediaFile.id !== id,
        ),
      }));

    const createAgent = (input: NewAgent): Agent => {
      const now = new Date();
      const agent: Agent = {
        ...input,
        id: createId("agent"),
        createdAt: now,
        updatedAt: now,
      };
      setState((current) => ({
        ...current,
        agents: [...current.agents, agent],
        participants: [
          ...current.participants,
          {
            id: createId("participant"),
            agentId: agent.id,
            name: agent.name,
            role: "AI Agent",
            campaignIds: [],
            status: agent.isActive ? "active" : "inactive",
          },
        ],
      }));
      return agent;
    };
    const updateAgent = (id: string, patch: Partial<Agent>) =>
      setState((current) => ({
        ...current,
        agents: current.agents.map((agent) =>
          agent.id === id
            ? { ...agent, ...patch, id, updatedAt: new Date() }
            : agent,
        ),
        participants: current.participants.map((participant) =>
          participant.agentId === id
            ? {
                ...participant,
                name:
                  typeof patch.name === "string"
                    ? patch.name
                    : participant.name,
                status:
                  typeof patch.isActive === "boolean"
                    ? patch.isActive
                      ? "active"
                      : "inactive"
                    : participant.status,
              }
            : participant,
        ),
      }));
    const deleteAgent = (id: string) =>
      setState((current) => ({
        ...current,
        agents: current.agents.filter((agent) => agent.id !== id),
        participants: current.participants.filter(
          (participant) => participant.agentId !== id,
        ),
        workflows: current.workflows.map((workflow) =>
          workflow.steps.some((step) => step.agentId === id)
            ? {
                ...workflow,
                steps: workflow.steps.map((step) =>
                  step.agentId === id ? { ...step, agentId: undefined } : step,
                ),
                updatedAt: new Date(),
              }
            : workflow,
        ),
        workPackages: current.workPackages.map((workPackage) =>
          workPackage.assigneeType === "agent" && workPackage.assigneeId === id
            ? { ...workPackage, assigneeId: undefined, updatedAt: new Date() }
            : workPackage,
        ),
      }));

    const createWorkflow = (input: NewWorkflow): Workflow => {
      const now = new Date();
      const workflow: Workflow = {
        ...input,
        id: createId("workflow"),
        createdAt: now,
        updatedAt: now,
      };
      setState((current) => ({
        ...current,
        workflows: [...current.workflows, workflow],
      }));
      stateRef.current = {
        ...stateRef.current,
        workflows: [...stateRef.current.workflows, workflow],
      };
      return workflow;
    };
    const updateWorkflow = (id: string, patch: Partial<Workflow>) =>
      setState((current) => ({
        ...current,
        workflows: current.workflows.map((workflow) =>
          workflow.id === id
            ? { ...workflow, ...patch, id, updatedAt: new Date() }
            : workflow,
        ),
      }));
    const deleteWorkflow = (id: string) =>
      setState((current) => ({
        ...current,
        workflows: current.workflows.filter((workflow) => workflow.id !== id),
        workflowRuns: current.workflowRuns.filter(
          (run) => run.workflowId !== id,
        ),
      }));
    const runWorkflow = async (id: string): Promise<WorkflowRun> => {
      const snapshot = stateRef.current;
      const workflow = snapshot.workflows.find((entry) => entry.id === id);
      if (!workflow) throw new Error("Der Workflow wurde nicht gefunden.");
      if (!workflow.isActive)
        throw new Error("Der Workflow ist nicht aktiviert.");
      if (!snapshot.settings.workflowEngineEnabled)
        throw new Error("Die Workflow-Engine ist pausiert.");
      if (workflow.steps.length === 0)
        throw new Error("Der Workflow enthält keine Schritte.");
      if (
        snapshot.workflowRuns.some(
          (entry) => entry.workflowId === id && entry.status === "running",
        )
      ) {
        throw new Error("Dieser Workflow wird bereits ausgeführt.");
      }

      const runId = createId("run");
      const run: WorkflowRun = {
        id: runId,
        workflowId: id,
        status: "running",
        startedAt: new Date(),
        message: "Workflow wird Schritt für Schritt ausgeführt.",
        stepResults: [],
      };
      setState((current) => ({
        ...current,
        workflowRuns: [run, ...current.workflowRuns].slice(0, 30),
      }));

      const orderedSteps = [...workflow.steps].sort(
        (left, right) => left.order - right.order,
      );
      let stepResults: WorkflowStepResult[] = [];

      const storeRun = (nextRun: WorkflowRun) => {
        setState((current) => ({
          ...current,
          workflowRuns: current.workflowRuns.map((entry) =>
            entry.id === runId ? nextRun : entry,
          ),
        }));
      };

      for (const [index, step] of orderedSteps.entries()) {
        const startedAt = new Date();
        try {
          if (shouldSkipWorkflowStep(step.condition, stepResults)) {
            const skippedResult: WorkflowStepResult = {
              stepId: step.id,
              action: step.action,
              agentId: step.agentId,
              status: "skipped",
              startedAt,
              completedAt: startedAt,
              output: `Bedingung „${step.condition}“ war nicht erfüllt.`,
            };
            stepResults = [...stepResults, skippedResult];
            storeRun({
              ...run,
              message: `Schritt ${index + 1} von ${orderedSteps.length} wurde übersprungen.`,
              stepResults,
            });
            continue;
          }
        } catch (error) {
          const failure = capPersistedOutput(errorMessage(error));
          const failedResult: WorkflowStepResult = {
            stepId: step.id,
            action: step.action,
            agentId: step.agentId,
            status: "failed",
            startedAt,
            completedAt: new Date(),
            error: failure,
          };
          const skippedResults = orderedSteps
            .slice(index + 1)
            .map<WorkflowStepResult>((remainingStep) => ({
              stepId: remainingStep.id,
              action: remainingStep.action,
              agentId: remainingStep.agentId,
              status: "skipped",
              startedAt,
              completedAt: startedAt,
              error:
                "Nicht ausgeführt, weil eine vorherige Bedingung ungültig war.",
            }));
          const failedRun: WorkflowRun = {
            ...run,
            status: "failed",
            completedAt: new Date(),
            message: failure,
            stepResults: [...stepResults, failedResult, ...skippedResults],
          };
          storeRun(failedRun);
          return failedRun;
        }
        const runningResult: WorkflowStepResult = {
          stepId: step.id,
          action: step.action,
          agentId: step.agentId,
          status: "running",
          startedAt,
        };
        stepResults = [...stepResults, runningResult];
        storeRun({
          ...run,
          message: `Schritt ${index + 1} von ${orderedSteps.length}: ${step.action}`,
          stepResults,
        });

        try {
          let completedResult: WorkflowStepResult;
          if (step.agentId) {
            const agent = snapshot.agents.find(
              (entry) => entry.id === step.agentId,
            );
            if (!agent)
              throw new Error(
                `Der zugewiesene Agent für „${step.action}“ wurde nicht gefunden.`,
              );
            if (!agent.isActive)
              throw new Error(`Der Agent „${agent.name}“ ist deaktiviert.`);
            if (snapshot.settings.aiProvider !== "ollama")
              throw new Error("Kein ausführbarer KI-Provider konfiguriert.");

            const priorOutputs = stepResults
              .slice(0, -1)
              .filter((result) => result.output)
              .map(
                (result) =>
                  `${result.action}: ${truncatePromptPart(result.output ?? "", 5_000)}`,
              )
              .join("\n\n");
            const messages: OllamaMessage[] = [
              { role: "system", content: buildAgentSystemPrompt(agent) },
              {
                role: "user",
                content: truncatePromptPart(
                  [
                    `Workflow: ${workflow.name}`,
                    workflow.description
                      ? `Beschreibung: ${workflow.description}`
                      : "",
                    `Schritt ${index + 1}/${orderedSteps.length}: ${step.action}`,
                    `Parameter:\n${summarizeParameters(step.parameters)}`,
                    `Kampagnenkontext:\n${campaignContext(snapshot, workflow)}`,
                    priorOutputs
                      ? `Ergebnisse vorheriger Schritte:\n${priorOutputs}`
                      : "Noch keine vorherigen Schrittergebnisse.",
                    "Bearbeite ausschließlich diesen Schritt und liefere ein direkt weiterverwendbares Ergebnis.",
                  ]
                    .filter(Boolean)
                    .join("\n\n"),
                  24_000,
                ),
              },
            ];
            const response = await chatWithOllama({
              endpoint: snapshot.settings.aiEndpoint,
              model: agentModel(agent, snapshot.settings.aiModel),
              messages,
              temperature: agentTemperature(agent),
              maxTokens: agentMaxTokens(agent),
            });
            completedResult = {
              ...runningResult,
              status: "completed",
              completedAt: new Date(),
              output: capPersistedOutput(response.content),
              model: response.model,
              promptTokens: response.promptTokens,
              completionTokens: response.completionTokens,
              totalDurationMs: response.totalDurationMs,
            };
          } else {
            completedResult = {
              ...runningResult,
              status: "completed",
              completedAt: new Date(),
              output: executeLocalWorkflowStep(step, workflow, snapshot),
            };
          }
          stepResults = stepResults.map((result) =>
            result.stepId === step.id ? completedResult : result,
          );
          storeRun({
            ...run,
            message: `Schritt ${index + 1} von ${orderedSteps.length} abgeschlossen.`,
            stepResults,
          });
        } catch (error) {
          const completedAt = new Date();
          const failure = capPersistedOutput(errorMessage(error));
          const failedResult: WorkflowStepResult = {
            ...runningResult,
            status: "failed",
            completedAt,
            error: failure,
          };
          stepResults = stepResults.map((result) =>
            result.stepId === step.id ? failedResult : result,
          );
          const skippedResults = orderedSteps
            .slice(index + 1)
            .map<WorkflowStepResult>((remainingStep) => ({
              stepId: remainingStep.id,
              action: remainingStep.action,
              agentId: remainingStep.agentId,
              status: "skipped",
              startedAt: completedAt,
              completedAt,
              error:
                "Nicht ausgeführt, weil ein vorheriger Schritt fehlgeschlagen ist.",
            }));
          const failedRun: WorkflowRun = {
            ...run,
            status: "failed",
            completedAt,
            message: `Schritt „${step.action}“ fehlgeschlagen: ${failure}`,
            stepResults: [...stepResults, ...skippedResults],
          };
          storeRun(failedRun);
          return failedRun;
        }
      }

      const completedRun: WorkflowRun = {
        ...run,
        status: "completed",
        completedAt: new Date(),
        message: `${orderedSteps.length} Workflow-Schritte wurden erfolgreich ausgeführt.`,
        stepResults,
      };
      storeRun(completedRun);
      return completedRun;
    };

    const inviteParticipant = (input: NewParticipant): Participant => {
      const matchingUser = input.email
        ? state.users.find(
            (user) =>
              user.email.toLowerCase() === input.email?.trim().toLowerCase(),
          )
        : undefined;
      const existingLinkedParticipant = matchingUser
        ? state.participants.find(
            (participant) => participant.userId === matchingUser.id,
          )
        : undefined;
      const participant: Participant = {
        ...input,
        id: existingLinkedParticipant?.id ?? createId("participant"),
        userId: matchingUser?.id ?? input.userId,
        name: matchingUser?.name ?? input.name,
        email: matchingUser?.email ?? input.email,
        avatar:
          matchingUser?.avatar ??
          input.avatar ??
          existingLinkedParticipant?.avatar,
        campaignIds: [
          ...new Set([
            ...(existingLinkedParticipant?.campaignIds ?? []),
            ...input.campaignIds,
          ]),
        ],
        status: existingLinkedParticipant?.status ?? input.status,
      };
      setState((current) => ({
        ...current,
        participants: existingLinkedParticipant
          ? current.participants.map((entry) =>
              entry.id === existingLinkedParticipant.id ? participant : entry,
            )
          : [...current.participants, participant],
      }));
      return participant;
    };
    const updateParticipant = (id: string, patch: Partial<Participant>) =>
      setState((current) => ({
        ...current,
        participants: current.participants.map((participant) =>
          participant.id === id
            ? { ...participant, ...patch, id }
            : participant,
        ),
      }));
    const deleteParticipant = (id: string) =>
      setState((current) => ({
        ...current,
        participants: current.participants.filter(
          (participant) => participant.id !== id,
        ),
      }));

    const sendMessage = (
      content: string,
      sender: User,
      conversationId = "team",
    ): ChatMessage => {
      const message: ChatMessage = {
        id: createId("message"),
        senderId: sender.id,
        senderName: sender.name,
        content: content.trim(),
        timestamp: new Date(),
        conversationId,
      };
      setState((current) => ({
        ...current,
        chatMessages: [...current.chatMessages, message],
      }));
      return message;
    };

    const chatWithAgent = async (
      agentId: string,
      conversationId: string,
      prompt: string,
      history: Array<{ role: "user" | "assistant"; content: string }> = [],
    ): Promise<ChatMessage> => {
      const snapshot = stateRef.current;
      const agent = snapshot.agents.find((entry) => entry.id === agentId);
      if (!agent)
        throw new Error("Der ausgewählte Agent wurde nicht gefunden.");
      if (!agent.isActive)
        throw new Error(`Der Agent „${agent.name}“ ist deaktiviert.`);
      if (snapshot.settings.aiProvider !== "ollama")
        throw new Error("Kein ausführbarer KI-Provider konfiguriert.");
      const cleanPrompt = prompt.trim();
      if (!cleanPrompt) throw new Error("Die Nachricht darf nicht leer sein.");

      const messages: OllamaMessage[] = [
        { role: "system", content: buildAgentSystemPrompt(agent) },
        ...history
          .filter((entry) => entry.content.trim())
          .slice(-20)
          .map((entry) => ({
            role: entry.role,
            content: truncatePromptPart(entry.content.trim(), 4_000),
          })),
        { role: "user", content: truncatePromptPart(cleanPrompt, 8_000) },
      ];
      const response = await chatWithOllama({
        endpoint: snapshot.settings.aiEndpoint,
        model: agentModel(agent, snapshot.settings.aiModel),
        messages,
        temperature: agentTemperature(agent),
        maxTokens: agentMaxTokens(agent),
      });
      const message: ChatMessage = {
        id: createId("message"),
        senderId: agent.id,
        senderName: agent.name,
        content: capPersistedOutput(response.content),
        timestamp: new Date(),
        conversationId,
      };
      setState((current) => ({
        ...current,
        chatMessages: [...current.chatMessages, message],
      }));
      return message;
    };

    const createCredential = (input: NewCredential): Credential => {
      const now = new Date();
      const credential: Credential = {
        ...input,
        id: createId("credential"),
        createdAt: now,
        updatedAt: now,
      };
      setState((current) => ({
        ...current,
        credentials: [...current.credentials, credential],
      }));
      return credential;
    };
    const deleteCredential = (id: string) =>
      setState((current) => ({
        ...current,
        credentials: current.credentials.filter(
          (credential) => credential.id !== id,
        ),
      }));

    const createSocialMediaAccount = (
      input: NewSocialMediaAccount,
    ): SocialMediaAccount => {
      const now = new Date();
      const account: SocialMediaAccount = {
        ...input,
        id: createId("account"),
        createdAt: now,
        updatedAt: now,
      };
      setState((current) => ({
        ...current,
        socialMediaAccounts: [...current.socialMediaAccounts, account],
      }));
      return account;
    };
    const updateSocialMediaAccount = (
      id: string,
      patch: Partial<SocialMediaAccount>,
    ) =>
      setState((current) => ({
        ...current,
        socialMediaAccounts: current.socialMediaAccounts.map((account) =>
          account.id === id
            ? { ...account, ...patch, id, updatedAt: new Date() }
            : account,
        ),
      }));
    const deleteSocialMediaAccount = (id: string) =>
      setState((current) => ({
        ...current,
        socialMediaAccounts: current.socialMediaAccounts.filter(
          (account) => account.id !== id,
        ),
        socialMediaPosts: current.socialMediaPosts.filter(
          (post) => post.accountId !== id,
        ),
      }));

    const createUser = (input: NewUser): User => {
      const now = new Date();
      const user: User = {
        ...input,
        id: createId("user"),
        createdAt: now,
        updatedAt: now,
      };
      const current = stateRef.current;
      const matchingInvite = current.participants.find(
        (participant) =>
          !participant.userId &&
          !participant.agentId &&
          participant.email?.toLowerCase() === user.email.toLowerCase(),
      );
      const linkedParticipant: Participant = {
        id: matchingInvite?.id ?? createId("participant"),
        userId: user.id,
        name: user.name,
        email: user.email,
        role:
          user.campaignRole ??
          matchingInvite?.role ??
          (user.role === "Agent" ? "AI Operator" : "Team Member"),
        campaignIds: matchingInvite?.campaignIds ?? [],
        avatar: user.avatar ?? matchingInvite?.avatar,
        status: "active",
      };
      const nextState: AppDataState = {
        ...current,
        users: [...current.users, user],
        participants: matchingInvite
          ? current.participants.map((participant) =>
              participant.id === matchingInvite.id
                ? linkedParticipant
                : participant,
            )
          : [...current.participants, linkedParticipant],
      };
      // Registration publishes the session immediately after this call. Store
      // the canonical user first so other tabs never observe an unknown ID.
      persistState(nextState);
      stateRef.current = nextState;
      setState(nextState);
      return user;
    };
    const updateUser = (id: string, patch: Partial<User>) =>
      setState((current) => {
        const existingUser = current.users.find((user) => user.id === id);
        if (!existingUser) return current;
        const updatedUser: User = {
          ...existingUser,
          ...patch,
          id,
          updatedAt: new Date(),
        };
        const linkedParticipant = current.participants.find(
          (participant) => participant.userId === id,
        );
        const matchingInvite = current.participants.find(
          (participant) =>
            participant.id !== linkedParticipant?.id &&
            !participant.userId &&
            !participant.agentId &&
            participant.email?.toLowerCase() ===
              updatedUser.email.toLowerCase(),
        );
        const participantId =
          linkedParticipant?.id ??
          matchingInvite?.id ??
          createId("participant");
        const roleWasUpdated = Object.prototype.hasOwnProperty.call(
          patch,
          "campaignRole",
        );
        const syncedParticipant: Participant = {
          id: participantId,
          userId: id,
          name: updatedUser.name,
          email: updatedUser.email,
          avatar: updatedUser.avatar,
          role: roleWasUpdated
            ? updatedUser.campaignRole?.trim() ||
              (updatedUser.role === "Agent" ? "AI Operator" : "Team Member")
            : (linkedParticipant?.role ??
              matchingInvite?.role ??
              updatedUser.campaignRole ??
              (updatedUser.role === "Agent" ? "AI Operator" : "Team Member")),
          campaignIds: [
            ...new Set([
              ...(linkedParticipant?.campaignIds ?? []),
              ...(matchingInvite?.campaignIds ?? []),
            ]),
          ],
          status: linkedParticipant?.status ?? "active",
        };
        const hasParticipant = Boolean(linkedParticipant || matchingInvite);
        return {
          ...current,
          users: current.users.map((user) =>
            user.id === id ? updatedUser : user,
          ),
          participants: hasParticipant
            ? current.participants
                .filter(
                  (participant) =>
                    participant.id !== matchingInvite?.id ||
                    participant.id === participantId,
                )
                .map((participant) =>
                  participant.id === participantId
                    ? syncedParticipant
                    : participant,
                )
            : [...current.participants, syncedParticipant],
        };
      });
    const deleteUser = (id: string) =>
      setState((current) => ({
        ...current,
        users: current.users.filter((user) => user.id !== id),
        participants: current.participants.filter(
          (participant) => participant.userId !== id,
        ),
        credentials: current.credentials.filter(
          (credential) => credential.userId !== id,
        ),
        workPackages: current.workPackages.map((workPackage) =>
          workPackage.assigneeType === "user" && workPackage.assigneeId === id
            ? { ...workPackage, assigneeId: undefined, updatedAt: new Date() }
            : workPackage,
        ),
        mediaFiles: current.mediaFiles.map((mediaFile) =>
          mediaFile.uploadedBy === id
            ? { ...mediaFile, uploadedBy: undefined }
            : mediaFile,
        ),
      }));

    const updateSettings = (patch: Partial<AppDataState["settings"]>) =>
      setState((current) => ({
        ...current,
        settings: { ...current.settings, ...patch },
      }));
    const resetDemoData = () => {
      localStorage.removeItem(STORAGE_KEY);
      localStorage.removeItem("campaignhub-credentials");
      setState(makeInitialState());
    };

    return {
      ...state,
      createCampaign,
      updateCampaign,
      deleteCampaign,
      createPhase,
      updatePhase,
      deletePhase,
      createMilestone,
      updateMilestone,
      deleteMilestone,
      createWorkPackage,
      updateWorkPackage,
      deleteWorkPackage,
      createMediaFile,
      importMediaFile,
      deleteMediaFile,
      createAgent,
      updateAgent,
      deleteAgent,
      createWorkflow,
      updateWorkflow,
      deleteWorkflow,
      runWorkflow,
      inviteParticipant,
      updateParticipant,
      deleteParticipant,
      sendMessage,
      chatWithAgent,
      createCredential,
      deleteCredential,
      createSocialMediaAccount,
      updateSocialMediaAccount,
      deleteSocialMediaAccount,
      createUser,
      updateUser,
      deleteUser,
      updateSettings,
      resetDemoData,
    };
  }, [state]);

  return (
    <AppDataContext.Provider value={value}>{children}</AppDataContext.Provider>
  );
}
