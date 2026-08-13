import { useEffect, useMemo, useState, type FormEvent } from "react";
import {
  AlertCircle,
  Bot,
  CheckCircle,
  Clock,
  FileText,
  Pencil,
  Plus,
  Search,
  Trash2,
} from "lucide-react";
import { format } from "date-fns";
import { de } from "date-fns/locale";
import { useSearchParams } from "react-router-dom";
import ConfirmDialog from "../components/ConfirmDialog";
import Modal from "../components/Modal";
import Avatar from "../components/Avatar";
import { useAppData } from "../contexts/app-data";
import { useAuth } from "../contexts/auth";
import { useFeedback } from "../contexts/feedback";
import type { TaskStatus, WorkPackage } from "../types";

const statusLabels: Record<TaskStatus, string> = {
  planned: "Geplant",
  in_progress: "In Arbeit",
  blocker: "Blockiert",
  finished: "Erledigt",
};
const statusBadges: Record<TaskStatus, string> = {
  planned: "bg-blue-500/20 text-blue-300",
  in_progress: "bg-yellow-500/20 text-yellow-300",
  blocker: "bg-red-500/20 text-red-300",
  finished: "bg-green-500/20 text-green-300",
};
const priorityBadges: Record<WorkPackage["priority"], string> = {
  critical: "bg-red-500/20 text-red-300",
  high: "bg-orange-500/20 text-orange-300",
  medium: "bg-yellow-500/20 text-yellow-300",
  low: "bg-blue-500/20 text-blue-300",
};
const priorityLabels: Record<WorkPackage["priority"], string> = {
  critical: "Kritisch",
  high: "Hoch",
  medium: "Mittel",
  low: "Niedrig",
};

interface TaskForm {
  milestoneId: string;
  title: string;
  description: string;
  status: TaskStatus;
  priority: WorkPackage["priority"];
  assigneeType: WorkPackage["assigneeType"];
  assigneeId: string;
  dueDate: string;
  estimatedHours: string;
  actualHours: string;
}

const emptyForm: TaskForm = {
  milestoneId: "",
  title: "",
  description: "",
  status: "planned",
  priority: "medium",
  assigneeType: "user",
  assigneeId: "",
  dueDate: "",
  estimatedHours: "4",
  actualHours: "0",
};

