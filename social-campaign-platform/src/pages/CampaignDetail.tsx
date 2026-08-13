import { useEffect, useMemo, useState, type FormEvent } from "react";
import {
  ArrowLeft,
  Calendar,
  CheckCircle2,
  ChevronDown,
  CircleAlert,
  Clock,
  Pencil,
  Plus,
  Target,
  Trash2,
} from "lucide-react";
import { Link, useParams } from "react-router-dom";
import { format } from "date-fns";
import { de } from "date-fns/locale";
import ConfirmDialog from "../components/ConfirmDialog";
import Modal from "../components/Modal";
import { useAppData } from "../contexts/app-data";
import { useAuth } from "../contexts/auth";
import { useFeedback } from "../contexts/feedback";
import type { Milestone, Phase, TaskStatus, WorkPackage } from "../types";

type DeleteTarget = {
  kind: "phase" | "milestone" | "task";
  id: string;
  name: string;
};

const taskStatusLabels: Record<TaskStatus, string> = {
  planned: "Geplant",
  in_progress: "In Arbeit",
  blocker: "Blockiert",
  finished: "Erledigt",
};

export default function CampaignDetail() {
  const { campaignId } = useParams();
  const {
    campaigns,
    phases,
    milestones,
    workPackages,
    users,
    agents,
    createPhase,
    updatePhase,
    deletePhase,
    createMilestone,
    updateMilestone,
    deleteMilestone,
    createWorkPackage,
    updateWorkPackage,
    deleteWorkPackage,
  } = useAppData();
  const { canEdit } = useAuth();
  const { notify } = useFeedback();
  const campaign = campaigns.find((entry) => entry.id === campaignId);
  const campaignPhases = useMemo(
    () =>
      phases
        .filter((phase) => phase.campaignId === campaignId)
        .sort((a, b) => a.order - b.order),
    [campaignId, phases],
  );
  const phaseIds = useMemo(
    () => new Set(campaignPhases.map((phase) => phase.id)),
    [campaignPhases],
  );
  const campaignMilestones = useMemo(
    () => milestones.filter((milestone) => phaseIds.has(milestone.phaseId)),
    [milestones, phaseIds],
  );
  const milestoneIds = useMemo(
    () => new Set(campaignMilestones.map((milestone) => milestone.id)),
    [campaignMilestones],
  );
  const campaignTasks = useMemo(
    () => workPackages.filter((task) => milestoneIds.has(task.milestoneId)),
    [milestoneIds, workPackages],
  );
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const [phaseOpen, setPhaseOpen] = useState(false);
  const [editingPhase, setEditingPhase] = useState<Phase | null>(null);
  const [milestonePhaseId, setMilestonePhaseId] = useState<string | null>(null);
  const [editingMilestone, setEditingMilestone] = useState<Milestone | null>(
    null,
  );
  const [taskMilestoneId, setTaskMilestoneId] = useState<string | null>(null);
  const [editingTask, setEditingTask] = useState<WorkPackage | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<DeleteTarget | null>(null);
  const [phaseForm, setPhaseForm] = useState({
    name: "",
    description: "",
    startDate: "",
    endDate: "",
    status: "upcoming" as Phase["status"],
  });
  const [milestoneForm, setMilestoneForm] = useState({
    name: "",
    description: "",
    dueDate: "",
    status: "pending" as Milestone["status"],
  });
  const [taskForm, setTaskForm] = useState({
    title: "",
    description: "",
    status: "planned" as TaskStatus,
    priority: "medium" as WorkPackage["priority"],
    assigneeType: "user" as WorkPackage["assigneeType"],
    assigneeId: "",
    dueDate: "",
    estimatedHours: "4",
    actualHours: "0",
  });

  useEffect(() => {
    if (canEdit) return;
    setPhaseOpen(false);
    setEditingPhase(null);
    setMilestonePhaseId(null);
    setEditingMilestone(null);
    setTaskMilestoneId(null);
    setEditingTask(null);
    setDeleteTarget(null);
  }, [canEdit]);

  if (!campaign) {
    return (
      <div className="p-8 text-center md:ml-64">
        <Target className="mx-auto mb-4 h-14 w-14 text-gray-600" />
        <h1 className="mb-2 text-2xl font-bold text-white">
          Kampagne nicht gefunden
        </h1>
        <Link to="/campaigns" className="text-blue-400 hover:text-blue-300">
          Zur Kampagnenübersicht
        </Link>
      </div>
    );
  }

  const completion = (() => {
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
    const duration = campaign.endDate.getTime() - campaign.startDate.getTime();
    if (duration <= 0) return 0;
    return Math.max(
      0,
      Math.min(
        100,
        Math.round(
          ((Date.now() - campaign.startDate.getTime()) / duration) * 100,
        ),
      ),
    );
  })();

  const openPhaseCreate = () => {
    if (!canEdit) return;
    setEditingPhase(null);
    setPhaseForm({
      name: "",
      description: "",
      startDate: "",
      endDate: "",
      status: "upcoming",
    });
    setPhaseOpen(true);
  };

  const openPhaseEdit = (phase: Phase) => {
    if (!canEdit) return;
    setEditingPhase(phase);
    setPhaseForm({
      name: phase.name,
      description: phase.description ?? "",
      startDate: format(phase.startDate, "yyyy-MM-dd"),
      endDate: format(phase.endDate, "yyyy-MM-dd"),
      status: phase.status,
    });
    setPhaseOpen(true);
  };

  const submitPhase = (event: FormEvent) => {
    event.preventDefault();
    if (!canEdit) return;
    const startDate = new Date(`${phaseForm.startDate}T00:00:00`);
    const endDate = new Date(`${phaseForm.endDate}T23:59:59`);
    if (!phaseForm.name.trim() || endDate < startDate)
      return notify("Bitte prüfe Name und Datumsbereich.", "error");
    if (editingPhase) {
      updatePhase(editingPhase.id, {
        name: phaseForm.name.trim(),
        description: phaseForm.description.trim(),
        startDate,
        endDate,
        status: phaseForm.status,
      });
      notify("Phase wurde aktualisiert.");
    } else {
      const phase = createPhase({
        campaignId: campaign.id,
        name: phaseForm.name.trim(),
        description: phaseForm.description.trim(),
        startDate,
        endDate,
        status: phaseForm.status,
        order: Math.max(0, ...campaignPhases.map((phase) => phase.order)) + 1,
      });
      setExpanded((current) => ({ ...current, [phase.id]: true }));
      notify("Phase wurde angelegt.");
    }
    setPhaseOpen(false);
    setEditingPhase(null);
    setPhaseForm({
      name: "",
      description: "",
      startDate: "",
      endDate: "",
      status: "upcoming",
    });
  };

  const openMilestoneCreate = (phaseId: string) => {
    if (!canEdit) return;
    setEditingMilestone(null);
    setMilestoneForm({
      name: "",
      description: "",
      dueDate: "",
      status: "pending",
    });
    setMilestonePhaseId(phaseId);
  };

  const openMilestoneEdit = (milestone: Milestone) => {
    if (!canEdit) return;
    setEditingMilestone(milestone);
    setMilestoneForm({
      name: milestone.name,
      description: milestone.description ?? "",
      dueDate: format(milestone.dueDate, "yyyy-MM-dd"),
      status: milestone.status,
    });
    setMilestonePhaseId(milestone.phaseId);
  };

  const submitMilestone = (event: FormEvent) => {
    event.preventDefault();
    if (!canEdit) return;
    if (
      !milestonePhaseId ||
      !milestoneForm.name.trim() ||
      !milestoneForm.dueDate
    )
      return;
    const values = {
      phaseId: milestonePhaseId,
      name: milestoneForm.name.trim(),
      description: milestoneForm.description.trim(),
      dueDate: new Date(`${milestoneForm.dueDate}T23:59:59`),
      status: milestoneForm.status,
    };
    if (editingMilestone) {
      updateMilestone(editingMilestone.id, values);
      notify("Meilenstein wurde aktualisiert.");
    } else {
      createMilestone({
        ...values,
        order:
          Math.max(
            0,
            ...milestones
              .filter((entry) => entry.phaseId === milestonePhaseId)
              .map((entry) => entry.order),
          ) + 1,
      });
      notify("Meilenstein wurde angelegt.");
    }
    setMilestonePhaseId(null);
    setEditingMilestone(null);
    setMilestoneForm({
      name: "",
      description: "",
      dueDate: "",
      status: "pending",
    });
  };

  const openTask = (milestoneId: string, task?: WorkPackage) => {
    if (!canEdit) return;
    setTaskMilestoneId(milestoneId);
    setEditingTask(task ?? null);
    setTaskForm(
      task
        ? {
            title: task.title,
            description: task.description,
            status: task.status,
            priority: task.priority,
            assigneeType: task.assigneeType,
            assigneeId: task.assigneeId ?? "",
            dueDate: task.dueDate ? format(task.dueDate, "yyyy-MM-dd") : "",
            estimatedHours: String(task.estimatedHours ?? 0),
            actualHours: String(task.actualHours ?? 0),
          }
        : {
            title: "",
            description: "",
            status: "planned",
            priority: "medium",
            assigneeType: "user",
            assigneeId: "",
            dueDate: "",
            estimatedHours: "4",
            actualHours: "0",
          },
    );
  };

  const submitTask = (event: FormEvent) => {
    event.preventDefault();
    if (!canEdit) return;
    if (
      !taskMilestoneId ||
      !taskForm.title.trim() ||
      !taskForm.description.trim()
    )
      return;
    const values = {
      milestoneId: taskMilestoneId,
      title: taskForm.title.trim(),
      description: taskForm.description.trim(),
      status: taskForm.status,
      priority: taskForm.priority,
      assigneeType: taskForm.assigneeType,
      assigneeId: taskForm.assigneeId || undefined,
      dueDate: taskForm.dueDate
        ? new Date(`${taskForm.dueDate}T23:59:59`)
        : undefined,
      estimatedHours: Number(taskForm.estimatedHours) || 0,
      actualHours: Number(taskForm.actualHours) || 0,
    };
    if (editingTask) {
      updateWorkPackage(editingTask.id, values);
      notify("Aufgabe wurde aktualisiert.");
    } else {
      createWorkPackage(values);
      notify("Aufgabe wurde angelegt.");
    }
    setTaskMilestoneId(null);
    setEditingTask(null);
  };

  const assignees = taskForm.assigneeType === "agent" ? agents : users;

  return (
    <div className="p-6 md:ml-64 md:p-8">
      <div className="mx-auto max-w-6xl">
        <Link
          to="/campaigns"
          className="mb-6 inline-flex items-center text-sm text-gray-400 hover:text-white"
        >
          <ArrowLeft className="mr-2 h-4 w-4" />
          Alle Kampagnen
        </Link>
        <div className="mb-8 flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <div className="mb-3 flex items-center gap-3">
              <span className="rounded-full bg-blue-500/20 px-3 py-1 text-xs font-medium uppercase tracking-wide text-blue-300">
                {campaign.status}
              </span>
              <span className="text-sm text-gray-500">
                {format(campaign.startDate, "dd.MM.yyyy", { locale: de })} –{" "}
                {format(campaign.endDate, "dd.MM.yyyy", { locale: de })}
              </span>
            </div>
            <h1 className="mb-2 text-3xl font-bold text-white">
              {campaign.name}
            </h1>
            <p className="max-w-3xl text-gray-400">{campaign.description}</p>
          </div>
          {canEdit && (
            <button
              type="button"
              onClick={openPhaseCreate}
              className="inline-flex shrink-0 items-center justify-center rounded-lg bg-blue-600 px-5 py-3 text-white hover:bg-blue-700"
            >
              <Plus className="mr-2 h-5 w-5" />
              Phase hinzufügen
            </button>
          )}
        </div>

        <div className="mb-8 grid gap-4 sm:grid-cols-4">
          <div className="rounded-xl border border-gray-700 bg-gray-800/50 p-5">
            <p className="text-2xl font-bold text-white">
              {campaignPhases.length}
            </p>
            <p className="text-sm text-gray-400">Phasen</p>
          </div>
          <div className="rounded-xl border border-gray-700 bg-gray-800/50 p-5">
            <p className="text-2xl font-bold text-white">
              {campaignMilestones.length}
            </p>
            <p className="text-sm text-gray-400">Meilensteine</p>
          </div>
          <div className="rounded-xl border border-gray-700 bg-gray-800/50 p-5">
            <p className="text-2xl font-bold text-white">
              {campaignTasks.length}
            </p>
            <p className="text-sm text-gray-400">Aufgaben</p>
          </div>
          <div className="rounded-xl border border-gray-700 bg-gray-800/50 p-5">
            <p className="text-2xl font-bold text-green-400">{completion}%</p>
            <p className="text-sm text-gray-400">Erledigt</p>
          </div>
        </div>

        <div className="space-y-5">
          {campaignPhases.map((phase) => {
            const phaseMilestones = milestones
              .filter((milestone) => milestone.phaseId === phase.id)
              .sort((a, b) => a.order - b.order);
            const isExpanded = expanded[phase.id] ?? phase.status === "current";
            return (
              <section
                key={phase.id}
                className="overflow-hidden rounded-xl border border-gray-700 bg-gray-800/50"
              >
                <div className="flex flex-wrap items-center gap-4 p-5">
                  <button
                    type="button"
                    onClick={() =>
                      setExpanded((current) => ({
                        ...current,
                        [phase.id]: !isExpanded,
                      }))
                    }
                    aria-expanded={isExpanded}
                    className="flex min-w-0 flex-1 items-center gap-4 text-left"
                  >
                    <span
                      className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-full font-bold ${phase.status === "completed" ? "bg-green-600" : phase.status === "current" ? "bg-blue-600" : "bg-gray-700"}`}
                    >
                      {phase.status === "completed" ? (
                        <CheckCircle2 className="h-5 w-5" />
                      ) : (
                        phase.order
                      )}
                    </span>
                    <span className="min-w-0">
                      <span className="block font-semibold text-white">
                        {phase.name}
                      </span>
                      <span className="block text-sm text-gray-400">
                        {format(phase.startDate, "dd.MM.")} –{" "}
                        {format(phase.endDate, "dd.MM.yyyy")}
                      </span>
                    </span>
                    <ChevronDown
                      className={`ml-auto h-5 w-5 shrink-0 text-gray-400 transition-transform ${isExpanded ? "rotate-180" : ""}`}
                    />
                  </button>
                  {canEdit && (
                    <div className="flex items-center gap-2">
                      <select
                        aria-label={`Status von ${phase.name}`}
                        value={phase.status}
                        onChange={(event) =>
                          updatePhase(phase.id, {
                            status: event.target.value as Phase["status"],
                          })
                        }
                        className="rounded-lg border border-gray-600 bg-gray-700 px-2 py-2 text-sm text-white"
                      >
                        <option value="upcoming">Geplant</option>
                        <option value="current">Aktuell</option>
                        <option value="completed">Erledigt</option>
                      </select>
                      <button
                        type="button"
                        onClick={() => openPhaseEdit(phase)}
                        aria-label={`${phase.name} bearbeiten`}
                        className="rounded-lg p-2 text-gray-400 hover:bg-gray-700 hover:text-white"
                      >
                        <Pencil className="h-4 w-4" />
                      </button>
                      <button
                        type="button"
                        onClick={() =>
                          setDeleteTarget({
                            kind: "phase",
                            id: phase.id,
                            name: phase.name,
                          })
                        }
                        aria-label={`${phase.name} löschen`}
                        className="rounded-lg p-2 text-gray-400 hover:bg-red-500/10 hover:text-red-300"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>
                  )}
                </div>
                {isExpanded && (
                  <div className="border-t border-gray-700 p-5">
                    {phase.description && (
                      <p className="mb-5 text-sm text-gray-400">
                        {phase.description}
                      </p>
                    )}
                    <div className="mb-4 flex items-center justify-between">
                      <h3 className="font-semibold text-white">Meilensteine</h3>
                      {canEdit && (
                        <button
                          type="button"
                          onClick={() => openMilestoneCreate(phase.id)}
                          className="inline-flex items-center text-sm text-blue-400 hover:text-blue-300"
                        >
                          <Plus className="mr-1 h-4 w-4" />
                          Meilenstein
                        </button>
                      )}
                    </div>
                    <div className="space-y-4">
                      {phaseMilestones.map((milestone) => {
                        const tasks = workPackages.filter(
                          (task) => task.milestoneId === milestone.id,
                        );
                        return (
                          <div
                            key={milestone.id}
                            className="rounded-lg border border-gray-700 bg-gray-800 p-4"
                          >
                            <div className="mb-3 flex flex-wrap items-start justify-between gap-3">
                              <div>
                                <div className="mb-1 flex items-center gap-2">
                                  <h4 className="font-medium text-white">
                                    {milestone.name}
                                  </h4>
                                  {milestone.status === "blocked" && (
                                    <CircleAlert className="h-4 w-4 text-red-400" />
                                  )}
                                </div>
                                <p className="text-xs text-gray-500">
                                  <Calendar className="mr-1 inline h-3 w-3" />
                                  Fällig{" "}
                                  {format(milestone.dueDate, "dd.MM.yyyy")}
                                </p>
                              </div>
                              {canEdit && (
                                <div className="flex gap-2">
                                  <select
                                    aria-label={`Status von ${milestone.name}`}
                                    value={milestone.status}
                                    onChange={(event) =>
                                      updateMilestone(milestone.id, {
                                        status: event.target
                                          .value as Milestone["status"],
                                      })
                                    }
                                    className="rounded border border-gray-600 bg-gray-700 px-2 py-1 text-xs text-white"
                                  >
                                    <option value="pending">Geplant</option>
                                    <option value="in_progress">
                                      In Arbeit
                                    </option>
                                    <option value="completed">Erledigt</option>
                                    <option value="blocked">Blockiert</option>
                                  </select>
                                  <button
                                    type="button"
                                    onClick={() => openMilestoneEdit(milestone)}
                                    aria-label={`${milestone.name} bearbeiten`}
                                    className="text-gray-500 hover:text-white"
                                  >
                                    <Pencil className="h-4 w-4" />
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() =>
                                      setDeleteTarget({
                                        kind: "milestone",
                                        id: milestone.id,
                                        name: milestone.name,
                                      })
                                    }
                                    aria-label={`${milestone.name} löschen`}
                                    className="text-gray-500 hover:text-red-300"
                                  >
                                    <Trash2 className="h-4 w-4" />
                                  </button>
                                </div>
                              )}
                            </div>
                            <div className="space-y-2">
                              {tasks.map((task) => (
                                <div
                                  key={task.id}
                                  className="flex flex-col gap-3 rounded-lg bg-gray-900/60 p-3 sm:flex-row sm:items-center"
                                >
                                  <div className="min-w-0 flex-1">
                                    <p className="text-sm font-medium text-gray-200">
                                      {task.title}
                                    </p>
                                    <p className="truncate text-xs text-gray-500">
                                      {task.description}
                                    </p>
                                  </div>
                                  <div className="flex items-center gap-2">
                                    <span className="rounded bg-gray-700 px-2 py-1 text-xs text-gray-300">
                                      {taskStatusLabels[task.status]}
                                    </span>
                                    {task.dueDate && (
                                      <span className="text-xs text-gray-500">
                                        <Clock className="mr-1 inline h-3 w-3" />
                                        {format(task.dueDate, "dd.MM.")}
                                      </span>
                                    )}
                                    {canEdit && (
                                      <>
                                        <button
                                          type="button"
                                          onClick={() =>
                                            openTask(milestone.id, task)
                                          }
                                          aria-label={`${task.title} bearbeiten`}
                                          className="text-gray-500 hover:text-white"
                                        >
                                          <Pencil className="h-4 w-4" />
                                        </button>
                                        <button
                                          type="button"
                                          onClick={() =>
                                            setDeleteTarget({
                                              kind: "task",
                                              id: task.id,
                                              name: task.title,
                                            })
                                          }
                                          aria-label={`${task.title} löschen`}
                                          className="text-gray-500 hover:text-red-300"
                                        >
                                          <Trash2 className="h-4 w-4" />
                                        </button>
                                      </>
                                    )}
                                  </div>
                                </div>
                              ))}
                            </div>
                            {canEdit && (
                              <button
                                type="button"
                                onClick={() => openTask(milestone.id)}
                                className="mt-3 inline-flex items-center text-xs text-blue-400 hover:text-blue-300"
                              >
                                <Plus className="mr-1 h-3 w-3" />
                                Aufgabe hinzufügen
                              </button>
                            )}
                          </div>
                        );
                      })}
                      {phaseMilestones.length === 0 && (
                        <p className="rounded-lg border border-dashed border-gray-700 p-5 text-center text-sm text-gray-500">
                          Noch keine Meilensteine in dieser Phase.
                        </p>
                      )}
                    </div>
                  </div>
                )}
              </section>
            );
          })}
          {campaignPhases.length === 0 && (
            <div className="rounded-xl border border-dashed border-gray-700 py-14 text-center">
              <Target className="mx-auto mb-3 h-12 w-12 text-gray-600" />
              <h2 className="mb-1 font-semibold text-gray-300">
                Noch keine Phasen
              </h2>
              <p className="text-sm text-gray-500">
                Lege die erste Phase für diese Kampagne an.
              </p>
            </div>
          )}
        </div>
      </div>

      <Modal
        open={phaseOpen}
        onClose={() => {
          setPhaseOpen(false);
          setEditingPhase(null);
        }}
        title={editingPhase ? "Phase bearbeiten" : "Neue Phase"}
      >
        <form onSubmit={submitPhase} className="space-y-4">
          <label className="block text-sm text-gray-300">
            Name
            <input
              required
              value={phaseForm.name}
              onChange={(event) =>
                setPhaseForm({ ...phaseForm, name: event.target.value })
              }
              className="mt-2 w-full rounded-lg border border-gray-600 bg-gray-700 px-3 py-2 text-white"
            />
          </label>
          <label className="block text-sm text-gray-300">
            Beschreibung
            <textarea
              rows={3}
              value={phaseForm.description}
              onChange={(event) =>
                setPhaseForm({ ...phaseForm, description: event.target.value })
              }
              className="mt-2 w-full rounded-lg border border-gray-600 bg-gray-700 px-3 py-2 text-white"
            />
          </label>
          <div className="grid gap-4 sm:grid-cols-2">
            <label className="text-sm text-gray-300">
              Start
              <input
                required
                type="date"
                value={phaseForm.startDate}
                onChange={(event) =>
                  setPhaseForm({ ...phaseForm, startDate: event.target.value })
                }
                className="mt-2 w-full rounded-lg border border-gray-600 bg-gray-700 px-3 py-2 text-white"
              />
            </label>
            <label className="text-sm text-gray-300">
              Ende
              <input
                required
                type="date"
                value={phaseForm.endDate}
                onChange={(event) =>
                  setPhaseForm({ ...phaseForm, endDate: event.target.value })
                }
                className="mt-2 w-full rounded-lg border border-gray-600 bg-gray-700 px-3 py-2 text-white"
              />
            </label>
          </div>
          <label className="block text-sm text-gray-300">
            Status
            <select
              value={phaseForm.status}
              onChange={(event) =>
                setPhaseForm({
                  ...phaseForm,
                  status: event.target.value as Phase["status"],
                })
              }
              className="mt-2 w-full rounded-lg border border-gray-600 bg-gray-700 px-3 py-2 text-white"
            >
              <option value="upcoming">Geplant</option>
              <option value="current">Aktuell</option>
              <option value="completed">Erledigt</option>
            </select>
          </label>
          <div className="flex justify-end gap-3">
            <button
              type="button"
              onClick={() => {
                setPhaseOpen(false);
                setEditingPhase(null);
              }}
              className="rounded-lg bg-gray-700 px-4 py-2"
            >
              Abbrechen
            </button>
            <button
              type="submit"
              className="rounded-lg bg-blue-600 px-4 py-2 text-white"
            >
              {editingPhase ? "Speichern" : "Anlegen"}
            </button>
          </div>
        </form>
      </Modal>

      <Modal
        open={Boolean(milestonePhaseId)}
        onClose={() => {
          setMilestonePhaseId(null);
          setEditingMilestone(null);
        }}
        title={
          editingMilestone ? "Meilenstein bearbeiten" : "Neuer Meilenstein"
        }
      >
        <form onSubmit={submitMilestone} className="space-y-4">
          <label className="block text-sm text-gray-300">
            Name
            <input
              required
              value={milestoneForm.name}
              onChange={(event) =>
                setMilestoneForm({ ...milestoneForm, name: event.target.value })
              }
              className="mt-2 w-full rounded-lg border border-gray-600 bg-gray-700 px-3 py-2 text-white"
            />
          </label>
          <label className="block text-sm text-gray-300">
            Beschreibung
            <textarea
              rows={3}
              value={milestoneForm.description}
              onChange={(event) =>
                setMilestoneForm({
                  ...milestoneForm,
                  description: event.target.value,
                })
              }
              className="mt-2 w-full rounded-lg border border-gray-600 bg-gray-700 px-3 py-2 text-white"
            />
          </label>
          <label className="block text-sm text-gray-300">
            Fällig am
            <input
              required
              type="date"
              value={milestoneForm.dueDate}
              onChange={(event) =>
                setMilestoneForm({
                  ...milestoneForm,
                  dueDate: event.target.value,
                })
              }
              className="mt-2 w-full rounded-lg border border-gray-600 bg-gray-700 px-3 py-2 text-white"
            />
          </label>
          <div className="flex justify-end gap-3">
            <button
              type="button"
              onClick={() => {
                setMilestonePhaseId(null);
                setEditingMilestone(null);
              }}
              className="rounded-lg bg-gray-700 px-4 py-2"
            >
              Abbrechen
            </button>
            <button
              type="submit"
              className="rounded-lg bg-blue-600 px-4 py-2 text-white"
            >
              {editingMilestone ? "Speichern" : "Anlegen"}
            </button>
          </div>
        </form>
      </Modal>

      <Modal
        open={Boolean(taskMilestoneId)}
        onClose={() => {
          setTaskMilestoneId(null);
          setEditingTask(null);
        }}
        title={editingTask ? "Aufgabe bearbeiten" : "Neue Aufgabe"}
        size="lg"
      >
        <form onSubmit={submitTask} className="space-y-4">
          <label className="block text-sm text-gray-300">
            Titel
            <input
              required
              value={taskForm.title}
              onChange={(event) =>
                setTaskForm({ ...taskForm, title: event.target.value })
              }
              className="mt-2 w-full rounded-lg border border-gray-600 bg-gray-700 px-3 py-2 text-white"
            />
          </label>
          <label className="block text-sm text-gray-300">
            Beschreibung
            <textarea
              required
              rows={3}
              value={taskForm.description}
              onChange={(event) =>
                setTaskForm({ ...taskForm, description: event.target.value })
              }
              className="mt-2 w-full rounded-lg border border-gray-600 bg-gray-700 px-3 py-2 text-white"
            />
          </label>
          <div className="grid gap-4 sm:grid-cols-2">
            <label className="text-sm text-gray-300">
              Status
              <select
                value={taskForm.status}
                onChange={(event) =>
                  setTaskForm({
                    ...taskForm,
                    status: event.target.value as TaskStatus,
                  })
                }
                className="mt-2 w-full rounded-lg border border-gray-600 bg-gray-700 px-3 py-2 text-white"
              >
                {Object.entries(taskStatusLabels).map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </select>
            </label>
            <label className="text-sm text-gray-300">
              Priorität
              <select
                value={taskForm.priority}
                onChange={(event) =>
                  setTaskForm({
                    ...taskForm,
                    priority: event.target.value as WorkPackage["priority"],
                  })
                }
                className="mt-2 w-full rounded-lg border border-gray-600 bg-gray-700 px-3 py-2 text-white"
              >
                <option value="low">Niedrig</option>
                <option value="medium">Mittel</option>
                <option value="high">Hoch</option>
                <option value="critical">Kritisch</option>
              </select>
            </label>
            <label className="text-sm text-gray-300">
              Zuweisung
              <select
                value={taskForm.assigneeType}
                onChange={(event) =>
                  setTaskForm({
                    ...taskForm,
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
              Zugewiesen an
              <select
                value={taskForm.assigneeId}
                onChange={(event) =>
                  setTaskForm({ ...taskForm, assigneeId: event.target.value })
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
              Fällig am
              <input
                type="date"
                value={taskForm.dueDate}
                onChange={(event) =>
                  setTaskForm({ ...taskForm, dueDate: event.target.value })
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
                  value={taskForm.estimatedHours}
                  onChange={(event) =>
                    setTaskForm({
                      ...taskForm,
                      estimatedHours: event.target.value,
                    })
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
                  value={taskForm.actualHours}
                  onChange={(event) =>
                    setTaskForm({
                      ...taskForm,
                      actualHours: event.target.value,
                    })
                  }
                  className="mt-2 w-full rounded-lg border border-gray-600 bg-gray-700 px-3 py-2 text-white"
                />
              </label>
            </div>
          </div>
          <div className="flex justify-end gap-3">
            <button
              type="button"
              onClick={() => setTaskMilestoneId(null)}
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
          if (deleteTarget.kind === "phase") deletePhase(deleteTarget.id);
          else if (deleteTarget.kind === "milestone")
            deleteMilestone(deleteTarget.id);
          else deleteWorkPackage(deleteTarget.id);
          notify("Eintrag wurde gelöscht.");
        }}
        title="Eintrag löschen?"
        message={`„${deleteTarget?.name ?? ""}“ und direkt untergeordnete Daten löschen?`}
        confirmLabel="Löschen"
        danger
      />
    </div>
  );
}
