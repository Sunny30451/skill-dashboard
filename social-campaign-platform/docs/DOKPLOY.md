# Deployment auf Contabo mit Dokploy

## Zielbild

`compose.yml` baut CampaignHub exakt mit `npm ci`, `npm run build` und startet es
als unprivilegierter Node-Benutzer über
`node server-dist/server/index.js --production`. Postgres 17, MinIO und optional
Ollama teilen ein internes Docker-Netz. Nur die App und MinIOs S3-API werden via
Dokploy/Traefik über HTTPS geroutet; es gibt keine direkten VPS-Host-Ports. Die
App hört intern auf Port `5173`, MinIOs S3-API auf `9000`. MinIOs Admin-Konsole
wird nicht veröffentlicht.

Die Compose-Datei verwendet Named Volumes, weil Dokploy nur diese über Volume
Backups sichern kann. Keine Datenbank-, MinIO- oder Ollama-Ports am VPS öffnen.

## VPS vorbereiten

1. DNS-`A`/`AAAA` für `campaign.example.com` und
   `media.campaign.example.com` auf den Contabo-VPS setzen.
2. Dokploy nach dessen Installationsanleitung installieren und aktualisieren.
3. Firewall: nur SSH, HTTP 80 und HTTPS 443 zulassen. Postgres 5432, MinIO
   9000/9001 und Ollama 11434 bleiben geschlossen.
4. Genügend freien Speicher für Git-Builds, Images, Medien, Datenbank und Modelle
   reservieren. Ollama auf einem CPU-VPS funktioniert, ist aber langsam und
   RAM-intensiv; für kleine VPS ein kleines quantisiertes Modell wählen.

## Compose-App anlegen

1. In Dokploy Projekt und Umgebung anlegen, dann **Compose → Docker Compose**.
2. Git-Repository/Branch auswählen und den Compose-Pfad auf `./compose.yml`
   setzen. Nicht den Stack/Swarm-Modus verwenden, da dieser `build` nicht
   unterstützt.
3. Unter **Environment** den Inhalt aus `.env.example` übernehmen und alle
   Platzhalter ersetzen. Dokploy schreibt diese Werte in die Compose-`.env`;
   `compose.yml` injiziert bewusst nur die benötigten Variablen.
4. Sichere Werte erzeugen, beispielsweise:

   ```bash
   openssl rand -base64 32 # TOKEN_ENCRYPTION_KEY, exakt 32 Byte Base64
   openssl rand -hex 32    # je ein Passwort/Verify-Token/Secret
   ```

   Für jeden Zweck einen eigenen Wert verwenden. `TOKEN_ENCRYPTION_KEY` nach dem
   ersten Deployment unverändert sichern: Bei Verlust sind gespeicherte
   Provider-Tokens nicht mehr entschlüsselbar.

5. Optionales Ollama aktivieren, indem in Dokploy beim Compose-Start das Profil
   `ollama` gesetzt wird. Auf der CLI lautet der entsprechende lokale Test:

   ```bash
   docker compose --profile ollama up -d --build
   docker compose --profile ollama exec ollama ollama pull gemma3
   ```

   Ohne Profil läuft CampaignHub weiter; KI-Funktionen benötigen dann einen
   anderen serverseitig freigegebenen Ollama-Endpunkt.

## Domain und TLS in der Dokploy-UI

1. **Domains → Add Domain** öffnen.
2. Service `app`, internen Container-Port `5173`, Host
   `campaign.example.com`, Pfad `/` und HTTPS/Let's Encrypt wählen.
3. Eine zweite Domain für Service `minio`, internen Port `9000`, Host
   `media.campaign.example.com`, Pfad `/` und HTTPS hinzufügen. Port `9001`
   niemals veröffentlichen. `S3_ENDPOINT=https://media.campaign.example.com`
   setzen. Die S3-API ist damit nur über Traefik 443 erreichbar; Buckets bleiben
   privat und Objekte benötigen kurzlebige Signaturen.
4. Speichern und die Compose-App neu deployen. Dokploy ergänzt die
   Traefik-Konfiguration; deshalb enthält `compose.yml` absichtlich keine
   Domain-Labels und veröffentlicht keinen Host-Port.
5. `PUBLIC_BASE_URL=https://campaign.example.com` exakt auf dieselbe Origin
   setzen, ohne Pfad und ohne abschließenden Slash. Nach Domainänderungen erst
   diese Variable und alle Provider-Konfigurationen aktualisieren, dann neu
   deployen.

Prüfen:

```bash
curl --fail https://campaign.example.com/api/health/live
curl --fail https://campaign.example.com/api/health/ready
```

`live` ist der Container-Livenesscheck. Für Dokploy/Uptime-Monitoring ist
`ready` der relevante Endpunkt; er prüft auch Postgres. Die Antwort sollte
`storage: true` enthalten.

