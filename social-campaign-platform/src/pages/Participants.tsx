import { useCallback, useMemo, useState, type FormEvent } from "react";
import {
  Bot,
  CircleUserRound,
  Edit3,
  Plus,
  Search,
  Trash2,
  User,
  UserPlus,
  Users,
  X,
} from "lucide-react";
import ConfirmDialog from "../components/ConfirmDialog";
import Modal from "../components/Modal";
import Avatar from "../components/Avatar";
import { useAppData } from "../contexts/app-data";
import { useAuth } from "../contexts/auth";
import { useFeedback } from "../contexts/feedback";
import type { Participant } from "../types";
import { isBackendEnabled, sendBackendInvitation } from "../services/backend";

type ParticipantStatus = NonNullable<Participant["status"]>;
type ParticipantModalMode = "invite" | "edit" | null;

interface ParticipantFormState {
  name: string;
  email: string;
  role: string;
  status: ParticipantStatus;
  campaignIds: string[];
}

const emptyParticipantForm: ParticipantFormState = {
  name: "",
  email: "",
  role: "",
  status: "invited",
  campaignIds: [],
};

const statusOptions: Array<{ value: ParticipantStatus; label: string }> = [
  { value: "active", label: "Aktiv" },
  { value: "invited", label: "Eingeladen" },
  { value: "inactive", label: "Inaktiv" },
];

function participantStatus(participant: Participant): ParticipantStatus {
  return participant.status ?? "active";
}

function statusLabel(status: ParticipantStatus): string {
  return (
    statusOptions.find((option) => option.value === status)?.label ?? status
  );
}

function statusStyle(status: ParticipantStatus): string {
  if (status === "active")
    return "border-green-500/20 bg-green-500/10 text-green-300";
  if (status === "invited")
    return "border-amber-500/20 bg-amber-500/10 text-amber-300";
  return "border-gray-500/20 bg-gray-500/10 text-gray-300";
}

