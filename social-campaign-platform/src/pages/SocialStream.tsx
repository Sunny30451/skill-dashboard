import { useEffect, useMemo, useRef, useState } from "react";
import { format } from "date-fns";
import { de } from "date-fns/locale";
import {
  Heart,
  MessageSquare,
  RefreshCw,
  Search,
  Share2,
  TrendingUp,
  Video,
  X,
} from "lucide-react";
import { useAppData } from "../contexts/app-data";
import { useFeedback } from "../contexts/feedback";
import {
  isBackendEnabled,
  listProviderConnections,
  syncProvider,
} from "../services/backend";

const PAGE_SIZE = 4;

const platformColors: Record<string, string> = {
  YouTube: "text-red-400",
  Instagram: "text-pink-400",
  "Twitter/X": "text-sky-400",
  LinkedIn: "text-blue-400",
  TikTok: "text-white",
  Facebook: "text-blue-400",
};

function normalizePlatform(platform: string): string {
  return platform.trim().toLocaleLowerCase("de-DE");
}

function getTimestamp(value: Date): number {
  const timestamp = new Date(value).getTime();
  return Number.isNaN(timestamp) ? 0 : timestamp;
}

function formatPostDate(value: Date): string {
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? "Datum unbekannt"
    : format(date, "dd.MM.yyyy, HH:mm", { locale: de });
}

function toDateTimeAttribute(value: Date): string | undefined {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? undefined : date.toISOString();
}

function PlatformIcon({ platform }: { platform: string }) {
  switch (platform) {
    case "Instagram":
      return (
        <svg
          className="h-4 w-4"
          aria-hidden="true"
          fill="currentColor"
          viewBox="0 0 24 24"
        >
          <path d="M12 2.163c3.204 0 3.584.012 4.85.07 3.252.148 4.771 1.691 4.919 4.919.058 1.265.069 1.645.069 4.849 0 3.205-.012 3.584-.069 4.849-.149 3.225-1.664 4.771-4.919 4.919-1.266.058-1.644.07-4.85.07-3.204 0-3.584-.012-4.849-.07-3.26-.149-4.771-1.699-4.919-4.92-.058-1.265-.07-1.644-.07-4.849 0-3.204.013-3.583.07-4.849.149-3.227 1.664-4.771 4.919-4.919 1.266-.057 1.645-.069 4.849-.069zm0-2.163c-3.259 0-3.667.014-4.947.072-4.358.2-6.78 2.618-6.98 6.98-.059 1.281-.073 1.689-.073 4.948 0 3.259.014 3.668.072 4.948.2 4.358 2.618 6.78 6.98 6.98 1.281.058 1.689.072 4.948.072 3.259 0 3.668-.014 4.948-.072 4.354-.2 6.782-2.618 6.979-6.98.059-1.28.073-1.689.073-4.948 0-3.259-.014-3.667-.072-4.947-.196-4.354-2.617-6.78-6.979-6.98-1.281-.059-1.69-.073-4.949-.073zm0 5.838A6.162 6.162 0 1 0 12 18.163 6.162 6.162 0 0 0 12 5.838zm0 10.162a4 4 0 1 1 0-8 4 4 0 0 1 0 8zm6.406-11.845a1.44 1.44 0 1 0 0 2.88 1.44 1.44 0 0 0 0-2.88z" />
        </svg>
      );
    case "Twitter/X":
      return (
        <svg
          className="h-4 w-4"
          aria-hidden="true"
          fill="currentColor"
          viewBox="0 0 24 24"
        >
          <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
        </svg>
      );
    case "LinkedIn":
      return (
        <svg
          className="h-4 w-4"
          aria-hidden="true"
          fill="currentColor"
          viewBox="0 0 24 24"
        >
          <path d="M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.351V9h3.414v1.561h.046c.477-.9 1.637-1.85 3.37-1.85 3.601 0 4.267 2.37 4.267 5.455v6.286zM5.337 7.433a2.064 2.064 0 1 1 0-4.128 2.064 2.064 0 0 1 0 4.128zm1.782 13.019H3.555V9h3.564v11.452zM22.225 0H1.771C.792 0 0 .774 0 1.729v20.542C0 23.227.792 24 1.771 24h20.451C23.2 24 24 23.227 24 22.271V1.729C24 .774 23.2 0 22.222 0z" />
        </svg>
      );
    case "TikTok":
      return <Video className="h-4 w-4" aria-hidden="true" />;
    default:
      return <MessageSquare className="h-4 w-4" aria-hidden="true" />;
  }
}

