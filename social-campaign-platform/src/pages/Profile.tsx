import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type FormEvent,
} from "react";
import { format } from "date-fns";
import { de } from "date-fns/locale";
import {
  Bot,
  CreditCard,
  Key,
  Lock,
  LoaderCircle,
  Mail,
  MessageSquare,
  Save,
  Send,
  Trash2,
  User,
  UserCircle,
  Users,
} from "lucide-react";
import ConfirmDialog from "../components/ConfirmDialog";
import Modal from "../components/Modal";
import Avatar from "../components/Avatar";
import { useAppData } from "../contexts/app-data";
import { useAuth } from "../contexts/auth";
import { useFeedback } from "../contexts/feedback";
import type { Credential } from "../types";

type ProfileTab = "profile" | "credentials" | "chat";

interface CredentialFormState {
  service: string;
  username: string;
  notes: string;
}

const emptyCredentialForm: CredentialFormState = {
  service: "",
  username: "",
  notes: "",
};

const tabItems: Array<{
  id: ProfileTab;
  label: string;
  icon: typeof UserCircle;
}> = [
  { id: "profile", label: "Profil", icon: UserCircle },
  { id: "credentials", label: "Credentials", icon: Key },
  { id: "chat", label: "Live-Chat", icon: MessageSquare },
];

function directConversationId(
  firstUserId: string,
  secondUserId: string,
): string {
  return `direct:${[firstUserId, secondUserId].sort().join(":")}`;
}