export default function Participants() {
  const { canEdit, user } = useAuth();
  const {
    campaigns,
    deleteParticipant,
    inviteParticipant,
    participants,
    updateParticipant,
  } = useAppData();
  const { notify } = useFeedback();

  const [searchTerm, setSearchTerm] = useState("");
  const [modalMode, setModalMode] = useState<ParticipantModalMode>(null);
  const [participantForm, setParticipantForm] =
    useState<ParticipantFormState>(emptyParticipantForm);
  const [editingParticipant, setEditingParticipant] =
    useState<Participant | null>(null);
  const [participantToDelete, setParticipantToDelete] =
    useState<Participant | null>(null);

  const campaignById = useMemo(
    () => new Map(campaigns.map((campaign) => [campaign.id, campaign])),
    [campaigns],
  );
  const normalizedSearch = searchTerm.trim().toLocaleLowerCase("de");
  const filteredParticipants = useMemo(() => {
    if (!normalizedSearch) return participants;
    return participants.filter((participant) => {
      const status = participantStatus(participant);
      const searchableValues = [
        participant.name,
        participant.email ?? "",
        participant.role,
        participant.agentId ? "Agent KI" : "Mensch",
        status,
        statusLabel(status),
        ...participant.campaignIds.map(
          (campaignId) => campaignById.get(campaignId)?.name ?? campaignId,
        ),
      ];
      return searchableValues.some((value) =>
        value.toLocaleLowerCase("de").includes(normalizedSearch),
      );
    });
  }, [campaignById, normalizedSearch, participants]);

  const humanCount = participants.filter(
    (participant) => !participant.agentId,
  ).length;
  const agentCount = participants.filter((participant) =>
    Boolean(participant.agentId),
  ).length;

  const closeParticipantModal = useCallback(() => {
    setModalMode(null);
    setEditingParticipant(null);
    setParticipantForm(emptyParticipantForm);
  }, []);

  const openInviteModal = () => {
    if (!canEdit) {
      notify("Besucher können keine Teilnehmer einladen.", "info");
      return;
    }
    setEditingParticipant(null);
    setParticipantForm(emptyParticipantForm);
    setModalMode("invite");
  };

  const openEditModal = (participant: Participant) => {
    if (!canEdit) return;
    setEditingParticipant(participant);
    setParticipantForm({
      name: participant.name,
      email: participant.email ?? "",
      role: participant.role,
      status: participantStatus(participant),
      campaignIds: [...participant.campaignIds],
    });
    setModalMode("edit");
  };

  const handleParticipantSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!canEdit || !modalMode) return;

    const name = participantForm.name.trim();
    const email = participantForm.email.trim().toLowerCase();
    const role = participantForm.role.trim();
    if (!name || !role || (modalMode === "invite" && !email)) {
      notify("Name, Rolle und E-Mail-Adresse sind erforderlich.", "error");
      return;
    }
    if (email && !/^\S+@\S+\.\S+$/.test(email)) {
      notify("Bitte gib eine gültige E-Mail-Adresse ein.", "error");
      return;
    }
    if (
      email &&
      participants.some(
        (participant) =>
          participant.id !== editingParticipant?.id &&
          participant.email?.toLowerCase() === email,
      )
    ) {
      notify(
        "Für diese E-Mail-Adresse gibt es bereits einen Teilnehmer.",
        "error",
      );
      return;
    }

    const campaignIds = participantForm.campaignIds.filter((campaignId) =>
      campaignById.has(campaignId),
    );
    if (modalMode === "invite") {
      if (await isBackendEnabled()) {
        try {
          await sendBackendInvitation({
            name,
            email,
            role: /visitor|gast|stakeholder|lese/i.test(role)
              ? "Visitor"
              : /agent|ki|ai/i.test(role)
                ? "Agent"
                : "Worker",
            campaignIds,
          });
        } catch (error) {
          notify(
            error instanceof Error
              ? error.message
              : "Die Einladung konnte nicht gesendet werden.",
            "error",
          );
          return;
        }
      }
      inviteParticipant({
        name,
        email,
        role,
        status: participantForm.status,
        campaignIds,
      });
      notify(`${name} wurde eingeladen.`);
    } else if (editingParticipant) {
      updateParticipant(editingParticipant.id, {
        name,
        email: email || undefined,
        role,
        status: participantForm.status,
        campaignIds,
      });
      notify(`${name} wurde aktualisiert.`);
    }
    closeParticipantModal();
  };

  const handleStatusChange = (
    participant: Participant,
    status: ParticipantStatus,
  ) => {
    if (!canEdit) return;
    if (participant.agentId) {
      notify(
        "Den Betriebsstatus verknüpfter Agenten änderst du unter Agent Workflows.",
        "info",
      );
      return;
    }
    updateParticipant(participant.id, { status });
    notify(`Status von ${participant.name}: ${statusLabel(status)}.`);
  };

  const removeCampaign = (participant: Participant, campaignId: string) => {
    if (!canEdit) return;
    updateParticipant(participant.id, {
      campaignIds: participant.campaignIds.filter((id) => id !== campaignId),
    });
    notify(
      `${campaignById.get(campaignId)?.name ?? "Kampagne"} wurde von ${participant.name} entfernt.`,
    );
  };

  const handleDelete = () => {
    if (!participantToDelete || !canEdit) return;
    if (participantToDelete.userId || participantToDelete.agentId) {
      notify(
        "Verknüpfte Identitäten können hier deaktiviert, aber nur in der Benutzer- oder Agentenverwaltung gelöscht werden.",
        "error",
      );
      setParticipantToDelete(null);
      return;
    }
    deleteParticipant(participantToDelete.id);
    notify(
      `${participantToDelete.name} wurde aus der Beteiligtenliste entfernt.`,
    );
    setParticipantToDelete(null);
  };

  const toggleCampaign = (campaignId: string) => {
    setParticipantForm((current) => ({
      ...current,
      campaignIds: current.campaignIds.includes(campaignId)
        ? current.campaignIds.filter((id) => id !== campaignId)
        : [...current.campaignIds, campaignId],
    }));
  };

  const renderIdentity = (participant: Participant) => (
    <div className="flex min-w-0 items-center">
      {participant.agentId ? (
        <span className="mr-3 flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-purple-500/20">
          <Bot className="h-5 w-5 text-purple-400" aria-hidden="true" />
        </span>
      ) : (
        <Avatar
          src={participant.avatar}
          name={participant.name}
          className="mr-3 h-10 w-10 shrink-0 rounded-full object-cover"
        />
      )}
      <span className="min-w-0">
        <span className="block truncate font-medium text-white">
          {participant.name}
        </span>
        {participant.email && (
          <span className="block truncate text-xs text-gray-400">
            {participant.email}
          </span>
        )}
      </span>
    </div>
  );

  const renderCampaigns = (participant: Participant) => {
    if (participant.campaignIds.length === 0)
      return <span className="text-sm text-gray-500">Keine Zuweisung</span>;
    return (
      <div className="flex flex-wrap gap-1.5">
        {participant.campaignIds.map((campaignId) => {
          const campaignName =
            campaignById.get(campaignId)?.name ?? "Unbekannte Kampagne";
          return (
            <span
              key={campaignId}
              className="inline-flex max-w-full items-center rounded-md bg-gray-700 px-2 py-1 text-xs text-gray-200"
            >
              <span className="max-w-44 truncate" title={campaignName}>
                {campaignName}
              </span>
              {canEdit && (
                <button
                  type="button"
                  onClick={() => removeCampaign(participant, campaignId)}
                  aria-label={`${campaignName} von ${participant.name} entfernen`}
                  className="-mr-1 ml-1 rounded p-0.5 text-gray-400 hover:bg-gray-600 hover:text-white"
                >
                  <X className="h-3 w-3" aria-hidden="true" />
                </button>
              )}
            </span>
          );
        })}
      </div>
    );
  };

  const renderStatusControl = (participant: Participant) => {
    const status = participantStatus(participant);
    return (
      <select
        value={status}
        onChange={(event) =>
          handleStatusChange(
            participant,
            event.target.value as ParticipantStatus,
          )
        }
        disabled={!canEdit || Boolean(participant.agentId)}
        title={
          participant.agentId
            ? "Agentenstatus unter Agent Workflows verwalten"
            : undefined
        }
        aria-label={`Status von ${participant.name}`}
        className={`rounded-lg border px-2 py-1.5 text-xs font-medium focus:outline-none ${statusStyle(status)}`}
      >
        {statusOptions.map((option) => (
          <option
            key={option.value}
            value={option.value}
            className="bg-gray-800 text-white"
          >
            {option.label}
          </option>
        ))}
      </select>
    );
  };

  const renderActions = (participant: Participant) => {
    if (!canEdit) return null;
    const isOwnParticipant = participant.userId === user?.id;
    const isLinkedIdentity = Boolean(participant.userId || participant.agentId);
    return (
      <div className="flex items-center gap-1">
        <button
          type="button"
          onClick={() => openEditModal(participant)}
          aria-label={`${participant.name} bearbeiten`}
          className="rounded-lg p-2 text-gray-400 hover:bg-blue-500/10 hover:text-blue-400"
        >
          <Edit3 className="h-4 w-4" aria-hidden="true" />
        </button>
        <button
          type="button"
          onClick={() => setParticipantToDelete(participant)}
          disabled={isOwnParticipant || isLinkedIdentity}
          title={
            isOwnParticipant
              ? "Der eigene Eintrag kann nicht entfernt werden."
              : isLinkedIdentity
                ? "Verknüpfte Identitäten werden in der Benutzer- oder Agentenverwaltung gelöscht."
                : undefined
          }
          aria-label={`${participant.name} entfernen`}
          className="rounded-lg p-2 text-gray-400 hover:bg-red-500/10 hover:text-red-400"
        >
          <Trash2 className="h-4 w-4" aria-hidden="true" />
        </button>
      </div>
    );
  };

  return (
    <div className="p-4 sm:p-6 md:ml-64 md:p-8">
      <div className="mx-auto max-w-7xl">
        <header className="mb-8 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h1 className="mb-2 text-3xl font-bold text-white">Beteiligte</h1>
            <p className="text-gray-400">
              Verwalte Personen, Agenten und deren Kampagnenzuweisungen.
            </p>
          </div>
          {canEdit && (
            <button
              type="button"
              onClick={openInviteModal}
              className="flex shrink-0 items-center justify-center rounded-lg bg-blue-600 px-5 py-3 text-white transition-colors hover:bg-blue-700"
            >
              <UserPlus className="mr-2 h-5 w-5" aria-hidden="true" />
              Teilnehmer einladen
            </button>
          )}
        </header>

        {!canEdit && (
          <p
            className="mb-6 rounded-lg border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-sm text-amber-200"
            role="status"
          >
            Besucher haben Lesezugriff. Einladungen und Änderungen sind
            deaktiviert.
          </p>
        )}

        <section
          aria-label="Beteiligtenstatistik"
          className="mb-8 grid grid-cols-1 gap-4 sm:grid-cols-3"
        >
          <article className="rounded-xl border border-gray-700 bg-gray-800/50 p-5 sm:p-6">
            <div className="mb-4 flex items-center justify-between">
              <Users className="h-8 w-8 text-blue-500" aria-hidden="true" />
              <span className="text-3xl font-bold text-white">
                {humanCount}
              </span>
            </div>
            <p className="text-gray-400">Menschliche Teilnehmer</p>
          </article>
          <article className="rounded-xl border border-gray-700 bg-gray-800/50 p-5 sm:p-6">
            <div className="mb-4 flex items-center justify-between">
              <Bot className="h-8 w-8 text-purple-500" aria-hidden="true" />
              <span className="text-3xl font-bold text-white">
                {agentCount}
              </span>
            </div>
            <p className="text-gray-400">KI-Agenten</p>
          </article>
          <article className="rounded-xl border border-gray-700 bg-gray-800/50 p-5 sm:p-6">
            <div className="mb-4 flex items-center justify-between">
              <User className="h-8 w-8 text-green-500" aria-hidden="true" />
              <span className="text-3xl font-bold text-white">
                {participants.length}
              </span>
            </div>
            <p className="text-gray-400">Gesamt</p>
          </article>
        </section>

        <section aria-labelledby="participants-list-heading">
          <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <h2
              id="participants-list-heading"
              className="text-xl font-semibold text-white"
            >
              Teilnehmerliste
            </h2>
            <p id="participants-result-count" className="text-sm text-gray-400">
              {filteredParticipants.length} von {participants.length} Einträgen
            </p>
          </div>
          <div className="relative mb-6">
            <label htmlFor="participant-search" className="sr-only">
              Beteiligte durchsuchen
            </label>
            <Search
              className="absolute left-3 top-1/2 h-5 w-5 -translate-y-1/2 text-gray-400"
              aria-hidden="true"
            />
            <input
              id="participant-search"
              type="search"
              value={searchTerm}
              onChange={(event) => setSearchTerm(event.target.value)}
              placeholder="Nach Name, Rolle, E-Mail, Status oder Kampagne suchen …"
              aria-describedby="participants-result-count"
              className="w-full rounded-lg border border-gray-700 bg-gray-800 py-3 pl-10 pr-4 text-white placeholder:text-gray-500 focus:border-blue-500 focus:outline-none"
            />
          </div>

          <div className="hidden overflow-hidden rounded-xl border border-gray-700 bg-gray-800/50 xl:block">
            <div className="overflow-x-auto">
              <table className="w-full min-w-[980px]">
                <caption className="sr-only">
                  Beteiligte mit Rolle, Typ, Kampagnen, Status und Aktionen
                </caption>
                <thead>
                  <tr className="border-b border-gray-700 bg-gray-800/60">
                    <th
                      scope="col"
                      className="px-5 py-4 text-left text-sm font-semibold text-gray-400"
                    >
                      Name
                    </th>
                    <th
                      scope="col"
                      className="px-5 py-4 text-left text-sm font-semibold text-gray-400"
                    >
                      Rolle
                    </th>
                    <th
                      scope="col"
                      className="px-5 py-4 text-left text-sm font-semibold text-gray-400"
                    >
                      Typ
                    </th>
                    <th
                      scope="col"
                      className="px-5 py-4 text-left text-sm font-semibold text-gray-400"
                    >
                      Kampagnen
                    </th>
                    <th
                      scope="col"
                      className="px-5 py-4 text-left text-sm font-semibold text-gray-400"
                    >
                      Status
                    </th>
                    {canEdit && (
                      <th
                        scope="col"
                        className="px-5 py-4 text-right text-sm font-semibold text-gray-400"
                      >
                        <span className="sr-only">Aktionen</span>
                      </th>
                    )}
                  </tr>
                </thead>
                <tbody>
                  {filteredParticipants.map((participant) => (
                    <tr
                      key={participant.id}
                      className="border-b border-gray-700/50 last:border-0 hover:bg-gray-800/50"
                    >
                      <th
                        scope="row"
                        className="max-w-64 px-5 py-4 text-left font-normal"
                      >
                        {renderIdentity(participant)}
                      </th>
                      <td className="max-w-48 px-5 py-4 text-sm text-gray-300">
                        {participant.role}
                      </td>
                      <td className="px-5 py-4">
                        <span
                          className={`rounded px-2 py-1 text-xs font-medium ${participant.agentId ? "bg-purple-500/20 text-purple-400" : "bg-blue-500/20 text-blue-400"}`}
                        >
                          {participant.agentId ? "Agent" : "Mensch"}
                        </span>
                      </td>
                      <td className="max-w-sm px-5 py-4">
                        {renderCampaigns(participant)}
                      </td>
                      <td className="px-5 py-4">
                        {renderStatusControl(participant)}
                      </td>
                      {canEdit && (
                        <td className="px-5 py-4">
                          <div className="flex justify-end">
                            {renderActions(participant)}
                          </div>
                        </td>
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          <div className="grid gap-4 sm:grid-cols-2 xl:hidden">
            {filteredParticipants.map((participant) => (
              <article
                key={participant.id}
                className="rounded-xl border border-gray-700 bg-gray-800/50 p-5"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    {renderIdentity(participant)}
                  </div>
                  {renderActions(participant)}
                </div>
                <dl className="mt-5 space-y-4">
                  <div className="flex items-start justify-between gap-4">
                    <dt className="text-sm text-gray-500">Rolle</dt>
                    <dd className="text-right text-sm text-gray-200">
                      {participant.role}
                    </dd>
                  </div>
                  <div className="flex items-center justify-between gap-4">
                    <dt className="text-sm text-gray-500">Typ</dt>
                    <dd>
                      <span
                        className={`rounded px-2 py-1 text-xs font-medium ${participant.agentId ? "bg-purple-500/20 text-purple-400" : "bg-blue-500/20 text-blue-400"}`}
                      >
                        {participant.agentId ? "Agent" : "Mensch"}
                      </span>
                    </dd>
                  </div>
                  <div className="flex items-center justify-between gap-4">
                    <dt className="text-sm text-gray-500">Status</dt>
                    <dd>{renderStatusControl(participant)}</dd>
                  </div>
                  <div>
                    <dt className="mb-2 text-sm text-gray-500">Kampagnen</dt>
                    <dd>{renderCampaigns(participant)}</dd>
                  </div>
                </dl>
              </article>
            ))}
          </div>

          {filteredParticipants.length === 0 && (
            <div className="rounded-xl border border-dashed border-gray-700 px-6 py-12 text-center">
              <CircleUserRound
                className="mx-auto mb-4 h-14 w-14 text-gray-600"
                aria-hidden="true"
              />
              <h3 className="mb-2 text-lg font-semibold text-gray-300">
                Keine Beteiligten gefunden
              </h3>
              <p className="mb-4 text-sm text-gray-500">
                Passe den Suchbegriff an oder setze die Suche zurück.
              </p>
              {searchTerm && (
                <button
                  type="button"
                  onClick={() => setSearchTerm("")}
                  className="rounded-lg bg-gray-700 px-4 py-2 text-sm text-gray-200 hover:bg-gray-600"
                >
                  Suche zurücksetzen
                </button>
              )}
            </div>
          )}
        </section>
      </div>

      <Modal
        open={modalMode !== null}
        onClose={closeParticipantModal}
        title={
          modalMode === "edit" ? "Teilnehmer bearbeiten" : "Teilnehmer einladen"
        }
        size="lg"
      >
        <form className="space-y-5" onSubmit={handleParticipantSubmit}>
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label
                htmlFor="participant-name"
                className="mb-2 block text-sm font-medium text-gray-300"
              >
                Name
              </label>
              <input
                id="participant-name"
                type="text"
                value={participantForm.name}
                onChange={(event) =>
                  setParticipantForm((current) => ({
                    ...current,
                    name: event.target.value,
                  }))
                }
                required
                readOnly={Boolean(
                  editingParticipant?.userId || editingParticipant?.agentId,
                )}
                autoComplete="name"
                className="w-full rounded-lg border border-gray-600 bg-gray-700 px-4 py-2 text-white focus:border-blue-500 focus:outline-none"
              />
            </div>
            <div>
              <label
                htmlFor="participant-email"
                className="mb-2 block text-sm font-medium text-gray-300"
              >
                E-Mail{" "}
                {editingParticipant?.agentId && (
                  <span className="font-normal text-gray-500">(optional)</span>
                )}
              </label>
              <input
                id="participant-email"
                type="email"
                value={participantForm.email}
                onChange={(event) =>
                  setParticipantForm((current) => ({
                    ...current,
                    email: event.target.value,
                  }))
                }
                required={modalMode === "invite"}
                readOnly={Boolean(
                  editingParticipant?.userId || editingParticipant?.agentId,
                )}
                autoComplete="email"
                className="w-full rounded-lg border border-gray-600 bg-gray-700 px-4 py-2 text-white focus:border-blue-500 focus:outline-none"
              />
            </div>
            <div>
              <label
                htmlFor="participant-role"
                className="mb-2 block text-sm font-medium text-gray-300"
              >
                Rolle
              </label>
              <input
                id="participant-role"
                type="text"
                value={participantForm.role}
                onChange={(event) =>
                  setParticipantForm((current) => ({
                    ...current,
                    role: event.target.value,
                  }))
                }
                required
                readOnly={Boolean(
                  editingParticipant?.userId || editingParticipant?.agentId,
                )}
                placeholder="z. B. Content Creator"
                className="w-full rounded-lg border border-gray-600 bg-gray-700 px-4 py-2 text-white placeholder:text-gray-500 focus:border-blue-500 focus:outline-none"
              />
            </div>
            <div>
              <label
                htmlFor="participant-status"
                className="mb-2 block text-sm font-medium text-gray-300"
              >
                Status
              </label>
              <select
                id="participant-status"
                value={participantForm.status}
                onChange={(event) =>
                  setParticipantForm((current) => ({
                    ...current,
                    status: event.target.value as ParticipantStatus,
                  }))
                }
                disabled={Boolean(editingParticipant?.agentId)}
                className="w-full rounded-lg border border-gray-600 bg-gray-700 px-4 py-2 text-white focus:border-blue-500 focus:outline-none"
              >
                {statusOptions.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
              {editingParticipant?.agentId && (
                <p className="mt-2 text-xs text-gray-400">
                  Den Betriebsstatus dieses Agenten verwaltest du unter Agent
                  Workflows.
                </p>
              )}
            </div>
          </div>

          <fieldset>
            <legend className="mb-3 text-sm font-medium text-gray-300">
              Kampagnen zuweisen
            </legend>
            {campaigns.length > 0 ? (
              <div className="grid max-h-64 gap-2 overflow-y-auto rounded-lg border border-gray-700 bg-gray-900/30 p-3 sm:grid-cols-2">
                {campaigns.map((campaign) => {
                  const checked = participantForm.campaignIds.includes(
                    campaign.id,
                  );
                  return (
                    <label
                      key={campaign.id}
                      className={`flex cursor-pointer items-start gap-3 rounded-lg border p-3 ${checked ? "border-blue-500/40 bg-blue-500/10" : "border-gray-700 bg-gray-800/50 hover:border-gray-600"}`}
                    >
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={() => toggleCampaign(campaign.id)}
                        className="mt-0.5 h-4 w-4 accent-blue-600"
                      />
                      <span className="min-w-0">
                        <span className="block truncate text-sm font-medium text-white">
                          {campaign.name}
                        </span>
                        <span className="block text-xs capitalize text-gray-500">
                          {campaign.status}
                        </span>
                      </span>
                    </label>
                  );
                })}
              </div>
            ) : (
              <p className="rounded-lg border border-dashed border-gray-700 p-4 text-sm text-gray-500">
                Es sind noch keine Kampagnen verfügbar.
              </p>
            )}
          </fieldset>

          <div className="flex flex-col-reverse gap-3 pt-1 sm:flex-row sm:justify-end">
            <button
              type="button"
              onClick={closeParticipantModal}
              className="rounded-lg bg-gray-700 px-4 py-2 text-gray-200 hover:bg-gray-600"
            >
              Abbrechen
            </button>
            <button
              type="submit"
              className="flex items-center justify-center rounded-lg bg-blue-600 px-4 py-2 text-white hover:bg-blue-700"
            >
              {modalMode === "edit" ? (
                <Edit3 className="mr-2 h-4 w-4" aria-hidden="true" />
              ) : (
                <Plus className="mr-2 h-4 w-4" aria-hidden="true" />
              )}
              {modalMode === "edit"
                ? "Änderungen speichern"
                : "Einladung senden"}
            </button>
          </div>
        </form>
      </Modal>

      <ConfirmDialog
        open={Boolean(participantToDelete)}
        onClose={() => setParticipantToDelete(null)}
        onConfirm={handleDelete}
        title="Teilnehmer entfernen?"
        message={`„${participantToDelete?.name ?? ""}“ wird aus der Beteiligtenliste entfernt.`}
        confirmLabel="Entfernen"
        danger
      />
    </div>
  );
}
