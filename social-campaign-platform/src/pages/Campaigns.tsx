import { useEffect, useMemo, useState, type FormEvent } from "react";
import {
  Archive,
  Calendar,
  ChevronRight,
  Pencil,
  Plus,
  Search,
  Target,
  Trash2,
} from "lucide-react";
import { Link } from "react-router-dom";
import { format } from "date-fns";
import { de } from "date-fns/locale";
import ConfirmDialog from "../components/ConfirmDialog";
import Modal from "../components/Modal";
import { useAppData } from "../contexts/app-data";
import { useAuth } from "../contexts/auth";
import { useFeedback } from "../contexts/feedback";
import type { Campaign } from "../types";

type CampaignStatus = Campaign["status"];

const statusLabels: Record<CampaignStatus, string> = {
  planning: "Planung",
  active: "Aktiv",
  paused: "Pausiert",
  completed: "Abgeschlossen",
  archived: "Archiviert",
};

const statusStyles: Record<CampaignStatus, string> = {
  planning: "bg-blue-500/20 text-blue-300",
  active: "bg-green-500/20 text-green-300",
  paused: "bg-yellow-500/20 text-yellow-300",
  completed: "bg-purple-500/20 text-purple-300",
  archived: "bg-gray-500/20 text-gray-300",
};

interface CampaignFormState {
  name: string;
  description: string;
  status: CampaignStatus;
  startDate: string;
  endDate: string;
}

const emptyForm: CampaignFormState = {
  name: "",
  description: "",
  status: "planning",
  startDate: "",
  endDate: "",
};

