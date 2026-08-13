import { useEffect, useState, type FormEvent } from "react";
import {
  ArrowRight,
  Bot,
  Calendar,
  CheckCircle,
  Menu,
  MessageSquare,
  Target,
  TrendingUp,
  Users,
  X,
} from "lucide-react";
import { useLocation, useNavigate } from "react-router-dom";
import Modal from "../components/Modal";
import { useAuth } from "../contexts/auth";
import {
  acceptBackendInvitation,
  BackendError,
} from "../services/backend";
import type { UserRole } from "../types";

const features = [
  {
    icon: Target,
    color: "text-blue-400",
    title: "Kampagnen-Management",
    description:
      "Verwalte Kampagnen mit Phasen, Meilensteinen und Arbeitspaketen.",
  },
  {
    icon: Users,
    color: "text-green-400",
    title: "Team-Kollaboration",
    description:
      "Arbeite mit Admins, Creators, Besuchern und Agenten zusammen.",
  },
  {
    icon: Bot,
    color: "text-purple-400",
    title: "AI-Agent Workflows",
    description:
      "Automatisiere wiederkehrende Prozesse mit konfigurierbaren Agenten.",
  },
  {
    icon: TrendingUp,
    color: "text-red-400",
    title: "Social Media Stream",
    description:
      "Behalte Posts, Reaktionen und kanalübergreifende Performance im Blick.",
  },
  {
    icon: Calendar,
    color: "text-yellow-400",
    title: "Zeitplanung",
    description:
      "Plane Phasen und erkenne anstehende Deadlines auf einen Blick.",
  },
  {
    icon: MessageSquare,
    color: "text-indigo-400",
    title: "Team-Chat",
    description:
      "Stimme dich direkt mit Teammitgliedern und AI-Assistenten ab.",
  },
];

const articles = [
  {
    title: "Kampagnenplanung ohne Medienbrüche",
    excerpt:
      "Von der ersten Idee bis zur Auswertung in einem gemeinsamen Arbeitsraum.",
    label: "Workflow",
  },
  {
    title: "AI-Agenten sinnvoll einsetzen",
    excerpt:
      "Welche Aufgaben sich automatisieren lassen und wo menschliche Freigaben wichtig bleiben.",
    label: "Automation",
  },
  {
    title: "Engagement richtig bewerten",
    excerpt:
      "Wie du Kennzahlen über verschiedene Plattformen hinweg einordnest.",
    label: "Analytics",
  },
];

