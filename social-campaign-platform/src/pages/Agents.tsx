import { useEffect, useState, type FormEvent } from "react";
import { format } from "date-fns";
import { de } from "date-fns/locale";
import {
  Activity,
  Bot,
  CheckCircle,
  CircleAlert,
  Clock,
  LoaderCircle,
  Pause,
  Play,
  Plus,
  Power,
  Settings,
  Trash2,
  Zap,
} from "lucide-react";
import Modal from "../components/Modal";
import ConfirmDialog from "../components/ConfirmDialog";
import { useAppData } from "../contexts/app-data";
import { useAuth } from "../contexts/auth";
import { useFeedback } from "../contexts/feedback";
import type { Agent, Workflow, WorkflowRun } from "../types";

interface AgentDraft {
  name: string;
  type: string;
  description: string;
  capabilities: string;
  model: string;
  temperature: string;
  maxTokens: string;
  isActive: boolean;
}

interface StepDraft {
  id: string;
  action: string;
  agentId: string;
  parameters: string;
  condition: string;
}

interface WorkflowDraft {
  name: string;
  description: string;
  triggerType: Workflow["triggerType"];
  schedule: string;
  campaignId: string;
  isActive: boolean;
  steps: StepDraft[];
}

let draftId = 0;

function createDraftId(prefix: string): string {
  draftId += 1;
  return `${prefix}-${Date.now()}-${draftId}`;
}

function emptyAgentDraft(model = "gemma3"): AgentDraft {
  return {
    name: "",
    type: "llm-writer",
    description: "",
    capabilities: "",
    model,
    temperature: "0.7",
    maxTokens: "500",
    isActive: true,
  };
}

function newStepDraft(): StepDraft {
  return {
    id: createDraftId("draft-step"),
    action: "",
    agentId: "",
    parameters: "{}",
    condition: "",
  };
}

function emptyWorkflowDraft(): WorkflowDraft {
  return {
    name: "",
    description: "",
    triggerType: "manual",
    schedule: "",
    campaignId: "",
    isActive: true,
    steps: [newStepDraft()],
  };
}

function configString(agent: Agent, key: string, fallback: string): string {
  const value = agent.configuration[key];
  return typeof value === "string" ? value : fallback;
}

function configNumber(agent: Agent, key: string, fallback: number): string {
  const value = agent.configuration[key];
  return typeof value === "number" && Number.isFinite(value)
    ? String(value)
    : String(fallback);
}

function runPresentation(run: WorkflowRun): {
  label: string;
  className: string;
  icon: typeof LoaderCircle;
} {
  if (run.status === "running") {
    return {
      label: "Wird ausgeführt",
      className: "text-blue-300",
      icon: LoaderCircle,
    };
  }
  if (run.status === "completed") {
    return {
      label: "Erfolgreich beendet",
      className: "text-green-300",
      icon: CheckCircle,
    };
  }
  return {
    label: "Fehlgeschlagen",
    className: "text-red-300",
    icon: CircleAlert,
  };
}

