import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  type FormEvent,
} from "react";
import { CheckCircle2, LoaderCircle, Send, XCircle } from "lucide-react";
import { useAppData } from "../contexts/app-data";
import { useAuth } from "../contexts/auth";
import { useFeedback } from "../contexts/feedback";
import {
  approvePublishJob,
  cancelPublishJob,
  createPublishJob,
  isBackendEnabled,
  listProviderConnections,
  listPublishJobs,
  type ProviderConnection,
  type PublishJob,
  type SocialProvider,
} from "../services/backend";

const fieldClass =
  "mt-1 w-full rounded-lg border border-gray-600 bg-gray-800 px-3 py-2.5 text-white focus:border-blue-500";

function providerLabel(provider: SocialProvider): string {
  if (provider === "youtube") return "YouTube";
  if (provider === "meta") return "Instagram / Facebook";
  return "TikTok";
}

const statusLabels: Record<PublishJob["status"], string> = {
  draft: "Entwurf – Freigabe ausstehend",
  pending: "Freigegeben / eingeplant",
  running: "Wird veröffentlicht",
  completed: "Veröffentlicht",
  failed: "Fehlgeschlagen",
  cancelled: "Abgebrochen",
};

export default function Publishing() {
  const { campaigns, mediaFiles } = useAppData();
  const { canEdit } = useAuth();
  const { notify } = useFeedback();
  const [connections, setConnections] = useState<ProviderConnection[]>([]);
  const [jobs, setJobs] = useState<PublishJob[]>([]);
  const [loading, setLoading] = useState(true);
  const [serverMode, setServerMode] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [form, setForm] = useState({
    connectionId: "",
    campaignId: "",
    mediaId: "",
    title: "",
    content: "",
    privacy: "private",
    scheduledFor: "",
    madeForKids: false,
    syntheticMedia: false,
  });

  const selectedConnection = useMemo(
    () => connections.find((entry) => entry.id === form.connectionId),
    [connections, form.connectionId],
  );

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const [nextConnections, nextJobs] = await Promise.all([
        listProviderConnections(),
        listPublishJobs(),
      ]);
      setConnections(nextConnections);
      setJobs(nextJobs);
      setForm((current) => ({
        ...current,
        connectionId: nextConnections.some(
          (entry) => entry.id === current.connectionId,
        )
          ? current.connectionId
          : (nextConnections[0]?.id ?? ""),
      }));
    } catch (error) {
      notify(
        error instanceof Error
          ? error.message
          : "Publishing-Daten konnten nicht geladen werden.",
        "error",
      );
    } finally {
      setLoading(false);
    }
  }, [notify]);

  useEffect(() => {
    let cancelled = false;
    void isBackendEnabled().then((enabled) => {
      if (cancelled) return;
      setServerMode(enabled);
      if (enabled) void refresh();
      else setLoading(false);
    });
    return () => {
      cancelled = true;
    };
  }, [refresh]);

  useEffect(() => {
    if (!serverMode) return undefined;
    const timer = window.setInterval(() => void refresh(), 15_000);
    return () => window.clearInterval(timer);
  }, [refresh, serverMode]);

  const submitDraft = async (event: FormEvent) => {
    event.preventDefault();
    if (!selectedConnection || !form.title.trim()) return;
    setSubmitting(true);
    try {
      const payload: Record<string, unknown> = {
        mediaId: form.mediaId || undefined,
        title: form.title.trim(),
        content: form.content.trim(),
      };
      if (selectedConnection.provider === "youtube") {
        Object.assign(payload, {
          description: form.content.trim(),
          privacyStatus: form.privacy,
          madeForKids: form.madeForKids,
          containsSyntheticMedia: form.syntheticMedia,
        });
      } else if (selectedConnection.provider === "tiktok") {
        Object.assign(payload, {
          privacyLevel: form.privacy,
          isAigc: form.syntheticMedia,
          disableComment: false,
          disableDuet: false,
          disableStitch: false,
        });
      }
      await createPublishJob({
        provider: selectedConnection.provider,
        connectionId: selectedConnection.id,
        campaignId: form.campaignId || undefined,
        scheduledFor: form.scheduledFor
          ? new Date(form.scheduledFor).toISOString()
          : undefined,
        payload,
      });
      notify("Entwurf erstellt. Prüfe ihn und erteile danach die Freigabe.");
      setForm((current) => ({
        ...current,
        title: "",
        content: "",
        mediaId: "",
      }));
      await refresh();
    } catch (error) {
      notify(
        error instanceof Error
          ? error.message
          : "Entwurf konnte nicht erstellt werden.",
        "error",
      );
    } finally {
      setSubmitting(false);
    }
  };

  const approve = async (job: PublishJob) => {
    const connection = connections.find(
      (entry) => entry.id === job.connectionId,
    );
    if (!connection) return;
    try {
      await approvePublishJob(job.id, {
        account: connection.displayName,
        contentHash: JSON.stringify(job.payload),
        privacy: String(
          job.payload.privacyStatus ??
            job.payload.privacyLevel ??
            "provider default",
        ),
      });
      notify("Veröffentlichung wurde ausdrücklich freigegeben.");
      await refresh();
    } catch (error) {
      notify(
        error instanceof Error ? error.message : "Freigabe fehlgeschlagen.",
        "error",
      );
    }
  };

  if (!serverMode) {
    return (
      <div className="p-6 md:ml-64 md:p-8">
        <div className="mx-auto max-w-5xl rounded-xl border border-amber-500/30 bg-amber-950/20 p-8">
          <h1 className="text-2xl font-bold text-white">Publishing</h1>
          <p className="mt-3 text-amber-100">
            Echtes Publishing ist nur im Self-Hosted-Backend mit PostgreSQL,
            MinIO und OAuth-Secrets verfügbar.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="p-4 sm:p-6 md:ml-64 md:p-8">
      <div className="mx-auto max-w-7xl">
        <header className="mb-8">
          <h1 className="text-3xl font-bold text-white">
            Publishing & Freigaben
          </h1>
          <p className="mt-2 text-gray-400">
            Entwürfe erstellen, Zielkonto prüfen und Schreibaktionen explizit
            freigeben.
          </p>
        </header>

        {canEdit && connections.length > 0 && (
          <form
            onSubmit={submitDraft}
            className="mb-8 rounded-xl border border-gray-700 bg-gray-800/50 p-5"
          >
            <h2 className="mb-5 text-lg font-semibold text-white">
              Neuer Entwurf
            </h2>
            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
              <label className="text-sm text-gray-300">
                Zielkonto
                <select
                  className={fieldClass}
                  value={form.connectionId}
                  onChange={(event) =>
                    setForm({ ...form, connectionId: event.target.value })
                  }
                  required
                >
                  {connections.map((connection) => (
                    <option key={connection.id} value={connection.id}>
                      {providerLabel(connection.provider)} –{" "}
                      {connection.displayName}
                    </option>
                  ))}
                </select>
              </label>
              <label className="text-sm text-gray-300">
                Kampagne
                <select
                  className={fieldClass}
                  value={form.campaignId}
                  onChange={(event) =>
                    setForm({ ...form, campaignId: event.target.value })
                  }
                >
                  <option value="">Keine Zuordnung</option>
                  {campaigns.map((campaign) => (
                    <option key={campaign.id} value={campaign.id}>
                      {campaign.name}
                    </option>
                  ))}
                </select>
              </label>
              <label className="text-sm text-gray-300">
                Medium
                <select
                  className={fieldClass}
                  value={form.mediaId}
                  onChange={(event) =>
                    setForm({ ...form, mediaId: event.target.value })
                  }
                  required={selectedConnection?.provider !== "meta"}
                >
                  <option value="">Kein Medium</option>
                  {mediaFiles
                    .filter((file) => !file.url.startsWith("data:"))
                    .map((file) => (
                      <option key={file.id} value={file.id}>
                        {file.originalName}
                      </option>
                    ))}
                </select>
              </label>
              <label className="text-sm text-gray-300 md:col-span-2">
                Titel
                <input
                  className={fieldClass}
                  value={form.title}
                  maxLength={100}
                  onChange={(event) =>
                    setForm({ ...form, title: event.target.value })
                  }
                  required
                />
              </label>
              <label className="text-sm text-gray-300">
                Veröffentlichungszeit
                <input
                  type="datetime-local"
                  className={fieldClass}
                  value={form.scheduledFor}
                  onChange={(event) =>
                    setForm({ ...form, scheduledFor: event.target.value })
                  }
                />
              </label>
              <label className="text-sm text-gray-300 md:col-span-2 xl:col-span-3">
                Text / Beschreibung
                <textarea
                  className={`${fieldClass} min-h-28`}
                  value={form.content}
                  onChange={(event) =>
                    setForm({ ...form, content: event.target.value })
                  }
                />
              </label>
              {(selectedConnection?.provider === "youtube" ||
                selectedConnection?.provider === "tiktok") && (
                <label className="text-sm text-gray-300">
                  Sichtbarkeit
                  <select
                    className={fieldClass}
                    value={form.privacy}
                    onChange={(event) =>
                      setForm({ ...form, privacy: event.target.value })
                    }
                  >
                    {selectedConnection.provider === "youtube" ? (
                      <>
                        <option value="private">Privat</option>
                        <option value="unlisted">Nicht gelistet</option>
                        <option value="public">Öffentlich</option>
                      </>
                    ) : (
                      <>
                        <option value="SELF_ONLY">Nur ich</option>
                        <option value="FOLLOWER_OF_CREATOR">Follower</option>
                        <option value="MUTUAL_FOLLOW_FRIENDS">Freunde</option>
                        <option value="PUBLIC_TO_EVERYONE">Öffentlich</option>
                      </>
                    )}
                  </select>
                </label>
              )}
              <label className="flex items-center gap-2 self-end text-sm text-gray-300">
                <input
                  type="checkbox"
                  checked={form.syntheticMedia}
                  onChange={(event) =>
                    setForm({ ...form, syntheticMedia: event.target.checked })
                  }
                />
                KI-/synthetische Medien kennzeichnen
              </label>
              {selectedConnection?.provider === "youtube" && (
                <label className="flex items-center gap-2 self-end text-sm text-gray-300">
                  <input
                    type="checkbox"
                    checked={form.madeForKids}
                    onChange={(event) =>
                      setForm({ ...form, madeForKids: event.target.checked })
                    }
                  />
                  Für Kinder erstellt
                </label>
              )}
            </div>
            <button
              disabled={submitting}
              className="mt-5 inline-flex items-center gap-2 rounded-lg bg-blue-600 px-5 py-2.5 font-medium text-white disabled:opacity-50"
            >
              {submitting ? (
                <LoaderCircle className="h-4 w-4 animate-spin" />
              ) : (
                <Send className="h-4 w-4" />
              )}
              Entwurf speichern
            </button>
          </form>
        )}

        <section>
          <h2 className="mb-4 text-xl font-semibold text-white">
            Warteschlange
          </h2>
          {loading ? (
            <p className="text-gray-400" role="status">
              Jobs werden geladen …
            </p>
          ) : jobs.length === 0 ? (
            <p className="rounded-xl border border-dashed border-gray-700 p-8 text-center text-gray-400">
              Noch keine Publishing-Jobs.
            </p>
          ) : (
            <div className="space-y-3">
              {jobs.map((job) => {
                const connection = connections.find(
                  (entry) => entry.id === job.connectionId,
                );
                return (
                  <article
                    key={job.id}
                    className="rounded-xl border border-gray-700 bg-gray-800/50 p-5"
                  >
                    <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                      <div>
                        <p className="text-xs uppercase tracking-wide text-blue-300">
                          {providerLabel(job.provider)} ·{" "}
                          {connection?.displayName ?? "Unbekanntes Konto"}
                        </p>
                        <h3 className="mt-1 font-semibold text-white">
                          {String(job.payload.title ?? "Ohne Titel")}
                        </h3>
                        <p className="mt-1 text-sm text-gray-400">
                          {statusLabels[job.status]} · Versuch {job.attempts}
                        </p>
                      </div>
                      <div className="flex flex-wrap gap-2">
                        {job.status === "draft" && canEdit && (
                          <button
                            type="button"
                            onClick={() => void approve(job)}
                            className="inline-flex items-center gap-2 rounded-lg bg-green-600 px-4 py-2 text-sm font-medium text-white"
                          >
                            <CheckCircle2 className="h-4 w-4" />
                            Inhalt, Konto & Sichtbarkeit bestätigen
                          </button>
                        )}
                        {(job.status === "draft" || job.status === "pending") &&
                          canEdit && (
                            <button
                              type="button"
                              onClick={() =>
                                void cancelPublishJob(job.id).then(refresh)
                              }
                              className="inline-flex items-center gap-2 rounded-lg border border-red-500/40 px-3 py-2 text-sm text-red-300"
                            >
                              <XCircle className="h-4 w-4" /> Abbrechen
                            </button>
                          )}
                      </div>
                    </div>
                  </article>
                );
              })}
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
