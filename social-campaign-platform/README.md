# CampaignHub - Social Media Kampagnen Management Plattform

Eine modulare, Full-Stack Web-Plattform zur Verwaltung von Social-Media-Kampagnen.

## 🚀 Features

### Kernfunktionalitäten
- **Landingpage** mit Challenge-Vorstellung, Login/Registrierung und Blog/Journal
- **Dashboard** mit Übersicht über Kampagnen, Aufgaben und Social-Media-Statistiken
- **Kampagnen-Management** mit Phasen, Meilensteinen und Arbeitspaketen
- **Social Media Stream** - Chronologische Ansicht aller Posts
- **Mediathek** mit Datei-Upload und Verwaltung
- **Aufgaben-Board** mit Statusverfolgung (planned, in_progress, blocker, finished)
- **Agent Workflows** mit KI-Einstellungen und Automatisierung
- **Beteiligte-Verwaltung** für Team-Mitglieder und AI-Agenten
- **Persönlicher Bereich** mit Profil, Credentials und Live-Chat
- **Admin-Bereich** für Systemverwaltung

### Rollen-System
- **Admin** - Vollzugriff auf alle Funktionen
- **Worker** - Bearbeiten von Aufgaben und Kampagnen
- **Visitor** - Lesender Zugriff
- **Agent** - KI-gestützte Automatisierung

### Architektur-Highlights
- ✅ Modulare Full-Stack Architektur
- ✅ Multi-Tenancy vorbereitet (Workspace-Grenzen)
- ✅ OAuth-Provider neutral (für spätere Integration)
- ✅ KI/LLM Anbindung vorbereitet (Lokal/Cloud)
- ✅ Cronjob-Integration für Social-Media-Sync
- ✅ Agent Workflow Engine
- ✅ Responsive Design (Desktop & Mobile)

## 🛠 Tech Stack

- **Frontend**: React 19 + TypeScript + Vite
- **Routing**: React Router v6
- **UI Components**: Lucide Icons
- **Styling**: Tailwind CSS
- **Dateien**: date-fns für Datumsformatierung
- **State Management**: React Context API

## 📁 Projektstruktur

```
src/
├── components/         # Wiederverwendbare Komponenten
│   └── Navigation.tsx
├── contexts/          # React Context Providers
│   └── AuthContext.tsx
├── mock-data/         # Mock-Daten für Demo
│   └── index.ts
├── pages/             # Seiten-Komponenten
│   ├── LandingPage.tsx
│   ├── Dashboard.tsx
│   ├── Campaigns.tsx
│   ├── SocialStream.tsx
│   ├── MediaLibrary.tsx
│   ├── Tasks.tsx
│   ├── Agents.tsx
│   ├── Participants.tsx
│   ├── Profile.tsx
│   └── Admin.tsx
├── types/             # TypeScript Interfaces
│   └── index.ts
└── App.tsx            # Hauptanwendung mit Routing
```

## 🎯 Datenmodelle

Die Plattform verwaltet:
- **Campaigns** - Kampagnen mit Status und Zeitrahmen
- **Phases** - Zeitlich terminierte Kampagnen-Abschnitte
- **Milestones** - Meilensteine innerhalb von Phasen
- **WorkPackages** - Arbeitspakete mit Zuweisungen
- **SocialMediaAccounts** - Connected Accounts mit Credentials
- **SocialMediaPosts** - Posts mit Engagement-Metriken
- **MediaFiles** - Dateien in der Mediathek
- **Agents** - KI-Agenten mit Fähigkeiten
- **Workflows** - Automatisierte Abläufe mit Schritten
- **Users** - Benutzer mit Rollen
- **Participants** - Beteiligte (User + Agents)
- **Credentials** - Gespeicherte Zugangsdaten
- **ChatMessages** - Chat-Nachrichten

## 🔐 Demo Accounts

| E-Mail | Rolle |
|--------|-------|
| admin@example.com | Admin |
| worker@example.com | Worker |
| visitor@example.com | Visitor |
| agent@example.com | Agent |

## 🚀 Starten

```bash
npm install
npm run dev
```

Die Anwendung ist dann unter http://localhost:5173 verfügbar.

## 📋 Implementierungsstatus

### ✅ Vollständig implementiert
- Landingpage mit allen Sektionen
- Authentication Context mit Login/Logout
- Navigation (Desktop & Mobile)
- Alle Hauptseiten als UI-Oberflächen
- Mock-Daten für Demonstration
- Responsive Design
- Routing mit Protected Routes

### 🔌 Integrationsbereit (UI vorhanden, keine Live-API)
- Externe Social-Media-APIs
- Echte OAuth-Logins (3 Anbieter vorbereitet)
- LLM/AI Ausführung
- Live-Chat Backend
- Datei-Upload Storage
- Cronjob Scheduler

## 🏗 Erweiterbarkeit

Die Architektur unterstützt einfache Erweiterung durch:
- Neue Module im `components/` Ordner
- Zusätzliche Seiten im `pages/` Ordner
- Erweiterte Datenmodelle in `types/index.ts`
- Custom Hooks im `hooks/` Ordner
- Services für API-Integrationen

## 📝 Lizenz

Dieses Projekt wurde als Demo/Prototyp erstellt.