export default function Campaigns() {
  const {
    campaigns,
    phases,
    milestones,
    workPackages,
    createCampaign,
    updateCampaign,
    deleteCampaign,
  } = useAppData();
  const { canEdit } = useAuth();
  const { notify } = useFeedback();
  const [searchTerm, setSearchTerm] = useState("");
  const [statusFilter, setStatusFilter] = useState<"all" | CampaignStatus>(
    "all",
  );
  const [timelineCampaignId, setTimelineCampaignId] = useState<string>("all");
  const [editingCampaign, setEditingCampaign] = useState<Campaign | null>(null);
  const [form, setForm] = useState<CampaignFormState>(emptyForm);
  const [formOpen, setFormOpen] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<Campaign | null>(null);

  useEffect(() => {
    if (canEdit) return;
    setFormOpen(false);
    setEditingCampaign(null);
    setForm(emptyForm);
    setDeleteTarget(null);
  }, [canEdit]);

  const filteredCampaigns = useMemo(
    () =>
      campaigns.filter((campaign) => {
        const query = searchTerm.trim().toLowerCase();
        const matchesSearch =
          !query ||
          campaign.name.toLowerCase().includes(query) ||
          campaign.description.toLowerCase().includes(query);
        return (
          matchesSearch &&
          (statusFilter === "all" || campaign.status === statusFilter)
        );
      }),
    [campaigns, searchTerm, statusFilter],
  );

  const getCampaignPhases = (campaignId: string) =>
    phases
      .filter((phase) => phase.campaignId === campaignId)
      .sort((a, b) => a.order - b.order);
  const getPhaseMilestones = (phaseId: string) =>
    milestones
      .filter((milestone) => milestone.phaseId === phaseId)
      .sort((a, b) => a.order - b.order);
  const getMilestoneTasks = (milestoneId: string) =>
    workPackages.filter((task) => task.milestoneId === milestoneId);

  const getCampaignProgress = (campaign: Campaign): number => {
    const campaignPhaseIds = new Set(
      getCampaignPhases(campaign.id).map((phase) => phase.id),
    );
    const campaignMilestones = milestones.filter((milestone) =>
      campaignPhaseIds.has(milestone.phaseId),
    );
    const campaignMilestoneIds = new Set(
      campaignMilestones.map((milestone) => milestone.id),
    );
    const campaignTasks = workPackages.filter((task) =>
      campaignMilestoneIds.has(task.milestoneId),
    );
    if (campaignTasks.length > 0) {
      return Math.round(
        (campaignTasks.filter((task) => task.status === "finished").length /
          campaignTasks.length) *
          100,
      );
    }
    if (campaignMilestones.length > 0) {
      return Math.round(
        (campaignMilestones.filter(
          (milestone) => milestone.status === "completed",
        ).length /
          campaignMilestones.length) *
          100,
      );
    }
    const total = campaign.endDate.getTime() - campaign.startDate.getTime();
    if (total <= 0) return 0;
    return Math.max(
      0,
      Math.min(
        100,
        Math.round(((Date.now() - campaign.startDate.getTime()) / total) * 100),
      ),
    );
  };

  const openCreate = () => {
    if (!canEdit) return;
    setEditingCampaign(null);
    setForm(emptyForm);
    setFormOpen(true);
  };

  const openEdit = (campaign: Campaign) => {
    if (!canEdit) return;
    setEditingCampaign(campaign);
    setForm({
      name: campaign.name,
      description: campaign.description,
      status: campaign.status,
      startDate: format(campaign.startDate, "yyyy-MM-dd"),
      endDate: format(campaign.endDate, "yyyy-MM-dd"),
    });
    setFormOpen(true);
  };

  const submitCampaign = (event: FormEvent) => {
    event.preventDefault();
    if (!canEdit) return;
    const startDate = new Date(`${form.startDate}T00:00:00`);
    const endDate = new Date(`${form.endDate}T23:59:59`);
    if (
      !form.name.trim() ||
      !form.description.trim() ||
      Number.isNaN(startDate.getTime()) ||
      endDate < startDate
    ) {
      notify("Bitte prüfe Name, Beschreibung und Datumsbereich.", "error");
      return;
    }
    if (editingCampaign) {
      updateCampaign(editingCampaign.id, {
        ...form,
        name: form.name.trim(),
        description: form.description.trim(),
        startDate,
        endDate,
      });
      notify("Kampagne wurde aktualisiert.");
    } else {
      const campaign = createCampaign({
        ...form,
        name: form.name.trim(),
        description: form.description.trim(),
        startDate,
        endDate,
      });
      setTimelineCampaignId(campaign.id);
      notify("Kampagne wurde erstellt.");
    }
    setFormOpen(false);
  };

  const timelineCampaigns =
    timelineCampaignId === "all"
      ? campaigns.filter((campaign) => campaign.status !== "archived")
      : campaigns.filter((campaign) => campaign.id === timelineCampaignId);

  return (
    <div className="p-6 md:ml-64 md:p-8">
      <div className="mx-auto max-w-7xl">
        <div className="mb-8 flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
          <div>
            <h1 className="mb-2 text-3xl font-bold text-white">Kampagnen</h1>
            <p className="text-gray-400">
              Plane Kampagnen und verfolge Phasen, Meilensteine und Aufgaben.
            </p>
          </div>
          {canEdit && (
            <button
              type="button"
              onClick={openCreate}
              className="inline-flex items-center justify-center rounded-lg bg-blue-600 px-6 py-3 text-white hover:bg-blue-700"
            >
              <Plus className="mr-2 h-5 w-5" />
              Neue Kampagne
            </button>
          )}
        </div>

        {!canEdit && (
          <div className="mb-6 rounded-lg border border-blue-500/20 bg-blue-500/10 p-3 text-sm text-blue-200">
            Du siehst die Kampagnen im Lesemodus.
          </div>
        )}

        <div className="mb-8 flex flex-col gap-4 md:flex-row">
          <label className="relative flex-1">
            <span className="sr-only">Kampagnen suchen</span>
            <Search className="absolute left-3 top-1/2 h-5 w-5 -translate-y-1/2 text-gray-400" />
            <input
              type="search"
              placeholder="Kampagnen suchen …"
              value={searchTerm}
              onChange={(event) => setSearchTerm(event.target.value)}
              className="w-full rounded-lg border border-gray-700 bg-gray-800 py-2 pl-10 pr-4 text-white placeholder:text-gray-500 focus:border-blue-500"
            />
          </label>
          <label>
            <span className="sr-only">Nach Status filtern</span>
            <select
              value={statusFilter}
              onChange={(event) =>
                setStatusFilter(event.target.value as "all" | CampaignStatus)
              }
              className="w-full rounded-lg border border-gray-700 bg-gray-800 px-4 py-2 text-white focus:border-blue-500 md:w-auto"
            >
              <option value="all">Alle Status</option>
              {Object.entries(statusLabels).map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
          </label>
        </div>

        {filteredCampaigns.length > 0 ? (
          <div className="mb-8 grid grid-cols-1 gap-6 lg:grid-cols-2">
            {filteredCampaigns.map((campaign) => {
              const campaignPhases = getCampaignPhases(campaign.id);
              const currentPhase =
                campaignPhases.find((phase) => phase.status === "current") ??
                campaignPhases.find((phase) => phase.status === "upcoming") ??
                campaignPhases.at(-1);
              const progress = getCampaignProgress(campaign);
              const campaignMilestones = campaignPhases.flatMap((phase) =>
                getPhaseMilestones(phase.id),
              );
              const taskCount = campaignMilestones.reduce(
                (sum, milestone) =>
                  sum + getMilestoneTasks(milestone.id).length,
                0,
              );
              return (
                <article
                  key={campaign.id}
                  className="overflow-hidden rounded-xl border border-gray-700 bg-gray-800/50 transition-colors hover:border-blue-500"
                >
                  <div className="p-6">
                    <div className="mb-4 flex items-start justify-between gap-4">
                      <div className="flex min-w-0 items-center">
                        <div className="mr-4 rounded-lg bg-blue-500/10 p-3">
                          <Target className="h-6 w-6 text-blue-400" />
                        </div>
                        <div className="min-w-0">
                          <h2 className="text-xl font-semibold text-white">
                            {campaign.name}
                          </h2>
                          <span
                            className={`mt-1 inline-block rounded px-2 py-1 text-xs font-medium ${statusStyles[campaign.status]}`}
                          >
                            {statusLabels[campaign.status]}
                          </span>
                        </div>
                      </div>
                      {canEdit && (
                        <div className="flex shrink-0 gap-1">
                          <button
                            type="button"
                            onClick={() => openEdit(campaign)}
                            aria-label={`${campaign.name} bearbeiten`}
                            className="rounded-lg p-2 text-gray-400 hover:bg-gray-700 hover:text-white"
                          >
                            <Pencil className="h-4 w-4" />
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              if (!canEdit) return;
                              updateCampaign(campaign.id, {
                                status: "archived",
                              });
                              notify("Kampagne wurde archiviert.");
                            }}
                            aria-label={`${campaign.name} archivieren`}
                            disabled={campaign.status === "archived"}
                            className="rounded-lg p-2 text-gray-400 hover:bg-gray-700 hover:text-yellow-300"
                          >
                            <Archive className="h-4 w-4" />
                          </button>
                          <button
                            type="button"
                            onClick={() => setDeleteTarget(campaign)}
                            aria-label={`${campaign.name} löschen`}
                            className="rounded-lg p-2 text-gray-400 hover:bg-red-500/10 hover:text-red-300"
                          >
                            <Trash2 className="h-4 w-4" />
                          </button>
                        </div>
                      )}
                    </div>
                    <p className="mb-4 text-gray-400">{campaign.description}</p>
                    <div className="mb-4 flex items-center text-sm text-gray-500">
                      <Calendar className="mr-2 h-4 w-4" />
                      {format(campaign.startDate, "dd.MM.yyyy", {
                        locale: de,
                      })}{" "}
                      – {format(campaign.endDate, "dd.MM.yyyy", { locale: de })}
                    </div>

                    <div className="mb-4 rounded-lg bg-gray-800 p-4">
                      <div className="mb-2 flex items-center justify-between text-sm">
                        <span className="text-gray-400">Fortschritt</span>
                        <span className="font-medium text-blue-300">
                          {progress}%
                        </span>
                      </div>
                      {currentPhase && (
                        <p className="mb-3 text-sm text-white">
                          {currentPhase.status === "current"
                            ? "Aktuell"
                            : currentPhase.status === "upcoming"
                              ? "Als Nächstes"
                              : "Letzte Phase"}
                          : {currentPhase.name}
                        </p>
                      )}
                      <div
                        className="h-2 w-full rounded-full bg-gray-700"
                        role="progressbar"
                        aria-label={`Fortschritt ${campaign.name}`}
                        aria-valuenow={progress}
                        aria-valuemin={0}
                        aria-valuemax={100}
                      >
                        <div
                          className="h-2 rounded-full bg-blue-500 transition-all"
                          style={{ width: `${progress}%` }}
                        />
                      </div>
                    </div>

                    <div className="mb-4 grid grid-cols-3 gap-4 text-center">
                      <div>
                        <div className="text-2xl font-bold text-white">
                          {campaignPhases.length}
                        </div>
                        <div className="text-xs text-gray-400">Phasen</div>
                      </div>
                      <div>
                        <div className="text-2xl font-bold text-white">
                          {campaignMilestones.length}
                        </div>
                        <div className="text-xs text-gray-400">
                          Meilensteine
                        </div>
                      </div>
                      <div>
                        <div className="text-2xl font-bold text-white">
                          {taskCount}
                        </div>
                        <div className="text-xs text-gray-400">Aufgaben</div>
                      </div>
                    </div>
                    <Link
                      to={`/campaigns/${campaign.id}`}
                      className="flex w-full items-center justify-center rounded-lg bg-gray-700 px-4 py-2 text-gray-200 hover:bg-gray-600"
                    >
                      Details ansehen
                      <ChevronRight className="ml-2 h-4 w-4" />
                    </Link>
                  </div>
                </article>
              );
            })}
          </div>
        ) : (
          <div className="mb-8 rounded-xl border border-dashed border-gray-700 py-14 text-center">
            <Target className="mx-auto mb-3 h-12 w-12 text-gray-600" />
            <h2 className="mb-1 text-lg font-semibold text-gray-300">
              Keine Kampagnen gefunden
            </h2>
            <p className="text-sm text-gray-500">
              Passe Suche oder Statusfilter an.
            </p>
          </div>
        )}

        <section className="rounded-xl border border-gray-700 bg-gray-800/50 p-6">
          <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <h2 className="flex items-center text-xl font-semibold text-white">
              <Calendar className="mr-2 h-5 w-5 text-purple-400" />
              Phasen im Überblick
            </h2>
            <label className="text-sm text-gray-400">
              Kampagne{" "}
              <select
                value={timelineCampaignId}
                onChange={(event) => setTimelineCampaignId(event.target.value)}
                className="ml-2 rounded-lg border border-gray-700 bg-gray-800 px-3 py-2 text-white"
              >
                <option value="all">Alle aktiven</option>
                {campaigns.map((campaign) => (
                  <option key={campaign.id} value={campaign.id}>
                    {campaign.name}
                  </option>
                ))}
              </select>
            </label>
          </div>
          <div className="space-y-8">
            {timelineCampaigns.map((campaign) => (
              <div key={campaign.id}>
                {timelineCampaignId === "all" && (
                  <h3 className="mb-4 font-semibold text-blue-300">
                    {campaign.name}
                  </h3>
                )}
                <div className="space-y-4">
                  {getCampaignPhases(campaign.id).map((phase) => (
                    <div key={phase.id} className="flex gap-4">
                      <div
                        className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-sm font-bold ${phase.status === "completed" ? "bg-green-600 text-white" : phase.status === "current" ? "bg-blue-600 text-white" : "bg-gray-700 text-gray-300"}`}
                      >
                        {phase.status === "completed" ? "✓" : phase.order}
                      </div>
                      <div className="flex-1 rounded-lg bg-gray-800 p-4">
                        <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                          <h4 className="font-semibold text-white">
                            {phase.name}
                          </h4>
                          <span className="text-xs text-gray-400">
                            {format(phase.startDate, "dd.MM.yyyy")} –{" "}
                            {format(phase.endDate, "dd.MM.yyyy")}
                          </span>
                        </div>
                        {phase.description && (
                          <p className="mb-3 text-sm text-gray-400">
                            {phase.description}
                          </p>
                        )}
                        <div className="flex flex-wrap gap-2">
                          {getPhaseMilestones(phase.id).map((milestone) => (
                            <span
                              key={milestone.id}
                              className={`rounded px-2 py-1 text-xs ${milestone.status === "completed" ? "bg-green-500/20 text-green-300" : milestone.status === "in_progress" ? "bg-yellow-500/20 text-yellow-300" : milestone.status === "blocked" ? "bg-red-500/20 text-red-300" : "bg-gray-700 text-gray-300"}`}
                            >
                              {milestone.name}
                            </span>
                          ))}
                        </div>
                      </div>
                    </div>
                  ))}
                  {getCampaignPhases(campaign.id).length === 0 && (
                    <p className="rounded-lg bg-gray-800 p-4 text-sm text-gray-500">
                      Noch keine Phasen angelegt.
                    </p>
                  )}
                </div>
              </div>
            ))}
          </div>
        </section>
      </div>

      <Modal
        open={formOpen}
        onClose={() => setFormOpen(false)}
        title={editingCampaign ? "Kampagne bearbeiten" : "Neue Kampagne"}
      >
        <form onSubmit={submitCampaign} className="space-y-4">
          <label
            htmlFor="campaign-name"
            className="block text-sm text-gray-300"
          >
            Name
            <input
              id="campaign-name"
              required
              value={form.name}
              onChange={(event) =>
                setForm({ ...form, name: event.target.value })
              }
              className="mt-2 w-full rounded-lg border border-gray-600 bg-gray-700 px-4 py-2 text-white"
            />
          </label>
          <label
            htmlFor="campaign-description"
            className="block text-sm text-gray-300"
          >
            Beschreibung
            <textarea
              id="campaign-description"
              required
              rows={4}
              value={form.description}
              onChange={(event) =>
                setForm({ ...form, description: event.target.value })
              }
              className="mt-2 w-full rounded-lg border border-gray-600 bg-gray-700 px-4 py-2 text-white"
            />
          </label>
          <label
            htmlFor="campaign-status"
            className="block text-sm text-gray-300"
          >
            Status
            <select
              id="campaign-status"
              value={form.status}
              onChange={(event) =>
                setForm({
                  ...form,
                  status: event.target.value as CampaignStatus,
                })
              }
              className="mt-2 w-full rounded-lg border border-gray-600 bg-gray-700 px-4 py-2 text-white"
            >
              {Object.entries(statusLabels).map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
          </label>
          <div className="grid gap-4 sm:grid-cols-2">
            <label
              htmlFor="campaign-start-date"
              className="block text-sm text-gray-300"
            >
              Startdatum
              <input
                id="campaign-start-date"
                required
                type="date"
                value={form.startDate}
                onChange={(event) =>
                  setForm({ ...form, startDate: event.target.value })
                }
                className="mt-2 w-full rounded-lg border border-gray-600 bg-gray-700 px-4 py-2 text-white"
              />
            </label>
            <label
              htmlFor="campaign-end-date"
              className="block text-sm text-gray-300"
            >
              Enddatum
              <input
                id="campaign-end-date"
                required
                type="date"
                value={form.endDate}
                onChange={(event) =>
                  setForm({ ...form, endDate: event.target.value })
                }
                className="mt-2 w-full rounded-lg border border-gray-600 bg-gray-700 px-4 py-2 text-white"
              />
            </label>
          </div>
          <div className="flex justify-end gap-3 pt-2">
            <button
              type="button"
              onClick={() => setFormOpen(false)}
              className="rounded-lg bg-gray-700 px-4 py-2 text-gray-200 hover:bg-gray-600"
            >
              Abbrechen
            </button>
            <button
              type="submit"
              className="rounded-lg bg-blue-600 px-4 py-2 text-white hover:bg-blue-700"
            >
              {editingCampaign ? "Speichern" : "Erstellen"}
            </button>
          </div>
        </form>
      </Modal>

      <ConfirmDialog
        open={Boolean(deleteTarget)}
        onClose={() => setDeleteTarget(null)}
        onConfirm={() => {
          if (!canEdit || !deleteTarget) return;
          deleteCampaign(deleteTarget.id);
          if (timelineCampaignId === deleteTarget.id)
            setTimelineCampaignId("all");
          notify("Kampagne und zugehörige Planungsdaten wurden gelöscht.");
        }}
        title="Kampagne löschen?"
        message={`„${deleteTarget?.name ?? ""}“ inklusive Phasen, Meilensteinen und Aufgaben dauerhaft aus der Demo entfernen?`}
        confirmLabel="Kampagne löschen"
        danger
      />
    </div>
  );
}