export default function Tasks() {
  const {
    workPackages,
    milestones,
    phases,
    campaigns,
    users,
    agents,
    createWorkPackage,
    updateWorkPackage,
    deleteWorkPackage,
  } = useAppData();
  const { canEdit } = useAuth();
  const { notify } = useFeedback();
  const [searchParams, setSearchParams] = useSearchParams();
  const statusParam = searchParams.get("status");
  const filterStatus: "all" | TaskStatus =
    statusParam && statusParam in statusLabels
      ? (statusParam as TaskStatus)
      : "all";
  const [search, setSearch] = useState("");
  const [campaignFilter, setCampaignFilter] = useState("all");
  const [editing, setEditing] = useState<WorkPackage | null>(null);
  const [form, setForm] = useState<TaskForm>(emptyForm);
  const [modalOpen, setModalOpen] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<WorkPackage | null>(null);

  useEffect(() => {
    if (canEdit) return;
    setModalOpen(false);
    setEditing(null);
    setForm(emptyForm);
    setDeleteTarget(null);
  }, [canEdit]);

  const setFilterStatus = (status: "all" | TaskStatus) => {
    setSearchParams(
      (current) => {
        const next = new URLSearchParams(current);
        if (status === "all") next.delete("status");
        else next.set("status", status);
        return next;
      },
      { replace: true },
    );
  };

  const milestoneToCampaign = useMemo(
    () =>
      new Map(
        milestones.map((milestone) => {
          const phase = phases.find((entry) => entry.id === milestone.phaseId);
          return [milestone.id, phase?.campaignId ?? ""];
        }),
      ),
    [milestones, phases],
  );

  const filteredTasks = useMemo(
    () =>
      workPackages
        .filter((task) => {
          const query = search.trim().toLowerCase();
          return (
            (filterStatus === "all" || task.status === filterStatus) &&
            (campaignFilter === "all" ||
              milestoneToCampaign.get(task.milestoneId) === campaignFilter) &&
            (!query ||
              task.title.toLowerCase().includes(query) ||
              task.description.toLowerCase().includes(query))
          );
        })
        .sort(
          (a, b) =>
            (a.dueDate?.getTime() ?? Number.MAX_SAFE_INTEGER) -
            (b.dueDate?.getTime() ?? Number.MAX_SAFE_INTEGER),
        ),
    [campaignFilter, filterStatus, milestoneToCampaign, search, workPackages],
  );

  const getAssignee = (task: WorkPackage) =>
    task.assigneeType === "agent"
      ? agents.find((agent) => agent.id === task.assigneeId)
      : users.find((user) => user.id === task.assigneeId);
  const getMilestoneLabel = (id: string) => {
    const milestone = milestones.find((entry) => entry.id === id);
    const campaign = campaigns.find(
      (entry) => entry.id === milestoneToCampaign.get(id),
    );
    return milestone
      ? `${campaign?.name ?? "Ohne Kampagne"} · ${milestone.name}`
      : "Unbekannter Meilenstein";
  };

  const openCreate = () => {
    if (!canEdit) return;
    setEditing(null);
    setForm({ ...emptyForm, milestoneId: milestones[0]?.id ?? "" });
    setModalOpen(true);
  };
  const openEdit = (task: WorkPackage) => {
    if (!canEdit) return;
    setEditing(task);
    setForm({
      milestoneId: task.milestoneId,
      title: task.title,
      description: task.description,
      status: task.status,
      priority: task.priority,
      assigneeType: task.assigneeType,
      assigneeId: task.assigneeId ?? "",
      dueDate: task.dueDate ? format(task.dueDate, "yyyy-MM-dd") : "",
      estimatedHours: String(task.estimatedHours ?? 0),
      actualHours: String(task.actualHours ?? 0),
    });
    setModalOpen(true);
  };

  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (!canEdit) return;
    if (!form.milestoneId || !form.title.trim() || !form.description.trim())
      return notify("Bitte fülle alle Pflichtfelder aus.", "error");
    const values = {
      milestoneId: form.milestoneId,
      title: form.title.trim(),
      description: form.description.trim(),
      status: form.status,
      priority: form.priority,
      assigneeType: form.assigneeType,
      assigneeId: form.assigneeId || undefined,
      dueDate: form.dueDate ? new Date(`${form.dueDate}T23:59:59`) : undefined,
      estimatedHours: Number(form.estimatedHours) || 0,
      actualHours: Number(form.actualHours) || 0,
    };
    if (editing) {
      updateWorkPackage(editing.id, values);
      notify("Aufgabe wurde aktualisiert.");
    } else {
      createWorkPackage(values);
      notify("Aufgabe wurde erstellt.");
    }
    setModalOpen(false);
  };
  const assignees = form.assigneeType === "agent" ? agents : users;

  return (
    <div className="p-6 md:ml-64 md:p-8">
      <div className="mx-auto max-w-7xl">
        <div className="mb-8 flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
          <div>
            <h1 className="mb-2 text-3xl font-bold text-white">Aufgaben</h1>
            <p className="text-gray-400">
              Verwalte Arbeitspakete, Zuständigkeiten und Zeiten.
            </p>
          </div>
          {canEdit && (
            <button
              type="button"
              onClick={openCreate}
              disabled={milestones.length === 0}
              className="inline-flex items-center justify-center rounded-lg bg-blue-600 px-6 py-3 text-white hover:bg-blue-700"
            >
              <Plus className="mr-2 h-5 w-5" />
              Neue Aufgabe
            </button>
          )}
        </div>

        <div className="mb-6 grid gap-3 lg:grid-cols-[1fr_auto_auto]">
          <label className="relative">
            <span className="sr-only">Aufgaben suchen</span>
            <Search className="absolute left-3 top-1/2 h-5 w-5 -translate-y-1/2 text-gray-400" />
            <input
              type="search"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Aufgaben suchen …"
              className="w-full rounded-lg border border-gray-700 bg-gray-800 py-2 pl-10 pr-4 text-white"
            />
          </label>
          <select
            aria-label="Kampagne filtern"
            value={campaignFilter}
            onChange={(event) => setCampaignFilter(event.target.value)}
            className="rounded-lg border border-gray-700 bg-gray-800 px-4 py-2 text-white"
          >
            <option value="all">Alle Kampagnen</option>
            {campaigns.map((campaign) => (
              <option key={campaign.id} value={campaign.id}>
                {campaign.name}
              </option>
            ))}
          </select>
          <select
            aria-label="Status filtern"
            value={filterStatus}
            onChange={(event) =>
              setFilterStatus(event.target.value as "all" | TaskStatus)
            }
            className="rounded-lg border border-gray-700 bg-gray-800 px-4 py-2 text-white"
          >
            <option value="all">Alle Status</option>
            {Object.entries(statusLabels).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
        </div>

        <div className="overflow-hidden rounded-xl border border-gray-700 bg-gray-800/50">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[950px]">
              <thead>
                <tr className="border-b border-gray-700">
                  <th
                    scope="col"
                    className="px-5 py-4 text-left text-sm text-gray-400"
                  >
                    Status
                  </th>
                  <th
                    scope="col"
                    className="px-5 py-4 text-left text-sm text-gray-400"
                  >
                    Aufgabe
                  </th>
                  <th
                    scope="col"
                    className="px-5 py-4 text-left text-sm text-gray-400"
                  >
                    Zuweisung
                  </th>
                  <th
                    scope="col"
                    className="px-5 py-4 text-left text-sm text-gray-400"
                  >
                    Priorität
                  </th>
                  <th
                    scope="col"
                    className="px-5 py-4 text-left text-sm text-gray-400"
                  >
                    Fällig
                  </th>
                  <th
                    scope="col"
                    className="px-5 py-4 text-left text-sm text-gray-400"
                  >
                    Stunden
                  </th>
                  {canEdit && (
                    <th
                      scope="col"
                      className="px-5 py-4 text-right text-sm text-gray-400"
                    >
                      Aktionen
                    </th>
                  )}
                </tr>
              </thead>
              <tbody>
                {filteredTasks.map((task) => {
                  const assignee = getAssignee(task);
                  return (
                    <tr
                      key={task.id}
                      className="border-b border-gray-700/50 hover:bg-gray-800"
                    >
                      <td className="px-5 py-4">
                        {canEdit ? (
                          <select
                            aria-label={`Status von ${task.title}`}
                            value={task.status}
                            onChange={(event) =>
                              updateWorkPackage(task.id, {
                                status: event.target.value as TaskStatus,
                              })
                            }
                            className={`rounded border-0 px-2 py-1 text-xs font-medium ${statusBadges[task.status]}`}
                          >
                            {Object.entries(statusLabels).map(
                              ([value, label]) => (
                                <option
                                  className="bg-gray-800 text-white"
                                  key={value}
                                  value={value}
                                >
                                  {label}
                                </option>
                              ),
                            )}
                          </select>
                        ) : (
                          <span
                            className={`rounded px-2 py-1 text-xs ${statusBadges[task.status]}`}
                          >
                            {statusLabels[task.status]}
                          </span>
                        )}
                      </td>
                      <td className="max-w-sm px-5 py-4">
                        <p className="font-medium text-white">{task.title}</p>
                        <p className="mt-1 truncate text-sm text-gray-400">
                          {task.description}
                        </p>
                        <p className="mt-1 truncate text-xs text-gray-600">
                          {getMilestoneLabel(task.milestoneId)}
                        </p>
                      </td>
                      <td className="px-5 py-4">
                        {assignee ? (
                          <div className="flex items-center gap-2">
                            {task.assigneeType === "agent" ? (
                              <span className="flex h-8 w-8 items-center justify-center rounded-full bg-purple-500/20">
                                <Bot className="h-4 w-4 text-purple-300" />
                              </span>
                            ) : "avatar" in assignee ? (
                              <Avatar
                                src={assignee.avatar}
                                name={assignee.name}
                                className="h-8 w-8 rounded-full object-cover"
                              />
                            ) : (
                              <span className="h-8 w-8 rounded-full bg-gray-700" />
                            )}
                            <span className="text-sm text-gray-300">
                              {assignee.name}
                            </span>
                          </div>
                        ) : (
                          <span className="text-sm text-gray-500">
                            Nicht zugewiesen
                          </span>
                        )}
                      </td>
                      <td className="px-5 py-4">
                        <span
                          className={`rounded px-2 py-1 text-xs ${priorityBadges[task.priority]}`}
                        >
                          {priorityLabels[task.priority]}
                        </span>
                      </td>
                      <td className="px-5 py-4 text-sm text-gray-300">
                        {task.dueDate
                          ? format(task.dueDate, "dd.MM.yyyy", { locale: de })
                          : "–"}
                      </td>
                      <td className="px-5 py-4 text-sm text-gray-300">
                        {task.actualHours ?? 0} / {task.estimatedHours ?? 0} h
                      </td>
                      {canEdit && (
                        <td className="px-5 py-4">
                          <div className="flex justify-end gap-1">
                            <button
                              type="button"
                              onClick={() => openEdit(task)}
                              aria-label={`${task.title} bearbeiten`}
                              className="rounded p-2 text-gray-400 hover:bg-gray-700 hover:text-white"
                            >
                              <Pencil className="h-4 w-4" />
                            </button>
                            <button
                              type="button"
                              onClick={() => setDeleteTarget(task)}
                              aria-label={`${task.title} löschen`}
                              className="rounded p-2 text-gray-400 hover:bg-red-500/10 hover:text-red-300"
                            >
                              <Trash2 className="h-4 w-4" />
                            </button>
                          </div>
                        </td>
                      )}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          {filteredTasks.length === 0 && (
            <div className="py-14 text-center">
              <FileText className="mx-auto mb-3 h-12 w-12 text-gray-600" />
              <p className="font-medium text-gray-300">
                Keine passenden Aufgaben
              </p>
              <p className="text-sm text-gray-500">
                Passe Suche oder Filter an.
              </p>
            </div>
          )}
        </div>

        <div className="mt-8 grid grid-cols-2 gap-4 md:grid-cols-4">
          {(
            ["planned", "in_progress", "blocker", "finished"] as TaskStatus[]
          ).map((status) => {
            const Icon =
              status === "finished"
                ? CheckCircle
                : status === "in_progress"
                  ? Clock
                  : status === "blocker"
                    ? AlertCircle
                    : FileText;
            return (
              <button
                type="button"
                key={status}
                onClick={() => setFilterStatus(status)}
                className={`rounded-lg border p-4 text-left ${statusBadges[status].replace("text-", "border-")}`}
              >
                <div className="mb-2 flex items-center justify-between">
                  <Icon className="h-5 w-5" />
                  <span className="text-2xl font-bold">
                    {
                      workPackages.filter((task) => task.status === status)
                        .length
                    }
                  </span>
                </div>
                <span className="text-sm text-gray-400">
                  {statusLabels[status]}
                </span>
              </button>
            );
          })}
        </div>
      </div>

      <Modal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        title={editing ? "Aufgabe bearbeiten" : "Neue Aufgabe"}
        size="lg"
      >
        <form onSubmit={submit} className="space-y-4">
          <label className="block text-sm text-gray-300">
            Meilenstein
            <select
              required
              value={form.milestoneId}
              onChange={(event) =>
                setForm({ ...form, milestoneId: event.target.value })
              }
              className="mt-2 w-full rounded-lg border border-gray-600 bg-gray-700 px-3 py-2 text-white"
            >
              {milestones.map((milestone) => (
                <option key={milestone.id} value={milestone.id}>
                  {getMilestoneLabel(milestone.id)}
                </option>
              ))}
            </select>
          </label>
          <label className="block text-sm text-gray-300">
            Titel
            <input
              required
              value={form.title}
              onChange={(event) =>
                setForm({ ...form, title: event.target.value })
              }
              className="mt-2 w-full rounded-lg border border-gray-600 bg-gray-700 px-3 py-2 text-white"
            />
          </label>
          <label className="block text-sm text-gray-300">
            Beschreibung
            <textarea
              required
              rows={3}
              value={form.description}
              onChange={(event) =>
                setForm({ ...form, description: event.target.value })
              }
              className="mt-2 w-full rounded-lg border border-gray-600 bg-gray-700 px-3 py-2 text-white"
            />
          </label>
          <div className="grid gap-4 sm:grid-cols-2">
            <label className="text-sm text-gray-300">
              Status
              <select
                value={form.status}
                onChange={(event) =>
                  setForm({ ...form, status: event.target.value as TaskStatus })
                }
                className="mt-2 w-full rounded-lg border border-gray-600 bg-gray-700 px-3 py-2 text-white"
              >
                {Object.entries(statusLabels).map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </select>
            </label>
            <label className="text-sm text-gray-300">
              Priorität
              <select
                value={form.priority}
                onChange={(event) =>
                  setForm({
                    ...form,
                    priority: event.target.value as WorkPackage["priority"],
                  })
                }
                className="mt-2 w-full rounded-lg border border-gray-600 bg-gray-700 px-3 py-2 text-white"
              >
                {Object.entries(priorityLabels).map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </select>
            </label>
            <label className="text-sm text-gray-300">
              Typ
              <select
                value={form.assigneeType}
                onChange={(event) =>
                  setForm({
                    ...form,
                    assigneeType: event.target
                      .value as WorkPackage["assigneeType"],
                    assigneeId: "",
                  })
                }
                className="mt-2 w-full rounded-lg border border-gray-600 bg-gray-700 px-3 py-2 text-white"
              >
                <option value="user">Person</option>
                <option value="agent">Agent</option>
              </select>
            </label>
            <label className="text-sm text-gray-300">
              Zuweisung
              <select
                value={form.assigneeId}
                onChange={(event) =>
                  setForm({ ...form, assigneeId: event.target.value })
                }
                className="mt-2 w-full rounded-lg border border-gray-600 bg-gray-700 px-3 py-2 text-white"
              >
                <option value="">Nicht zugewiesen</option>
                {assignees.map((entry) => (
                  <option key={entry.id} value={entry.id}>
                    {entry.name}
                  </option>
                ))}
              </select>
            </label>
            <label className="text-sm text-gray-300">
              Fällig
              <input
                type="date"
                value={form.dueDate}
                onChange={(event) =>
                  setForm({ ...form, dueDate: event.target.value })
                }
                className="mt-2 w-full rounded-lg border border-gray-600 bg-gray-700 px-3 py-2 text-white"
              />
            </label>
            <div className="grid grid-cols-2 gap-3">
              <label className="text-sm text-gray-300">
                Plan (h)
                <input
                  type="number"
                  min="0"
                  step="0.5"
                  value={form.estimatedHours}
                  onChange={(event) =>
                    setForm({ ...form, estimatedHours: event.target.value })
                  }
                  className="mt-2 w-full rounded-lg border border-gray-600 bg-gray-700 px-3 py-2 text-white"
                />
              </label>
              <label className="text-sm text-gray-300">
                Ist (h)
                <input
                  type="number"
                  min="0"
                  step="0.5"
                  value={form.actualHours}
                  onChange={(event) =>
                    setForm({ ...form, actualHours: event.target.value })
                  }
                  className="mt-2 w-full rounded-lg border border-gray-600 bg-gray-700 px-3 py-2 text-white"
                />
              </label>
            </div>
          </div>
          <div className="flex justify-end gap-3">
            <button
              type="button"
              onClick={() => setModalOpen(false)}
              className="rounded-lg bg-gray-700 px-4 py-2"
            >
              Abbrechen
            </button>
            <button
              type="submit"
              className="rounded-lg bg-blue-600 px-4 py-2 text-white"
            >
              Speichern
            </button>
          </div>
        </form>
      </Modal>
      <ConfirmDialog
        open={Boolean(deleteTarget)}
        onClose={() => setDeleteTarget(null)}
        onConfirm={() => {
          if (!canEdit || !deleteTarget) return;
          deleteWorkPackage(deleteTarget.id);
          notify("Aufgabe wurde gelöscht.");
        }}
        title="Aufgabe löschen?"
        message={`„${deleteTarget?.title ?? ""}“ aus der Aufgabenliste entfernen?`}
        confirmLabel="Löschen"
        danger
      />
    </div>
  );
}
