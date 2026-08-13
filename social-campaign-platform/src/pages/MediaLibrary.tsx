import { useEffect, useMemo, useState, type FormEvent } from "react";
import { format } from "date-fns";
import { de } from "date-fns/locale";
import {
  Download,
  Eye,
  FileAudio,
  FileText,
  FolderOpen,
  Image as ImageIcon,
  LayoutGrid,
  List,
  Search,
  Trash2,
  Upload,
  Video,
} from "lucide-react";
import ConfirmDialog from "../components/ConfirmDialog";
import Modal from "../components/Modal";
import { useAppData } from "../contexts/app-data";
import { useAuth } from "../contexts/auth";
import { useFeedback } from "../contexts/feedback";
import type { MediaFile } from "../types";
import {
  deleteBackendMedia,
  isBackendEnabled,
  uploadBackendMedia,
} from "../services/backend";

type ViewMode = "grid" | "list";
type FilterType = "all" | "image" | "video" | "audio" | "application";

const MAX_DEMO_FILE_SIZE = 2 * 1024 * 1024;
const MAX_SERVER_FILE_SIZE = 512 * 1024 * 1024;
const MAX_DEMO_STORAGE_SIZE = 4 * 1024 * 1024;

function formatFileSize(bytes: number): string {
  if (!bytes) return "0 Bytes";
  const units = ["Bytes", "KB", "MB", "GB"];
  const unitIndex = Math.min(
    Math.floor(Math.log(bytes) / Math.log(1024)),
    units.length - 1,
  );
  return `${Number((bytes / 1024 ** unitIndex).toFixed(2))} ${units[unitIndex]}`;
}

function FileIcon({
  mimeType,
  className = "h-8 w-8",
}: {
  mimeType: string;
  className?: string;
}) {
  if (mimeType.startsWith("image/"))
    return (
      <ImageIcon className={`${className} text-blue-400`} aria-hidden="true" />
    );
  if (mimeType.startsWith("video/"))
    return (
      <Video className={`${className} text-purple-400`} aria-hidden="true" />
    );
  if (mimeType.startsWith("audio/"))
    return (
      <FileAudio
        className={`${className} text-emerald-400`}
        aria-hidden="true"
      />
    );
  if (mimeType.includes("pdf"))
    return (
      <FileText className={`${className} text-red-400`} aria-hidden="true" />
    );
  return (
    <FolderOpen className={`${className} text-gray-400`} aria-hidden="true" />
  );
}

function MediaThumbnail({ file }: { file: MediaFile }) {
  const [failed, setFailed] = useState(false);
  const previewUrl = file.thumbnailUrl || file.url;

  if (file.mimeType.startsWith("image/") && previewUrl && !failed) {
    return (
      <img
        src={previewUrl}
        alt=""
        className="h-full w-full object-cover"
        onError={() => setFailed(true)}
      />
    );
  }

  if (
    file.mimeType.startsWith("video/") &&
    file.url.startsWith("data:") &&
    !failed
  ) {
    return (
      <video
        src={file.url}
        className="h-full w-full object-cover"
        muted
        preload="metadata"
        onError={() => setFailed(true)}
        aria-label={`Vorschau von ${file.originalName}`}
      />
    );
  }

  return <FileIcon mimeType={file.mimeType} className="h-10 w-10" />;
}

function readAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === "string") resolve(reader.result);
      else reject(new Error("Die Datei konnte nicht gelesen werden."));
    };
    reader.onerror = () =>
      reject(
        reader.error ?? new Error("Die Datei konnte nicht gelesen werden."),
      );
    reader.readAsDataURL(file);
  });
}

