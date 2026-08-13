import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type FormEvent,
} from "react";
import {
  Bot,
  CheckCircle2,
  CircleAlert,
  Database,
  Globe,
  KeyRound,
  LoaderCircle,
  Pencil,
  Plus,
  Power,
  RefreshCw,
  RotateCcw,
  Save,
  Settings,
  ShieldCheck,
  Trash2,
  Users,
} from "lucide-react";
import ConfirmDialog from "../components/ConfirmDialog";
import Modal from "../components/Modal";
import Avatar from "../components/Avatar";
import { useAppData } from "../contexts/app-data";
import { useAuth } from "../contexts/auth";
import { useFeedback } from "../contexts/feedback";
import { listOllamaModels, type OllamaModel } from "../services/ollama";
import {
  disconnectProviderConnection,
  isBackendEnabled,
  listProviderConnections,
  startProviderConnection,
  type ProviderConnection,
  type SocialProvider,
} from "../services/backend";
import type { AppSettings, SocialMediaAccount, User, UserRole } from "../types";

type AdminTab = "accounts" | "users" | "settings";

interface AccountFormState {
  platform: string;
  name: string;
  email: string;
  url: string;
  apiEndpoint: string;
  connectionStatus: SocialMediaAccount["connectionStatus"];
  isActive: boolean;
  campaignIds: string[];
}

interface UserFormState {
  name: string;
  email: string;
  role: UserRole;
  campaignRole: string;
  avatar: string;
  password: string;
}

const emptyAccountForm: AccountFormState = {
  platform: "",
  name: "",
  email: "",
  url: "",
  apiEndpoint: "",
  connectionStatus: "disconnected",
  isActive: false,
  campaignIds: [],
};

const emptyUserForm: UserFormState = {
  name: "",
  email: "",
  role: "Worker",
  campaignRole: "",
  avatar: "",
  password: "",
};

const fieldClassName =
  "w-full rounded-lg border border-gray-600 bg-gray-700 px-4 py-2.5 text-white placeholder:text-gray-500 focus:border-blue-500";
const labelClassName = "mb-2 block text-sm font-medium text-gray-300";
const userRoles: UserRole[] = ["Admin", "Worker", "Visitor", "Agent"];
const OLLAMA_DEFAULT_ENDPOINT = "http://127.0.0.1:11434";
const OLLAMA_DEFAULT_MODEL = "gemma3";

type OllamaConnectionStatus =
  "idle" | "loading" | "success" | "empty" | "error";

interface OllamaConnectionState {
  status: OllamaConnectionStatus;
  message: string;
  models: OllamaModel[];
}

const initialOllamaConnection: OllamaConnectionState = {
  status: "idle",
  message: "",
  models: [],
};

const roleStyles: Record<UserRole, string> = {
  Admin: "bg-red-500/20 text-red-300",
  Worker: "bg-blue-500/20 text-blue-300",
  Visitor: "bg-gray-500/20 text-gray-300",
  Agent: "bg-purple-500/20 text-purple-300",
};

const connectionLabels: Record<SocialMediaAccount["connectionStatus"], string> =
  {
    connected: "Verbunden",
    disconnected: "Getrennt",
    error: "Fehler",
  };

const connectionStyles: Record<SocialMediaAccount["connectionStatus"], string> =
  {
    connected: "bg-green-500/20 text-green-300",
    disconnected: "bg-gray-500/20 text-gray-300",
    error: "bg-red-500/20 text-red-300",
  };

function isHttpUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return url.protocol === "http:" || url.protocol === "https:";
  } catch {
    return false;
  }
}

function looksLikeCloudDefaultEndpoint(value: string): boolean {
  const normalized = value.trim().replace(/\/+$/, "").toLowerCase();
  return (
    !normalized ||
    normalized === "https://api.openai.com" ||
    normalized === "https://api.openai.com/v1"
  );
}

function looksLikeCloudDefaultModel(value: string): boolean {
  const normalized = value.trim();
  return (
    !normalized ||
    /^(?:gpt(?:-|$)|o[134](?:-|$)|claude(?:-|$))/i.test(normalized)
  );
}

function ollamaModelName(model: OllamaModel): string {
  return model.name || model.model;
}

function formatModelSize(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return "Größe unbekannt";
  const units = ["Bytes", "KB", "MB", "GB", "TB"];
  const index = Math.min(
    Math.floor(Math.log(bytes) / Math.log(1024)),
    units.length - 1,
  );
  return `${Number((bytes / 1024 ** index).toFixed(index > 2 ? 1 : 0)).toLocaleString("de-DE")} ${units[index]}`;
}