export default function LandingPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const { login, register, isServerMode } = useAuth();
  const [showLogin, setShowLogin] = useState(false);
  const [showRegister, setShowRegister] = useState(false);
  const [showInvitation, setShowInvitation] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [invitationError, setInvitationError] = useState("");
  const [invitationToken, setInvitationToken] = useState("");
  const [invitationPassword, setInvitationPassword] = useState({
    password: "",
    confirmation: "",
  });
  const [loginData, setLoginData] = useState({
    email: "admin@example.com",
    password: "demo123",
  });
  const [registerData, setRegisterData] = useState({
    email: "",
    name: "",
    role: "Worker" as UserRole,
    password: "",
  });

  const destination =
    (location.state as { from?: string } | null)?.from ?? "/dashboard";

  useEffect(() => {
    const parameters = new URLSearchParams(location.search);
    const rawToken = parameters.get("invitation");
    if (rawToken === null) return;

    // Keep invitation secrets out of browser history and future referrers once
    // the SPA has captured them in memory.
    parameters.delete("invitation");
    navigate(
      {
        pathname: location.pathname,
        search: parameters.size > 0 ? `?${parameters.toString()}` : "",
        hash: location.hash,
      },
      { replace: true, state: location.state },
    );

    const token = rawToken.trim();
    if (!token) return;
    setInvitationToken(token);
    setInvitationError("");
    setInvitationPassword({ password: "", confirmation: "" });
    setShowInvitation(true);
  }, [
    location.hash,
    location.pathname,
    location.search,
    location.state,
    navigate,
  ]);

  const openLogin = () => {
    setMobileOpen(false);
    setError("");
    setNotice("");
    setShowLogin(true);
  };
  const openRegister = () => {
    setMobileOpen(false);
    setError("");
    setShowRegister(true);
  };

  const handleLogin = async (event: FormEvent) => {
    event.preventDefault();
    setSubmitting(true);
    setError("");
    try {
      const success = await login(loginData.email, loginData.password);
      if (success) navigate(destination, { replace: true });
      else
        setError(
          "E-Mail oder Passwort ist falsch. Für Demo-Konten lautet das Passwort „demo123“.",
        );
    } catch {
      setError(
        "Die Anmeldung konnte nicht gespeichert werden. Bitte gib lokalen Speicher frei und versuche es erneut.",
      );
    } finally {
      setSubmitting(false);
    }
  };
  const handleRegister = async (event: FormEvent) => {
    event.preventDefault();
    setSubmitting(true);
    setError("");
    const minimumPasswordLength = isServerMode ? 12 : 6;
    if (registerData.password.length < minimumPasswordLength) {
      setSubmitting(false);
      setError(
        `Das Passwort muss mindestens ${minimumPasswordLength} Zeichen lang sein.`,
      );
      return;
    }
    try {
      const success = await register(
        registerData.email,
        registerData.name,
        registerData.role,
        registerData.password,
      );
      if (success) navigate("/dashboard", { replace: true });
      else
        setError(
          "Das Konto konnte nicht erstellt werden. Die E-Mail ist möglicherweise bereits vergeben.",
        );
    } catch {
      setError(
        "Das Konto konnte nicht lokal gespeichert werden. Bitte gib Speicher frei und versuche es erneut.",
      );
    } finally {
      setSubmitting(false);
    }
  };

  const handleInvitation = async (event: FormEvent) => {
    event.preventDefault();
    setInvitationError("");
    if (invitationPassword.password.length < 12) {
      setInvitationError("Das Passwort muss mindestens 12 Zeichen lang sein.");
      return;
    }
    if (invitationPassword.password !== invitationPassword.confirmation) {
      setInvitationError("Die beiden Passwörter stimmen nicht überein.");
      return;
    }
    if (!invitationToken) {
      setInvitationError(
        "Der Einladungslink ist unvollständig. Bitte öffne den Link aus der Einladungs-E-Mail erneut.",
      );
      return;
    }

    setSubmitting(true);
    try {
      await acceptBackendInvitation(
        invitationToken,
        invitationPassword.password,
      );
      setInvitationToken("");
      setInvitationPassword({ password: "", confirmation: "" });
      setShowInvitation(false);
      setLoginData({ email: "", password: "" });
      setError("");
      setNotice(
        "Dein Konto ist aktiviert. Melde dich jetzt mit der E-Mail-Adresse aus deiner Einladung an.",
      );
      setShowLogin(true);
    } catch (cause) {
      setInvitationError(
        cause instanceof BackendError
          ? cause.message
          : "Die Einladung konnte nicht angenommen werden. Bitte versuche es erneut.",
      );
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-950 via-blue-950 to-gray-950">
      <header className="fixed inset-x-0 top-0 z-50 border-b border-white/5 bg-gray-950/85 backdrop-blur-md">
        <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-4 sm:px-6 lg:px-8">
          <a href="#top" className="flex items-center gap-2">
            <Target className="h-8 w-8 text-blue-500" />
            <span className="text-xl font-bold text-white">CampaignHub</span>
          </a>
          <nav
            className="hidden items-center gap-8 md:flex"
            aria-label="Hauptnavigation"
          >
            <a href="#features" className="text-gray-300 hover:text-white">
              Features
            </a>
            <a href="#insights" className="text-gray-300 hover:text-white">
              Insights
            </a>
            <a href="#challenge" className="text-gray-300 hover:text-white">
              Über das Projekt
            </a>
            <button
              type="button"
              onClick={openLogin}
              className="px-4 py-2 text-gray-300 hover:text-white"
            >
              Login
            </button>
            <button
              type="button"
              onClick={openRegister}
              className="rounded-lg bg-blue-600 px-6 py-2 text-white hover:bg-blue-700"
            >
              Registrieren
            </button>
          </nav>
          <button
            type="button"
            aria-label="Navigation öffnen"
            aria-expanded={mobileOpen}
            aria-controls="mobile-navigation"
            onClick={() => setMobileOpen((open) => !open)}
            className="rounded-lg p-2 text-gray-300 hover:bg-gray-800 md:hidden"
          >
            {mobileOpen ? <X /> : <Menu />}
          </button>
        </div>
        {mobileOpen && (
          <nav
            id="mobile-navigation"
            className="space-y-2 border-t border-gray-800 bg-gray-950 p-4 md:hidden"
          >
            <a
              onClick={() => setMobileOpen(false)}
              href="#features"
              className="block rounded-lg px-4 py-3 text-gray-300 hover:bg-gray-800"
            >
              Features
            </a>
            <a
              onClick={() => setMobileOpen(false)}
              href="#insights"
              className="block rounded-lg px-4 py-3 text-gray-300 hover:bg-gray-800"
            >
              Insights
            </a>
            <button
              type="button"
              onClick={openLogin}
              className="w-full rounded-lg px-4 py-3 text-left text-gray-300 hover:bg-gray-800"
            >
              Login
            </button>
            <button
              type="button"
              onClick={openRegister}
              className="w-full rounded-lg bg-blue-600 px-4 py-3 text-white"
            >
              Registrieren
            </button>
          </nav>
        )}
      </header>

      <main id="top">
        <section className="px-4 pb-24 pt-36">
          <div className="mx-auto max-w-7xl text-center">
            <span className="mb-6 inline-flex rounded-full border border-blue-400/30 bg-blue-500/10 px-4 py-1.5 text-sm font-medium text-blue-200">
              Lokale, interaktive Produktdemo
            </span>
            <h1 className="mx-auto mb-6 max-w-5xl text-5xl font-bold tracking-tight text-white md:text-7xl">
              Social-Media-Kampagnen
              <br />
              <span className="bg-gradient-to-r from-blue-400 to-purple-400 bg-clip-text text-transparent">
                gemeinsam steuern
              </span>
            </h1>
            <p className="mx-auto mb-10 max-w-3xl text-xl leading-relaxed text-gray-300">
              Plane Kampagnen, organisiere Aufgaben und Inhalte und
              automatisiere Workflows – in einem konsistenten Arbeitsbereich für
              dein ganzes Team.
            </p>
            <div className="flex flex-col justify-center gap-4 sm:flex-row">
              <button
                type="button"
                onClick={openRegister}
                className="inline-flex items-center justify-center rounded-lg bg-blue-600 px-8 py-4 text-lg font-medium text-white hover:bg-blue-700"
              >
                Demo starten
                <ArrowRight className="ml-2 h-5 w-5" />
              </button>
              <button
                type="button"
                onClick={openLogin}
                className="rounded-lg border border-gray-600 px-8 py-4 text-lg text-gray-200 hover:border-gray-400 hover:bg-white/5"
              >
                Mit Demo-Konto anmelden
              </button>
            </div>
          </div>
        </section>

        <section id="features" className="bg-gray-900/55 px-4 py-20">
          <div className="mx-auto max-w-7xl">
            <h2 className="mb-4 text-center text-4xl font-bold text-white">
              Alles in einem Arbeitsbereich
            </h2>
            <p className="mx-auto mb-14 max-w-2xl text-center text-gray-400">
              Die Demo verbindet Planung, Ausführung und Auswertung mit
              rollenbasierten Arbeitsabläufen.
            </p>
            <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
              {features.map(({ icon: Icon, color, title, description }) => (
                <article
                  key={title}
                  className="rounded-xl border border-gray-700 bg-gray-800/75 p-6 transition hover:-translate-y-0.5 hover:border-blue-500"
                >
                  <Icon className={`mb-4 h-8 w-8 ${color}`} />
                  <h3 className="mb-2 text-xl font-semibold text-white">
                    {title}
                  </h3>
                  <p className="leading-relaxed text-gray-400">{description}</p>
                </article>
              ))}
            </div>
          </div>
        </section>

        <section id="challenge" className="px-4 py-20">
          <div className="mx-auto max-w-7xl rounded-2xl bg-gradient-to-r from-blue-700 to-purple-700 p-8 md:p-12">
            <div className="grid gap-10 md:grid-cols-[2fr_1fr] md:items-center">
              <div>
                <h2 className="mb-4 text-3xl font-bold text-white md:text-4xl">
                  Eine ehrliche, erweiterbare Demo
                </h2>
                <p className="mb-6 text-lg leading-relaxed text-blue-100">
                  CampaignHub bildet die Kernabläufe einer
                  Social-Campaign-Plattform lokal im Browser ab. Änderungen
                  werden versioniert gespeichert; externe Netzwerke, OAuth,
                  Cloud-Speicher und produktive KI-Aufrufe benötigen weiterhin
                  ein Backend.
                </p>
                <ul className="space-y-3">
                  {[
                    "Rollen- und Schreibrechte in der Oberfläche",
                    "Konsistente Daten über alle Module hinweg",
                    "Kampagnen-, Aufgaben- und Workflow-Aktionen",
                    "Responsive und tastaturfreundliche Bedienung",
                  ].map((item) => (
                    <li key={item} className="flex items-center text-blue-50">
                      <CheckCircle className="mr-3 h-5 w-5 shrink-0 text-green-300" />
                      {item}
                    </li>
                  ))}
                </ul>
              </div>
              <div className="grid grid-cols-2 gap-4 text-center md:grid-cols-1">
                <div className="rounded-xl bg-white/10 p-5">
                  <p className="text-4xl font-bold text-white">10</p>
                  <p className="text-sm text-blue-100">Arbeitsbereiche</p>
                </div>
                <div className="rounded-xl bg-white/10 p-5">
                  <p className="text-4xl font-bold text-white">4</p>
                  <p className="text-sm text-blue-100">Rollen</p>
                </div>
              </div>
            </div>
          </div>
        </section>

        <section id="insights" className="bg-gray-900/55 px-4 py-20">
          <div className="mx-auto max-w-7xl">
            <h2 className="mb-4 text-center text-4xl font-bold text-white">
              Insights
            </h2>
            <p className="mx-auto mb-14 max-w-2xl text-center text-gray-400">
              Drei Themen, die bei einem produktiven Ausbau im Mittelpunkt
              stehen.
            </p>
            <div className="grid gap-6 md:grid-cols-3">
              {articles.map((article, index) => (
                <article
                  key={article.title}
                  className="overflow-hidden rounded-xl border border-gray-700 bg-gray-800"
                >
                  <div
                    className={`h-2 ${index === 0 ? "bg-blue-500" : index === 1 ? "bg-purple-500" : "bg-green-500"}`}
                  />
                  <div className="p-6">
                    <p className="mb-3 text-xs font-semibold uppercase tracking-wider text-blue-400">
                      {article.label}
                    </p>
                    <h3 className="mb-3 text-xl font-semibold text-white">
                      {article.title}
                    </h3>
                    <p className="text-gray-400">{article.excerpt}</p>
                  </div>
                </article>
              ))}
            </div>
          </div>
        </section>

        <section className="px-4 py-20 text-center">
          <h2 className="mb-4 text-4xl font-bold text-white">
            Bereit für die Demo?
          </h2>
          <p className="mb-8 text-xl text-gray-300">
            Starte mit bestehenden Beispieldaten oder erstelle ein eigenes
            Konto.
          </p>
          <button
            type="button"
            onClick={openRegister}
            className="inline-flex items-center rounded-lg bg-blue-600 px-8 py-4 text-lg text-white hover:bg-blue-700"
          >
            Konto erstellen
            <ArrowRight className="ml-2 h-5 w-5" />
          </button>
        </section>
      </main>

      <footer className="border-t border-gray-800 px-4 py-10">
        <div className="mx-auto flex max-w-7xl flex-col gap-4 text-center text-sm text-gray-500 sm:flex-row sm:items-center sm:justify-between sm:text-left">
          <div className="flex items-center justify-center gap-2">
            <Target className="h-5 w-5 text-blue-500" />
            <span className="font-semibold text-gray-300">CampaignHub</span>
          </div>
          <p>Interaktive Frontend-Demo · Daten bleiben in diesem Browser.</p>
          <p>© 2026 CampaignHub</p>
        </div>
      </footer>

      <Modal
        open={showLogin}
        onClose={() => setShowLogin(false)}
        title="Anmelden"
        size="sm"
      >
        <form onSubmit={handleLogin} className="space-y-4">
          <label className="block text-sm text-gray-300">
            E-Mail
            <input
              type="email"
              autoComplete="email"
              required
              value={loginData.email}
              onChange={(event) =>
                setLoginData({ ...loginData, email: event.target.value })
              }
              className="mt-2 w-full rounded-lg border border-gray-600 bg-gray-700 px-4 py-2 text-white"
            />
          </label>
          <label className="block text-sm text-gray-300">
            Passwort
            <input
              type="password"
              autoComplete="current-password"
              required
              value={loginData.password}
              onChange={(event) =>
                setLoginData({ ...loginData, password: event.target.value })
              }
              className="mt-2 w-full rounded-lg border border-gray-600 bg-gray-700 px-4 py-2 text-white"
            />
          </label>
          {error && (
            <p
              role="alert"
              className="rounded-lg bg-red-500/10 p-3 text-sm text-red-300"
            >
              {error}
            </p>
          )}
          {notice && (
            <p
              role="status"
              className="rounded-lg bg-green-500/10 p-3 text-sm text-green-300"
            >
              {notice}
            </p>
          )}
          <button
            type="submit"
            disabled={submitting}
            className="w-full rounded-lg bg-blue-600 px-6 py-3 text-white hover:bg-blue-700"
          >
            {submitting ? "Anmeldung läuft …" : "Einloggen"}
          </button>
          <div className="border-t border-gray-700 pt-4 text-xs text-gray-400">
            <p className="mb-2 font-medium text-gray-300">
              Demo-Konten · Passwort: demo123
            </p>
            <div className="grid gap-1">
              <button
                type="button"
                onClick={() =>
                  setLoginData({
                    email: "admin@example.com",
                    password: "demo123",
                  })
                }
                className="text-left hover:text-white"
              >
                admin@example.com · Admin
              </button>
              <button
                type="button"
                onClick={() =>
                  setLoginData({
                    email: "worker@example.com",
                    password: "demo123",
                  })
                }
                className="text-left hover:text-white"
              >
                worker@example.com · Worker
              </button>
              <button
                type="button"
                onClick={() =>
                  setLoginData({
                    email: "visitor@example.com",
                    password: "demo123",
                  })
                }
                className="text-left hover:text-white"
              >
                visitor@example.com · Visitor
              </button>
            </div>
          </div>
        </form>
      </Modal>

      <Modal
        open={showInvitation}
        onClose={() => setShowInvitation(false)}
        title="Einladung annehmen"
        size="sm"
      >
        <form onSubmit={handleInvitation} className="space-y-4">
          <p className="text-sm leading-relaxed text-gray-300">
            Lege ein persönliches Passwort für dein neues CampaignHub-Konto
            fest. Danach kannst du dich mit der E-Mail-Adresse aus deiner
            Einladung anmelden.
          </p>
          <label className="block text-sm text-gray-300">
            Neues Passwort
            <input
              type="password"
              required
              minLength={12}
              maxLength={1024}
              autoComplete="new-password"
              value={invitationPassword.password}
              onChange={(event) =>
                setInvitationPassword((current) => ({
                  ...current,
                  password: event.target.value,
                }))
              }
              className="mt-2 w-full rounded-lg border border-gray-600 bg-gray-700 px-4 py-2 text-white"
            />
          </label>
          <label className="block text-sm text-gray-300">
            Passwort wiederholen
            <input
              type="password"
              required
              minLength={12}
              maxLength={1024}
              autoComplete="new-password"
              value={invitationPassword.confirmation}
              onChange={(event) =>
                setInvitationPassword((current) => ({
                  ...current,
                  confirmation: event.target.value,
                }))
              }
              className="mt-2 w-full rounded-lg border border-gray-600 bg-gray-700 px-4 py-2 text-white"
            />
          </label>
          <p className="text-xs text-gray-400">
            Verwende mindestens 12 Zeichen und ein nur hier genutztes
            Passwort.
          </p>
          {invitationError && (
            <p
              role="alert"
              className="rounded-lg bg-red-500/10 p-3 text-sm text-red-300"
            >
              {invitationError}
            </p>
          )}
          <button
            type="submit"
            disabled={submitting}
            className="w-full rounded-lg bg-blue-600 px-6 py-3 text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {submitting ? "Einladung wird angenommen …" : "Konto aktivieren"}
          </button>
        </form>
      </Modal>

      <Modal
        open={showRegister}
        onClose={() => setShowRegister(false)}
        title="Konto erstellen"
        size="sm"
      >
        <form onSubmit={handleRegister} className="space-y-4">
          <label className="block text-sm text-gray-300">
            Name
            <input
              required
              autoComplete="name"
              value={registerData.name}
              onChange={(event) =>
                setRegisterData({ ...registerData, name: event.target.value })
              }
              className="mt-2 w-full rounded-lg border border-gray-600 bg-gray-700 px-4 py-2 text-white"
            />
          </label>
          <label className="block text-sm text-gray-300">
            E-Mail
            <input
              type="email"
              required
              autoComplete="email"
              value={registerData.email}
              onChange={(event) =>
                setRegisterData({ ...registerData, email: event.target.value })
              }
              className="mt-2 w-full rounded-lg border border-gray-600 bg-gray-700 px-4 py-2 text-white"
            />
          </label>
          <label className="block text-sm text-gray-300">
            Passwort
            <input
              type="password"
              required
              minLength={6}
              autoComplete="new-password"
              value={registerData.password}
              onChange={(event) =>
                setRegisterData({
                  ...registerData,
                  password: event.target.value,
                })
              }
              className="mt-2 w-full rounded-lg border border-gray-600 bg-gray-700 px-4 py-2 text-white"
            />
          </label>
          <label className="block text-sm text-gray-300">
            Rolle
            <select
              value={registerData.role}
              onChange={(event) =>
                setRegisterData({
                  ...registerData,
                  role: event.target.value as UserRole,
                })
              }
              className="mt-2 w-full rounded-lg border border-gray-600 bg-gray-700 px-4 py-2 text-white"
            >
              <option value="Worker">Worker</option>
              <option value="Visitor">Visitor</option>
              <option value="Agent">Agent Operator</option>
            </select>
          </label>
          {error && (
            <p
              role="alert"
              className="rounded-lg bg-red-500/10 p-3 text-sm text-red-300"
            >
              {error}
            </p>
          )}
          <button
            type="submit"
            disabled={submitting}
            className="w-full rounded-lg bg-blue-600 px-6 py-3 text-white hover:bg-blue-700"
          >
            {submitting ? "Konto wird erstellt …" : "Konto erstellen"}
          </button>
        </form>
      </Modal>
    </div>
  );
}
