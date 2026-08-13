# Provider einrichten

Ersetze in allen folgenden URLs `campaign.example.com` durch die produktive
Dokploy-Domain. Die Origin muss exakt `PUBLIC_BASE_URL` entsprechen. Alle URLs
sind öffentlich per HTTPS erreichbar; Connect-Endpunkte bleiben authentifizierte
CampaignHub-Endpunkte.

Die separate Medien-Origin `https://media.campaign.example.com` muss ebenfalls
per HTTPS funktionieren. Sie liefert ausschließlich private Objekte über
kurzlebige vorsignierte URLs; Meta und TikTok müssen diese URLs serverseitig
abrufen können.

| Provider | Connect                                                        | OAuth-Callback                                             | Webhook                                             |
| -------- | -------------------------------------------------------------- | ---------------------------------------------------------- | --------------------------------------------------- |
| YouTube  | `POST https://campaign.example.com/api/social/youtube/connect` | `https://campaign.example.com/api/social/youtube/callback` | `https://campaign.example.com/api/webhooks/youtube` |
| Meta     | `POST https://campaign.example.com/api/social/meta/connect`    | `https://campaign.example.com/api/social/meta/callback`    | `https://campaign.example.com/api/webhooks/meta`    |
| TikTok   | `POST https://campaign.example.com/api/social/tiktok/connect`  | `https://campaign.example.com/api/social/tiktok/callback`  | `https://campaign.example.com/api/webhooks/tiktok`  |

Die Connect-Aufrufe werden normalerweise von der Admin-Oberfläche ausgelöst,
nicht manuell beim Provider eingetragen.

## YouTube / Google

1. In Google Cloud ein Projekt erstellen, YouTube Data API v3 aktivieren und
   einen OAuth-Client vom Typ **Web application** anlegen.
2. OAuth-Consent-Screen mit Produktname, Support-E-Mail, verifizierter Domain,
   Homepage, Datenschutzerklärung und Nutzungsbedingungen ausfüllen.
3. Als **Authorized redirect URI** exakt eintragen:
   `https://campaign.example.com/api/social/youtube/callback`.
4. `YOUTUBE_CLIENT_ID` und `YOUTUBE_CLIENT_SECRET` in Dokploy setzen.
5. Unabhängige Zufallswerte für `YOUTUBE_WEBHOOK_SECRET` und
   `YOUTUBE_WEBSUB_VERIFY_TOKEN` setzen. Die Callback-URL für YouTube-Push/
   WebSub ist `https://campaign.example.com/api/webhooks/youtube`.

CampaignHub fordert inkrementell die tatsächlich implementierten Scopes an:

- `https://www.googleapis.com/auth/youtube.readonly`
- `https://www.googleapis.com/auth/youtube.upload`
- `https://www.googleapis.com/auth/youtube.force-ssl`
- `https://www.googleapis.com/auth/yt-analytics.readonly`

Vor externem Produktivbetrieb Googles OAuth-Verifizierung für sensible Scopes
abschließen. Für Upload-Projekte gilt zusätzlich: API-Projekte ohne verifiziertes
Compliance-Audit können hochgeladene Videos auf privat beschränken. Das
YouTube-Quota-Dashboard überwachen; die Default-Allokation ist begrenzt und
Quota-Erhöhungen verlangen eine Compliance-Prüfung. Service Accounts ersetzen
die Nutzer-OAuth-Autorisierung für normale YouTube-Kanäle nicht.

Tests vor Review:

- Einwilligung, Abbruch, erneutes Verbinden, Refresh nach Ablauf und Revoke.
- Kanal-Erkennung, Upload privat/unlisted/public, geplante Veröffentlichung,
  Made-for-Kids-Auswahl, Sync, Kommentare und Analytics.
- Datenschutzerklärung und Löschprozess mit echten Testkonten.

Offizielle Quellen:

- OAuth Web-Server-Flow, Scopes und Verifizierung:
  <https://developers.google.com/youtube/v3/guides/auth/server-side-web-apps>
- Upload-/Audit-Hinweis:
  <https://developers.google.com/youtube/v3/docs/videos/insert>
- Quota und Audit für Erweiterungen:
  <https://developers.google.com/youtube/v3/guides/quota_and_compliance_audits>
- Push Notifications/WebSub:
  <https://developers.google.com/youtube/v3/guides/push_notifications>

## Meta: Facebook Pages und Instagram

1. In **Meta for Developers** eine Business-App erstellen, Facebook Login for
   Business, Webhooks und die benötigten Graph-/Instagram-Produkte aktivieren.
2. Eine Login-for-Business-Konfiguration erstellen und deren ID als
   `META_CONFIG_ID` hinterlegen.
3. Valid OAuth Redirect URI exakt auf
   `https://campaign.example.com/api/social/meta/callback` setzen.
