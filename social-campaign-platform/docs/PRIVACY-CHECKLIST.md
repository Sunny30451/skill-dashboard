# Datenschutz- und Security-Checkliste

Diese Liste ist eine technische Betriebsgrundlage, keine Rechtsberatung. Vor dem
öffentlichen Betrieb mit Datenschutzbeauftragten/Rechtsberatung auf EU-/DE-
Anforderungen, Verträge und konkrete Datenflüsse abstimmen.

## Vor Go-live

- [ ] Verantwortliche Stelle, Kontakt und ggf. Datenschutzbeauftragte benennen.
- [ ] Öffentlich erreichbare, aktuelle Datenschutzerklärung, Nutzungsbedingungen
      und Kontolösch-/Datenlöschseite unter der verifizierten HTTPS-Domain
      veröffentlichen.
- [ ] Zwecke, Rechtsgrundlagen, Datenkategorien, Empfänger/Provider,
      Drittlandtransfers, Speicherdauer und Betroffenenrechte dokumentieren.
- [ ] Auftragsverarbeitungsverträge und Subprozessoren für Contabo, E-Mail,
      Backup-Ziel und weitere Dienste prüfen; Transfermechanismen dokumentieren.
- [ ] Verzeichnis von Verarbeitungstätigkeiten und ggf. DSFA erstellen.
- [ ] Nur notwendige OAuth-Scopes beantragen; getrennte Funktionen inkrementell
      autorisieren und Einwilligung/Publishing-Freigabe nachvollziehbar speichern.
- [ ] Google OAuth-Verifizierung, Meta App Review/Business Verification und TikTok
      Review/Content-Posting-Audit abgeschlossen oder Testbeschränkungen sichtbar
      dokumentiert.
- [ ] Provider-Markenrichtlinien, Made-for-Kids, Branded Content und AIGC-
      Kennzeichnung im Produktprozess abbilden.

## Secrets und Zugriff

- [ ] `.env` nie committen; Secrets nur in Dokploy/Secret-Manager und
      verschlüsseltem Notfall-Backup speichern.
- [ ] Einzigartige, lange Werte für Postgres, MinIO, Admin, Webhook-Verifikation
      und jeden Provider verwenden.
- [ ] `TOKEN_ENCRYPTION_KEY` ist exakt 32 zufällige Base64-Bytes, gesichert und
      mit dokumentiertem Zwei-Personen-Rotationsverfahren versehen.
- [ ] Bootstrap-Adminpasswort nach dem ersten Start aus der Laufzeitumgebung
      entfernen; MFA/SSO ergänzen, sobald unterstützt.
- [ ] Least-Privilege-Rollen quartalsweise prüfen; ausgeschiedene Personen sofort
      sperren, Sessions widerrufen und Provider-Verbindungen neu bewerten.
- [ ] Dokploy, VPS, Git-Provider und Backup-Ziel mit MFA, getrennten Admin-Konten
      und auditierbaren Zugriffen schützen.

## Netzwerk und Plattform

- [ ] DNS und gültiges TLS; HTTP wird auf HTTPS umgeleitet, HSTS erst nach
      erfolgreicher Subdomain-/Recovery-Prüfung aktivieren.
- [ ] Nur 22 (eingeschränkt), 80 und 443 extern; 5432, 9000/9001 und 11434 sind
      nicht als VPS-Host-Ports veröffentlicht. MinIOs private S3-API ist nur über
      die dedizierte TLS-Medien-Domain/Traefik erreichbar; die Admin-Konsole
      bleibt intern.
- [ ] SSH nur mit Schlüsseln, Root-Login/Passwortlogin deaktiviert, Updates und
      Reboot-Fenster definiert, Fail2ban oder äquivalenter Schutz aktiviert.
- [ ] App läuft non-root, ohne Linux-Capabilities und mit
      `no-new-privileges`; Containerimages und npm-Abhängigkeiten regelmäßig auf
      Schwachstellen prüfen.
- [ ] Ollama bleibt intern und host-allowlisted. Prompts können Kampagnen-, Chat-
      und Personendaten enthalten; Modell, Logs und Retention in die
      Datenschutzdokumentation aufnehmen.

## OAuth, Webhooks und Publishing

- [ ] Callback-URIs exakt auf `/api/social/{provider}/callback`; OAuth-`state`
      einmalig, kurzlebig und nutzergebunden; PKCE wo unterstützt.
- [ ] Provider-Tokens verschlüsselt gespeichert, nie geloggt und bei Ablauf
      sicher aktualisiert. Refresh-Token-Rotation atomar/preservierend testen.
- [ ] Webhooks exakt auf `/api/webhooks/{provider}`; rohe Request-Bytes vor dem
      JSON-Parsen signaturprüfen, Zeitfenster/Replay-Schutz und Idempotenz nutzen.