export default function Agents() {
  const {
    agents,
    workflows,
    workflowRuns,
    campaigns,
    settings,
    createAgent,
    updateAgent,
    deleteAgent,
    createWorkflow,
    updateWorkflow,
    deleteWorkflow,
    runWorkflow,
  } = useAppData();
  const { canEdit } = useAuth();
  const { notify } = useFeedback();
  const [agentModalOpen, setAgentModalOpen] = useState(false);
  const [editingAgent, setEditingAgent] = useState<Agent | null>(null);
  const [agentDraft, setAgentDraft] = useState<AgentDraft>(emptyAgentDraft);
  const [agentError, setAgentError] = useState("");
  const [workflowModalOpen, setWorkflowModalOpen] = useState(false);
  const [editingWorkflow, setEditingWorkflow] = useState<Workflow | null>(null);
  const [workflowDraft, setWorkflowDraft] =
    useState<WorkflowDraft>(emptyWorkflowDraft);
  const [workflowError, setWorkflowError] = useState("");
  const [deleteTarget, setDeleteTarget] = useState<{
    kind: "agent" | "workflow";
    id: string;
    name: string;
  } | null>(null);

  useEffect(() => {
    if (canEdit) return;
    setAgentModalOpen(false);
    setEditingAgent(null);
    setAgentDraft(emptyAgentDraft(settings.aiModel));
    setAgentError("");
    setWorkflowModalOpen(false);
    setEditingWorkflow(null);
    setWorkflowDraft(emptyWorkflowDraft());
    setWorkflowError("");
    setDeleteTarget(null);
  }, [canEdit, settings.aiModel]);

  const openCreateAgent = () => {
    if (!canEdit) return;
    setEditingAgent(null);
    setAgentDraft(emptyAgentDraft(settings.aiModel));
    setAgentError("");
    setAgentModalOpen(true);
  };

  const openEditAgent = (agent: Agent) => {
    if (!canEdit) return;
    setEditingAgent(agent);
    setAgentDraft({
      name: agent.name,
      type: agent.type,
      description: agent.description ?? "",
      capabilities: agent.capabilities.join(", "),
      model: configString(agent, "model", settings.aiModel),
      temperature: configNumber(agent, "temperature", 0.7),
      maxTokens: configNumber(agent, "maxTokens", 500),
      isActive: agent.isActive,
    });
    setAgentError("");
    setAgentModalOpen(true);
  };

  const handleAgentSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!canEdit) return;
    const name = agentDraft.name.trim();
    const type = agentDraft.type.trim();
    const capabilities = [
      ...new Set(
        agentDraft.capabilities
          .split(",")
          .map((item) => item.trim())
          .filter(Boolean),
      ),
    ];
    const temperature = Number(agentDraft.temperature);
    const maxTokens = Number(agentDraft.maxTokens);

    if (!name || !type) {
      setAgentError("Name und Typ sind Pflichtfelder.");
      return;
    }
    if (
      !agentDraft.temperature.trim() ||
      !Number.isFinite(temperature) ||
      temperature < 0 ||
      temperature > 2
    ) {
      setAgentError("Die Temperatur muss zwischen 0 und 2 liegen.");
      return;
    }
    if (!Number.isInteger(maxTokens) || maxTokens < 1 || maxTokens > 131072) {
      setAgentError(
        "Max. Tokens muss eine ganze Zahl zwischen 1 und 131.072 sein.",
      );
      return;
    }

    const input = {
      name,
      type,
      description: agentDraft.description.trim() || undefined,
      capabilities,
      isActive: agentDraft.isActive,
      configuration: {
        ...(editingAgent?.configuration ?? {}),
        model: agentDraft.model.trim() || settings.aiModel,
        temperature,
        maxTokens,
      },
    };

    if (editingAgent) {
      updateAgent(editingAgent.id, input);
      notify(`Agent „${name}“ wurde aktualisiert.`);
    } else {
      createAgent(input);
      notify(`Agent „${name}“ wurde erstellt.`);
    }
    setAgentModalOpen(false);
  };

  const toggleAgent = (agent: Agent) => {
    if (!canEdit) return;
    updateAgent(agent.id, { isActive: !agent.isActive });
    notify(
      `Agent „${agent.name}“ wurde ${agent.isActive ? "deaktiviert" : "aktiviert"}.`,
    );
  };

  const openCreateWorkflow = () => {
    if (!canEdit) return;
    setEditingWorkflow(null);
    setWorkflowDraft(emptyWorkflowDraft());
    setWorkflowError("");
    setWorkflowModalOpen(true);
  };

  const openEditWorkflow = (workflow: Workflow) => {
    if (!canEdit) return;
    setEditingWorkflow(workflow);
    setWorkflowDraft({
      name: workflow.name,
      description: workflow.description ?? "",
      triggerType: workflow.triggerType,
      schedule: workflow.schedule ?? "",
      campaignId: workflow.campaignId ?? "",
      isActive: workflow.isActive,
      steps: [...workflow.steps]
        .sort((left, right) => left.order - right.order)
        .map((step) => ({
          id: step.id,
          action: step.action,
          agentId: step.agentId ?? "",
          parameters: JSON.stringify(step.parameters, null, 2),
          condition: step.condition ?? "",
        })),
    });
    setWorkflowError("");
    setWorkflowModalOpen(true);
  };

  const updateStep = (id: string, patch: Partial<StepDraft>) => {
    setWorkflowDraft((current) => ({
      ...current,
      steps: current.steps.map((step) =>
        step.id === id ? { ...step, ...patch } : step,
      ),
    }));
  };

  const removeStep = (id: string) => {
    setWorkflowDraft((current) => ({
      ...current,
      steps: current.steps.filter((step) => step.id !== id),
    }));
  };

  const handleWorkflowSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!canEdit) return;
    const name = workflowDraft.name.trim();
    if (!name) {
      setWorkflowError("Der Workflow braucht einen Namen.");
      return;
    }
    if (
      workflowDraft.triggerType === "scheduled" &&
      !workflowDraft.schedule.trim()
    ) {
      setWorkflowError(
        "Für einen geplanten Workflow ist ein Zeitplan erforderlich.",
      );
      return;
    }
    if (
      workflowDraft.steps.length === 0 ||
      workflowDraft.steps.some((step) => !step.action.trim())
    ) {
      setWorkflowError(
        "Füge mindestens einen vollständig benannten Schritt hinzu.",
      );
      return;
    }
    const allowedConditions = new Set([
      "",
      "always",
      "never",
      "previous.completed",
      "previous.failed",
    ]);
    const invalidConditionIndex = workflowDraft.steps.findIndex(
      (step) => !allowedConditions.has(step.condition.trim().toLowerCase()),
    );
    if (invalidConditionIndex >= 0) {
      setWorkflowError(
        `Schritt ${invalidConditionIndex + 1} enthält eine nicht unterstützte Bedingung.`,
      );
      return;
    }

    try {
      const steps = workflowDraft.steps.map((step, index) => {
        const parsed = JSON.parse(step.parameters || "{}") as unknown;
        if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
          throw new Error(
            `Die Parameter in Schritt ${index + 1} müssen ein JSON-Objekt sein.`,
          );
        }
        return {
          id: step.id.startsWith("draft-step-")
            ? createDraftId("step")
            : step.id,
          order: index + 1,
          action: step.action.trim(),
          agentId: step.agentId || undefined,
          parameters: parsed as Record<string, unknown>,
          condition: step.condition.trim() || undefined,
        };
      });

      const input = {
        name,
        description: workflowDraft.description.trim() || undefined,
        triggerType: workflowDraft.triggerType,
        schedule:
          workflowDraft.triggerType === "scheduled"
            ? workflowDraft.schedule.trim()
            : undefined,
        campaignId: workflowDraft.campaignId || undefined,
        isActive: workflowDraft.isActive,
        steps,
      };

      if (editingWorkflow) {
        updateWorkflow(editingWorkflow.id, input);
        notify(`Workflow „${name}“ wurde aktualisiert.`);
      } else {
        createWorkflow(input);
        notify(`Workflow „${name}“ wurde erstellt.`);
      }
      setWorkflowModalOpen(false);
    } catch (error) {
      setWorkflowError(
        error instanceof Error
          ? error.message
          : "Die Schrittparameter enthalten ungültiges JSON.",
      );
    }
  };

  const toggleWorkflow = (workflow: Workflow) => {
    if (!canEdit) return;
    if (!settings.workflowEngineEnabled && !workflow.isActive) {
      notify(
        "Die Workflow-Engine ist in den Systemeinstellungen pausiert.",
        "error",
      );
      return;
    }
    updateWorkflow(workflow.id, { isActive: !workflow.isActive });
    notify(
      `Workflow „${workflow.name}“ wurde ${workflow.isActive ? "deaktiviert" : "aktiviert"}.`,
    );
  };

  const executeWorkflow = async (workflow: Workflow) => {
    if (!canEdit) return;
    if (!workflow.isActive) {
      notify("Aktiviere den Workflow, bevor du ihn startest.", "error");
      return;
    }
    if (!settings.workflowEngineEnabled) {
      notify(
        "Die Workflow-Engine ist in den Systemeinstellungen pausiert.",
        "error",
      );
      return;
    }
    const unavailableAgent = workflow.steps
      .map((step) => agents.find((agent) => agent.id === step.agentId))
      .find((agent) => agent && !agent.isActive);
    const missingAgent = workflow.steps.some(
      (step) =>
        step.agentId && !agents.some((agent) => agent.id === step.agentId),
    );
    if (unavailableAgent || missingAgent) {
      notify(
        unavailableAgent
          ? `Aktiviere den Agenten „${unavailableAgent.name}“ vor dem Start.`
          : "Mindestens ein Workflow-Schritt verweist auf einen fehlenden Agenten.",
        "error",
      );
      return;
    }
    const running = workflowRuns.some(
      (run) => run.workflowId === workflow.id && run.status === "running",
    );
    if (running) return;
    notify(`Workflow „${workflow.name}“ wurde gestartet.`, "info");
    try {
      const result = await runWorkflow(workflow.id);
      if (result.status === "completed") {
        notify(`Workflow „${workflow.name}“ wurde erfolgreich abgeschlossen.`);
      } else {
        notify(
          result.message ?? `Workflow „${workflow.name}“ ist fehlgeschlagen.`,
          "error",
        );
      }
    } catch (error) {
      notify(
        error instanceof Error
          ? error.message
          : `Workflow „${workflow.name}“ konnte nicht gestartet werden.`,
        "error",
      );
    }
  };

  return (
    <div className="p-4 sm:p-6 md:ml-64 md:p-8">
      <div className="mx-auto max-w-7xl">
        <div className="mb-8 flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
          <div>
            <h1 className="mb-2 text-3xl font-bold text-white">
              Agent Workflows
            </h1>
            <p className="text-gray-400">
              Verwalte KI-Agenten und automatisierte Workflows
            </p>
          </div>
          <button
            type="button"
            onClick={openCreateAgent}
            disabled={!canEdit}
            title={
              canEdit ? undefined : "Besucher können keine Agenten erstellen"
            }
            className="inline-flex w-full items-center justify-center rounded-lg bg-blue-600 px-6 py-3 text-white transition-colors hover:bg-blue-700 sm:w-auto"
          >
            <Bot className="mr-2 h-5 w-5" aria-hidden="true" />
            Neuen Agent erstellen
          </button>
        </div>

        {!canEdit && (
          <div
            role="note"
            className="mb-6 rounded-xl border border-blue-500/20 bg-blue-500/10 px-4 py-3 text-sm text-blue-200"
          >
            Du siehst Agenten und Workflows im Lesemodus. Änderungen und
            Ausführungen sind deaktiviert.
          </div>
        )}

        <section
          aria-labelledby="ai-settings-heading"
          className="mb-8 rounded-xl border border-purple-500/20 bg-gradient-to-r from-purple-900/50 to-blue-900/50 p-5 sm:p-6"
        >
          <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
            <h2
              id="ai-settings-heading"
              className="flex items-center text-xl font-semibold text-white"
            >
              <Settings
                className="mr-2 h-5 w-5 text-purple-400"
                aria-hidden="true"
              />{" "}
              KI-Einstellungen
            </h2>
            <span
              className={`rounded-full px-3 py-1 text-sm ${settings.workflowEngineEnabled ? "bg-green-500/20 text-green-400" : "bg-yellow-500/20 text-yellow-300"}`}
            >
              {settings.workflowEngineEnabled
                ? "Engine aktiv"
                : "Engine pausiert"}
            </span>
          </div>
          <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
            <div className="rounded-lg bg-gray-800/50 p-4">
              <p className="mb-1 text-xs text-gray-400">Provider</p>
              <p className="font-medium text-white">
                {settings.aiProvider === "ollama"
                  ? "Ollama (lokal)"
                  : "Cloud (nicht ausführbar)"}
              </p>
            </div>
            <div className="rounded-lg bg-gray-800/50 p-4">
              <p className="mb-1 text-xs text-gray-400">Modell</p>
              <p className="font-medium text-white">{settings.aiModel}</p>
            </div>
            <div className="rounded-lg bg-gray-800/50 p-4">
              <p className="mb-1 text-xs text-gray-400">Verbindung</p>
              <p className="font-medium text-yellow-300">
                {settings.aiProvider === "ollama"
                  ? `Konfiguriert: ${settings.aiEndpoint}`
                  : "Kein ausführbarer Provider"}
              </p>
              {settings.aiProvider === "ollama" && (
                <p className="mt-1 text-xs text-gray-500">
                  Live-Status im Adminbereich testen
                </p>
              )}
            </div>
          </div>
        </section>

        <section aria-labelledby="agents-heading" className="mb-10">
          <div className="mb-4 flex items-center justify-between gap-3">
            <h2
              id="agents-heading"
              className="text-xl font-semibold text-white"
            >
              Verfügbare Agenten
            </h2>
            <span className="text-sm text-gray-500">
              {agents.length} {agents.length === 1 ? "Agent" : "Agenten"}
            </span>
          </div>
          {agents.length > 0 ? (
            <div className="grid grid-cols-1 gap-6 md:grid-cols-2 xl:grid-cols-3">
              {agents.map((agent) => (
                <article
                  key={agent.id}
                  className={`rounded-xl border p-5 sm:p-6 ${agent.isActive ? "border-purple-500/20 bg-gray-800/50" : "border-gray-700 bg-gray-800/30"}`}
                >
                  <div className="mb-4 flex items-start justify-between gap-3">
                    <div className="flex min-w-0 items-center">
                      <div
                        className={`shrink-0 rounded-lg p-3 ${agent.isActive ? "bg-purple-500/20" : "bg-gray-700"}`}
                      >
                        <Bot
                          className={`h-6 w-6 ${agent.isActive ? "text-purple-400" : "text-gray-400"}`}
                          aria-hidden="true"
                        />
                      </div>
                      <div className="ml-3 min-w-0">
                        <h3 className="truncate font-semibold text-white">
                          {agent.name}
                        </h3>
                        <p className="truncate text-xs text-gray-400">
                          {agent.type}
                        </p>
                      </div>
                    </div>
                    <span
                      className={`shrink-0 rounded px-2 py-1 text-xs font-medium ${agent.isActive ? "bg-green-500/20 text-green-400" : "bg-gray-500/20 text-gray-400"}`}
                    >
                      {agent.isActive ? "Aktiv" : "Inaktiv"}
                    </span>
                  </div>
                  <p className="mb-4 min-h-10 text-sm text-gray-400">
                    {agent.description || "Keine Beschreibung hinterlegt."}
                  </p>
                  <div className="mb-4 flex min-h-6 flex-wrap gap-1">
                    {agent.capabilities.length > 0 ? (
                      agent.capabilities.map((capability) => (
                        <span
                          key={capability}
                          className="rounded bg-purple-500/10 px-2 py-1 text-xs text-purple-400"
                        >
                          {capability}
                        </span>
                      ))
                    ) : (
                      <span className="text-xs text-gray-500">
                        Keine Fähigkeiten hinterlegt
                      </span>
                    )}
                  </div>
                  <p className="mb-4 text-xs text-gray-500">
                    Modell:{" "}
                    <span className="text-gray-300">
                      {configString(agent, "model", settings.aiModel)}
                    </span>
                  </p>
                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={() => openEditAgent(agent)}
                      disabled={!canEdit}
                      className="flex-1 rounded-lg bg-purple-600 px-3 py-2 text-sm text-white transition-colors hover:bg-purple-700"
                    >
                      Konfigurieren
                    </button>
                    <button
                      type="button"
                      onClick={() => toggleAgent(agent)}
                      disabled={!canEdit}
                      aria-label={`${agent.name} ${agent.isActive ? "deaktivieren" : "aktivieren"}`}
                      title={
                        agent.isActive
                          ? "Agent deaktivieren"
                          : "Agent aktivieren"
                      }
                      className={`rounded-lg px-3 py-2 transition-colors ${agent.isActive ? "bg-gray-700 text-gray-300 hover:bg-gray-600" : "bg-green-500/15 text-green-300 hover:bg-green-500/25"}`}
                    >
                      <Power className="h-4 w-4" aria-hidden="true" />
                    </button>
                    <button
                      type="button"
                      onClick={() =>
                        setDeleteTarget({
                          kind: "agent",
                          id: agent.id,
                          name: agent.name,
                        })
                      }
                      disabled={!canEdit}
                      aria-label={`${agent.name} löschen`}
                      title="Agent löschen"
                      className="rounded-lg bg-red-500/10 px-3 py-2 text-red-300 hover:bg-red-500/20"
                    >
                      <Trash2 className="h-4 w-4" aria-hidden="true" />
                    </button>
                  </div>
                </article>
              ))}
            </div>
          ) : (
            <div className="rounded-xl border border-dashed border-gray-700 bg-gray-800/20 px-6 py-10 text-center">
              <Bot
                className="mx-auto mb-3 h-12 w-12 text-gray-600"
                aria-hidden="true"
              />
              <h3 className="font-semibold text-gray-300">
                Noch keine Agenten
              </h3>
              <p className="mt-1 text-sm text-gray-500">
                Erstelle einen Agenten und weise ihn anschließend
                Workflow-Schritten zu.
              </p>
              {canEdit && (
                <button
                  type="button"
                  onClick={openCreateAgent}
                  className="mt-5 rounded-lg bg-purple-600 px-4 py-2 text-white hover:bg-purple-700"
                >
                  Agent erstellen
                </button>
              )}
            </div>
          )}
        </section>

        <section aria-labelledby="workflows-heading">
          <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2
                id="workflows-heading"
                className="text-xl font-semibold text-white"
              >
                Workflows
              </h2>
              <p className="mt-1 text-sm text-gray-500">
                Automatisiere wiederkehrende Kampagnenabläufe.
              </p>
            </div>
            <button
              type="button"
              onClick={openCreateWorkflow}
              disabled={!canEdit}
              className="inline-flex items-center rounded-lg bg-gray-700 px-4 py-2 text-sm text-gray-200 hover:bg-gray-600"
            >
              <Plus className="mr-2 h-4 w-4" aria-hidden="true" /> Neuer
              Workflow
            </button>
          </div>
          {workflows.length > 0 ? (
            <div className="space-y-4">
              {workflows.map((workflow) => {
                const latestRun = workflowRuns.find(
                  (run) => run.workflowId === workflow.id,
                );
                const isRunning = latestRun?.status === "running";
                const hasUnavailableAgent = workflow.steps.some(
                  (step) =>
                    step.agentId &&
                    !agents.some(
                      (agent) => agent.id === step.agentId && agent.isActive,
                    ),
                );
                const runInfo = latestRun ? runPresentation(latestRun) : null;
                const RunIcon = runInfo?.icon;
                return (
                  <article
                    key={workflow.id}
                    className="rounded-xl border border-gray-700 bg-gray-800/50 p-5 sm:p-6"
                  >
                    <div className="mb-4 flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                      <div className="flex min-w-0 items-start">
                        <div
                          className={`shrink-0 rounded-lg p-3 ${workflow.isActive ? "bg-blue-500/20" : "bg-gray-700"}`}
                        >
                          <Zap
                            className={`h-6 w-6 ${workflow.isActive ? "text-blue-400" : "text-gray-400"}`}
                            aria-hidden="true"
                          />
                        </div>
                        <div className="ml-4 min-w-0">
                          <h3 className="font-semibold text-white sm:text-lg">
                            {workflow.name}
                          </h3>
                          <p className="mt-1 text-sm text-gray-400">
                            {workflow.description ||
                              "Keine Beschreibung hinterlegt."}
                          </p>
                        </div>
                      </div>
                      <span
                        className={`self-start rounded-full px-3 py-1 text-xs font-medium ${workflow.isActive ? "bg-green-500/20 text-green-400" : "bg-gray-500/20 text-gray-400"}`}
                      >
                        {workflow.isActive ? "Aktiv" : "Inaktiv"}
                      </span>
                    </div>

                    <div className="mb-4 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
                      <div className="flex items-center text-sm">
                        <Activity
                          className="mr-2 h-4 w-4 text-blue-400"
                          aria-hidden="true"
                        />
                        <span className="text-gray-400">Typ:</span>
                        <span className="ml-2 capitalize text-white">
                          {workflow.triggerType}
                        </span>
                      </div>
                      {workflow.schedule && (
                        <div className="flex items-center text-sm">
                          <Clock
                            className="mr-2 h-4 w-4 text-yellow-400"
                            aria-hidden="true"
                          />
                          <span className="text-gray-400">Zeitplan:</span>
                          <span className="ml-2 break-all font-mono text-white">
                            {workflow.schedule}
                          </span>
                        </div>
                      )}
                      <div className="flex items-center text-sm">
                        <Bot
                          className="mr-2 h-4 w-4 text-purple-400"
                          aria-hidden="true"
                        />
                        <span className="text-gray-400">Schritte:</span>
                        <span className="ml-2 text-white">
                          {workflow.steps.length}
                        </span>
                      </div>
                    </div>

                    <div className="border-t border-gray-700 pt-4">
                      <p className="mb-3 text-sm text-gray-400">
                        Workflow-Schritte:
                      </p>
                      {workflow.steps.length > 0 ? (
                        <ol className="flex flex-wrap gap-2">
                          {[...workflow.steps]
                            .sort((left, right) => left.order - right.order)
                            .map((step, index) => (
                              <li
                                key={step.id}
                                className="flex items-center rounded-lg bg-gray-800 px-3 py-2"
                              >
                                <span className="mr-2 text-xs text-gray-500">
                                  {index + 1}.
                                </span>
                                <span className="text-sm text-white">
                                  {step.action}
                                </span>
                                {step.agentId && (
                                  <Bot
                                    className="ml-2 h-3 w-3 text-purple-400"
                                    aria-label="Agent zugewiesen"
                                  />
                                )}
                              </li>
                            ))}
                        </ol>
                      ) : (
                        <p className="text-sm text-gray-500">
                          Keine Schritte konfiguriert.
                        </p>
                      )}
                    </div>

                    {latestRun && runInfo && RunIcon && (
                      <div className="mt-4 rounded-lg bg-gray-900/60 px-3 py-2">
                        <div
                          role="status"
                          aria-live="polite"
                          className={`flex flex-wrap items-center gap-x-2 gap-y-1 text-sm ${runInfo.className}`}
                        >
                          <RunIcon
                            className={`h-4 w-4 ${isRunning ? "animate-spin" : ""}`}
                            aria-hidden="true"
                          />
                          <span className="font-medium">{runInfo.label}</span>
                          <span className="text-gray-500">·</span>
                          <time
                            dateTime={new Date(
                              latestRun.startedAt,
                            ).toISOString()}
                            className="text-gray-400"
                          >
                            {format(
                              new Date(latestRun.startedAt),
                              "dd.MM.yyyy HH:mm:ss",
                              { locale: de },
                            )}
                          </time>
                          {latestRun.message && (
                            <span className="w-full text-xs text-gray-400 sm:w-auto">
                              {latestRun.message}
                            </span>
                          )}
                        </div>
                        {latestRun.stepResults &&
                          latestRun.stepResults.length > 0 && (
                            <details className="mt-3 border-t border-gray-700 pt-3">
                              <summary className="cursor-pointer text-xs font-medium text-gray-300 hover:text-white">
                                Schrittergebnisse anzeigen (
                                {latestRun.stepResults.length})
                              </summary>
                              <ol className="mt-3 space-y-3">
                                {latestRun.stepResults.map((result, index) => {
                                  const assignedAgent = result.agentId
                                    ? agents.find(
                                        (agent) => agent.id === result.agentId,
                                      )
                                    : undefined;
                                  return (
                                    <li
                                      key={`${result.stepId}-${index}`}
                                      className="rounded-lg border border-gray-700 bg-gray-950/60 p-3"
                                    >
                                      <div className="flex flex-wrap items-center gap-2 text-xs">
                                        <span className="font-medium text-white">
                                          {index + 1}. {result.action}
                                        </span>
                                        <span
                                          className={`rounded px-2 py-0.5 ${
                                            result.status === "completed"
                                              ? "bg-green-500/15 text-green-300"
                                              : result.status === "failed"
                                                ? "bg-red-500/15 text-red-300"
                                                : result.status === "running"
                                                  ? "bg-blue-500/15 text-blue-300"
                                                  : "bg-gray-700 text-gray-400"
                                          }`}
                                        >
                                          {result.status === "completed"
                                            ? "Abgeschlossen"
                                            : result.status === "failed"
                                              ? "Fehlgeschlagen"
                                              : result.status === "running"
                                                ? "Läuft"
                                                : "Übersprungen"}
                                        </span>
                                        <span className="text-gray-500">
                                          {assignedAgent
                                            ? `${assignedAgent.name}${result.model ? ` · ${result.model}` : ""}`
                                            : "Lokaler Datenschritt"}
                                        </span>
                                      </div>
                                      {result.output && (
                                        <pre className="mt-2 max-h-72 overflow-auto whitespace-pre-wrap break-words rounded bg-gray-900 p-3 text-xs text-gray-300">
                                          {result.output}
                                        </pre>
                                      )}
                                      {result.error && (
                                        <p className="mt-2 whitespace-pre-wrap break-words text-xs text-red-300">
                                          {result.error}
                                        </p>
                                      )}
                                      {(result.promptTokens !== undefined ||
                                        result.completionTokens !== undefined ||
                                        result.totalDurationMs !==
                                          undefined) && (
                                        <p className="mt-2 text-[11px] text-gray-500">
                                          {result.promptTokens !== undefined
                                            ? `${result.promptTokens} Prompt-Tokens`
                                            : "Prompt-Tokens unbekannt"}
                                          {" · "}
                                          {result.completionTokens !== undefined
                                            ? `${result.completionTokens} Antwort-Tokens`
                                            : "Antwort-Tokens unbekannt"}
                                          {result.totalDurationMs !== undefined
                                            ? ` · ${(result.totalDurationMs / 1000).toFixed(2)} s`
                                            : ""}
                                        </p>
                                      )}
                                    </li>
                                  );
                                })}
                              </ol>
                            </details>
                          )}
                      </div>
                    )}

                    <div className="mt-4 flex flex-wrap gap-2">
                      <button
                        type="button"
                        onClick={() => toggleWorkflow(workflow)}
                        disabled={
                          !canEdit ||
                          (!settings.workflowEngineEnabled &&
                            !workflow.isActive)
                        }
                        className={`inline-flex items-center rounded-lg px-4 py-2 ${workflow.isActive ? "bg-red-500/20 text-red-400 hover:bg-red-500/30" : "bg-green-500/20 text-green-400 hover:bg-green-500/30"}`}
                      >
                        {workflow.isActive ? (
                          <Pause className="mr-2 h-4 w-4" aria-hidden="true" />
                        ) : (
                          <Play className="mr-2 h-4 w-4" aria-hidden="true" />
                        )}
                        {workflow.isActive ? "Deaktivieren" : "Aktivieren"}
                      </button>
                      <button
                        type="button"
                        onClick={() => openEditWorkflow(workflow)}
                        disabled={!canEdit}
                        className="rounded-lg bg-gray-700 px-4 py-2 text-gray-300 hover:bg-gray-600"
                      >
                        Bearbeiten
                      </button>
                      <button
                        type="button"
                        onClick={() =>
                          setDeleteTarget({
                            kind: "workflow",
                            id: workflow.id,
                            name: workflow.name,
                          })
                        }
                        disabled={!canEdit}
                        aria-label={`${workflow.name} löschen`}
                        title="Workflow löschen"
                        className="rounded-lg bg-red-500/10 px-3 py-2 text-red-300 hover:bg-red-500/20"
                      >
                        <Trash2 className="h-4 w-4" aria-hidden="true" />
                      </button>
                      <button
                        type="button"
                        onClick={() => executeWorkflow(workflow)}
                        disabled={
                          !canEdit ||
                          !workflow.isActive ||
                          !settings.workflowEngineEnabled ||
                          isRunning ||
                          hasUnavailableAgent ||
                          workflow.steps.length === 0
                        }
                        title={
                          !settings.workflowEngineEnabled
                            ? "Die Workflow-Engine ist pausiert"
                            : !workflow.isActive
                              ? "Der Workflow ist deaktiviert"
                              : hasUnavailableAgent
                                ? "Ein zugewiesener Agent fehlt oder ist inaktiv"
                                : undefined
                        }
                        className="inline-flex items-center rounded-lg bg-blue-600 px-4 py-2 text-white hover:bg-blue-700"
                      >
                        {isRunning && (
                          <LoaderCircle
                            className="mr-2 h-4 w-4 animate-spin"
                            aria-hidden="true"
                          />
                        )}
                        {isRunning ? "Wird ausgeführt …" : "Jetzt ausführen"}
                      </button>
                    </div>
                  </article>
                );
              })}
            </div>
          ) : (
            <div className="rounded-xl border border-dashed border-gray-700 bg-gray-800/20 px-6 py-10 text-center">
              <Zap
                className="mx-auto mb-3 h-12 w-12 text-gray-600"
                aria-hidden="true"
              />
              <h3 className="font-semibold text-gray-300">
                Noch keine Workflows
              </h3>
              <p className="mt-1 text-sm text-gray-500">
                Erstelle einen Ablauf aus manuellen oder automatisierten
                Schritten.
              </p>
              {canEdit && (
                <button
                  type="button"
                  onClick={openCreateWorkflow}
                  className="mt-5 rounded-lg bg-blue-600 px-4 py-2 text-white hover:bg-blue-700"
                >
                  Workflow erstellen
                </button>
              )}
            </div>
          )}
        </section>
      </div>

      <Modal
        open={agentModalOpen}
        onClose={() => setAgentModalOpen(false)}
        title={editingAgent ? "Agent konfigurieren" : "Neuen Agent erstellen"}
        size="lg"
      >
        <form onSubmit={handleAgentSubmit} noValidate>
          {agentError && (
            <p
              role="alert"
              className="mb-5 rounded-lg border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-300"
            >
              {agentError}
            </p>
          )}
          <div className="grid gap-5 sm:grid-cols-2">
            <div>
              <label
                htmlFor="agent-name"
                className="mb-2 block text-sm font-medium text-gray-200"
              >
                Name *
              </label>
              <input
                id="agent-name"
                value={agentDraft.name}
                onChange={(event) =>
                  setAgentDraft((current) => ({
                    ...current,
                    name: event.target.value,
                  }))
                }
                required
                className="w-full rounded-lg border border-gray-600 bg-gray-900 px-3 py-2.5 text-white"
              />
            </div>
            <div>
              <label
                htmlFor="agent-type"
                className="mb-2 block text-sm font-medium text-gray-200"
              >
                Typ *
              </label>
              <input
                id="agent-type"
                value={agentDraft.type}
                onChange={(event) =>
                  setAgentDraft((current) => ({
                    ...current,
                    type: event.target.value,
                  }))
                }
                required
                placeholder="z. B. llm-writer"
                className="w-full rounded-lg border border-gray-600 bg-gray-900 px-3 py-2.5 text-white placeholder:text-gray-500"
              />
            </div>
            <div className="sm:col-span-2">
              <label
                htmlFor="agent-description"
                className="mb-2 block text-sm font-medium text-gray-200"
              >
                Beschreibung
              </label>
              <textarea
                id="agent-description"
                rows={3}
                value={agentDraft.description}
                onChange={(event) =>
                  setAgentDraft((current) => ({
                    ...current,
                    description: event.target.value,
                  }))
                }
                className="w-full resize-y rounded-lg border border-gray-600 bg-gray-900 px-3 py-2.5 text-white"
              />
            </div>
            <div className="sm:col-span-2">
              <label
                htmlFor="agent-capabilities"
                className="mb-2 block text-sm font-medium text-gray-200"
              >
                Fähigkeiten
              </label>
              <input
                id="agent-capabilities"
                value={agentDraft.capabilities}
                onChange={(event) =>
                  setAgentDraft((current) => ({
                    ...current,
                    capabilities: event.target.value,
                  }))
                }
                placeholder="content-writing, translation, analysis"
                className="w-full rounded-lg border border-gray-600 bg-gray-900 px-3 py-2.5 text-white placeholder:text-gray-500"
              />
              <p className="mt-2 text-xs text-gray-400">
                Mehrere Fähigkeiten mit Kommas trennen. Agent-Schritte werden
                live über Ollama ausgeführt; externe Veröffentlichungen oder
                E-Mails benötigen eigene Integrationen.
              </p>
            </div>
            <div>
              <label
                htmlFor="agent-model"
                className="mb-2 block text-sm font-medium text-gray-200"
              >
                Modell
              </label>
              <input
                id="agent-model"
                value={agentDraft.model}
                onChange={(event) =>
                  setAgentDraft((current) => ({
                    ...current,
                    model: event.target.value,
                  }))
                }
                className="w-full rounded-lg border border-gray-600 bg-gray-900 px-3 py-2.5 text-white"
              />
              <p className="mt-2 text-xs text-gray-400">
                Muss als installiertes Ollama-Modell am konfigurierten Endpoint
                verfügbar sein.
              </p>
            </div>
            <div>
              <label
                htmlFor="agent-temperature"
                className="mb-2 block text-sm font-medium text-gray-200"
              >
                Temperatur (0–2)
              </label>
              <input
                id="agent-temperature"
                type="number"
                min="0"
                max="2"
                step="0.1"
                value={agentDraft.temperature}
                onChange={(event) =>
                  setAgentDraft((current) => ({
                    ...current,
                    temperature: event.target.value,
                  }))
                }
                className="w-full rounded-lg border border-gray-600 bg-gray-900 px-3 py-2.5 text-white"
              />
            </div>
            <div>
              <label
                htmlFor="agent-tokens"
                className="mb-2 block text-sm font-medium text-gray-200"
              >
                Max. Tokens
              </label>
              <input
                id="agent-tokens"
                type="number"
                min="1"
                max="131072"
                step="1"
                value={agentDraft.maxTokens}
                onChange={(event) =>
                  setAgentDraft((current) => ({
                    ...current,
                    maxTokens: event.target.value,
                  }))
                }
                className="w-full rounded-lg border border-gray-600 bg-gray-900 px-3 py-2.5 text-white"
              />
            </div>
            <label className="flex items-center gap-3 self-end rounded-lg border border-gray-700 bg-gray-900/60 px-3 py-2.5 text-sm text-gray-200">
              <input
                type="checkbox"
                checked={agentDraft.isActive}
                onChange={(event) =>
                  setAgentDraft((current) => ({
                    ...current,
                    isActive: event.target.checked,
                  }))
                }
                className="h-4 w-4 rounded"
              />{" "}
              Agent ist aktiv
            </label>
          </div>
          <div className="mt-6 flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
            <button
              type="button"
              onClick={() => setAgentModalOpen(false)}
              className="rounded-lg bg-gray-700 px-4 py-2 text-gray-200 hover:bg-gray-600"
            >
              Abbrechen
            </button>
            <button
              type="submit"
              className="rounded-lg bg-purple-600 px-4 py-2 font-medium text-white hover:bg-purple-700"
            >
              {editingAgent ? "Änderungen speichern" : "Agent erstellen"}
            </button>
          </div>
        </form>
      </Modal>

      <Modal
        open={workflowModalOpen}
        onClose={() => setWorkflowModalOpen(false)}
        title={
          editingWorkflow ? "Workflow bearbeiten" : "Neuen Workflow erstellen"
        }
        size="xl"
      >
        <form onSubmit={handleWorkflowSubmit} noValidate>
          {workflowError && (
            <p
              role="alert"
              className="mb-5 rounded-lg border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-300"
            >
              {workflowError}
            </p>
          )}
          <div className="grid gap-5 sm:grid-cols-2">
            <div>
              <label
                htmlFor="workflow-name"
                className="mb-2 block text-sm font-medium text-gray-200"
              >
                Name *
              </label>
              <input
                id="workflow-name"
                value={workflowDraft.name}
                onChange={(event) =>
                  setWorkflowDraft((current) => ({
                    ...current,
                    name: event.target.value,
                  }))
                }
                required
                className="w-full rounded-lg border border-gray-600 bg-gray-900 px-3 py-2.5 text-white"
              />
            </div>
            <div>
              <label
                htmlFor="workflow-trigger"
                className="mb-2 block text-sm font-medium text-gray-200"
              >
                Auslöser *
              </label>
              <select
                id="workflow-trigger"
                value={workflowDraft.triggerType}
                onChange={(event) =>
                  setWorkflowDraft((current) => ({
                    ...current,
                    triggerType: event.target.value as Workflow["triggerType"],
                  }))
                }
                className="w-full rounded-lg border border-gray-600 bg-gray-900 px-3 py-2.5 text-white"
              >
                <option value="manual">Manuell</option>
                <option value="scheduled">Zeitgesteuert</option>
                <option value="event">Ereignis</option>
              </select>
            </div>
            <div className="sm:col-span-2">
              <label
                htmlFor="workflow-description"
                className="mb-2 block text-sm font-medium text-gray-200"
              >
                Beschreibung
              </label>
              <textarea
                id="workflow-description"
                rows={2}
                value={workflowDraft.description}
                onChange={(event) =>
                  setWorkflowDraft((current) => ({
                    ...current,
                    description: event.target.value,
                  }))
                }
                className="w-full resize-y rounded-lg border border-gray-600 bg-gray-900 px-3 py-2.5 text-white"
              />
            </div>
            {workflowDraft.triggerType === "scheduled" && (
              <div>
                <label
                  htmlFor="workflow-schedule"
                  className="mb-2 block text-sm font-medium text-gray-200"
                >
                  Zeitplan (Cron) *
                </label>
                <input
                  id="workflow-schedule"
                  value={workflowDraft.schedule}
                  onChange={(event) =>
                    setWorkflowDraft((current) => ({
                      ...current,
                      schedule: event.target.value,
                    }))
                  }
                  placeholder="0 9 * * *"
                  className="w-full rounded-lg border border-gray-600 bg-gray-900 px-3 py-2.5 font-mono text-white placeholder:text-gray-500"
                />
              </div>
            )}
            <div>
              <label
                htmlFor="workflow-campaign"
                className="mb-2 block text-sm font-medium text-gray-200"
              >
                Kampagne
              </label>
              <select
                id="workflow-campaign"
                value={workflowDraft.campaignId}
                onChange={(event) =>
                  setWorkflowDraft((current) => ({
                    ...current,
                    campaignId: event.target.value,
                  }))
                }
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
            <label className="flex items-center gap-3 self-end rounded-lg border border-gray-700 bg-gray-900/60 px-3 py-2.5 text-sm text-gray-200">
              <input
                type="checkbox"
                checked={workflowDraft.isActive}
                onChange={(event) =>
                  setWorkflowDraft((current) => ({
                    ...current,
                    isActive: event.target.checked,
                  }))
                }
                className="h-4 w-4 rounded"
              />{" "}
              Workflow ist aktiv
            </label>
          </div>

          <div className="mt-7 border-t border-gray-700 pt-6">
            <div className="mb-4 flex items-center justify-between gap-3">
              <div>
                <h3 className="font-semibold text-white">Schritte</h3>
                <p className="mt-1 text-xs text-gray-400">
                  Parameter werden als JSON-Objekt gespeichert.
                </p>
              </div>
              <button
                type="button"
                onClick={() =>
                  setWorkflowDraft((current) => ({
                    ...current,
                    steps: [...current.steps, newStepDraft()],
                  }))
                }
                className="inline-flex items-center rounded-lg bg-blue-500/15 px-3 py-2 text-sm text-blue-300 hover:bg-blue-500/25"
              >
                <Plus className="mr-1 h-4 w-4" aria-hidden="true" /> Schritt
              </button>
            </div>
            <div className="space-y-4">
              {workflowDraft.steps.map((step, index) => (
                <fieldset
                  key={step.id}
                  className="rounded-xl border border-gray-700 bg-gray-900/40 p-4"
                >
                  <legend className="px-2 text-sm font-medium text-gray-300">
                    Schritt {index + 1}
                  </legend>
                  <div className="grid gap-4 sm:grid-cols-[1fr_1fr_auto]">
                    <div>
                      <label
                        htmlFor={`step-action-${step.id}`}
                        className="mb-2 block text-xs font-medium text-gray-400"
                      >
                        Aktion *
                      </label>
                      <input
                        id={`step-action-${step.id}`}
                        value={step.action}
                        onChange={(event) =>
                          updateStep(step.id, { action: event.target.value })
                        }
                        placeholder="z. B. generate-content"
                        className="w-full rounded-lg border border-gray-600 bg-gray-900 px-3 py-2 text-sm text-white placeholder:text-gray-500"
                      />
                    </div>
                    <div>
                      <label
                        htmlFor={`step-agent-${step.id}`}
                        className="mb-2 block text-xs font-medium text-gray-400"
                      >
                        Agent
                      </label>
                      <select
                        id={`step-agent-${step.id}`}
                        value={step.agentId}
                        onChange={(event) =>
                          updateStep(step.id, { agentId: event.target.value })
                        }
                        className="w-full rounded-lg border border-gray-600 bg-gray-900 px-3 py-2 text-sm text-white"
                      >
                        <option value="">Kein Agent</option>
                        {agents.map((agent) => (
                          <option key={agent.id} value={agent.id}>
                            {agent.name}
                            {agent.isActive ? "" : " (inaktiv)"}
                          </option>
                        ))}
                      </select>
                    </div>
                    <button
                      type="button"
                      onClick={() => removeStep(step.id)}
                      disabled={workflowDraft.steps.length === 1}
                      aria-label={`Schritt ${index + 1} entfernen`}
                      title="Schritt entfernen"
                      className="self-end rounded-lg bg-red-500/10 p-2.5 text-red-300 hover:bg-red-500/20"
                    >
                      <Trash2 className="h-4 w-4" aria-hidden="true" />
                    </button>
                  </div>
                  <details className="mt-4">
                    <summary className="cursor-pointer text-sm text-gray-400 hover:text-gray-200">
                      Erweiterte Einstellungen
                    </summary>
                    <div className="mt-4 grid gap-4 sm:grid-cols-2">
                      <div>
                        <label
                          htmlFor={`step-parameters-${step.id}`}
                          className="mb-2 block text-xs font-medium text-gray-400"
                        >
                          Parameter (JSON)
                        </label>
                        <textarea
                          id={`step-parameters-${step.id}`}
                          rows={4}
                          spellCheck={false}
                          value={step.parameters}
                          onChange={(event) =>
                            updateStep(step.id, {
                              parameters: event.target.value,
                            })
                          }
                          className="w-full resize-y rounded-lg border border-gray-600 bg-gray-950 px-3 py-2 font-mono text-xs text-white"
                        />
                      </div>
                      <div>
                        <label
                          htmlFor={`step-condition-${step.id}`}
                          className="mb-2 block text-xs font-medium text-gray-400"
                        >
                          Bedingung
                        </label>
                        <textarea
                          id={`step-condition-${step.id}`}
                          rows={4}
                          value={step.condition}
                          onChange={(event) =>
                            updateStep(step.id, {
                              condition: event.target.value,
                            })
                          }
                          placeholder="Optional: always, never, previous.completed oder previous.failed"
                          className="w-full resize-y rounded-lg border border-gray-600 bg-gray-950 px-3 py-2 text-sm text-white placeholder:text-gray-500"
                        />
                        <p className="mt-2 text-xs text-gray-500">
                          Bedingungen verwenden absichtlich eine kleine, sichere
                          Ausdrucksmenge und führen kein JavaScript aus.
                        </p>
                      </div>
                    </div>
                  </details>
                </fieldset>
              ))}
            </div>
          </div>

          <div className="mt-6 flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
            <button
              type="button"
              onClick={() => setWorkflowModalOpen(false)}
              className="rounded-lg bg-gray-700 px-4 py-2 text-gray-200 hover:bg-gray-600"
            >
              Abbrechen
            </button>
            <button
              type="submit"
              className="rounded-lg bg-blue-600 px-4 py-2 font-medium text-white hover:bg-blue-700"
            >
              {editingWorkflow ? "Änderungen speichern" : "Workflow erstellen"}
            </button>
          </div>
        </form>
      </Modal>
      <ConfirmDialog
        open={Boolean(deleteTarget)}
        onClose={() => setDeleteTarget(null)}
        onConfirm={() => {
          if (!canEdit || !deleteTarget) return;
          if (deleteTarget.kind === "agent") deleteAgent(deleteTarget.id);
          else deleteWorkflow(deleteTarget.id);
          notify(
            `${deleteTarget.kind === "agent" ? "Agent" : "Workflow"} „${deleteTarget.name}“ wurde gelöscht.`,
          );
        }}
        title={`${deleteTarget?.kind === "agent" ? "Agent" : "Workflow"} löschen?`}
        message={
          deleteTarget?.kind === "agent"
            ? `„${deleteTarget.name}“ wird auch aus Zuweisungen und Workflow-Schritten entfernt.`
            : `„${deleteTarget?.name ?? ""}“ und seine Ausführungshistorie werden entfernt.`
        }
        confirmLabel="Löschen"
        danger
      />
    </div>
  );
}