export default function Admin() {
  const {
    campaigns,
    socialMediaAccounts,
    users,
    settings,
    createSocialMediaAccount,
    updateSocialMediaAccount,
    deleteSocialMediaAccount,
    createUser,
    updateUser,
    deleteUser,
    updateSettings,
    resetDemoData,
  } = useAppData();
  const { user: currentUser, setUserPassword, isServerMode } = useAuth();
  const { notify } = useFeedback();

  const [activeTab, setActiveTab] = useState<AdminTab>("accounts");
  const [accountModalOpen, setAccountModalOpen] = useState(false);
  const [editingAccountId, setEditingAccountId] = useState<string | null>(null);
  const [accountForm, setAccountForm] = useState<AccountFormState>({
    ...emptyAccountForm,
  });
  const [accountToDelete, setAccountToDelete] =
    useState<SocialMediaAccount | null>(null);
  const [userModalOpen, setUserModalOpen] = useState(false);
  const [editingUserId, setEditingUserId] = useState<string | null>(null);
  const [userForm, setUserForm] = useState<UserFormState>({ ...emptyUserForm });
  const [userToDelete, setUserToDelete] = useState<User | null>(null);
  const [userSubmitting, setUserSubmitting] = useState(false);
  const [settingsDraft, setSettingsDraft] = useState<AppSettings>(settings);
  const [ollamaConnection, setOllamaConnection] =
    useState<OllamaConnectionState>(initialOllamaConnection);
  const ollamaRequestId = useRef(0);
  const [resetDialogOpen, setResetDialogOpen] = useState(false);
  const [serverMode, setServerMode] = useState(false);
  const [providerConnections, setProviderConnections] = useState<
    ProviderConnection[]
  >([]);
  const [providerLoading, setProviderLoading] = useState(false);

  const closeAccountModal = useCallback(() => setAccountModalOpen(false), []);
  const closeUserModal = useCallback(() => setUserModalOpen(false), []);
  const closeAccountDeleteDialog = useCallback(
    () => setAccountToDelete(null),
    [],
  );
  const closeUserDeleteDialog = useCallback(() => setUserToDelete(null), []);
  const closeResetDialog = useCallback(() => setResetDialogOpen(false), []);

  useEffect(() => {
    setSettingsDraft(settings);
    setOllamaConnection(initialOllamaConnection);
  }, [settings]);

  const refreshProviderConnections = useCallback(async () => {
    setProviderLoading(true);
    try {
      setProviderConnections(await listProviderConnections());
    } catch (error) {
      notify(
        error instanceof Error
          ? error.message
          : "Provider-Verbindungen konnten nicht geladen werden.",
        "error",
      );
    } finally {
      setProviderLoading(false);
    }
  }, [notify]);

  useEffect(() => {
    let cancelled = false;
    void isBackendEnabled().then((enabled) => {
      if (cancelled) return;
      setServerMode(enabled);
      if (enabled) void refreshProviderConnections();
    });
    return () => {
      cancelled = true;
    };
  }, [refreshProviderConnections]);

  const connectProvider = (provider: SocialProvider) => {
    startProviderConnection(provider);
  };

  const disconnectProvider = async (connection: ProviderConnection) => {
    try {
      await disconnectProviderConnection(connection.id);
      notify(`${connection.displayName} wurde sicher getrennt.`);
      await refreshProviderConnections();
    } catch (error) {
      notify(
        error instanceof Error
          ? error.message
          : "Verbindung konnte nicht getrennt werden.",
        "error",
      );
    }
  };

  const adminCount = useMemo(
    () => users.filter((candidate) => candidate.role === "Admin").length,
    [users],
  );

  const hasSettingsChanges = useMemo(
    () =>
      Object.keys(settingsDraft).some((key) => {
        const settingKey = key as keyof AppSettings;
        return settingsDraft[settingKey] !== settings[settingKey];
      }),
    [settings, settingsDraft],
  );

  const openNewAccount = () => {
    setEditingAccountId(null);
    setAccountForm({ ...emptyAccountForm, campaignIds: [] });
    setAccountModalOpen(true);
  };

  const openAccountEditor = (account: SocialMediaAccount) => {
    setEditingAccountId(account.id);
    setAccountForm({
      platform: account.platform,
      name: account.name,
      email: account.email,
      url: account.url,
      apiEndpoint: account.apiEndpoint ?? "",
      connectionStatus: account.connectionStatus,
      isActive: account.isActive,
      campaignIds: [...account.campaignIds],
    });
    setAccountModalOpen(true);
  };

  const submitAccount = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const platform = accountForm.platform.trim();
    const name = accountForm.name.trim();
    const email = accountForm.email.trim().toLowerCase();
    const url = accountForm.url.trim();
    const apiEndpoint = accountForm.apiEndpoint.trim();

    if (!platform || !name || !email || !url) {
      notify("Bitte fülle alle Pflichtfelder des Accounts aus.", "error");
      return;
    }
    if (!isHttpUrl(url) || (apiEndpoint && !isHttpUrl(apiEndpoint))) {
      notify(
        "Account-URL und API-Endpunkt müssen gültige HTTP(S)-URLs sein.",
        "error",
      );
      return;
    }
    if (
      socialMediaAccounts.some(
        (account) =>
          account.id !== editingAccountId &&
          account.url.toLowerCase() === url.toLowerCase(),
      )
    ) {
      notify("Für diese Account-URL existiert bereits ein Eintrag.", "error");
      return;
    }

    const input = {
      platform,
      name,
      email,
      url,
      apiEndpoint: apiEndpoint || undefined,
      connectionStatus: accountForm.connectionStatus,
      isActive: accountForm.isActive,
      campaignIds: accountForm.campaignIds,
    };

    if (editingAccountId) {
      updateSocialMediaAccount(editingAccountId, input);
      notify(`${name} wurde aktualisiert.`);
    } else {
      createSocialMediaAccount(input);
      notify(`${name} wurde hinzugefügt.`);
    }
    closeAccountModal();
  };

  const toggleAccount = (account: SocialMediaAccount) => {
    const isActive = !account.isActive;
    updateSocialMediaAccount(account.id, { isActive });
    notify(
      `${account.name}: Synchronisierung ${isActive ? "aktiviert" : "pausiert"}.`,
    );
  };

  const confirmAccountDeletion = () => {
    if (!accountToDelete) return;
    deleteSocialMediaAccount(accountToDelete.id);
    notify(`${accountToDelete.name} wurde entfernt.`);
  };

  const openNewUser = () => {
    setEditingUserId(null);
    setUserForm({ ...emptyUserForm });
    setUserModalOpen(true);
  };

  const openUserEditor = (selectedUser: User) => {
    setEditingUserId(selectedUser.id);
    setUserForm({
      name: selectedUser.name,
      email: selectedUser.email,
      role: selectedUser.role,
      campaignRole: selectedUser.campaignRole ?? "",
      avatar: selectedUser.avatar ?? "",
      password: "",
    });
    setUserModalOpen(true);
  };

  const submitUser = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const name = userForm.name.trim();
    const email = userForm.email.trim().toLowerCase();
    const campaignRole = userForm.campaignRole.trim();
    const avatar = userForm.avatar.trim();
    const password = userForm.password;
    const editedUser = users.find(
      (candidate) => candidate.id === editingUserId,
    );

    if (!name || !email) {
      notify("Name und E-Mail-Adresse sind erforderlich.", "error");
      return;
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      notify("Bitte gib eine gültige E-Mail-Adresse ein.", "error");
      return;
    }
    if (avatar && !isHttpUrl(avatar)) {
      notify("Die Avatar-Adresse muss eine gültige HTTP(S)-URL sein.", "error");
      return;
    }
    if (
      (!editingUserId && password.length < (isServerMode ? 12 : 6)) ||
      (password.length > 0 && password.length < (isServerMode ? 12 : 6))
    ) {
      notify(
        `Das Passwort muss mindestens ${isServerMode ? 12 : 6} Zeichen lang sein.`,
        "error",
      );
      return;
    }
    if (
      users.some(
        (candidate) =>
          candidate.id !== editingUserId &&
          candidate.email.toLowerCase() === email,
      )
    ) {
      notify("Diese E-Mail-Adresse wird bereits verwendet.", "error");
      return;
    }
    if (
      editedUser &&
      editedUser.id === currentUser?.id &&
      userForm.role !== editedUser.role
    ) {
      notify("Du kannst deine eigene Systemrolle nicht ändern.", "error");
      return;
    }
    if (
      editedUser?.role === "Admin" &&
      userForm.role !== "Admin" &&
      adminCount <= 1
    ) {
      notify("Der letzte Admin kann nicht herabgestuft werden.", "error");
      return;
    }

    const input = {
      name,
      email,
      role: userForm.role,
      campaignRole: campaignRole || undefined,
      avatar: avatar || undefined,
    };

    setUserSubmitting(true);
    try {
      if (editingUserId) {
        if (password) await setUserPassword(editingUserId, password);
        updateUser(editingUserId, input);
        notify(`${name} wurde aktualisiert.`);
      } else {
        const createdUser = createUser(input);
        try {
          await setUserPassword(createdUser.id, password);
        } catch (error) {
          deleteUser(createdUser.id);
          throw error;
        }
        notify(`${name} wurde angelegt.`);
      }
      closeUserModal();
    } catch (error) {
      notify(
        error instanceof Error
          ? error.message
          : "Der Benutzer konnte nicht gespeichert werden.",
        "error",
      );
    } finally {
      setUserSubmitting(false);
    }
  };

  const requestUserDeletion = (selectedUser: User) => {
    if (selectedUser.id === currentUser?.id) {
      notify("Du kannst dein eigenes Konto nicht löschen.", "error");
      return;
    }
    if (selectedUser.role === "Admin" && adminCount <= 1) {
      notify("Der letzte Admin kann nicht gelöscht werden.", "error");
      return;
    }
    setUserToDelete(selectedUser);
  };

  const confirmUserDeletion = () => {
    if (!userToDelete) return;
    if (
      userToDelete.id === currentUser?.id ||
      (userToDelete.role === "Admin" && adminCount <= 1)
    ) {
      notify("Dieser Benutzer kann nicht gelöscht werden.", "error");
      return;
    }
    deleteUser(userToDelete.id);
    notify(`${userToDelete.name} wurde gelöscht.`);
  };

  const changeAiProvider = (provider: AppSettings["aiProvider"]) => {
    ollamaRequestId.current += 1;
    setOllamaConnection(initialOllamaConnection);
    setSettingsDraft((current) => {
      if (provider !== "ollama") return { ...current, aiProvider: provider };
      return {
        ...current,
        aiProvider: provider,
        aiEndpoint: looksLikeCloudDefaultEndpoint(current.aiEndpoint)
          ? OLLAMA_DEFAULT_ENDPOINT
          : current.aiEndpoint,
        aiModel: looksLikeCloudDefaultModel(current.aiModel)
          ? OLLAMA_DEFAULT_MODEL
          : current.aiModel,
        apiKeyConfigured: false,
      };
    });
  };

  const changeAiEndpoint = (aiEndpoint: string) => {
    ollamaRequestId.current += 1;
    setOllamaConnection(initialOllamaConnection);
    setSettingsDraft((current) => ({ ...current, aiEndpoint }));
  };

  const testOllamaConnection = async () => {
    const endpoint = settingsDraft.aiEndpoint.trim();
    if (!isHttpUrl(endpoint)) {
      setOllamaConnection({
        status: "error",
        message:
          "Bitte gib zuerst einen gültigen Ollama-Endpunkt mit http:// oder https:// ein.",
        models: [],
      });
      return;
    }

    const requestId = ollamaRequestId.current + 1;
    ollamaRequestId.current = requestId;
    setOllamaConnection({
      status: "loading",
      message: "Verbindung zu Ollama wird geprüft …",
      models: [],
    });

    try {
      const models = await listOllamaModels(endpoint);
      if (ollamaRequestId.current !== requestId) return;
      const uniqueModels = [
        ...new Map(
          models
            .filter((model) => ollamaModelName(model).trim())
            .map((model) => [ollamaModelName(model), model]),
        ).values(),
      ].sort((left, right) =>
        ollamaModelName(left).localeCompare(ollamaModelName(right), "de"),
      );
      setOllamaConnection({
        status: uniqueModels.length > 0 ? "success" : "empty",
        message:
          uniqueModels.length > 0
            ? `Ollama ist erreichbar. ${uniqueModels.length} ${uniqueModels.length === 1 ? "installiertes Modell wurde" : "installierte Modelle wurden"} gefunden.`
            : "Ollama ist erreichbar, aber es ist noch kein Modell installiert. Installiere zum Beispiel „gemma3“ mit „ollama pull gemma3“ und teste erneut.",
        models: uniqueModels,
      });
    } catch (error) {
      if (ollamaRequestId.current !== requestId) return;
      const detail =
        error instanceof Error && error.message.trim()
          ? ` ${error.message.trim()}`
          : "";
      setOllamaConnection({
        status: "error",
        message: `Ollama ist unter diesem Endpunkt nicht erreichbar. Prüfe, ob „ollama serve“ läuft und der Browser auf den Dienst zugreifen darf.${detail}`,
        models: [],
      });
    }
  };

  const submitSettings = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const aiEndpoint = settingsDraft.aiEndpoint.trim();
    const aiModel = settingsDraft.aiModel.trim();
    if (!aiModel || !isHttpUrl(aiEndpoint)) {
      notify(
        "Bitte gib ein Modell und einen gültigen API-Endpunkt an.",
        "error",
      );
      return;
    }
    updateSettings({
      ...settingsDraft,
      aiEndpoint,
      aiModel,
      apiKeyConfigured:
        settingsDraft.aiProvider === "ollama"
          ? false
          : settingsDraft.apiKeyConfigured,
    });
    notify("Systemeinstellungen wurden gespeichert.");
  };

  const confirmDemoReset = () => {
    resetDemoData();
    notify(
      "Die Demo-Daten wurden auf den Ausgangszustand zurückgesetzt.",
      "info",
    );
  };

  const tabs: Array<{ id: AdminTab; label: string; icon: typeof Globe }> = [
    { id: "accounts", label: "Social-Media-Konten", icon: Globe },
    { id: "users", label: "Benutzer", icon: Users },
    { id: "settings", label: "Systemeinstellungen", icon: Settings },
  ];

  const handleTabKeyDown = (event: React.KeyboardEvent<HTMLButtonElement>) => {
    const currentIndex = tabs.findIndex((tab) => tab.id === activeTab);
    let nextIndex = currentIndex;
    if (event.key === "ArrowRight")
      nextIndex = (currentIndex + 1) % tabs.length;
    else if (event.key === "ArrowLeft")
      nextIndex = (currentIndex - 1 + tabs.length) % tabs.length;
    else if (event.key === "Home") nextIndex = 0;
    else if (event.key === "End") nextIndex = tabs.length - 1;
    else return;
    event.preventDefault();
    const nextTab = tabs[nextIndex];
    if (!nextTab) return;
    setActiveTab(nextTab.id);
    document.getElementById(`admin-tab-${nextTab.id}`)?.focus();
  };

  return (
    <div className="p-4 sm:p-6 md:ml-64 md:p-8">
      <div className="mx-auto max-w-7xl">
        <header className="mb-8">
          <h1 className="mb-2 text-3xl font-bold text-white">Admin-Bereich</h1>
          <p className="text-gray-400">
            Konten, Zugriffe und Systemeinstellungen zentral verwalten
          </p>
        </header>

        <div
          className="mb-8 overflow-x-auto border-b border-gray-700"
          role="tablist"
          aria-label="Admin-Bereiche"
        >
          <div className="flex min-w-max gap-1">
            {tabs.map(({ id, label, icon: Icon }) => (
              <button
                key={id}
                id={`admin-tab-${id}`}
                type="button"
                role="tab"
                aria-selected={activeTab === id}
                aria-controls={`admin-panel-${id}`}
                tabIndex={activeTab === id ? 0 : -1}
                onClick={() => setActiveTab(id)}
                onKeyDown={handleTabKeyDown}
                className={`flex items-center gap-2 whitespace-nowrap border-b-2 px-4 py-3 text-sm font-medium transition-colors sm:px-6 ${
                  activeTab === id
                    ? "border-blue-400 text-blue-300"
                    : "border-transparent text-gray-400 hover:text-white"
                }`}
              >
                <Icon className="h-5 w-5" aria-hidden="true" />
                {label}
              </button>
            ))}
          </div>
        </div>

        {activeTab === "accounts" && (
          <section
            id="admin-panel-accounts"
            role="tabpanel"
            aria-labelledby="admin-tab-accounts"
          >
            {serverMode && (
              <div className="mb-6 rounded-xl border border-blue-500/30 bg-blue-950/30 p-5">
                <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
                  <div>
                    <h2 className="font-semibold text-white">
                      Verifizierte OAuth-Verbindungen
                    </h2>
                    <p className="mt-1 text-sm text-gray-300">
                      Tokens bleiben verschlüsselt auf dem Server.
                      Veröffentlichungen werden erst nach einer expliziten
                      Freigabe ausgeführt.
                    </p>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {(
                      [
                        ["youtube", "YouTube"],
                        ["meta", "Instagram / Facebook"],
                        ["tiktok", "TikTok"],
                      ] as const
                    ).map(([provider, label]) => (
                      <button
                        key={provider}
                        type="button"
                        onClick={() => connectProvider(provider)}
                        className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-500"
                      >
                        {label} verbinden
                      </button>
                    ))}
                  </div>
                </div>
                {providerLoading ? (
                  <p className="mt-4 text-sm text-gray-400" role="status">
                    Verbindungen werden geladen …
                  </p>
                ) : providerConnections.length > 0 ? (
                  <div className="mt-5 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
                    {providerConnections.map((connection) => (
                      <article
                        key={connection.id}
                        className="rounded-lg border border-gray-700 bg-gray-900/70 p-4"
                      >
                        <div className="flex items-start justify-between gap-3">
                          <div>
                            <p className="text-xs uppercase tracking-wide text-blue-300">
                              {connection.provider}
                            </p>
                            <h3 className="mt-1 font-medium text-white">
                              {connection.displayName}
                            </h3>
                            <p className="mt-1 text-xs text-gray-400">
                              {connection.status === "connected"
                                ? "Verbunden"
                                : `Status: ${connection.status}`}
                            </p>
                          </div>
                          <button
                            type="button"
                            onClick={() => void disconnectProvider(connection)}
                            className="rounded-md border border-red-500/40 px-3 py-1.5 text-xs text-red-300 hover:bg-red-500/10"
                          >
                            Trennen
                          </button>
                        </div>
                      </article>
                    ))}
                  </div>
                ) : (
                  <p className="mt-4 text-sm text-gray-400">
                    Noch keine echte Provider-Verbindung eingerichtet.
                  </p>
                )}
              </div>
            )}
            <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <h2 className="text-xl font-semibold text-white">
                  Social-Media-Konten
                </h2>
                <p className="mt-1 text-sm text-gray-400">
                  Verbindungen und Kampagnenzuordnung pflegen
                </p>
              </div>
              <button
                type="button"
                onClick={openNewAccount}
                className="inline-flex items-center justify-center gap-2 rounded-lg bg-blue-600 px-4 py-2.5 font-medium text-white hover:bg-blue-700"
              >
                <Plus className="h-4 w-4" aria-hidden="true" />
                Account hinzufügen
              </button>
            </div>

            {socialMediaAccounts.length > 0 ? (
              <div className="space-y-4">
                {socialMediaAccounts.map((account) => (
                  <article
                    key={account.id}
                    className="rounded-xl border border-gray-700 bg-gray-800/50 p-4 sm:p-6"
                  >
                    <div className="flex flex-col gap-5 lg:flex-row lg:items-start lg:justify-between">
                      <div className="flex min-w-0 items-start gap-4">
                        <div
                          className={`shrink-0 rounded-lg p-3 ${account.isActive ? "bg-blue-500/20 text-blue-300" : "bg-gray-700 text-gray-400"}`}
                        >
                          <Globe className="h-6 w-6" aria-hidden="true" />
                        </div>
                        <div className="min-w-0">
                          <h3 className="truncate font-semibold text-white">
                            {account.name}
                          </h3>
                          <p className="text-sm text-gray-300">
                            {account.platform}
                          </p>
                          <p className="mt-1 break-all text-xs text-gray-500">
                            {account.email}
                          </p>
                          <div className="mt-3 flex flex-wrap gap-2">
                            <span
                              className={`rounded-full px-2.5 py-1 text-xs font-medium ${connectionStyles[account.connectionStatus]}`}
                            >
                              {connectionLabels[account.connectionStatus]}
                            </span>
                            <span
                              className={`rounded-full px-2.5 py-1 text-xs font-medium ${account.isActive ? "bg-blue-500/20 text-blue-300" : "bg-gray-500/20 text-gray-300"}`}
                            >
                              Sync {account.isActive ? "aktiv" : "pausiert"}
                            </span>
                          </div>
                        </div>
                      </div>

                      <div className="flex flex-wrap gap-2">
                        <button
                          type="button"
                          onClick={() => toggleAccount(account)}
                          aria-pressed={account.isActive}
                          className="inline-flex items-center gap-2 rounded-lg bg-gray-700 px-3 py-2 text-sm text-gray-200 hover:bg-gray-600"
                        >
                          <Power className="h-4 w-4" aria-hidden="true" />
                          {account.isActive ? "Pausieren" : "Aktivieren"}
                        </button>
                        <button
                          type="button"
                          onClick={() => openAccountEditor(account)}
                          className="inline-flex items-center gap-2 rounded-lg bg-gray-700 px-3 py-2 text-sm text-gray-200 hover:bg-gray-600"
                        >
                          <Pencil className="h-4 w-4" aria-hidden="true" />
                          Konfigurieren
                        </button>
                        <button
                          type="button"
                          onClick={() => setAccountToDelete(account)}
                          className="inline-flex items-center gap-2 rounded-lg bg-red-500/10 px-3 py-2 text-sm text-red-300 hover:bg-red-500/20"
                        >
                          <Trash2 className="h-4 w-4" aria-hidden="true" />
                          Löschen
                        </button>
                      </div>
                    </div>

                    <dl className="mt-5 grid grid-cols-1 gap-4 border-t border-gray-700 pt-5 md:grid-cols-3">
                      <div className="min-w-0">
                        <dt className="mb-1 text-xs text-gray-500">
                          Profil-URL
                        </dt>
                        <dd
                          className="truncate text-sm text-gray-300"
                          title={account.url}
                        >
                          {account.url}
                        </dd>
                      </div>
                      <div className="min-w-0">
                        <dt className="mb-1 text-xs text-gray-500">
                          API-Endpunkt
                        </dt>
                        <dd
                          className="truncate font-mono text-sm text-gray-300"
                          title={account.apiEndpoint}
                        >
                          {account.apiEndpoint || "Nicht hinterlegt"}
                        </dd>
                      </div>
                      <div>
                        <dt className="mb-1 text-xs text-gray-500">
                          Kampagnen
                        </dt>
                        <dd className="text-sm text-gray-300">
                          {account.campaignIds.length} zugewiesen
                        </dd>
                      </div>
                    </dl>
                  </article>
                ))}
              </div>
            ) : (
              <div className="rounded-xl border border-dashed border-gray-700 bg-gray-800/30 px-6 py-12 text-center">
                <Globe
                  className="mx-auto mb-4 h-12 w-12 text-gray-600"
                  aria-hidden="true"
                />
                <h3 className="font-semibold text-gray-300">
                  Noch keine Social-Media-Konten
                </h3>
                <p className="mt-1 text-sm text-gray-500">
                  Füge ein Konto hinzu, um es Kampagnen zuzuordnen.
                </p>
              </div>
            )}
          </section>
        )}

        {activeTab === "users" && (
          <section
            id="admin-panel-users"
            role="tabpanel"
            aria-labelledby="admin-tab-users"
          >
            <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <h2 className="text-xl font-semibold text-white">
                  Benutzerverwaltung
                </h2>
                <p className="mt-1 text-sm text-gray-400">
                  Rollen und Profilinformationen verwalten
                </p>
              </div>
              <button
                type="button"
                onClick={openNewUser}
                className="inline-flex items-center justify-center gap-2 rounded-lg bg-blue-600 px-4 py-2.5 font-medium text-white hover:bg-blue-700"
              >
                <Plus className="h-4 w-4" aria-hidden="true" />
                Neuer Benutzer
              </button>
            </div>

            <div className="overflow-x-auto rounded-xl border border-gray-700 bg-gray-800/50">
              <table className="w-full min-w-[760px]">
                <caption className="sr-only">
                  Alle Benutzer und ihre Rollen
                </caption>
                <thead>
                  <tr className="border-b border-gray-700">
                    <th
                      scope="col"
                      className="px-6 py-4 text-left text-sm font-semibold text-gray-400"
                    >
                      Name
                    </th>
                    <th
                      scope="col"
                      className="px-6 py-4 text-left text-sm font-semibold text-gray-400"
                    >
                      E-Mail
                    </th>
                    <th
                      scope="col"
                      className="px-6 py-4 text-left text-sm font-semibold text-gray-400"
                    >
                      Rolle
                    </th>
                    <th
                      scope="col"
                      className="px-6 py-4 text-left text-sm font-semibold text-gray-400"
                    >
                      Kampagnen-Rolle
                    </th>
                    <th
                      scope="col"
                      className="px-6 py-4 text-right text-sm font-semibold text-gray-400"
                    >
                      Aktionen
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {users.map((selectedUser) => {
                    const isSelf = selectedUser.id === currentUser?.id;
                    const isProtectedAdmin =
                      selectedUser.role === "Admin" && adminCount <= 1;
                    return (
                      <tr
                        key={selectedUser.id}
                        className="border-b border-gray-700/50 last:border-0 hover:bg-gray-800/70"
                      >
                        <td className="px-6 py-4">
                          <div className="flex items-center gap-3">
                            <Avatar
                              src={selectedUser.avatar}
                              name={selectedUser.name}
                              className="h-9 w-9 rounded-full object-cover"
                              fallbackClassName="bg-blue-500/20 text-blue-300"
                            />
                            <div>
                              <span className="font-medium text-white">
                                {selectedUser.name}
                              </span>
                              {isSelf && (
                                <span className="ml-2 text-xs text-blue-300">
                                  Du
                                </span>
                              )}
                            </div>
                          </div>
                        </td>
                        <td className="px-6 py-4 text-gray-300">
                          {selectedUser.email}
                        </td>
                        <td className="px-6 py-4">
                          <span
                            className={`rounded px-2 py-1 text-xs font-medium ${roleStyles[selectedUser.role]}`}
                          >
                            {selectedUser.role}
                          </span>
                        </td>
                        <td className="px-6 py-4 text-sm text-gray-400">
                          {selectedUser.campaignRole || "–"}
                        </td>
                        <td className="px-6 py-4">
                          <div className="flex justify-end gap-2">
                            <button
                              type="button"
                              onClick={() => openUserEditor(selectedUser)}
                              className="rounded-lg px-3 py-2 text-sm text-blue-300 hover:bg-blue-500/10 hover:text-blue-200"
                            >
                              Bearbeiten
                            </button>
                            <button
                              type="button"
                              onClick={() => requestUserDeletion(selectedUser)}
                              disabled={isSelf || isProtectedAdmin}
                              title={
                                isSelf
                                  ? "Das eigene Konto kann hier nicht gelöscht werden."
                                  : isProtectedAdmin
                                    ? "Der letzte Admin kann nicht gelöscht werden."
                                    : undefined
                              }
                              className="rounded-lg px-3 py-2 text-sm text-red-300 hover:bg-red-500/10 hover:text-red-200"
                            >
                              Löschen
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </section>
        )}

        {activeTab === "settings" && (
          <section
            id="admin-panel-settings"
            role="tabpanel"
            aria-labelledby="admin-tab-settings"
          >
            <form onSubmit={submitSettings} className="space-y-6">
              <div className="rounded-xl border border-gray-700 bg-gray-800/50 p-5 sm:p-6">
                <h2 className="mb-6 flex items-center text-xl font-semibold text-white">
                  <Bot
                    className="mr-2 h-5 w-5 text-purple-400"
                    aria-hidden="true"
                  />
                  KI-Einstellungen
                </h2>
                <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
                  <label>
                    <span className={labelClassName}>Provider</span>
                    <select
                      value={settingsDraft.aiProvider}
                      onChange={(event) =>
                        changeAiProvider(
                          event.target.value as AppSettings["aiProvider"],
                        )
                      }
                      className={fieldClassName}
                    >
                      <option value="ollama">Ollama (lokal)</option>
                      <option value="cloud">Cloud (nicht angebunden)</option>
                    </select>
                  </label>
                  <label>
                    <span className={labelClassName}>Modell</span>
                    <input
                      required
                      value={settingsDraft.aiModel}
                      onChange={(event) =>
                        setSettingsDraft((current) => ({
                          ...current,
                          aiModel: event.target.value,
                        }))
                      }
                      className={fieldClassName}
                      placeholder={
                        settingsDraft.aiProvider === "ollama"
                          ? "z. B. gemma3"
                          : "z. B. gpt-4"
                      }
                    />
                  </label>
                  <label className="md:col-span-2">
                    <span className={labelClassName}>API-Endpunkt</span>
                    <input
                      required
                      type="url"
                      value={settingsDraft.aiEndpoint}
                      onChange={(event) => changeAiEndpoint(event.target.value)}
                      className={`${fieldClassName} font-mono`}
                      placeholder={
                        settingsDraft.aiProvider === "ollama"
                          ? OLLAMA_DEFAULT_ENDPOINT
                          : "https://api.example.com/v1"
                      }
                    />
                  </label>
                </div>

                {settingsDraft.aiProvider === "ollama" && (
                  <div className="mt-6 rounded-xl border border-purple-500/20 bg-purple-500/5 p-4 sm:p-5">
                    <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                      <div>
                        <h3 className="font-medium text-white">
                          Lokale Ollama-Verbindung
                        </h3>
                        <p className="mt-1 max-w-2xl text-sm text-gray-400">
                          Prüft den eingetragenen Endpunkt und liest die lokal
                          installierten Modelle aus. Ein erfolgreicher Test ist
                          zum Speichern nicht erforderlich.
                        </p>
                      </div>
                      <button
                        type="button"
                        onClick={testOllamaConnection}
                        disabled={ollamaConnection.status === "loading"}
                        aria-describedby="ollama-connection-help"
                        className="inline-flex shrink-0 items-center justify-center rounded-lg bg-purple-600 px-4 py-2.5 font-medium text-white hover:bg-purple-700"
                      >
                        {ollamaConnection.status === "loading" ? (
                          <LoaderCircle
                            className="mr-2 h-4 w-4 animate-spin"
                            aria-hidden="true"
                          />
                        ) : (
                          <RefreshCw
                            className="mr-2 h-4 w-4"
                            aria-hidden="true"
                          />
                        )}
                        {ollamaConnection.status === "loading"
                          ? "Verbindung wird geprüft …"
                          : "Verbindung testen"}
                      </button>
                    </div>
                    <p
                      id="ollama-connection-help"
                      className="mt-3 text-xs text-gray-500"
                    >
                      Standardmäßig läuft Ollama unter {OLLAMA_DEFAULT_ENDPOINT}
                      .
                    </p>

                    {ollamaConnection.status !== "idle" && (
                      <div
                        role={
                          ollamaConnection.status === "error" ||
                          ollamaConnection.status === "empty"
                            ? "alert"
                            : "status"
                        }
                        aria-live="polite"
                        className={`mt-4 flex items-start gap-3 rounded-lg border px-4 py-3 text-sm ${
                          ollamaConnection.status === "error"
                            ? "border-red-500/30 bg-red-500/10 text-red-200"
                            : ollamaConnection.status === "success"
                              ? "border-green-500/30 bg-green-500/10 text-green-200"
                              : ollamaConnection.status === "empty"
                                ? "border-yellow-500/30 bg-yellow-500/10 text-yellow-200"
                                : "border-blue-500/30 bg-blue-500/10 text-blue-200"
                        }`}
                      >
                        {ollamaConnection.status === "error" ? (
                          <CircleAlert
                            className="mt-0.5 h-5 w-5 shrink-0"
                            aria-hidden="true"
                          />
                        ) : ollamaConnection.status === "success" ? (
                          <CheckCircle2
                            className="mt-0.5 h-5 w-5 shrink-0"
                            aria-hidden="true"
                          />
                        ) : ollamaConnection.status === "loading" ? (
                          <LoaderCircle
                            className="mt-0.5 h-5 w-5 shrink-0 animate-spin"
                            aria-hidden="true"
                          />
                        ) : (
                          <CircleAlert
                            className="mt-0.5 h-5 w-5 shrink-0"
                            aria-hidden="true"
                          />
                        )}
                        <p>{ollamaConnection.message}</p>
                      </div>
                    )}

                    {ollamaConnection.models.length > 0 && (
                      <fieldset className="mt-4">
                        <legend className="mb-3 text-sm font-medium text-gray-200">
                          Installiertes Modell auswählen
                        </legend>
                        <div className="grid gap-2 md:grid-cols-2">
                          {ollamaConnection.models.map((model) => {
                            const modelName = ollamaModelName(model);
                            const details = [
                              model.parameterSize,
                              model.quantizationLevel,
                              formatModelSize(model.size),
                            ].filter(Boolean);
                            return (
                              <label
                                key={modelName}
                                className={`flex cursor-pointer items-start gap-3 rounded-lg border p-3 ${
                                  settingsDraft.aiModel === modelName
                                    ? "border-purple-400/60 bg-purple-500/10"
                                    : "border-gray-700 bg-gray-900/40 hover:border-gray-600"
                                }`}
                              >
                                <input
                                  type="radio"
                                  name="ollama-model"
                                  value={modelName}
                                  checked={settingsDraft.aiModel === modelName}
                                  onChange={() =>
                                    setSettingsDraft((current) => ({
                                      ...current,
                                      aiModel: modelName,
                                    }))
                                  }
                                  className="mt-1 h-4 w-4 accent-purple-600"
                                />
                                <span className="min-w-0">
                                  <span className="block break-all text-sm font-medium text-white">
                                    {modelName}
                                  </span>
                                  <span className="mt-1 block text-xs text-gray-400">
                                    {details.join(" · ")}
                                  </span>
                                </span>
                              </label>
                            );
                          })}
                        </div>
                      </fieldset>
                    )}
                  </div>
                )}

                {settingsDraft.aiProvider === "ollama" ? (
                  <div
                    role="note"
                    className="mt-6 flex items-start gap-3 rounded-lg border border-green-500/20 bg-green-500/10 p-4"
                  >
                    <ShieldCheck
                      className="mt-0.5 h-5 w-5 shrink-0 text-green-300"
                      aria-hidden="true"
                    />
                    <div>
                      <p className="font-medium text-green-100">
                        Kein API-Schlüssel erforderlich
                      </p>
                      <p className="mt-1 text-sm text-green-100/80">
                        Ollama läuft lokal. CampaignHub speichert für diesen
                        Provider deshalb keinen API-Key-Status.
                      </p>
                    </div>
                  </div>
                ) : (
                  <label className="mt-6 flex items-start gap-3 rounded-lg border border-gray-700 bg-gray-800 p-4">
                    <input
                      type="checkbox"
                      checked={settingsDraft.apiKeyConfigured}
                      onChange={(event) =>
                        setSettingsDraft((current) => ({
                          ...current,
                          apiKeyConfigured: event.target.checked,
                        }))
                      }
                      className="mt-1 h-4 w-4 rounded border-gray-600 bg-gray-700 text-blue-600"
                    />
                    <span>
                      <span className="flex items-center gap-2 font-medium text-white">
                        <KeyRound
                          className="h-4 w-4 text-yellow-400"
                          aria-hidden="true"
                        />{" "}
                        Zugangsdaten extern konfiguriert
                      </span>
                      <span className="mt-1 block text-sm text-gray-400">
                        Es wird nur der Konfigurationsstatus gespeichert.
                        API-Schlüssel gehören in einen geschützten Secret-Store
                        und werden hier weder eingegeben noch angezeigt.
                      </span>
                    </span>
                  </label>
                )}
              </div>

              <div className="rounded-xl border border-gray-700 bg-gray-800/50 p-5 sm:p-6">
                <h2 className="mb-6 flex items-center text-xl font-semibold text-white">
                  <Database
                    className="mr-2 h-5 w-5 text-blue-400"
                    aria-hidden="true"
                  />
                  Workflow-Verwaltung
                </h2>
                <div className="space-y-4">
                  <label className="flex flex-col gap-3 rounded-lg bg-gray-800 p-4 sm:flex-row sm:items-center sm:justify-between">
                    <span>
                      <span className="block font-medium text-white">
                        Social-Media-Synchronisierung
                      </span>
                      <span className="mt-1 block text-sm text-gray-400">
                        Posts aktiver Konten regelmäßig abrufen
                      </span>
                    </span>
                    <input
                      type="checkbox"
                      checked={settingsDraft.socialSyncEnabled}
                      onChange={(event) =>
                        setSettingsDraft((current) => ({
                          ...current,
                          socialSyncEnabled: event.target.checked,
                        }))
                      }
                      className="h-5 w-5 rounded border-gray-600 bg-gray-700 text-blue-600"
                    />
                  </label>
                  <label className="flex flex-col gap-3 rounded-lg bg-gray-800 p-4 sm:flex-row sm:items-center sm:justify-between">
                    <span>
                      <span className="block font-medium text-white">
                        Workflow Execution Engine
                      </span>
                      <span className="mt-1 block text-sm text-gray-400">
                        Automatisierte Workflows ausführen
                      </span>
                    </span>
                    <input
                      type="checkbox"
                      checked={settingsDraft.workflowEngineEnabled}
                      onChange={(event) =>
                        setSettingsDraft((current) => ({
                          ...current,
                          workflowEngineEnabled: event.target.checked,
                        }))
                      }
                      className="h-5 w-5 rounded border-gray-600 bg-gray-700 text-blue-600"
                    />
                  </label>
                </div>
              </div>

              <div className="flex flex-col-reverse gap-3 sm:flex-row sm:justify-between">
                <button
                  type="button"
                  onClick={() => setResetDialogOpen(true)}
                  className="inline-flex items-center justify-center gap-2 rounded-lg border border-red-500/40 px-5 py-3 font-medium text-red-300 hover:bg-red-500/10"
                >
                  <RotateCcw className="h-5 w-5" aria-hidden="true" />
                  Demo-Daten zurücksetzen
                </button>
                <button
                  type="submit"
                  disabled={!hasSettingsChanges}
                  className="inline-flex items-center justify-center gap-2 rounded-lg bg-blue-600 px-6 py-3 font-medium text-white hover:bg-blue-700"
                >
                  <Save className="h-5 w-5" aria-hidden="true" />
                  Einstellungen speichern
                </button>
              </div>
            </form>
          </section>
        )}
      </div>

      <Modal
        open={accountModalOpen}
        onClose={closeAccountModal}
        title={
          editingAccountId
            ? "Account konfigurieren"
            : "Social-Media-Account hinzufügen"
        }
        size="lg"
      >
        <form onSubmit={submitAccount} className="space-y-5">
          <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
            <label>
              <span className={labelClassName}>Plattform *</span>
              <input
                required
                value={accountForm.platform}
                onChange={(event) =>
                  setAccountForm((current) => ({
                    ...current,
                    platform: event.target.value,
                  }))
                }
                className={fieldClassName}
                placeholder="z. B. Instagram"
              />
            </label>
            <label>
              <span className={labelClassName}>Account-Name *</span>
              <input
                required
                value={accountForm.name}
                onChange={(event) =>
                  setAccountForm((current) => ({
                    ...current,
                    name: event.target.value,
                  }))
                }
                className={fieldClassName}
                placeholder="@marke"
              />
            </label>
            <label>
              <span className={labelClassName}>Kontakt-E-Mail *</span>
              <input
                required
                type="email"
                value={accountForm.email}
                onChange={(event) =>
                  setAccountForm((current) => ({
                    ...current,
                    email: event.target.value,
                  }))
                }
                className={fieldClassName}
                placeholder="social@example.com"
              />
            </label>
            <label>
              <span className={labelClassName}>Verbindungsstatus</span>
              <select
                value={accountForm.connectionStatus}
                onChange={(event) =>
                  setAccountForm((current) => ({
                    ...current,
                    connectionStatus: event.target
                      .value as SocialMediaAccount["connectionStatus"],
                  }))
                }
                className={fieldClassName}
              >
                <option value="connected">Verbunden</option>
                <option value="disconnected">Getrennt</option>
                <option value="error">Fehler</option>
              </select>
            </label>
            <label className="sm:col-span-2">
              <span className={labelClassName}>Profil-URL *</span>
              <input
                required
                type="url"
                value={accountForm.url}
                onChange={(event) =>
                  setAccountForm((current) => ({
                    ...current,
                    url: event.target.value,
                  }))
                }
                className={fieldClassName}
                placeholder="https://social.example.com/account"
              />
            </label>
            <label className="sm:col-span-2">
              <span className={labelClassName}>API-Endpunkt</span>
              <input
                type="url"
                value={accountForm.apiEndpoint}
                onChange={(event) =>
                  setAccountForm((current) => ({
                    ...current,
                    apiEndpoint: event.target.value,
                  }))
                }
                className={`${fieldClassName} font-mono`}
                placeholder="https://api.example.com/v1"
              />
            </label>
          </div>

          <div>
            <p className={labelClassName}>Zugewiesene Kampagnen</p>
            {campaigns.length > 0 ? (
              <div className="grid max-h-44 grid-cols-1 gap-2 overflow-y-auto rounded-lg border border-gray-700 bg-gray-900/40 p-3 sm:grid-cols-2">
                {campaigns.map((campaign) => (
                  <label
                    key={campaign.id}
                    className="flex items-start gap-3 rounded-lg p-2 hover:bg-gray-700/60"
                  >
                    <input
                      type="checkbox"
                      checked={accountForm.campaignIds.includes(campaign.id)}
                      onChange={(event) =>
                        setAccountForm((current) => ({
                          ...current,
                          campaignIds: event.target.checked
                            ? [...current.campaignIds, campaign.id]
                            : current.campaignIds.filter(
                                (campaignId) => campaignId !== campaign.id,
                              ),
                        }))
                      }
                      className="mt-1 h-4 w-4 rounded border-gray-600 bg-gray-700 text-blue-600"
                    />
                    <span className="text-sm text-gray-200">
                      {campaign.name}
                    </span>
                  </label>
                ))}
              </div>
            ) : (
              <p className="rounded-lg border border-dashed border-gray-700 p-3 text-sm text-gray-500">
                Keine Kampagnen verfügbar.
              </p>
            )}
          </div>

          <label className="flex items-start gap-3 rounded-lg bg-gray-700/50 p-4">
            <input
              type="checkbox"
              checked={accountForm.isActive}
              onChange={(event) =>
                setAccountForm((current) => ({
                  ...current,
                  isActive: event.target.checked,
                }))
              }
              className="mt-1 h-4 w-4 rounded border-gray-600 bg-gray-700 text-blue-600"
            />
            <span>
              <span className="block font-medium text-white">
                Synchronisierung aktiv
              </span>
              <span className="mt-1 block text-sm text-gray-400">
                Nur aktive Konten werden im Social Stream berücksichtigt.
              </span>
            </span>
          </label>

          <div className="flex items-start gap-3 rounded-lg border border-blue-500/20 bg-blue-500/10 p-4 text-sm text-blue-100">
            <ShieldCheck
              className="mt-0.5 h-5 w-5 shrink-0 text-blue-300"
              aria-hidden="true"
            />
            <p>
              Hier werden nur öffentliche Verbindungsdaten gespeichert. Tokens,
              Passwörter und andere Secrets werden nicht erfasst.
            </p>
          </div>

          <div className="flex justify-end gap-3 border-t border-gray-700 pt-5">
            <button
              type="button"
              onClick={closeAccountModal}
              className="rounded-lg bg-gray-700 px-4 py-2.5 text-gray-200 hover:bg-gray-600"
            >
              Abbrechen
            </button>
            <button
              type="submit"
              className="rounded-lg bg-blue-600 px-4 py-2.5 font-medium text-white hover:bg-blue-700"
            >
              {editingAccountId ? "Änderungen speichern" : "Account hinzufügen"}
            </button>
          </div>
        </form>
      </Modal>

      <Modal
        open={userModalOpen}
        onClose={closeUserModal}
        title={editingUserId ? "Benutzer bearbeiten" : "Benutzer anlegen"}
      >
        <form onSubmit={submitUser} className="space-y-5">
          <label>
            <span className={labelClassName}>Name *</span>
            <input
              required
              value={userForm.name}
              onChange={(event) =>
                setUserForm((current) => ({
                  ...current,
                  name: event.target.value,
                }))
              }
              className={fieldClassName}
              autoComplete="name"
            />
          </label>
          <label>
            <span className={labelClassName}>E-Mail-Adresse *</span>
            <input
              required
              type="email"
              value={userForm.email}
              onChange={(event) =>
                setUserForm((current) => ({
                  ...current,
                  email: event.target.value,
                }))
              }
              className={fieldClassName}
              autoComplete="email"
            />
          </label>
          <label>
            <span className={labelClassName}>Systemrolle</span>
            <select
              value={userForm.role}
              onChange={(event) =>
                setUserForm((current) => ({
                  ...current,
                  role: event.target.value as UserRole,
                }))
              }
              disabled={editingUserId === currentUser?.id}
              className={fieldClassName}
            >
              {userRoles.map((role) => (
                <option key={role} value={role}>
                  {role}
                </option>
              ))}
            </select>
            {editingUserId === currentUser?.id && (
              <span className="mt-1 block text-xs text-gray-500">
                Die eigene Systemrolle ist geschützt.
              </span>
            )}
          </label>
          <label>
            <span className={labelClassName}>Kampagnen-Rolle</span>
            <input
              value={userForm.campaignRole}
              onChange={(event) =>
                setUserForm((current) => ({
                  ...current,
                  campaignRole: event.target.value,
                }))
              }
              className={fieldClassName}
              placeholder="z. B. Content Creator"
            />
          </label>
          <label>
            <span className={labelClassName}>Avatar-URL</span>
            <input
              type="url"
              value={userForm.avatar}
              onChange={(event) =>
                setUserForm((current) => ({
                  ...current,
                  avatar: event.target.value,
                }))
              }
              className={fieldClassName}
              placeholder="https://example.com/avatar.jpg"
            />
          </label>
          <label>
            <span className={labelClassName}>
              {editingUserId ? "Neues Passwort" : "Initiales Passwort *"}
            </span>
            <input
              type="password"
              required={!editingUserId}
              minLength={6}
              value={userForm.password}
              onChange={(event) =>
                setUserForm((current) => ({
                  ...current,
                  password: event.target.value,
                }))
              }
              className={fieldClassName}
              autoComplete="new-password"
              placeholder={
                editingUserId
                  ? "Leer lassen, um es nicht zu ändern"
                  : "Mindestens 6 Zeichen"
              }
            />
          </label>
          <p className="rounded-lg border border-gray-700 bg-gray-900/40 p-3 text-sm text-gray-400">
            Passwörter werden nur lokal als SHA-256-Hash gespeichert. Das ist
            für diese Browser-Demo gedacht und ersetzt keine serverseitige
            Authentifizierung.
          </p>
          <div className="flex justify-end gap-3 border-t border-gray-700 pt-5">
            <button
              type="button"
              onClick={closeUserModal}
              className="rounded-lg bg-gray-700 px-4 py-2.5 text-gray-200 hover:bg-gray-600"
            >
              Abbrechen
            </button>
            <button
              type="submit"
              disabled={userSubmitting}
              className="rounded-lg bg-blue-600 px-4 py-2.5 font-medium text-white hover:bg-blue-700"
            >
              {userSubmitting
                ? "Wird gespeichert …"
                : editingUserId
                  ? "Änderungen speichern"
                  : "Benutzer anlegen"}
            </button>
          </div>
        </form>
      </Modal>

      <ConfirmDialog
        open={Boolean(accountToDelete)}
        title="Account löschen?"
        message={`${accountToDelete?.name ?? "Dieser Account"} und alle zugehörigen Demo-Posts werden dauerhaft aus der App entfernt.`}
        confirmLabel="Account löschen"
        danger
        onConfirm={confirmAccountDeletion}
        onClose={closeAccountDeleteDialog}
      />
      <ConfirmDialog
        open={Boolean(userToDelete)}
        title="Benutzer löschen?"
        message={`${userToDelete?.name ?? "Dieser Benutzer"} sowie zugehörige Teilnehmer- und Zugangsdaten werden entfernt. Zugewiesene Aufgaben werden freigegeben.`}
        confirmLabel="Benutzer löschen"
        danger
        onConfirm={confirmUserDeletion}
        onClose={closeUserDeleteDialog}
      />
      <ConfirmDialog
        open={resetDialogOpen}
        title="Demo-Daten zurücksetzen?"
        message="Alle Änderungen an Kampagnen, Benutzern, Konten und Einstellungen werden verworfen und durch die ursprünglichen Demo-Daten ersetzt."
        confirmLabel="Demo zurücksetzen"
        danger
        onConfirm={confirmDemoReset}
        onClose={closeResetDialog}
      />
    </div>
  );
}