4. `META_APP_ID`, `META_APP_SECRET` und einen langen zufälligen
   `META_WEBHOOK_VERIFY_TOKEN` in Dokploy hinterlegen.
5. Webhook-Callback `https://campaign.example.com/api/webhooks/meta` mit dem
   gleichen Verify-Token registrieren, relevante Page-/Instagram-Felder
   abonnieren und Meta-Signaturen mit dem App Secret prüfen.

Typische Berechtigungen müssen im konkreten Review auf die tatsächlich sichtbaren
Funktionen minimiert werden, z. B. Page-Liste/-Inhalte/-Interaktion/-Insights und
Instagram Basic, Content Publishing, Kommentare und Insights. Ein
Instagram-Professional-Konto muss mit einer Facebook Page verknüpft sein. App
Review und ggf. Business Verification/Tech-Provider-Anforderungen vor Live-Modus
abschließen; Review-Videos müssen jeden beantragten Scope und den sichtbaren
Nutzerwert zeigen.

Vor Review mit Rollen-/Testkonten prüfen: Login, Page- und IG-Erkennung,
Langzeittoken, Text/Link/Bild/Reel, Containerstatus, Kommentare/Insights,
Webhook-Verifikation/-Signatur sowie Disconnect und Datenlöschung.

Offizielle Quellen:

- Facebook Login for Business:
  <https://developers.facebook.com/docs/facebook-login/facebook-login-for-business>
- Instagram API mit Facebook Login:
  <https://developers.facebook.com/docs/instagram-platform/instagram-api-with-facebook-login>
- Instagram Publishing:
  <https://developers.facebook.com/docs/instagram-platform/instagram-api-with-facebook-login/content-publishing>
- Graph API Webhooks:
  <https://developers.facebook.com/docs/graph-api/webhooks>
- App Review:
  <https://developers.facebook.com/docs/app-review>

## TikTok

1. In TikTok for Developers eine Web-App registrieren und Login Kit, Display API,
   Content Posting API sowie Direct Post aktivieren.
2. Redirect URI exakt setzen:
   `https://campaign.example.com/api/social/tiktok/callback`.
3. Trusted Domain als Origin ohne Pfad eintragen:
   `https://campaign.example.com`.
4. URL-/Domain-Eigentum für `https://campaign.example.com` und die Medien-Origin
   `https://media.campaign.example.com` verifizieren. Für `PULL_FROM_URL` muss
   die URL-Eigenschaft, von der TikTok Medien abruft, verifiziert sein.
5. Webhook `https://campaign.example.com/api/webhooks/tiktok` konfigurieren und
   den Test-Request aus dem Portal erfolgreich empfangen.
6. `TIKTOK_CLIENT_KEY`, `TIKTOK_CLIENT_SECRET` und einen unabhängigen
   `TIKTOK_WEBHOOK_SECRET` in Dokploy hinterlegen.

CampaignHub nutzt `user.info.basic`, `video.list`, `video.upload` und
`video.publish`. `video.publish` benötigt Freigabe und Nutzerautorisierung. Vor
jedem Direct Post müssen aktuelle Creator-Informationen abgerufen, angebotene
Privacy-/Interaktionsoptionen respektiert und eine ausdrückliche Nutzerfreigabe
eingeholt werden. Nicht auditierte Direct-Post-Clients veröffentlichen nur privat;
für öffentliche Sichtbarkeit ist das Content Posting API Audit erforderlich.

Review-/Audit-Test: Auth/Refresh/Revoke, Creator-Info-UI, ausdrückliche
Bestätigung, Video und Foto, Uploadstatus/Polling, complete/failed Webhooks,
Privacy/Kommentar/Duet/Stitch, Branded Content und AIGC-Markierung. Keine
unzulässigen Watermarks oder Promotions in exportierte Medien einfügen.

Offizielle Quellen:

- App und URL-Verifizierung:
  <https://developers.tiktok.com/doc/getting-started-create-an-app/>
- Trusted Domain und Webhooks:
  <https://developers.tiktok.com/doc/set-up-development-configuration>
- Content Posting/Direct Post/Audit:
  <https://developers.tiktok.com/doc/content-posting-api-get-started>
- Content Sharing Guidelines:
  <https://developers.tiktok.com/doc/content-sharing-guidelines/>
- Status und Webhook-Ereignisse:
  <https://developers.tiktok.com/doc/content-posting-api-reference-get-video-status>

## Go-live-Gate

Provider nicht live schalten, bevor HTTPS, exakte Redirects, Signaturprüfung,
Least-Privilege-Scopes, Privacy-/Terms-/Deletion-Seiten, Review-/Audit-Status,
Quota-/Rate-Limit-Monitoring und ein getesteter Revoke-/Delete-Flow dokumentiert
sind. Änderungen an Domain, Scopes oder sichtbarem Funktionsumfang können eine
erneute Provider-Prüfung auslösen.