- [ ] Meta Challenge-Verify-Token, Meta `X-Hub-Signature-256`, TikTok-Signatur und
      YouTube WebSub-Secret/Challenge gemäß Provider-Spezifikation testen.
- [ ] Publishing erfordert sichtbare Zielkonto-, Inhalt-, Privacy-, Zeitplan- und
      Compliance-Bestätigung. Fehlgeschlagene Jobs dürfen nicht still als Erfolg
      gelten; Retries müssen Duplikate verhindern.
- [ ] Provider-Revoke und lokales Disconnect vollständig testen. Entzogene oder
      abgelaufene Tokens werden nicht weiter verwendet.

## Datenminimierung, Aufbewahrung und Löschung

- [ ] Pro Datenkategorie eine konkrete Retention definieren: Sessions, OAuth-
      States, Provider-Tokens, Webhook-Payloads, Jobs/Fehler, Medien, Chat,
      Analytics, Audit- und Applikationslogs.
- [ ] OAuth-States nach Minuten, unbearbeitete Webhook-Rohdaten und Provider-
      Fehlerdetails so kurz wie betrieblich möglich löschen/anonymisieren.
- [ ] Logs enthalten keine Tokens, Cookies, Passwörter, vollständigen Webhook-
      Payloads oder unnötige personenbezogene Inhalte; Zugriff und Retention sind
      begrenzt.
- [ ] Nutzerexport in strukturiertem Format und nachvollziehbare Löschung aus
      Postgres, MinIO, Provider-Verbindungen, Jobs/Webhooks und Backups umsetzen.
- [ ] Vor Nutzerlöschung Provider-Tokens widerrufen. Medienobjekte und DB-
      Referenzen transaktional/mit Löschwarteschlange bereinigen.
- [ ] Backup-Löschkonzept dokumentieren: unveränderliche Backups laufen nach der
      Retention aus; gelöschte Daten werden bei Restore erneut gelöscht, bevor
      die Instanz produktiv geht.
- [ ] Meta Data Deletion Callback/Status-URL sowie Google-/TikTok-
      Löschanforderungen entsprechend den tatsächlich aktivierten Produkten
      konfigurieren und regelmäßig testen.

## Backup, Monitoring und Incident Response

- [ ] Tägliche verschlüsselte Offsite-Backups für `postgres_data` und
      `minio_data`; Environment-Secrets separat. Ollama-Modelle nur sichern, wenn
      erneuter Download nicht genügt.
- [ ] Monatlicher automatisierter Integritätscheck, vierteljährlicher Restore-Test
      mit dokumentiertem RPO/RTO und Zwei-Personen-Freigabe.
- [ ] Backup-Zugriff getrennt, Write-once/Versionierung und Lifecycle-Retention;
      Schlüsselrotation darf alte Backups nicht unlesbar machen.
- [ ] Monitoring für `/api/health/ready`, Speicher, DB-Verbindungen,
      Job-Fehlerrate, Provider-Ratenlimits/Quota, Tokenablauf und Webhook-Fehler.
- [ ] Alarme enthalten keine vertraulichen Payloads. Uhrzeit/NTP synchron halten,
      damit Signatur- und Replay-Prüfungen funktionieren.
- [ ] Incident-Runbook mit Isolation, Secret-/Token-Rotation, Provider-Revoke,
      Beweissicherung, interner Eskalation und Meldefristen pflegen und üben.
- [ ] Nach Restore Worker zunächst deaktivieren, Webhooks/Replays deduplizieren
      und erst nach Konsistenzprüfung Publishing reaktivieren.

## Regelmäßige Prüfung

- [ ] Monatlich Images/Dependencies, Provider-Changelogs und Dokploy aktualisieren.
- [ ] Quartalsweise Rollen, Scopes, Provider-App-Konfiguration, Löschtests,
      Webhook-Signaturen, Backup-Restore und öffentliche Rechtstexte prüfen.
- [ ] Jährlich sowie bei neuem Provider/Scope/Zweck Datenschutzbewertung,
      Bedrohungsmodell, Review-/Audit-Status und Incident-Übung erneuern.

## Referenzen

- Google API Services User Data Policy:
  <https://developers.google.com/terms/api-services-user-data-policy>
- YouTube API Services Terms/Policies:
  <https://developers.google.com/youtube/terms/api-services-terms-of-service>
- Meta Platform Terms:
  <https://developers.facebook.com/terms/>
- TikTok Developer Terms:
  <https://developers.tiktok.com/terms/>
- Dokploy Named-Volume-Backups:
  <https://docs.dokploy.com/docs/core/docker-compose>