export default function MediaLibrary() {
  const {
    mediaFiles,
    campaigns,
    createMediaFile,
    importMediaFile,
    deleteMediaFile,
  } = useAppData();
  const { user, canEdit } = useAuth();
  const { notify } = useFeedback();
  const [viewMode, setViewMode] = useState<ViewMode>("grid");
  const [filterType, setFilterType] = useState<FilterType>("all");
  const [query, setQuery] = useState("");
  const [uploadOpen, setUploadOpen] = useState(false);
  const [uploadFile, setUploadFile] = useState<File | null>(null);
  const [uploadTags, setUploadTags] = useState("");
  const [uploadCampaignId, setUploadCampaignId] = useState("");
  const [uploadError, setUploadError] = useState("");
  const [uploading, setUploading] = useState(false);
  const [fileInputKey, setFileInputKey] = useState(0);
  const [previewFile, setPreviewFile] = useState<MediaFile | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<MediaFile | null>(null);
  const [serverMode, setServerMode] = useState(false);

  useEffect(() => {
    let cancelled = false;
    void isBackendEnabled().then((enabled) => {
      if (!cancelled) setServerMode(enabled);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const filteredFiles = useMemo(() => {
    const normalizedQuery = query.trim().toLocaleLowerCase("de");
    return mediaFiles.filter((file) => {
      const typeMatches =
        filterType === "all" ||
        file.mimeType.startsWith(`${filterType}/`) ||
        (filterType === "application" && file.mimeType.startsWith("text/"));
      const searchMatches =
        !normalizedQuery ||
        [file.originalName, file.mimeType, ...(file.tags ?? [])].some((value) =>
          value.toLocaleLowerCase("de").includes(normalizedQuery),
        );
      return typeMatches && searchMatches;
    });
  }, [filterType, mediaFiles, query]);

  const closeUpload = () => {
    if (uploading) return;
    setUploadOpen(false);
    setUploadFile(null);
    setUploadTags("");
    setUploadCampaignId("");
    setUploadError("");
    setFileInputKey((current) => current + 1);
  };

  const validateUpload = (file: File | null): string => {
    if (!file) return "Bitte wähle eine Datei aus.";
    if (file.size === 0)
      return "Leere Dateien können nicht hochgeladen werden.";
    const maximum = serverMode ? MAX_SERVER_FILE_SIZE : MAX_DEMO_FILE_SIZE;
    if (file.size > maximum) {
      return `Dateien bis ${formatFileSize(maximum)} sind erlaubt.`;
    }
    return "";
  };

  const handleUpload = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!canEdit || !user) return;
    const validationMessage = validateUpload(uploadFile);
    if (validationMessage || !uploadFile) {
      setUploadError(validationMessage);
      return;
    }

    setUploading(true);
    setUploadError("");
    try {
      const tags = [
        ...new Set(
          uploadTags
            .split(",")
            .map((tag) => tag.trim())
            .filter(Boolean),
        ),
      ];
      if (serverMode) {
        importMediaFile(
          await uploadBackendMedia({
            file: uploadFile,
            campaignId: uploadCampaignId || undefined,
            tags,
          }),
        );
      } else {
        const dataUrl = await readAsDataUrl(uploadFile);
        const currentStorageSize = new Blob([
          localStorage.getItem("campaignhub-data") ?? "",
        ]).size;
        if (
          currentStorageSize + new Blob([dataUrl]).size >
          MAX_DEMO_STORAGE_SIZE
        ) {
          throw new Error(
            "Für diese Datei ist im lokalen Demo-Speicher nicht mehr genug Platz. Lösche zuerst andere Uploads.",
          );
        }
        createMediaFile({
          filename: `${Date.now()}-${uploadFile.name.replace(/[^a-zA-Z0-9._-]/g, "-")}`,
          originalName: uploadFile.name,
          mimeType: uploadFile.type || "application/octet-stream",
          size: uploadFile.size,
          url: dataUrl,
          uploadedBy: user.id,
          campaignId: uploadCampaignId || undefined,
          tags,
        });
      }
      notify(`„${uploadFile.name}“ wurde hochgeladen.`);
      setUploading(false);
      closeUpload();
    } catch (error) {
      setUploading(false);
      setUploadError(
        error instanceof Error
          ? error.message
          : "Die Datei konnte nicht gelesen werden. Bitte versuche es erneut.",
      );
      notify("Der Upload ist fehlgeschlagen.", "error");
    }
  };

  const downloadFile = (file: MediaFile) => {
    const link = document.createElement("a");
    link.href = file.url;
    link.download = file.originalName;
    if (!file.url.startsWith("data:")) {
      link.target = "_blank";
      link.rel = "noreferrer";
    }
    document.body.appendChild(link);
    link.click();
    link.remove();
    notify(`Download von „${file.originalName}“ gestartet.`, "info");
  };

  const confirmDelete = async () => {
    if (!deleteTarget || !canEdit) return;
    if (serverMode) {
      try {
        await deleteBackendMedia(deleteTarget.id);
      } catch (error) {
        notify(
          error instanceof Error
            ? error.message
            : "Die Datei konnte nicht gelöscht werden.",
          "error",
        );
        return;
      }
    }
    deleteMediaFile(deleteTarget.id);
    notify(`„${deleteTarget.originalName}“ wurde gelöscht.`);
    if (previewFile?.id === deleteTarget.id) setPreviewFile(null);
    setDeleteTarget(null);
  };

  const filters: { value: FilterType; label: string }[] = [
    { value: "all", label: "Alle" },
    { value: "image", label: "Bilder" },
    { value: "video", label: "Videos" },
    { value: "audio", label: "Audio" },
    { value: "application", label: "Dokumente" },
  ];

  const actionButtons = (file: MediaFile) => (
    <div className="flex items-center gap-1">
      <button
        type="button"
        onClick={() => setPreviewFile(file)}
        aria-label={`${file.originalName} ansehen`}
        title="Vorschau und Details"
        className="rounded-lg p-2 text-gray-400 hover:bg-gray-700 hover:text-white"
      >
        <Eye className="h-4 w-4" aria-hidden="true" />
      </button>
      <button
        type="button"
        onClick={() => downloadFile(file)}
        aria-label={`${file.originalName} herunterladen`}
        title="Herunterladen"
        className="rounded-lg p-2 text-gray-400 hover:bg-gray-700 hover:text-white"
      >
        <Download className="h-4 w-4" aria-hidden="true" />
      </button>
      <button
        type="button"
        onClick={() => setDeleteTarget(file)}
        disabled={!canEdit}
        aria-label={`${file.originalName} löschen`}
        title={canEdit ? "Löschen" : "Nur mit Bearbeitungsrechten verfügbar"}
        className="rounded-lg p-2 text-gray-400 hover:bg-red-500/10 hover:text-red-400"
      >
        <Trash2 className="h-4 w-4" aria-hidden="true" />
      </button>
    </div>
  );

  return (
    <div className="p-4 sm:p-6 md:ml-64 md:p-8">
      <div className="mx-auto max-w-7xl">
        <div className="mb-8 flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
          <div>
            <h1 className="mb-2 text-3xl font-bold text-white">Mediathek</h1>
            <p className="text-gray-400">
              Verwalte alle deine Medien und Dateien
            </p>
          </div>
          <button
            type="button"
            onClick={() => setUploadOpen(true)}
            disabled={!canEdit}
            title={
              canEdit ? undefined : "Besucher können keine Dateien hochladen"
            }
            className="inline-flex w-full items-center justify-center rounded-lg bg-blue-600 px-6 py-3 text-white transition-colors hover:bg-blue-700 sm:w-auto"
          >
            <Upload className="mr-2 h-5 w-5" aria-hidden="true" />
            Datei hochladen
          </button>
        </div>

        {!canEdit && (
          <div
            role="note"
            className="mb-6 rounded-xl border border-blue-500/20 bg-blue-500/10 px-4 py-3 text-sm text-blue-200"
          >
            Du siehst die Mediathek im Lesemodus. Downloads und Vorschauen
            bleiben verfügbar.
          </div>
        )}

        <div className="mb-8 flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div
            className="flex flex-wrap gap-2"
            role="group"
            aria-label="Dateityp filtern"
          >
            {filters.map((filter) => (
              <button
                key={filter.value}
                type="button"
                onClick={() => setFilterType(filter.value)}
                aria-pressed={filterType === filter.value}
                className={`rounded-lg px-4 py-2 transition-colors ${
                  filterType === filter.value
                    ? "bg-blue-600 text-white"
                    : "bg-gray-800 text-gray-300 hover:bg-gray-700"
                }`}
              >
                {filter.label}
              </button>
            ))}
          </div>

          <div className="flex flex-col gap-3 sm:flex-row">
            <label className="relative block min-w-0 sm:w-64">
              <span className="sr-only">Dateien durchsuchen</span>
              <Search
                className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-500"
                aria-hidden="true"
              />
              <input
                type="search"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Name, Typ oder Tag …"
                className="w-full rounded-lg border border-gray-700 bg-gray-800 py-2 pl-9 pr-3 text-sm text-white placeholder:text-gray-500"
              />
            </label>
            <div
              className="flex rounded-lg bg-gray-800 p-1"
              role="group"
              aria-label="Ansicht wählen"
            >
              <button
                type="button"
                onClick={() => setViewMode("grid")}
                aria-label="Rasteransicht"
                aria-pressed={viewMode === "grid"}
                className={`flex flex-1 items-center justify-center rounded-md px-3 py-1.5 text-sm ${viewMode === "grid" ? "bg-blue-600 text-white" : "text-gray-300 hover:bg-gray-700"}`}
              >
                <LayoutGrid className="mr-2 h-4 w-4" aria-hidden="true" />{" "}
                Raster
              </button>
              <button
                type="button"
                onClick={() => setViewMode("list")}
                aria-label="Listenansicht"
                aria-pressed={viewMode === "list"}
                className={`flex flex-1 items-center justify-center rounded-md px-3 py-1.5 text-sm ${viewMode === "list" ? "bg-blue-600 text-white" : "text-gray-300 hover:bg-gray-700"}`}
              >
                <List className="mr-2 h-4 w-4" aria-hidden="true" /> Liste
              </button>
            </div>
          </div>
        </div>

        {filteredFiles.length > 0 && viewMode === "grid" && (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5">
            {filteredFiles.map((file) => (
              <article
                key={file.id}
                className="group overflow-hidden rounded-xl border border-gray-700 bg-gray-800/50 transition-colors hover:border-blue-500"
              >
                <button
                  type="button"
                  onClick={() => setPreviewFile(file)}
                  className="flex aspect-video w-full items-center justify-center overflow-hidden bg-gray-800"
                  aria-label={`${file.originalName} ansehen`}
                >
                  <MediaThumbnail file={file} />
                </button>
                <div className="p-4">
                  <h2
                    className="mb-1 truncate text-sm font-medium text-white"
                    title={file.originalName}
                  >
                    {file.originalName}
                  </h2>
                  <p className="mb-2 text-xs text-gray-400">
                    {formatFileSize(file.size)}
                  </p>
                  <div className="flex items-center justify-between gap-2">
                    <time
                      dateTime={new Date(file.createdAt).toISOString()}
                      className="text-xs text-gray-500"
                    >
                      {format(new Date(file.createdAt), "dd.MM.yyyy", {
                        locale: de,
                      })}
                    </time>
                    <div className="opacity-100 transition-opacity sm:opacity-0 sm:group-hover:opacity-100 sm:group-focus-within:opacity-100">
                      {actionButtons(file)}
                    </div>
                  </div>
                </div>
              </article>
            ))}
          </div>
        )}

        {filteredFiles.length > 0 && viewMode === "list" && (
          <div className="overflow-x-auto rounded-xl border border-gray-700 bg-gray-800/50">
            <table className="w-full min-w-[760px]">
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
                    Typ
                  </th>
                  <th
                    scope="col"
                    className="px-6 py-4 text-left text-sm font-semibold text-gray-400"
                  >
                    Größe
                  </th>
                  <th
                    scope="col"
                    className="px-6 py-4 text-left text-sm font-semibold text-gray-400"
                  >
                    Hochgeladen am
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
                {filteredFiles.map((file) => (
                  <tr
                    key={file.id}
                    className="border-b border-gray-700/50 last:border-0 hover:bg-gray-800/70"
                  >
                    <td className="px-6 py-4">
                      <div className="flex items-center">
                        <div className="mr-3 shrink-0">
                          <FileIcon mimeType={file.mimeType} />
                        </div>
                        <div className="min-w-0">
                          <p
                            className="max-w-xs truncate font-medium text-white"
                            title={file.originalName}
                          >
                            {file.originalName}
                          </p>
                          {!!file.tags?.length && (
                            <div className="mt-1 flex max-w-xs flex-wrap gap-1">
                              {file.tags.map((tag) => (
                                <span
                                  key={tag}
                                  className="text-xs text-blue-400"
                                >
                                  #{tag}
                                </span>
                              ))}
                            </div>
                          )}
                        </div>
                      </div>
                    </td>
                    <td className="px-6 py-4 text-sm text-gray-400">
                      {file.mimeType}
                    </td>
                    <td className="px-6 py-4 text-sm text-gray-400">
                      {formatFileSize(file.size)}
                    </td>
                    <td className="whitespace-nowrap px-6 py-4 text-sm text-gray-400">
                      {format(new Date(file.createdAt), "dd.MM.yyyy HH:mm", {
                        locale: de,
                      })}
                    </td>
                    <td className="px-6 py-4">
                      <div className="flex justify-end">
                        {actionButtons(file)}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {filteredFiles.length === 0 && (
          <div className="rounded-xl border border-dashed border-gray-700 bg-gray-800/20 px-6 py-12 text-center">
            <FolderOpen
              className="mx-auto mb-4 h-16 w-16 text-gray-600"
              aria-hidden="true"
            />
            <h2 className="mb-2 text-xl font-semibold text-gray-300">
              {mediaFiles.length === 0
                ? "Noch keine Dateien"
                : "Keine Dateien gefunden"}
            </h2>
            <p className="mx-auto max-w-md text-gray-500">
              {mediaFiles.length === 0
                ? "Lade deine erste kleine Demo-Datei in die Mediathek hoch."
                : "Ändere den Filter oder den Suchbegriff, um andere Dateien zu sehen."}
            </p>
            {mediaFiles.length === 0 && canEdit && (
              <button
                type="button"
                onClick={() => setUploadOpen(true)}
                className="mt-5 rounded-lg bg-blue-600 px-5 py-2.5 text-white hover:bg-blue-700"
              >
                Datei hochladen
              </button>
            )}
          </div>
        )}
      </div>

      <Modal open={uploadOpen} onClose={closeUpload} title="Datei hochladen">
        <form onSubmit={handleUpload} noValidate>
          <div className="space-y-5">
            <div>
              <label
                htmlFor="media-file"
                className="mb-2 block text-sm font-medium text-gray-200"
              >
                Datei *
              </label>
              <input
                key={fileInputKey}
                id="media-file"
                type="file"
                required
                disabled={uploading}
                aria-describedby={`upload-help${uploadError ? " upload-error" : ""}`}
                onChange={(event) => {
                  const selected = event.target.files?.[0] ?? null;
                  setUploadFile(selected);
                  setUploadError(validateUpload(selected));
                }}
                className="block w-full rounded-lg border border-gray-600 bg-gray-900 text-sm text-gray-300 file:mr-4 file:border-0 file:bg-blue-600 file:px-4 file:py-3 file:text-white hover:file:bg-blue-700"
              />
              <p id="upload-help" className="mt-2 text-xs text-gray-400">
                Maximal 2 MB. Die Datei bleibt als Data-URL in diesem Browser
                gespeichert.
              </p>
              {uploadError && (
                <p
                  id="upload-error"
                  role="alert"
                  className="mt-2 text-sm text-red-400"
                >
                  {uploadError}
                </p>
              )}
            </div>

            {uploadFile && !uploadError && (
              <div className="flex items-center gap-3 rounded-lg border border-gray-700 bg-gray-900/60 p-3">
                <FileIcon mimeType={uploadFile.type} />
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium text-white">
                    {uploadFile.name}
                  </p>
                  <p className="text-xs text-gray-400">
                    {formatFileSize(uploadFile.size)} ·{" "}
                    {uploadFile.type || "Unbekannter Dateityp"}
                  </p>
                </div>
              </div>
            )}

            <div>
              <label
                htmlFor="media-campaign"
                className="mb-2 block text-sm font-medium text-gray-200"
              >
                Kampagne
              </label>
              <select
                id="media-campaign"
                value={uploadCampaignId}
                onChange={(event) => setUploadCampaignId(event.target.value)}
                disabled={uploading}
                className="w-full rounded-lg border border-gray-600 bg-gray-900 px-3 py-2.5 text-white"
              >
                <option value="">Keine Zuordnung</option>
                {campaigns.map((campaign) => (
                  <option key={campaign.id} value={campaign.id}>
                    {campaign.name}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label
                htmlFor="media-tags"
                className="mb-2 block text-sm font-medium text-gray-200"
              >
                Tags
              </label>
              <input
                id="media-tags"
                value={uploadTags}
                onChange={(event) => setUploadTags(event.target.value)}
                disabled={uploading}
                placeholder="launch, hero, social"
                className="w-full rounded-lg border border-gray-600 bg-gray-900 px-3 py-2.5 text-white placeholder:text-gray-500"
              />
              <p className="mt-2 text-xs text-gray-400">
                Mehrere Tags mit Kommas trennen.
              </p>
            </div>
          </div>

          <div className="mt-6 flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
            <button
              type="button"
              onClick={closeUpload}
              disabled={uploading}
              className="rounded-lg bg-gray-700 px-4 py-2 text-gray-200 hover:bg-gray-600"
            >
              Abbrechen
            </button>
            <button
              type="submit"
              disabled={uploading}
              className="rounded-lg bg-blue-600 px-4 py-2 font-medium text-white hover:bg-blue-700"
            >
              {uploading ? "Wird hochgeladen …" : "Hochladen"}
            </button>
          </div>
        </form>
      </Modal>

      <Modal
        open={Boolean(previewFile)}
        onClose={() => setPreviewFile(null)}
        title={previewFile?.originalName ?? "Dateivorschau"}
        size="lg"
      >
        {previewFile && (
          <div>
            <div className="flex min-h-56 items-center justify-center overflow-hidden rounded-xl bg-gray-900">
              {previewFile.mimeType.startsWith("image/") ? (
                <img
                  src={previewFile.url}
                  alt={previewFile.originalName}
                  className="max-h-[60vh] max-w-full object-contain"
                />
              ) : previewFile.mimeType.startsWith("video/") ? (
                <video
                  src={previewFile.url}
                  controls
                  className="max-h-[60vh] w-full"
                  aria-label={`Vorschau von ${previewFile.originalName}`}
                />
              ) : previewFile.mimeType.startsWith("audio/") ? (
                <audio
                  src={previewFile.url}
                  controls
                  className="w-[min(28rem,90%)]"
                  aria-label={`Vorschau von ${previewFile.originalName}`}
                />
              ) : previewFile.mimeType.includes("pdf") ? (
                <iframe
                  src={previewFile.url}
                  title={`Vorschau von ${previewFile.originalName}`}
                  className="h-[60vh] w-full bg-white"
                />
              ) : (
                <div className="p-10 text-center">
                  <FileIcon
                    mimeType={previewFile.mimeType}
                    className="mx-auto mb-4 h-16 w-16"
                  />
                  <p className="text-gray-400">
                    Für diesen Dateityp ist keine direkte Vorschau verfügbar.
                  </p>
                </div>
              )}
            </div>
            <dl className="mt-5 grid gap-3 text-sm sm:grid-cols-2">
              <div>
                <dt className="text-gray-500">Dateityp</dt>
                <dd className="mt-1 break-all text-gray-200">
                  {previewFile.mimeType}
                </dd>
              </div>
              <div>
                <dt className="text-gray-500">Größe</dt>
                <dd className="mt-1 text-gray-200">
                  {formatFileSize(previewFile.size)}
                </dd>
              </div>
              <div>
                <dt className="text-gray-500">Hochgeladen</dt>
                <dd className="mt-1 text-gray-200">
                  {format(new Date(previewFile.createdAt), "dd.MM.yyyy HH:mm", {
                    locale: de,
                  })}
                </dd>
              </div>
              <div>
                <dt className="text-gray-500">Tags</dt>
                <dd className="mt-1 text-gray-200">
                  {previewFile.tags?.length
                    ? previewFile.tags.join(", ")
                    : "Keine"}
                </dd>
              </div>
            </dl>
            <div className="mt-6 flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
              {canEdit && (
                <button
                  type="button"
                  onClick={() => {
                    setDeleteTarget(previewFile);
                    setPreviewFile(null);
                  }}
                  className="rounded-lg bg-red-500/15 px-4 py-2 text-red-300 hover:bg-red-500/25"
                >
                  Löschen
                </button>
              )}
              <button
                type="button"
                onClick={() => downloadFile(previewFile)}
                className="rounded-lg bg-blue-600 px-4 py-2 text-white hover:bg-blue-700"
              >
                Herunterladen
              </button>
            </div>
          </div>
        )}
      </Modal>

      <ConfirmDialog
        open={Boolean(deleteTarget)}
        title="Datei löschen?"
        message={
          deleteTarget
            ? `„${deleteTarget.originalName}“ wird dauerhaft aus dieser lokalen Demo entfernt.`
            : ""
        }
        confirmLabel="Datei löschen"
        danger
        onConfirm={confirmDelete}
        onClose={() => setDeleteTarget(null)}
      />
    </div>
  );
}