Die öffentliche S3-Origin ist mit der aktuellen App erforderlich: CampaignHub
liefert kurzlebige vorsignierte URLs an Browser und an Meta/TikTok für deren
`PULL_FROM_URL`-Import. `http://minio:9000` als `S3_ENDPOINT` würde nur im
Docker-Netz aufgelöst und deshalb Vorschau sowie Provider-Publishing brechen.

## Erster Start und Betrieb

- Migrationen laufen beim App-Start unter einem Postgres-Advisory-Lock.
- Der Bootstrap-Admin wird nur erstellt, wenn noch kein Benutzer existiert.
  Danach `BOOTSTRAP_ADMIN_PASSWORD` in Dokploy leeren und neu deployen.
- Logs auf Migration, MinIO-Bucket-Initialisierung und `ready` prüfen.
- Provider erst nach stabiler HTTPS-Domain konfigurieren; die exakten URLs stehen
  in `PROVIDER-SETUP.md`.
- Images monatlich geplant aktualisieren und vorher Backups testen. Gepinnte
  Versionen verhindern überraschende Major-Upgrades; Renovate/Dependabot kann
  Updates kontrolliert vorschlagen.

## Backup

**Empfehlung:** täglich logisch plus volumenbasiert sichern. Volume-Snapshots
allein sind bei laufendem Postgres nicht garantiert transaktionskonsistent.

1. In Dokploy unter **Volume Backups** ein externes S3-kompatibles Ziel mit
   Verschlüsselung und Retention konfigurieren.
2. `postgres_data`, `minio_data` und bei Bedarf `ollama_data` sichern.
3. Zusätzlich regelmäßig ein verschlüsseltes logisches DB-Backup erzeugen:

   ```bash
   docker compose exec -T postgres sh -c \
     'pg_dump -Fc -U "$POSTGRES_USER" -d "$POSTGRES_DB"' \
     > campaignhub-$(date +%F).dump
   ```

4. MinIO entweder mit Dokploys Named-Volume-Backup oder mit einem separaten,
   versionierten S3-Replikations-/`mc mirror`-Ziel sichern. Datenbankdump und
   Objektdaten gehören zum selben dokumentierten Recovery Point.
5. Environment-Secrets, Provider-Konfiguration und insbesondere
   `TOKEN_ENCRYPTION_KEY` separat in einem Passwortmanager sichern. Sie gehören
   nicht ins Git-Repository oder unverschlüsselt ins Backup-Archiv.

## Restore-Test

Mindestens vierteljährlich in einer isolierten Umgebung testen:

1. Produktion schreibgeschützt schalten bzw. Worker stoppen
   (`WORKER_ENABLED=false`), um Publishing-Duplikate zu vermeiden.
2. Leere Named Volumes anlegen und das gewünschte Dokploy-Volume-Backup
   wiederherstellen.
3. Alternativ Postgres logisch restaurieren:

   ```bash
   docker compose exec -T postgres dropdb -U campaignhub --if-exists campaignhub
   docker compose exec -T postgres createdb -U campaignhub campaignhub
   docker compose exec -T postgres pg_restore \
     -U campaignhub -d campaignhub --clean --if-exists < campaignhub.dump
   ```

   Benutzer-/Datenbanknamen an die Environment-Werte anpassen. Dieser Schritt
   ist destruktiv und darf nur gegen die verifizierte Restore-Instanz laufen.

4. Exakt denselben `TOKEN_ENCRYPTION_KEY` einspielen, App starten, `ready`
   prüfen, Medien öffnen und Provider-Verbindungen testen.
5. Erst danach Worker aktivieren. Restore-Zeit, Recovery Point und Ergebnis
   protokollieren.

## Rollback und Fehlerdiagnose

- Bei fehlerhaftem App-Release den vorherigen Git-Commit deployen. Schema-
  Migrationen sind vorwärtsgerichtet; vor potenziell inkompatiblen Änderungen
  ein Restore-fähiges Backup erstellen.
- `ready` 503: Postgres-Healthcheck, `DATABASE_URL`, Migrationen und Logs prüfen.
- `storage: false` oder Startfehler: MinIO-Health, Credentials und S3-Bucket
  prüfen.
- OAuth-Fehler: `PUBLIC_BASE_URL` und registrierte Callback-URL müssen exakt
  übereinstimmen; HTTPS, Host, Pfad und abschließender Slash zählen.

## Primärquellen

- Dokploy Compose/Environment/Named Volumes:
  <https://docs.dokploy.com/docs/core/docker-compose>
- Dokploy Domains via UI:
  <https://docs.dokploy.com/docs/core/docker-compose/domains>
- Ollama Docker-Betrieb:
  <https://hub.docker.com/r/ollama/ollama>
