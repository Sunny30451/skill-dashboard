# CampaignHub

CampaignHub ist eine selbst hostbare Web-App für Social-Media-Kampagnen. Im Produktivmodus verwaltet ein Node-Backend Daten in PostgreSQL, Medien in S3/MinIO und lokale KI-Aufgaben über Ollama. YouTube, Facebook Pages/Instagram Professional und TikTok sind über serverseitiges OAuth, Webhooks und eine persistente Freigabe-Queue angebunden. Die Oberfläche ist auf Deutsch und für Desktop und Mobilgeräte optimiert.

## Funktionen

- Rollenbasierter Login für Admins, Worker, Visitors und Agents
- Geschützte Routen und ein eigener Admin-Zugriffsschutz
- Kampagnen mit Phasen, Meilensteinen und Arbeitspaketen
- Aufgabenverwaltung mit Filtern, Zuweisungen, Status und Zeiterfassung
- Mediathek mit Suche, Vorschau, Upload, Download und Löschen
- Agenten- und Workflow-Verwaltung mit echten lokalen Ollama-Aufrufen und Schrittprotokollen
- Beteiligte, Kampagnenzuordnungen und Einladungsstatus
- Profil, Zugangsdaten-Metadaten, lokaler Teamchat und Ollama-Agentenchats
- Social Stream mit Konto-, Plattform- und Textfiltern
- Admin-Bereich für Nutzer, Social Accounts und Anwendungseinstellungen
- OAuth-Verbindungen, Social-Sync sowie Publishing-Entwürfe mit expliziter Freigabe
- Persistente Jobs mit Sperren, Backoff und Provider-spezifischer Token-Rotation
- HttpOnly-Sitzungen, scrypt-Passwörter und AES-GCM-verschlüsselte Provider-Tokens
- Persistente Demo-Daten, Toast-Feedback, Bestätigungsdialoge und responsive Navigation

Besucher haben ausschließlich Lesezugriff. Schreibaktionen werden in der Oberfläche zusätzlich über die zentrale Berechtigungslogik geschützt.

## Lokaler Start

Voraussetzung ist Node.js `^20.19.0` oder `>=22.12.0`.

```bash
npm install
npm run dev
```

CampaignHub zeigt anschließend die lokale URL an, normalerweise `http://127.0.0.1:5173`. Der Entwicklungsserver liefert sowohl die React-App als auch den geschützten Ollama-Adapter aus.

### Ollama einrichten

Für KI-Agenten und KI-gestützte Workflow-Schritte muss [Ollama](https://ollama.com/) lokal installiert sein. Beispiel:

```bash
ollama serve
ollama pull gemma3
```

Öffne anschließend als Admin **Admin → Systemeinstellungen**, wähle **Ollama (lokal)** und klicke auf **Verbindung testen**. Der Standard-Endpunkt ist `http://127.0.0.1:11434`; installierte Modelle werden nach einem erfolgreichen Test zur Auswahl angeboten. Lokal ist kein API-Schlüssel erforderlich.

Aus Sicherheitsgründen akzeptiert der Server standardmäßig nur Ollama-Endpunkte auf `localhost`, `127.0.0.1` und `::1`. Weitere vertrauenswürdige Hosts können serverseitig, kommasepariert über `OLLAMA_ALLOWED_HOSTS` freigeschaltet werden. Mit `OLLAMA_REQUEST_TIMEOUT_MS` lässt sich das Request-Timeout zwischen 1 und 300 Sekunden konfigurieren.

## Demo-Konten

Für alle Konten lautet das Passwort `demo123`.

| E-Mail                | Rolle   |
| --------------------- | ------- |
| `admin@example.com`   | Admin   |
| `worker@example.com`  | Worker  |
| `visitor@example.com` | Visitor |
| `agent@example.com`   | Agent   |

Neue Konten lassen sich auf der Landingpage registrieren. Der Admin kann weitere Nutzer anlegen und Rollen ändern.

Diese Konten gelten nur im lokalen Demo-Modus ohne `DATABASE_URL`. Im Self-Hosted-Modus wird beim ersten Start stattdessen der `BOOTSTRAP_ADMIN_*`-Nutzer angelegt; sein Passwort muss mindestens 12 Zeichen lang sein.

## Self-Hosting mit Dokploy

Der produktive Stack liegt in [`compose.yml`](./compose.yml) und enthält App, PostgreSQL 17, MinIO und optional Ollama. Kopiere [`.env.example`](./.env.example), ersetze alle Platzhalter und folge der [Dokploy-Anleitung](./docs/DOKPLOY.md). Provider-Callbacks, Scopes, Reviews und Webhooks sind in [Provider-Setup](./docs/PROVIDER-SETUP.md) beschrieben; vor Go-live die [Datenschutz- und Security-Checkliste](./docs/PRIVACY-CHECKLIST.md) abarbeiten.

Wichtige Produktionsvariablen sind `PUBLIC_BASE_URL`, `DATABASE_URL` (in Compose erzeugt), `TOKEN_ENCRYPTION_KEY`, S3/MinIO- und Bootstrap-Admin-Zugangsdaten. Alle Provider-Secrets werden ausschließlich serverseitig gelesen und dürfen nicht als Vite-Variablen in den Browser gelangen.

## Qualitätsprüfungen

```bash
npm run test
npm run lint
npm run build
npm run format:check
```

`npm run test:watch` startet Vitest im Watch-Modus. Nach `npm run build` startet `npm run preview` den Produktionsserver inklusive Ollama-Adapter und SPA-Fallback.

## Technik

- React 19, TypeScript und Vite
- React Router
- Tailwind CSS 4
- React Context und zentraler, persistierter Anwendungszustand
- Node-HTTP-API mit PostgreSQL, MinIO/S3, SMTP und dauerhaftem Worker
- Server-Adapter für Ollama, YouTube Data API, Meta Graph API und TikTok APIs
- Vitest, Testing Library, oxlint und Prettier

Die Startdaten liegen in `src/mock-data`. Ohne `DATABASE_URL` bleibt die bisherige lokale Demo verfügbar und speichert Daten im Browser. Sobald der persistente Backend-Modus erreichbar ist, hydratisiert die App aus PostgreSQL, authentifiziert per sicherem Cookie und speichert Uploads in MinIO.

## Wichtige externe Go-live-Grenzen

Die Provider-Implementierung ist vollständig verdrahtet, kann externe Plattformfreigaben aber nicht ersetzen. YouTube verlangt OAuth-Verifizierung und für nicht-private API-Uploads neuer Projekte einen Compliance-Audit. Meta verlangt je nach Konten App Review, Advanced Access und Business Verification. TikTok beschränkt nicht auditierte Direct-Post-Clients auf private Sichtbarkeit. Bis diese Freigaben vorliegen, gelten die Test-/Private-only-Limits der jeweiligen Plattform.

Publishing erfolgt bewusst nicht autonom: Ein Workflow oder Agent erstellt einen Entwurf; ein berechtigter Nutzer bestätigt sichtbar Zielkonto, Inhalt, Privacy und Zeitpunkt. Erst dann beansprucht der persistente Worker den Job. Das erfüllt die Plattformvorgaben besser und reduziert Fehlveröffentlichungen, erfordert aber einen zusätzlichen Freigabeschritt.