export default function Profile() {
  const { user, canEdit, changePassword, isServerMode } = useAuth();
  const {
    chatMessages,
    chatWithAgent,
    createCredential,
    credentials,
    deleteCredential,
    participants,
    sendMessage,
    updateUser,
    users,
  } = useAppData();
  const { notify } = useFeedback();

  const [activeTab, setActiveTab] = useState<ProfileTab>("profile");
  const [name, setName] = useState(user?.name ?? "");
  const [email, setEmail] = useState(user?.email ?? "");
  const [password, setPassword] = useState("");
  const [passwordConfirmation, setPasswordConfirmation] = useState("");
  const [isSaving, setIsSaving] = useState(false);
  const [credentialModalOpen, setCredentialModalOpen] = useState(false);
  const [credentialForm, setCredentialForm] =
    useState<CredentialFormState>(emptyCredentialForm);
  const [credentialToDelete, setCredentialToDelete] =
    useState<Credential | null>(null);
  const [selectedContactId, setSelectedContactId] = useState<string | null>(
    null,
  );
  const [messageDraft, setMessageDraft] = useState("");
  const [respondingConversationId, setRespondingConversationId] = useState<
    string | null
  >(null);
  const messageListRef = useRef<HTMLDivElement>(null);
  const closeCredentialModal = useCallback(
    () => setCredentialModalOpen(false),
    [],
  );

  useEffect(() => {
    setName(user?.name ?? "");
    setEmail(user?.email ?? "");
  }, [user?.email, user?.name]);

  const userParticipant = participants.find(
    (participant) => participant.userId === user?.id,
  );
  const userCredentials = useMemo(
    () =>
      credentials
        .filter((credential) => credential.userId === user?.id)
        .sort(
          (first, second) =>
            new Date(second.updatedAt).getTime() -
            new Date(first.updatedAt).getTime(),
        ),
    [credentials, user?.id],
  );
  const contacts = useMemo(
    () =>
      participants.filter(
        (participant) =>
          participant.agentId ||
          (participant.userId && participant.userId !== user?.id),
      ),
    [participants, user?.id],
  );
  const selectedContact =
    contacts.find((contact) => contact.id === selectedContactId) ?? null;
  const selectedPrincipalId =
    selectedContact?.userId ?? selectedContact?.agentId;
  const conversationId =
    selectedPrincipalId && user
      ? directConversationId(user.id, selectedPrincipalId)
      : "team";
  const visibleMessages = useMemo(
    () =>
      chatMessages.filter(
        (message) => (message.conversationId ?? "team") === conversationId,
      ),
    [chatMessages, conversationId],
  );

  const handleTabKeyDown = (event: React.KeyboardEvent<HTMLButtonElement>) => {
    const currentIndex = tabItems.findIndex((tab) => tab.id === activeTab);
    let nextIndex = currentIndex;
    if (event.key === "ArrowRight")
      nextIndex = (currentIndex + 1) % tabItems.length;
    else if (event.key === "ArrowLeft")
      nextIndex = (currentIndex - 1 + tabItems.length) % tabItems.length;
    else if (event.key === "Home") nextIndex = 0;
    else if (event.key === "End") nextIndex = tabItems.length - 1;
    else return;
    event.preventDefault();
    const nextTab = tabItems[nextIndex];
    if (!nextTab) return;
    setActiveTab(nextTab.id);
    document.getElementById(`profile-tab-${nextTab.id}`)?.focus();
  };

  useEffect(() => {
    if (
      selectedContactId &&
      !contacts.some((contact) => contact.id === selectedContactId)
    ) {
      setSelectedContactId(null);
    }
  }, [contacts, selectedContactId]);

  useEffect(() => {
    messageListRef.current?.scrollTo({
      top: messageListRef.current.scrollHeight,
      behavior: "smooth",
    });
  }, [conversationId, visibleMessages.length]);

  if (!user) {
    return (
      <div className="p-6 md:ml-64 md:p-8">
        <div
          className="mx-auto max-w-7xl rounded-xl border border-red-500/30 bg-red-500/10 p-6 text-red-200"
          role="alert"
        >
          Das Profil konnte nicht geladen werden.
        </div>
      </div>
    );
  }

  const handleProfileSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!canEdit && !password) {
      notify("Gib ein neues Passwort ein, um es zu ändern.", "info");
      return;
    }

    const normalizedName = name.trim();
    const normalizedEmail = email.trim().toLowerCase();
    if (canEdit && (!normalizedName || !normalizedEmail)) {
      notify("Name und E-Mail-Adresse sind erforderlich.", "error");
      return;
    }
    if (
      canEdit &&
      users.some(
        (candidate) =>
          candidate.id !== user.id &&
          candidate.email.toLowerCase() === normalizedEmail,
      )
    ) {
      notify("Diese E-Mail-Adresse wird bereits verwendet.", "error");
      return;
    }
    if (password && password.length < (isServerMode ? 12 : 6)) {
      notify(
        `Das Passwort muss mindestens ${isServerMode ? 12 : 6} Zeichen lang sein.`,
        "error",
      );
      return;
    }
    if (password !== passwordConfirmation) {
      notify("Die eingegebenen Passwörter stimmen nicht überein.", "error");
      return;
    }

    setIsSaving(true);
    try {
      if (password) await changePassword(password);
      if (canEdit)
        updateUser(user.id, { name: normalizedName, email: normalizedEmail });
      setPassword("");
      setPasswordConfirmation("");
      notify(
        canEdit && password
          ? "Profil und Passwort wurden aktualisiert."
          : canEdit
            ? "Profil wurde aktualisiert."
            : "Passwort wurde aktualisiert.",
      );
    } catch (error) {
      notify(
        error instanceof Error
          ? error.message
          : "Das Profil konnte nicht gespeichert werden.",
        "error",
      );
    } finally {
      setIsSaving(false);
    }
  };

  const openCredentialModal = () => {
    if (!canEdit) {
      notify("Besucher können keine Credentials hinzufügen.", "info");
      return;
    }
    setCredentialForm(emptyCredentialForm);
    setCredentialModalOpen(true);
  };

  const handleCredentialSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!canEdit) return;
    const service = credentialForm.service.trim();
    const username = credentialForm.username.trim();
    if (!service || !username) {
      notify("Dienst und Benutzername sind erforderlich.", "error");
      return;
    }
    createCredential({
      userId: user.id,
      service,
      username,
      notes: credentialForm.notes.trim() || undefined,
    });
    closeCredentialModal();
    setCredentialForm(emptyCredentialForm);
    notify("Credentials wurden gespeichert.");
  };

  const handleCredentialDelete = () => {
    if (!credentialToDelete || !canEdit) return;
    deleteCredential(credentialToDelete.id);
    notify(`Credentials für ${credentialToDelete.service} wurden gelöscht.`);
    setCredentialToDelete(null);
  };

  const handleMessageSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const content = messageDraft.trim();
    if (!canEdit) {
      notify("Besucher können keine Nachrichten senden.", "info");
      return;
    }
    if (!content) return;
    const agentId = selectedContact?.agentId;
    const targetConversationId = conversationId;
    const history = visibleMessages
      .filter((message) => !message.isSystem)
      .slice(-12)
      .map((message) => ({
        role:
          agentId && message.senderId === agentId
            ? ("assistant" as const)
            : ("user" as const),
        content: message.content,
      }));
    sendMessage(content, user, conversationId);
    setMessageDraft("");
    if (!agentId) return;

    setRespondingConversationId(targetConversationId);
    try {
      await chatWithAgent(agentId, targetConversationId, content, history);
    } catch (error) {
      notify(
        error instanceof Error
          ? error.message
          : "Der Agent konnte nicht antworten.",
        "error",
      );
    } finally {
      setRespondingConversationId((current) =>
        current === targetConversationId ? null : current,
      );
    }
  };

  return (
    <div className="p-4 sm:p-6 md:ml-64 md:p-8">
      <div className="mx-auto max-w-7xl">
        <header className="mb-8">
          <h1 className="mb-2 text-3xl font-bold text-white">
            Persönlicher Bereich
          </h1>
          <p className="text-gray-400">
            Verwalte dein Profil, deine Credentials und Unterhaltungen.
          </p>
          {!canEdit && (
            <p
              className="mt-4 rounded-lg border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-sm text-amber-200"
              role="status"
            >
              Du bist als Besucher angemeldet. Fachliche Änderungen und neue
              Nachrichten sind deaktiviert; dein Passwort kannst du weiterhin im
              Profil ändern.
            </p>
          )}
        </header>

        <div
          className="mb-8 overflow-x-auto border-b border-gray-700"
          role="tablist"
          aria-label="Profilbereiche"
        >
          <div className="flex min-w-max gap-1">
            {tabItems.map((tab) => {
              const Icon = tab.icon;
              const selected = activeTab === tab.id;
              return (
                <button
                  key={tab.id}
                  id={`profile-tab-${tab.id}`}
                  type="button"
                  role="tab"
                  aria-selected={selected}
                  aria-controls={`profile-panel-${tab.id}`}
                  tabIndex={selected ? 0 : -1}
                  onClick={() => setActiveTab(tab.id)}
                  onKeyDown={handleTabKeyDown}
                  className={`flex items-center border-b-2 px-4 py-3 sm:px-6 ${
                    selected
                      ? "border-blue-400 text-blue-400"
                      : "border-transparent text-gray-400 hover:text-white"
                  }`}
                >
                  <Icon className="mr-2 h-5 w-5" aria-hidden="true" />
                  {tab.label}
                </button>
              );
            })}
          </div>
        </div>

        {activeTab === "profile" && (
          <section
            id="profile-panel-profile"
            role="tabpanel"
            aria-labelledby="profile-tab-profile"
          >
            <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
              <aside className="rounded-xl border border-gray-700 bg-gray-800/50 p-6 text-center lg:col-span-1">
                <Avatar
                  src={user.avatar}
                  name={user.name}
                  className="mx-auto mb-4 h-32 w-32 rounded-full object-cover"
                />
                <h2 className="text-xl font-semibold text-white">
                  {user.name}
                </h2>
                <p className="mb-2 break-all text-gray-400">{user.email}</p>
                <span className="inline-block rounded-full bg-blue-500/20 px-3 py-1 text-sm text-blue-400">
                  {user.role}
                </span>
                {userParticipant && (
                  <p className="mt-2 text-sm text-gray-500">
                    {userParticipant.role}
                  </p>
                )}
              </aside>

              <div className="rounded-xl border border-gray-700 bg-gray-800/50 p-5 sm:p-6 lg:col-span-2">
                <h2 className="mb-6 text-xl font-semibold text-white">
                  Profil bearbeiten
                </h2>
                <form className="space-y-4" onSubmit={handleProfileSubmit}>
                  <div>
                    <label
                      htmlFor="profile-name"
                      className="mb-2 block text-sm text-gray-300"
                    >
                      Name
                    </label>
                    <div className="relative">
                      <User
                        className="absolute left-3 top-1/2 h-5 w-5 -translate-y-1/2 text-gray-400"
                        aria-hidden="true"
                      />
                      <input
                        id="profile-name"
                        type="text"
                        value={name}
                        onChange={(event) => setName(event.target.value)}
                        required
                        readOnly={!canEdit}
                        autoComplete="name"
                        className="w-full rounded-lg border border-gray-600 bg-gray-700 py-2 pl-10 pr-4 text-white focus:border-blue-500 focus:outline-none read-only:text-gray-400"
                      />
                    </div>
                  </div>
                  <div>
                    <label
                      htmlFor="profile-email"
                      className="mb-2 block text-sm text-gray-300"
                    >
                      E-Mail
                    </label>
                    <div className="relative">
                      <Mail
                        className="absolute left-3 top-1/2 h-5 w-5 -translate-y-1/2 text-gray-400"
                        aria-hidden="true"
                      />
                      <input
                        id="profile-email"
                        type="email"
                        value={email}
                        onChange={(event) => setEmail(event.target.value)}
                        required
                        readOnly={!canEdit}
                        autoComplete="email"
                        className="w-full rounded-lg border border-gray-600 bg-gray-700 py-2 pl-10 pr-4 text-white focus:border-blue-500 focus:outline-none read-only:text-gray-400"
                      />
                    </div>
                  </div>
                  <div className="grid gap-4 sm:grid-cols-2">
                    <div>
                      <label
                        htmlFor="profile-password"
                        className="mb-2 block text-sm text-gray-300"
                      >
                        Neues Passwort
                      </label>
                      <div className="relative">
                        <Lock
                          className="absolute left-3 top-1/2 h-5 w-5 -translate-y-1/2 text-gray-400"
                          aria-hidden="true"
                        />
                        <input
                          id="profile-password"
                          type="password"
                          value={password}
                          onChange={(event) => setPassword(event.target.value)}
                          minLength={6}
                          disabled={isSaving}
                          autoComplete="new-password"
                          placeholder="Mindestens 6 Zeichen"
                          className="w-full rounded-lg border border-gray-600 bg-gray-700 py-2 pl-10 pr-4 text-white placeholder:text-gray-500 focus:border-blue-500 focus:outline-none"
                        />
                      </div>
                    </div>
                    <div>
                      <label
                        htmlFor="profile-password-confirmation"
                        className="mb-2 block text-sm text-gray-300"
                      >
                        Passwort bestätigen
                      </label>
                      <div className="relative">
                        <Lock
                          className="absolute left-3 top-1/2 h-5 w-5 -translate-y-1/2 text-gray-400"
                          aria-hidden="true"
                        />
                        <input
                          id="profile-password-confirmation"
                          type="password"
                          value={passwordConfirmation}
                          onChange={(event) =>
                            setPasswordConfirmation(event.target.value)
                          }
                          minLength={6}
                          disabled={isSaving}
                          autoComplete="new-password"
                          placeholder="Passwort wiederholen"
                          className="w-full rounded-lg border border-gray-600 bg-gray-700 py-2 pl-10 pr-4 text-white placeholder:text-gray-500 focus:border-blue-500 focus:outline-none"
                        />
                      </div>
                    </div>
                  </div>
                  <button
                    type="submit"
                    disabled={isSaving || (!canEdit && !password)}
                    className="flex w-full items-center justify-center rounded-lg bg-blue-600 px-6 py-3 text-white transition-colors hover:bg-blue-700 disabled:hover:bg-blue-600"
                  >
                    <Save className="mr-2 h-5 w-5" aria-hidden="true" />
                    {isSaving
                      ? "Wird gespeichert …"
                      : canEdit
                        ? "Änderungen speichern"
                        : "Passwort speichern"}
                  </button>
                </form>
              </div>
            </div>
          </section>
        )}

        {activeTab === "credentials" && (
          <section
            id="profile-panel-credentials"
            role="tabpanel"
            aria-labelledby="profile-tab-credentials"
          >
            <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
              <h2 className="text-xl font-semibold text-white">
                Gespeicherte Credentials
              </h2>
              {canEdit && (
                <button
                  type="button"
                  onClick={openCredentialModal}
                  className="flex items-center justify-center rounded-lg bg-blue-600 px-4 py-2 text-white transition-colors hover:bg-blue-700"
                >
                  <CreditCard className="mr-2 h-4 w-4" aria-hidden="true" />
                  Neue Credentials
                </button>
              )}
            </div>

            <div className="grid gap-4 md:grid-cols-2">
              {userCredentials.map((credential) => (
                <article
                  key={credential.id}
                  className="rounded-xl border border-gray-700 bg-gray-800/50 p-5 sm:p-6"
                >
                  <div className="flex items-start justify-between gap-4">
                    <div className="min-w-0">
                      <h3 className="truncate font-semibold text-white">
                        {credential.service}
                      </h3>
                      <p className="mt-1 break-all text-sm text-gray-300">
                        {credential.username}
                      </p>
                      {credential.notes && (
                        <p className="mt-2 whitespace-pre-wrap text-sm text-gray-500">
                          {credential.notes}
                        </p>
                      )}
                    </div>
                    {canEdit && (
                      <button
                        type="button"
                        onClick={() => setCredentialToDelete(credential)}
                        aria-label={`Credentials für ${credential.service} löschen`}
                        className="shrink-0 rounded-lg p-2 text-gray-400 hover:bg-red-500/10 hover:text-red-400"
                      >
                        <Trash2 className="h-5 w-5" aria-hidden="true" />
                      </button>
                    )}
                  </div>
                  <p className="mt-4 text-xs text-gray-500">
                    Aktualisiert:{" "}
                    <time
                      dateTime={new Date(credential.updatedAt).toISOString()}
                    >
                      {format(
                        new Date(credential.updatedAt),
                        "dd.MM.yyyy HH:mm",
                        { locale: de },
                      )}
                    </time>
                  </p>
                </article>
              ))}
            </div>

            {userCredentials.length === 0 && (
              <div className="rounded-xl border border-dashed border-gray-700 py-12 text-center">
                <Key
                  className="mx-auto mb-4 h-14 w-14 text-gray-600"
                  aria-hidden="true"
                />
                <h3 className="mb-2 text-xl font-semibold text-gray-400">
                  Keine Credentials
                </h3>
                <p className="text-gray-500">
                  Speichere deine ersten Zugangsdaten.
                </p>
              </div>
            )}
          </section>
        )}

        {activeTab === "chat" && (
          <section
            id="profile-panel-chat"
            role="tabpanel"
            aria-labelledby="profile-tab-chat"
          >
            <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
              <aside className="overflow-hidden rounded-xl border border-gray-700 bg-gray-800/50 lg:col-span-1">
                <div className="border-b border-gray-700 p-4">
                  <h2 className="flex items-center font-semibold text-white">
                    <Users className="mr-2 h-5 w-5" aria-hidden="true" />
                    Unterhaltungen ({contacts.length + 1})
                  </h2>
                </div>
                <div
                  className="max-h-72 divide-y divide-gray-700 overflow-y-auto lg:max-h-[440px]"
                  aria-label="Chat-Kontakte"
                >
                  <button
                    type="button"
                    aria-pressed={!selectedContact}
                    onClick={() => setSelectedContactId(null)}
                    className={`flex w-full items-center p-4 text-left transition-colors ${
                      !selectedContact
                        ? "bg-blue-500/15"
                        : "hover:bg-gray-700/50"
                    }`}
                  >
                    <span className="mr-3 flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-blue-500/20">
                      <Users
                        className="h-5 w-5 text-blue-400"
                        aria-hidden="true"
                      />
                    </span>
                    <span>
                      <span className="block font-medium text-white">
                        Team-Chat
                      </span>
                      <span className="block text-xs text-gray-400">
                        Alle Beteiligten
                      </span>
                    </span>
                  </button>
                  {contacts.map((contact) => {
                    const selected = selectedContact?.id === contact.id;
                    return (
                      <button
                        key={contact.id}
                        type="button"
                        aria-pressed={selected}
                        onClick={() => setSelectedContactId(contact.id)}
                        className={`flex w-full items-center p-4 text-left transition-colors ${
                          selected ? "bg-blue-500/15" : "hover:bg-gray-700/50"
                        }`}
                      >
                        <Avatar
                          src={contact.avatar}
                          name={contact.name}
                          className="mr-3 h-10 w-10 shrink-0 rounded-full object-cover"
                        />
                        <span className="min-w-0">
                          <span className="block truncate font-medium text-white">
                            {contact.name}
                          </span>
                          <span className="block truncate text-xs text-gray-400">
                            {contact.role}
                          </span>
                        </span>
                      </button>
                    );
                  })}
                </div>
              </aside>

              <div className="flex h-[min(620px,70vh)] min-h-[440px] flex-col rounded-xl border border-gray-700 bg-gray-800/50 lg:col-span-2">
                <div className="border-b border-gray-700 p-4">
                  <h2 className="font-semibold text-white">
                    {selectedContact?.name ?? "Team-Chat"}
                  </h2>
                  <p className="text-xs text-gray-400">
                    {selectedContact?.role ??
                      "Gemeinsamer Kanal für das gesamte Team"}
                  </p>
                  {selectedContact?.agentId && (
                    <p className="mt-1 flex items-center gap-1 text-xs text-purple-300">
                      <Bot className="h-3.5 w-3.5" aria-hidden="true" />
                      Antworten werden lokal mit Ollama erzeugt.
                    </p>
                  )}
                </div>

                <div
                  ref={messageListRef}
                  className="flex-1 space-y-4 overflow-y-auto p-4"
                  role="log"
                  aria-live="polite"
                  aria-label={`Nachrichten in ${selectedContact?.name ?? "Team-Chat"}`}
                >
                  {visibleMessages.map((message) => {
                    const ownMessage = message.senderId === user.id;
                    return (
                      <article
                        key={message.id}
                        className={`flex ${message.isSystem ? "justify-center" : ownMessage ? "justify-end" : "justify-start"}`}
                      >
                        <div
                          className={`max-w-[85%] rounded-lg p-3 sm:max-w-[75%] ${
                            message.isSystem
                              ? "border border-blue-500/20 bg-blue-600/20"
                              : ownMessage
                                ? "bg-blue-600"
                                : "bg-gray-700"
                          }`}
                        >
                          {!message.isSystem && !ownMessage && (
                            <p className="mb-1 text-xs text-gray-400">
                              {message.senderName}
                            </p>
                          )}
                          <p className="whitespace-pre-wrap break-words text-sm text-white">
                            {message.content}
                          </p>
                          <time
                            dateTime={new Date(message.timestamp).toISOString()}
                            className={`mt-1 block text-xs ${ownMessage && !message.isSystem ? "text-blue-100" : "text-gray-400"}`}
                          >
                            {format(
                              new Date(message.timestamp),
                              "dd.MM., HH:mm",
                              { locale: de },
                            )}
                          </time>
                        </div>
                      </article>
                    );
                  })}
                  {visibleMessages.length === 0 && (
                    <div className="flex h-full items-center justify-center text-center text-sm text-gray-500">
                      Noch keine Nachrichten. Starte die Unterhaltung.
                    </div>
                  )}
                  {respondingConversationId === conversationId && (
                    <div
                      className="flex items-center gap-2 text-sm text-purple-300"
                      role="status"
                    >
                      <LoaderCircle
                        className="h-4 w-4 animate-spin"
                        aria-hidden="true"
                      />
                      {selectedContact?.name ?? "Agent"} erstellt eine Antwort …
                    </div>
                  )}
                </div>

                <form
                  className="border-t border-gray-700 p-4"
                  onSubmit={handleMessageSubmit}
                >
                  <label htmlFor="chat-message" className="sr-only">
                    Nachricht an {selectedContact?.name ?? "das Team"}
                  </label>
                  <div className="flex gap-2">
                    <input
                      id="chat-message"
                      type="text"
                      value={messageDraft}
                      onChange={(event) => setMessageDraft(event.target.value)}
                      disabled={
                        !canEdit || respondingConversationId === conversationId
                      }
                      autoComplete="off"
                      placeholder={
                        respondingConversationId === conversationId
                          ? "Agent antwortet …"
                          : canEdit
                            ? "Nachricht schreiben …"
                            : "Für Besucher deaktiviert"
                      }
                      className="min-w-0 flex-1 rounded-lg border border-gray-600 bg-gray-700 px-4 py-2 text-white placeholder:text-gray-500 focus:border-blue-500 focus:outline-none"
                    />
                    <button
                      type="submit"
                      disabled={
                        !canEdit ||
                        !messageDraft.trim() ||
                        respondingConversationId === conversationId
                      }
                      aria-label="Nachricht senden"
                      className="flex items-center justify-center rounded-lg bg-blue-600 px-4 py-2 text-white transition-colors hover:bg-blue-700 disabled:hover:bg-blue-600 sm:px-6"
                    >
                      <Send className="h-5 w-5 sm:mr-2" aria-hidden="true" />
                      <span className="hidden sm:inline">Senden</span>
                    </button>
                  </div>
                  {canEdit && (
                    <p className="mt-2 text-xs text-gray-500">
                      Mit Enter senden
                    </p>
                  )}
                </form>
              </div>
            </div>
          </section>
        )}
      </div>

      <Modal
        open={credentialModalOpen}
        onClose={closeCredentialModal}
        title="Neue Credentials"
        size="md"
      >
        <form className="space-y-4" onSubmit={handleCredentialSubmit}>
          <div>
            <label
              htmlFor="credential-service"
              className="mb-2 block text-sm font-medium text-gray-300"
            >
              Dienst
            </label>
            <input
              id="credential-service"
              type="text"
              value={credentialForm.service}
              onChange={(event) =>
                setCredentialForm((current) => ({
                  ...current,
                  service: event.target.value,
                }))
              }
              required
              placeholder="z. B. Instagram Business"
              className="w-full rounded-lg border border-gray-600 bg-gray-700 px-4 py-2 text-white placeholder:text-gray-500 focus:border-blue-500 focus:outline-none"
            />
          </div>
          <div>
            <label
              htmlFor="credential-username"
              className="mb-2 block text-sm font-medium text-gray-300"
            >
              Benutzername oder Konto-ID
            </label>
            <input
              id="credential-username"
              type="text"
              value={credentialForm.username}
              onChange={(event) =>
                setCredentialForm((current) => ({
                  ...current,
                  username: event.target.value,
                }))
              }
              required
              autoComplete="username"
              className="w-full rounded-lg border border-gray-600 bg-gray-700 px-4 py-2 text-white focus:border-blue-500 focus:outline-none"
            />
          </div>
          <div>
            <label
              htmlFor="credential-notes"
              className="mb-2 block text-sm font-medium text-gray-300"
            >
              Notizen{" "}
              <span className="font-normal text-gray-500">(optional)</span>
            </label>
            <textarea
              id="credential-notes"
              value={credentialForm.notes}
              onChange={(event) =>
                setCredentialForm((current) => ({
                  ...current,
                  notes: event.target.value,
                }))
              }
              rows={3}
              className="w-full resize-y rounded-lg border border-gray-600 bg-gray-700 px-4 py-2 text-white focus:border-blue-500 focus:outline-none"
            />
          </div>
          <div className="flex flex-col-reverse gap-3 pt-2 sm:flex-row sm:justify-end">
            <button
              type="button"
              onClick={closeCredentialModal}
              className="rounded-lg bg-gray-700 px-4 py-2 text-gray-200 hover:bg-gray-600"
            >
              Abbrechen
            </button>
            <button
              type="submit"
              className="rounded-lg bg-blue-600 px-4 py-2 text-white hover:bg-blue-700"
            >
              Credentials speichern
            </button>
          </div>
        </form>
      </Modal>

      <ConfirmDialog
        open={Boolean(credentialToDelete)}
        onClose={() => setCredentialToDelete(null)}
        onConfirm={handleCredentialDelete}
        title="Credentials löschen?"
        message={`Die Credentials für „${credentialToDelete?.service ?? ""}“ werden dauerhaft entfernt.`}
        confirmLabel="Löschen"
        danger
      />
    </div>
  );
}