export default function SocialStream() {
  const { socialMediaPosts, socialMediaAccounts, settings } = useAppData();
  const { notify } = useFeedback();
  const [selectedPlatform, setSelectedPlatform] = useState("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [lastRefreshedAt, setLastRefreshedAt] = useState<Date | null>(null);
  const refreshTimer = useRef<number | undefined>(undefined);

  const activeAccounts = useMemo(
    () =>
      settings.socialSyncEnabled
        ? socialMediaAccounts.filter(
            (account) =>
              account.isActive && account.connectionStatus === "connected",
          )
        : [],
    [settings.socialSyncEnabled, socialMediaAccounts],
  );

  const activeAccountById = useMemo(
    () => new Map(activeAccounts.map((account) => [account.id, account])),
    [activeAccounts],
  );

  const platformOptions = useMemo(() => {
    const options = new Map<
      string,
      { key: string; label: string; accountCount: number }
    >();
    activeAccounts.forEach((account) => {
      const key = normalizePlatform(account.platform);
      if (!key) return;
      const existing = options.get(key);
      if (existing) {
        existing.accountCount += 1;
      } else {
        options.set(key, {
          key,
          label: account.platform.trim(),
          accountCount: 1,
        });
      }
    });
    return [...options.values()].sort((left, right) =>
      left.label.localeCompare(right.label, "de"),
    );
  }, [activeAccounts]);

  const availablePosts = useMemo(
    () =>
      socialMediaPosts
        .filter((post) => activeAccountById.has(post.accountId))
        .sort(
          (left, right) =>
            getTimestamp(right.postedAt) - getTimestamp(left.postedAt),
        ),
    [activeAccountById, socialMediaPosts],
  );

  const filteredPosts = useMemo(() => {
    const query = searchQuery.trim().toLocaleLowerCase("de-DE");
    return availablePosts.filter((post) => {
      const account = activeAccountById.get(post.accountId);
      const platform = account?.platform ?? post.platform;
      if (
        selectedPlatform !== "all" &&
        normalizePlatform(platform) !== selectedPlatform
      )
        return false;
      if (!query) return true;
      return [post.content, platform, account?.name, account?.email]
        .filter(Boolean)
        .some((value) => value?.toLocaleLowerCase("de-DE").includes(query));
    });
  }, [activeAccountById, availablePosts, searchQuery, selectedPlatform]);

  const stats = useMemo(
    () =>
      filteredPosts.reduce(
        (total, post) => ({
          posts: total.posts + 1,
          likes: total.likes + (post.likes ?? 0),
          comments: total.comments + (post.comments ?? 0),
          shares: total.shares + (post.shares ?? 0),
        }),
        { posts: 0, likes: 0, comments: 0, shares: 0 },
      ),
    [filteredPosts],
  );

  const visiblePosts = filteredPosts.slice(0, visibleCount);
  const hasMorePosts = visiblePosts.length < filteredPosts.length;

  useEffect(() => {
    if (
      selectedPlatform !== "all" &&
      !platformOptions.some((option) => option.key === selectedPlatform)
    ) {
      setSelectedPlatform("all");
    }
  }, [platformOptions, selectedPlatform]);

  useEffect(() => {
    setVisibleCount(PAGE_SIZE);
  }, [searchQuery, selectedPlatform]);

  useEffect(
    () => () => {
      if (refreshTimer.current !== undefined)
        window.clearTimeout(refreshTimer.current);
    },
    [],
  );

  const refreshStream = async () => {
    if (isRefreshing || !settings.socialSyncEnabled) return;
    setIsRefreshing(true);
    if (await isBackendEnabled()) {
      try {
        const connections = await listProviderConnections();
        const providers = [
          ...new Set(connections.map((connection) => connection.provider)),
        ];
        await Promise.all(providers.map((provider) => syncProvider(provider)));
        setVisibleCount(PAGE_SIZE);
        setLastRefreshedAt(new Date());
        notify(
          `${connections.length} Provider-Verbindung${connections.length === 1 ? "" : "en"} geprüft. Plattform-Synchronisation läuft als persistenter Job.`,
          "info",
        );
      } catch (error) {
        notify(
          error instanceof Error
            ? error.message
            : "Synchronisierung konnte nicht gestartet werden.",
          "error",
        );
      } finally {
        setIsRefreshing(false);
      }
      return;
    }
    if (refreshTimer.current !== undefined)
      window.clearTimeout(refreshTimer.current);
    refreshTimer.current = window.setTimeout(() => {
      setVisibleCount(PAGE_SIZE);
      setLastRefreshedAt(new Date());
      setIsRefreshing(false);
      notify("Der Stream zeigt jetzt die aktuellen App-Daten.");
      refreshTimer.current = undefined;
    }, 450);
  };

  const clearFilters = () => {
    setSelectedPlatform("all");
    setSearchQuery("");
  };

  const emptyTitle = !settings.socialSyncEnabled
    ? "Synchronisierung pausiert"
    : activeAccounts.length === 0
      ? "Keine aktiven Konten"
      : searchQuery.trim()
        ? "Keine passenden Posts"
        : "Keine Posts gefunden";
  const emptyDescription = !settings.socialSyncEnabled
    ? "Ein Admin kann die lokale Social-Synchronisierung in den Systemeinstellungen wieder aktivieren."
    : activeAccounts.length === 0
      ? "Verbinde und aktiviere im Admin-Bereich mindestens ein Social-Media-Konto."
      : searchQuery.trim()
        ? "Versuche einen anderen Suchbegriff oder entferne die Filter."
        : selectedPlatform === "all"
          ? "Für die aktiven Konten sind noch keine Posts vorhanden."
          : "Für die ausgewählte Plattform sind keine Posts vorhanden.";

  return (
    <div className="p-4 sm:p-6 md:ml-64 md:p-8">
      <div className="mx-auto max-w-7xl">
        <header className="mb-8 flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <h1 className="mb-2 text-3xl font-bold text-white">
              Social Media Stream
            </h1>
            <p className="text-gray-400">
              Die neuesten Posts aller aktiven Social-Media-Konten
            </p>
            {lastRefreshedAt && (
              <p className="mt-2 text-xs text-gray-500">
                Ansicht aktualisiert um{" "}
                {format(lastRefreshedAt, "HH:mm:ss", { locale: de })} Uhr
              </p>
            )}
          </div>
          <button
            type="button"
            onClick={refreshStream}
            disabled={isRefreshing || !settings.socialSyncEnabled}
            className="inline-flex items-center justify-center gap-2 rounded-lg bg-gray-800 px-4 py-2.5 font-medium text-gray-200 hover:bg-gray-700"
          >
            <RefreshCw
              className={`h-4 w-4 ${isRefreshing ? "animate-spin" : ""}`}
              aria-hidden="true"
            />
            {isRefreshing ? "Aktualisiere …" : "Aktualisieren"}
          </button>
        </header>

        <section
          aria-label="Stream-Filter"
          className="mb-8 rounded-xl border border-gray-700 bg-gray-800/40 p-4"
        >
          <label htmlFor="stream-search" className="sr-only">
            Posts durchsuchen
          </label>
          <div className="relative mb-4">
            <Search
              className="pointer-events-none absolute left-3 top-1/2 h-5 w-5 -translate-y-1/2 text-gray-500"
              aria-hidden="true"
            />
            <input
              id="stream-search"
              type="search"
              value={searchQuery}
              onChange={(event) => setSearchQuery(event.target.value)}
              placeholder="Posts, Plattform oder Account durchsuchen …"
              className="w-full rounded-lg border border-gray-600 bg-gray-800 py-2.5 pl-10 pr-10 text-white placeholder:text-gray-500 focus:border-blue-500"
            />
            {searchQuery && (
              <button
                type="button"
                onClick={() => setSearchQuery("")}
                aria-label="Suche leeren"
                className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-1.5 text-gray-400 hover:bg-gray-700 hover:text-white"
              >
                <X className="h-4 w-4" aria-hidden="true" />
              </button>
            )}
          </div>

          <div
            className="flex flex-wrap gap-2"
            aria-label="Nach Plattform filtern"
          >
            <button
              type="button"
              onClick={() => setSelectedPlatform("all")}
              aria-pressed={selectedPlatform === "all"}
              className={`rounded-lg px-4 py-2 text-sm font-medium transition-colors ${selectedPlatform === "all" ? "bg-blue-600 text-white" : "bg-gray-800 text-gray-300 hover:bg-gray-700"}`}
            >
              Alle aktiven Konten ({activeAccounts.length})
            </button>
            {platformOptions.map((option) => (
              <button
                key={option.key}
                type="button"
                onClick={() => setSelectedPlatform(option.key)}
                aria-pressed={selectedPlatform === option.key}
                className={`flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-medium transition-colors ${selectedPlatform === option.key ? "bg-blue-600 text-white" : "bg-gray-800 text-gray-300 hover:bg-gray-700"}`}
              >
                <PlatformIcon platform={option.label} />
                <span>
                  {option.label}
                  {option.accountCount > 1 ? ` (${option.accountCount})` : ""}
                </span>
              </button>
            ))}
          </div>
        </section>

        <section
          aria-label="Statistik der gefilterten Posts"
          className="mb-8 grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4"
        >
          {[
            { label: "Gefundene Posts", value: stats.posts },
            { label: "Likes", value: stats.likes },
            { label: "Kommentare", value: stats.comments },
            { label: "Shares", value: stats.shares },
          ].map((stat) => (
            <div
              key={stat.label}
              className="rounded-lg border border-gray-700 bg-gray-800/50 p-4"
            >
              <div className="text-xl font-bold text-white sm:text-2xl">
                {stat.value.toLocaleString("de-DE")}
              </div>
              <div className="mt-1 text-xs text-gray-400 sm:text-sm">
                {stat.label}
              </div>
            </div>
          ))}
        </section>

        {visiblePosts.length > 0 ? (
          <>
            <p className="sr-only" aria-live="polite">
              {visiblePosts.length} von {filteredPosts.length} Posts werden
              angezeigt.
            </p>
            <div className="space-y-6">
              {visiblePosts.map((post) => {
                const account = activeAccountById.get(post.accountId);
                const platform = account?.platform ?? post.platform;
                return (
                  <article
                    key={post.id}
                    className="overflow-hidden rounded-xl border border-gray-700 bg-gray-800/50 transition-colors hover:border-gray-600"
                  >
                    <div className="p-4 sm:p-6">
                      <header className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                        <div className="flex min-w-0 items-center">
                          <div
                            className={`mr-3 shrink-0 rounded-lg bg-gray-800 p-2 ${platformColors[platform] ?? "text-gray-400"}`}
                          >
                            <PlatformIcon platform={platform} />
                          </div>
                          <div className="min-w-0">
                            <h2 className="truncate font-semibold text-white">
                              {account?.name ?? platform}
                            </h2>
                            <p className="text-xs text-gray-400">
                              {platform} ·{" "}
                              <time
                                dateTime={toDateTimeAttribute(post.postedAt)}
                              >
                                {formatPostDate(post.postedAt)}
                              </time>
                            </p>
                          </div>
                        </div>
                        {post.engagement !== undefined && (
                          <div
                            className="flex shrink-0 items-center text-green-400"
                            title="Engagement-Rate"
                          >
                            <TrendingUp
                              className="mr-1 h-4 w-4"
                              aria-hidden="true"
                            />
                            <span className="text-sm font-medium">
                              {post.engagement.toLocaleString("de-DE")} %
                              Engagement
                            </span>
                          </div>
                        )}
                      </header>

                      <p className="mb-4 whitespace-pre-wrap break-words text-gray-300">
                        {post.content}
                      </p>

                      {post.mediaUrls && post.mediaUrls.length > 0 && (
                        <div
                          className={`mb-4 grid gap-2 ${post.mediaUrls.length > 1 ? "grid-cols-2" : "grid-cols-1"}`}
                        >
                          {post.mediaUrls.map((url, index) => (
                            <div
                              key={`${url}-${index}`}
                              className="aspect-video overflow-hidden rounded-lg bg-gray-800 sm:aspect-square"
                            >
                              <img
                                src={url}
                                alt={`Medieninhalt ${index + 1} von ${post.mediaUrls?.length ?? 1}`}
                                loading="lazy"
                                className="h-full w-full object-cover"
                              />
                            </div>
                          ))}
                        </div>
                      )}

                      <dl className="flex flex-wrap items-center gap-x-6 gap-y-3 border-t border-gray-700 pt-4">
                        <div
                          className="flex items-center text-gray-400"
                          title="Likes"
                        >
                          <Heart className="mr-2 h-5 w-5" aria-hidden="true" />
                          <dt className="sr-only">Likes</dt>
                          <dd>{(post.likes ?? 0).toLocaleString("de-DE")}</dd>
                        </div>
                        <div
                          className="flex items-center text-gray-400"
                          title="Kommentare"
                        >
                          <MessageSquare
                            className="mr-2 h-5 w-5"
                            aria-hidden="true"
                          />
                          <dt className="sr-only">Kommentare</dt>
                          <dd>
                            {(post.comments ?? 0).toLocaleString("de-DE")}
                          </dd>
                        </div>
                        <div
                          className="flex items-center text-gray-400"
                          title="Shares"
                        >
                          <Share2 className="mr-2 h-5 w-5" aria-hidden="true" />
                          <dt className="sr-only">Shares</dt>
                          <dd>{(post.shares ?? 0).toLocaleString("de-DE")}</dd>
                        </div>
                      </dl>
                    </div>
                  </article>
                );
              })}
            </div>

            <div className="mt-8 text-center">
              {hasMorePosts ? (
                <button
                  type="button"
                  onClick={() =>
                    setVisibleCount((current) => current + PAGE_SIZE)
                  }
                  className="rounded-lg bg-gray-800 px-6 py-3 font-medium text-gray-300 hover:bg-gray-700"
                >
                  Weitere Posts laden (
                  {filteredPosts.length - visiblePosts.length})
                </button>
              ) : (
                <p className="text-sm text-gray-500">
                  Alle {filteredPosts.length.toLocaleString("de-DE")} Posts
                  werden angezeigt.
                </p>
              )}
            </div>
          </>
        ) : (
          <div className="rounded-xl border border-dashed border-gray-700 bg-gray-800/30 px-6 py-12 text-center">
            <MessageSquare
              className="mx-auto mb-4 h-14 w-14 text-gray-600"
              aria-hidden="true"
            />
            <h2 className="mb-2 text-xl font-semibold text-gray-300">
              {emptyTitle}
            </h2>
            <p className="mx-auto max-w-lg text-gray-500">{emptyDescription}</p>
            {(selectedPlatform !== "all" || searchQuery) && (
              <button
                type="button"
                onClick={clearFilters}
                className="mt-5 rounded-lg bg-gray-700 px-4 py-2 text-sm font-medium text-gray-200 hover:bg-gray-600"
              >
                Filter zurücksetzen
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
