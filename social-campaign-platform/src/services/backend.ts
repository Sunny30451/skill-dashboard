import type { AppDataState } from "../contexts/app-data";
import type { MediaFile, User, UserRole } from "../types";

interface ApiErrorPayload {
  error?: {
    code?: string;
    message?: string;
    details?: Record<string, unknown>;
  };
}

export class BackendError extends Error {
  readonly status: number;
  readonly code: string;
  readonly details?: Record<string, unknown>;

  constructor(
    status: number,
    code: string,
    message: string,
    details?: Record<string, unknown>,
  ) {
    super(message);
    this.name = "BackendError";
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  const response = await fetch(path, {
    credentials: "same-origin",
    ...init,
    headers: {
      ...(init.body instanceof FormData
        ? {}
        : { "Content-Type": "application/json" }),
      ...init.headers,
    },
  });
  if (!response.ok) {
    let payload: ApiErrorPayload = {};
    try {
      payload = (await response.json()) as ApiErrorPayload;
    } catch {
      // A safe generic error is used for non-JSON proxy failures.
    }
    throw new BackendError(
      response.status,
      payload.error?.code ?? "request_failed",
      payload.error?.message ??
        `Backend-Anfrage fehlgeschlagen (${response.status}).`,
      payload.error?.details,
    );
  }
  if (response.status === 204) return undefined as T;
  return (await response.json()) as T;
}

let backendModePromise: Promise<boolean> | undefined;

export function resetBackendDetectionForTests(): void {
  backendModePromise = undefined;
}

export function isBackendEnabled(): Promise<boolean> {
  backendModePromise ??= (async () => {
    const controller = new AbortController();
    const timeout = window.setTimeout(() => controller.abort(), 4_000);
    try {
      const response = await fetch("/api/health/ready", {
        credentials: "same-origin",
        signal: controller.signal,
      });
      if (!response.ok) return false;
      const value = (await response.json()) as { database?: unknown };
      return value.database === true;
    } catch {
      return false;
    } finally {
      window.clearTimeout(timeout);
    }
  })();
  return backendModePromise;
}

export async function backendSession(): Promise<User | null> {
  const result = await request<{ user: User | null }>("/api/auth/session");
  return result.user;
}

export async function backendLogin(
  email: string,
  password: string,
): Promise<User> {
  const result = await request<{ user: User }>("/api/auth/login", {
    method: "POST",
    body: JSON.stringify({ email, password }),
  });
  return result.user;
}

export function backendLogout(): Promise<void> {
  return request<void>("/api/auth/logout", { method: "POST", body: "{}" });
}

export async function backendRegister(input: {
  email: string;
  name: string;
  role: UserRole;
  password: string;
}): Promise<User> {
  const result = await request<{ user: User }>("/api/auth/register", {
    method: "POST",
    body: JSON.stringify(input),
  });
  return result.user;
}

export function backendChangePassword(password: string): Promise<void> {
  return request<void>("/api/auth/password", {
    method: "PUT",
    body: JSON.stringify({ password }),
  });
}

export function backendSetUserPassword(
  userId: string,
  password: string,
): Promise<void> {
  return request<void>(
    `/api/auth/users/${encodeURIComponent(userId)}/password`,
    {
      method: "PUT",
      body: JSON.stringify({ password }),
    },
  );
}

export async function sendBackendInvitation(input: {
  email: string;
  name: string;
  role: "Worker" | "Visitor" | "Agent";
  campaignIds: string[];
}): Promise<string> {
  const result = await request<{ id: string }>("/api/invitations", {
    method: "POST",
    body: JSON.stringify(input),
  });
  return result.id;
}

export function acceptBackendInvitation(
  token: string,
  password: string,
): Promise<void> {
  return request<void>("/api/invitations/accept", {
    method: "POST",
    body: JSON.stringify({ token, password }),
  });
}

export interface BackendStateResult {
  state: AppDataState;
  version: number;
}

export function fetchBackendState(): Promise<BackendStateResult> {
  return request<BackendStateResult>("/api/state");
}

export function saveBackendState(
  state: AppDataState,
  version: number,
  commandId: string,
): Promise<BackendStateResult> {
  return request<BackendStateResult>("/api/state", {
    method: "PUT",
    body: JSON.stringify({ state, version, id: commandId }),
  });
}

export async function uploadBackendMedia(input: {
  file: File;
  campaignId?: string;
  tags: string[];
}): Promise<MediaFile> {
  const form = new FormData();
  form.append("file", input.file, input.file.name);
  if (input.campaignId) form.append("campaignId", input.campaignId);
  if (input.tags.length) form.append("tags", input.tags.join(","));
  const result = await request<{ media: MediaFile }>("/api/media/upload", {
    method: "POST",
    headers: { "X-File-Size": String(input.file.size) },
    body: form,
  });
  return result.media;
}

export function deleteBackendMedia(id: string): Promise<void> {
  return request<void>(`/api/media/${encodeURIComponent(id)}`, {
    method: "DELETE",
  });
}

export type SocialProvider = "youtube" | "meta" | "tiktok";

export interface ProviderConnection {
  id: string;
  provider: SocialProvider;
  accountType: string;
  providerAccountId: string;
  displayName: string;
  status: "connected" | "expired" | "revoked" | "error";
  scopes: string[];
  expiresAt?: string;
  metadata: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
}

export function startProviderConnection(provider: SocialProvider): void {
  void request<{ authorizationUrl: string }>(
    `/api/social/${provider}/connect`,
    {
      method: "POST",
      body: JSON.stringify({ returnPath: "/admin?social=connected" }),
    },
  ).then(({ authorizationUrl }) => window.location.assign(authorizationUrl));
}

export async function listProviderConnections(): Promise<ProviderConnection[]> {
  const result = await request<{ connections: ProviderConnection[] }>(
    "/api/social/connections",
  );
  return result.connections;
}

export function disconnectProviderConnection(id: string): Promise<void> {
  return listProviderConnections().then((connections) => {
    const connection = connections.find((entry) => entry.id === id);
    if (!connection)
      throw new BackendError(
        404,
        "connection_not_found",
        "Verbindung nicht gefunden.",
      );
    return request<void>(`/api/social/${connection.provider}/disconnect`, {
      method: "DELETE",
    });
  });
}

export async function syncProvider(
  provider: SocialProvider,
): Promise<string[]> {
  const result = await request<{ jobs: Array<{ id: string }> }>(
    `/api/social/${provider}/sync`,
    { method: "POST", body: "{}" },
  );
  return result.jobs.map((job) => job.id);
}

export interface PublishJob {
  id: string;
  provider: SocialProvider;
  connectionId: string;
  campaignId?: string;
  status:
    "draft" | "pending" | "running" | "completed" | "failed" | "cancelled";
  payload: Record<string, unknown>;
  consent?: Record<string, unknown>;
  scheduledFor?: string;
  attempts: number;
  createdAt: string;
  updatedAt: string;
}

export async function listPublishJobs(): Promise<PublishJob[]> {
  const result = await request<{ jobs: PublishJob[] }>("/api/jobs");
  return result.jobs;
}

export async function createPublishJob(input: {
  provider: SocialProvider;
  connectionId: string;
  campaignId?: string;
  scheduledFor?: string;
  payload: Record<string, unknown>;
}): Promise<PublishJob> {
  const result = await request<{ job: PublishJob }>("/api/jobs", {
    method: "POST",
    body: JSON.stringify(input),
  });
  return result.job;
}

export async function approvePublishJob(
  id: string,
  consent: {
    account: string;
    contentHash: string;
    privacy: string;
  },
): Promise<PublishJob> {
  const result = await request<{ job: PublishJob }>(
    `/api/jobs/${encodeURIComponent(id)}/approve`,
    {
      method: "POST",
      body: JSON.stringify({ confirmed: true, ...consent }),
    },
  );
  return result.job;
}

export function cancelPublishJob(id: string): Promise<void> {
  return request<void>(`/api/jobs/${encodeURIComponent(id)}`, {
    method: "DELETE",
  });
}
