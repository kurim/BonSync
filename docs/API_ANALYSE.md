# Lidl Plus APK – Analyse der Login- und Kassenbon-API

Analysiert: `com.lidl.eci.lidlplus_17.9.3-minAPI28(arm64-v8a)(nodpi).apk`
Methode: `apktool` (Smali/Resourcen), `jadx` (teilweise), `hbc-decompiler` (Hermes/React-Native-Bundle `assets/bundle.jsbundle`), gezielte String-/Grep-Analyse über Smali-Quellcode.

Die App ist ein Hybrid: ältere/kernnahe Features (u. a. **Kassenbons/"tickets"**) sind natives Kotlin,
neuere Screens laufen in einem React-Native/Expo-Modul namens **"axion"** (Hermes-Bytecode in `assets/bundle.jsbundle`).

## 1. Login – OAuth 2.0 Authorization Code + PKCE

Die App nutzt die Bibliothek `net.openid.appauth` (AppAuth) für einen Standard-OIDC-Login gegen einen
separaten Identity-Server. Es gibt **keinen** direkten "POST /login mit Passwort"-Call in der App selbst –
Login läuft über eine eingebettete WebView/Browser-Seite von Lidl.

Verifizierte Werte (aus String-Konstanten im Bytecode):

| Parameter | Wert |
|---|---|
| Issuer | `https://accounts.lidl.com` |
| Authorization-Endpoint | `https://accounts.lidl.com/connect/authorize` |
| Token-Endpoint | `https://accounts.lidl.com/connect/token` |
| `client_id` | `LidlPlusNativeClient` |
| Client-Credential-String | `LidlPlusNativeClient:secret` (als Basic-Auth-Header beim Token-Call verwendet) |
| `scope` | `openid profile offline_access lpprofile lpapis` |
| `redirect_uri` | `com.lidlplus.app://callback` *(Custom-URI-Scheme, s. Korrektur unten)* |
| PKCE | `code_challenge` / `code_challenge_method=S256` / `code_verifier` (Standard-PKCE via AppAuth) |
| Login-Seite (in WebView) | `/account/login`, `/account/login/browser?client_id=...`, `/account/login/mobile?client_id=...` |
| MFA-Seite | `/account/mfa?client_id=...` |

**Zusaetzliche Pflicht-Parameter am Authorize-Call (Update):** Ein erster Test ohne diese Parameter
landete auf `https://accounts.lidl.com/error`. Grund: Die App haengt neben den Standard-AppAuth-Parametern
noch vier eigene Werte als `additionalParameters` an (gefunden in `Lqck;->a()` / Aufrufer von `Lio0;->a()`):

| Parameter | Quelle/Bedeutung | Beispielwert |
|---|---|---|
| `Country` | `SharedPreferences["countryId"]` – Land des Lidl-Plus-Kontos | `DE` |
| `language` | `SharedPreferences["langID"] + "-" + countryId` | `de-DE` |
| `force` | Boolean, vermutlich "Re-Login erzwingen" | `false` |
| `track` | Boolean, vermutlich Tracking-/Analytics-Consent | `false` |

Der Identity-Server kann ohne `Country`/`language` offenbar keinen Mandanten (Land) auflösen und zeigt
die generische Fehlerseite. `force`/`track` scheinen unkritisch, wurden aber der Vollständigkeit halber
mit aufgenommen. `lidlplus_client.py` setzt diese jetzt automatisch (`--country`/`--language`-Flags bei
`login`).

**Korrektur: redirect_uri.** Die ursprünglich hier notierte `https://lidlplus.com/mylidlprofile?deeplink=1`
ist **falsch** für den nativen Login-Flow und führt am `/connect/authorize`-Aufruf zu einem sofortigen
`https://accounts.lidl.com/error?id=...` (IdentityServer/Duende zeigt bei einer *redirect_uri*, die für
den Client nicht registriert ist, aus Sicherheitsgründen direkt eine Fehlerseite an, statt mit
Fehlerparametern zur redirect_uri zurückzuleiten — genau das beobachtete Verhalten). Jene URL wird
tatsächlich nur von anderen, unabhängigen WebView-Deep-Links benutzt (Rechnungs-/Adress-Formulare),
nicht vom OAuth-Login.

Die korrekte, im `AndroidManifest.xml` registrierte Redirect-URI ist ein **Custom-URI-Scheme**:

```xml
<activity android:exported="true" android:name="net.openid.appauth.RedirectUriReceiverActivity">
    <intent-filter>
        <action android:name="android.intent.action.VIEW"/>
        <category android:name="android.intent.category.DEFAULT"/>
        <category android:name="android.intent.category.BROWSABLE"/>
        <data android:host="callback" android:scheme="com.lidlplus.app"/>
    </intent-filter>
</activity>
```

→ `redirect_uri = com.lidlplus.app://callback`. Das öffentliche Discovery-Dokument
(`https://accounts.lidl.com/.well-known/openid-configuration`) bestätigt Endpunkte/Scopes/Response-Types
unabhängig davon als korrekt.

Praktische Konsequenz: Ein Desktop-Browser kann `com.lidlplus.app://callback?...` nicht öffnen. Die
finale URL mit dem `code`-Parameter lässt sich trotzdem einsehen, z. B. über die Browser-DevTools
(Network-Tab mit "Preserve log", nach dem Login nach einem Eintrag "callback" suchen und dessen
Request-URL kopieren) oder über den "Anwendung öffnen?"-Dialog, den manche Browser anzeigen.

Token-Response-Felder (aus AppAuth-`TokenResponse`-Parsing im Code): `access_token`, `refresh_token`,
`id_token`, `token_type`, `expires_at`, `scope`.

**Ablauf, den man nachbauen kann:**
1. PKCE `code_verifier` + `code_challenge` (S256) erzeugen, `state`/`nonce` generieren.
2. Browser öffnen auf `.../connect/authorize?client_id=LidlPlusNativeClient&response_type=code&redirect_uri=...&scope=...&code_challenge=...&code_challenge_method=S256&state=...`.
3. Nutzer loggt sich auf der echten Lidl-Seite ein (inkl. evtl. MFA – das übernimmt der Identity-Server, nicht die App).
4. Browser leitet auf `com.lidlplus.app://callback?code=...&state=...` um. Auf dem Handy fängt Android
   das per Intent-Filter ab (`net.openid.appauth.RedirectUriReceiverActivity`, siehe Korrektur unten);
   im Desktop-Browser für ein eigenes Script kann man das nicht direkt öffnen, aber per DevTools
   (Network-Tab, "Preserve log") den fehlgeschlagenen Navigations-Request sehen und dessen URL kopieren.
5. `code` gegen Token tauschen: `POST /connect/token` mit `grant_type=authorization_code`, `code`, `redirect_uri`, `code_verifier`, `client_id`, Basic-Auth-Header aus der Client-Credential-Zeichenkette oben.
6. Refresh via `grant_type=refresh_token`.

### Login-Automatisierung (`login-auto`) und ihre Grenze

`lidlplus_client.py login-auto` automatisiert Schritt 3 (Formular ausfuellen) per Selenium gegen die
echte, sich aendernde SPA unter `accounts.lidl.com/Account/Login` (Element-Selektoren siehe Code-
Kommentare; die Seite nutzt je Schritt unterschiedliche `data-testid`s fuer den "Weiter"-Button:
`login-or-register-submit-button` beim ersten Schritt, `button-primary` danach).

**Bestaetigte Grenze:** Die Seite läuft mit unsichtbarem Google-reCAPTCHA (Enterprise, v3) im
Hintergrund. Eine per Selenium/ChromeDriver gesteuerte Session wird von reCAPTCHA als automatisiert
erkannt (u. a. am `navigator.webdriver`-Flag) und mit einer Meldung *"Die Kapazität wurde
überschritten"* abgewiesen - während derselbe Login manuell im normalen Browser vom selben Rechner/
derselben IP anstandslos funktioniert. Das ist **kein** IP-Rate-Limit, sondern gezielte
Bot-Erkennung. Es werden hier bewusst **keine** Umgehungstechniken eingebaut (kein
`undetected-chromedriver`, kein Patchen von `navigator.webdriver`, keine simulierten
Mausbewegungen o. ä.), da das eine gezielte Umgehung einer Anti-Automatisierungs-Maßnahme wäre.

`login-auto` versucht deshalb erst den automatisierten Weg und fällt bei jedem Fehler (inkl.
reCAPTCHA-Abweisung) automatisch auf den manuellen Flow zurück (`--no-manual-fallback` deaktiviert
das). Erfolgsaussicht des automatisierten Wegs ist unsicher/wechselhaft; der manuelle `login`-Befehl
bleibt der zuverlässige Standardweg.

## 2. API-Gateways (Basis-URLs)

Aus dem Hermes-Bundle (React-Native-Teil) extrahiert – Umgebungsauswahl (`production`/`uat`/`staging`):

```
https://connect.lidlplus.com/app-api        (production, "Haupt-Gateway" vieler Features)
https://connect-uat.lidlplus.com/app-api
https://connect-stg.lidlplus.com/app-api
```

Alle Requests bekommen per Interceptor `Authorization: Bearer <access_token>` (Token kommt aus dem
Auth-Modul, s. o.).

Zusätzlich existiert eine **riesige Liste eigener Microservice-Hosts** nach Muster
`<feature>[-uat|-stg].lidlplus.com` (aus DI-Konfigurationsklassen extrahiert), u. a.:

```
tickets.lidlplus.com/api/       <-- Kassenbons/Receipts (siehe unten)
tickets-uat.lidlplus.com/api/
tickets-stg.lidlplus.com/api/
eticket.lidlplus.com            <-- vermutlich E-Rechnung/elektronischer Bon-Export
home.lidlplus.com/api/
loyaltytab-*.lidlplus.com
coupons.lidlplus.com / couponplus.lidlplus.com
stores.lidlplus.com
selfscanning.lidlplus.com
... (>60 weitere, siehe Rohdaten unten)
```

## 3. Kassenbons ("Meine Kassenbons") – Feature-Paket

Natives Kotlin-Paket: `es.lidlplus.features.tickets.*`
Basis-URL: **`https://tickets.lidlplus.com/api/`** (separates Microservice, nicht das `app-api`-Gateway).

Bestätigtes Response-Modell für einen Listeneintrag (`TicketListResponse`, Moshi-generiert, Feldnamen 1:1
aus `@Json`-Annotationen extrahiert):

```jsonc
{
  "id": "string",
  "isFavorite": false,
  "date": "2026-01-01T12:00:00+01:00",   // OffsetDateTime, ISO-8601
  "totalAmount": 12.34,                    // BigDecimal
  "savings": 0.50,                         // BigDecimal
  "articlesCount": 5,
  "couponsUsedCount": 0,
  "returns": [ /* ReturnResponse[] */ ],
  "isHtml": false,
  "iconUrl": "https://...",
  "vendor": { /* VendorResponse */ },
  "badges": { /* BadgesResponse */ },
  "origin": "..."                          // Enum TicketListResponse$a
}
```

Weitere vorhandene Detail-Modelle (Ticket-Detailansicht, `es.lidlplus.features.tickets.data.api.models`):
`TicketUnifiedResponse`, `TicketLineResponse`, `TicketPaymentResponse`, `TicketCardPaymentResponse`,
`TicketDiscountResponse`, `TicketDepositResponse`, `TicketReturnedLineResponse`, `TicketTaxResponse`,
`TicketTotalTaxesResponse`, `TicketTenderChangeResponse`, `TicketCouponResponse`, `TicketCurrencyResponse`,
`StoreResponse`, `VendorResponse`, `CodeResponse`/`CodeLabelResponse`, plus länderspezifische
Fiskalisierungs-Modelle `FiscalDataAtResponse` (AT), `FiscalDataCZResponse` (CZ), `FiscalDataDeResponse` (DE)
und länderspezifische Zahlungs-/Zeitstempel-Views (CZ, DK, IE, IT, SE, PL) – d. h. der Bon-Aufbau
unterscheidet sich je nach Land (Fiskalisierung).

**Update – funktioniert, Ende-zu-Ende gegen den echten Account verifiziert (Login + Ticketliste):**

```
GET https://tickets.lidlplus.com/api/v2/{country}/tickets?skip=0&take=50
Authorization: Bearer <access_token>
```

liefert `200` mit einem **reinen JSON-Array** von `TicketListResponse`-Objekten (kein Wrapper-Objekt) -
bestätigt durch einen echten Testlauf, z. B.:

```json
[
  {"date":"2025-06-30T17:16:34+00:00","totalAmount":68.88,"articlesCount":48,"id":"23003303220250630685989", "..."},
  {"date":"2025-03-08T17:01:16+00:00","totalAmount":47.46,"articlesCount":42,"id":"23006400120250308664356", "..."}
]
```

- `{country}` ist ein **Pfadsegment** (nicht Query!), ≤2 Zeichen, ISO-Ländercode wie `DE`.
- Es gibt **kein** User-ID-Segment im Pfad - der Server identifiziert den Nutzer allein über den
  Bearer-Token. Ein erster Versuch mit `.../v2/{userId}/tickets?Country=DE` schlug mit `400` fehl:
  `"The length of 'Country' must be 2 characters or fewer. You entered 17 characters."` - die 17 Zeichen
  waren exakt die Länge der (fälschlich in den Pfad gesetzten) User-ID. Das zeigte, dass ASP.NET das
  einzige Pfadsegment positionell auf den Parameter `Country` bindet, nicht auf eine User-ID.
- `skip`/`take` als Pagination-Query-Parameter funktionieren (Response kam mit weniger Ergebnissen als
  `take`, Pagination-Loop im Client bricht dann korrekt ab). Ob es zusätzlich einen serverseitigen
  Datumsfilter-Query-Parameter gibt, ist weiterhin offen und für den Anwendungsfall auch nicht nötig -
  der Client filtert Datum client-seitig (s. u.), das funktioniert nachweislich.
- Die Ticket-`id` (z. B. `23003303220250630685989`) enthält augenscheinlich eingebettet eine
  Filial-/Kassen-Kennung, das Kaufdatum (`20250630`) und eine laufende Nummer - nicht weiter verifiziert,
  aber für einen `ticket`-Detailaufruf reicht die rohe ID als Pfad-Parameter.

**Update (Ende-zu-Ende gegen den echten Account verifiziert, echter `200` mit vollem Bonbeleg):**
Der Detail-Endpoint liegt **NICHT** unter `v2` wie ursprünglich (unten stehend) angenommen, sondern
unter `v3`. `v2/{country}/tickets/{ticketId}` liefert einen sofortigen, leeren `400` direkt von
`istio-envoy` (Content-Length: 0, `x-envoy-upstream-service-time: 1`ms) - die Route existiert unter
`v2` fuer ein einzelnes Ticket schlicht nicht, obwohl die Referenzbibliothek (s.u.) sie dort erwartet
(vermutlich ein API-Versions-Unterschied zwischen iOS- und Android-App, oder die Bibliothek ist selbst
veraltet). Richtig ist:
```
GET https://tickets.lidlplus.com/api/v3/{country}/tickets/{ticketId}
Headers: Authorization: Bearer ..., Accept-Language: de, Operating-System: Android,
         App: com.lidl.eci.lidlplus, App-Version: 17.9.3
```
`lidlplus_client.py` (`TICKET_DETAIL_PATH_TEMPLATE`) wurde entsprechend auf `v3` korrigiert.

**Korrektur eines eigenen Irrwegs:** Ein Zwischenschritt vermutete zwar korrekt `v3/{country}/tickets/{ticketId}`,
setzte dabei aber einen Query-Parameter `LanguageCode` (der Server antwortete mit `400` und
`"'Language Code' must not be empty."`). Das führte in die Irre - selbst mit gesetztem `LanguageCode`
blieb der Fehler "0 characters" bestehen, weil der Server den Wert offenbar aus einem **Header**
liest, nicht aus der Query - genau wie beim Liste-Endpoint. Mit `Accept-Language: de` als Header
(statt `LanguageCode` als Query-Parameter) liefert `v3` den vollen Beleg. Die quelloffene Python-Bibliothek
[`lidl-plus`](https://pypi.org/project/lidl-plus/) (PyPI, genutzt vom Home-Assistant-Addon
[FaserF/ha-lidl](https://github.com/FaserF/ha-lidl)) verwendet laut ihrem Quellcode zwar konsequent `v2`
für Liste **und** Detail (gegen den echten Account per Live-Test widerlegt, s.o. - fuer Detail
funktioniert nur `v3`), schickt aber bei jedem Request dieselben Header mit:

```python
{
    "Authorization": f"Bearer {token}",
    "App-Version": "999.99.9",
    "Operating-System": self._OS,          # "iOs" bei dieser (iOS-)Bibliothek
    "App": "com.lidl.eci.lidl.plus",       # iOS-Bundle-ID
    "Accept-Language": self._language,     # z.B. "de"
}
```

Für unseren (Android-)Client wurde das auf `Operating-System: Android` und `App: com.lidl.eci.lidlplus`
(die echte Android-Package-ID dieser APK) angepasst; `App-Version` bleibt die echte `17.9.3`. Diese
Referenzbibliothek bestätigt zusätzlich unabhängig alle bisherigen Kernfunde: `_CLIENT_ID =
"LidlPlusNativeClient"`, `_AUTH_API = "https://accounts.lidl.com"`, Redirect `com.lidlplus.app://callback`,
Scope `"openid profile offline_access lpprofile lpapis"`, Token-Endpoint-Basic-Auth aus
`f"{client_id}:secret"`, sowie die Zusatzparameter `Country`/`language` (`{lang}-{country}`) beim
Authorize-Call.

**Wie das gefunden wurde:** Da statische Analyse nicht ausreichte, wurde ein kleines Diagnose-Kommando
(`probe`) gebaut, das mit dem echten, gültigen Access-Token mehrere plausible Pfad-Varianten durchprobiert
und die HTTP-Status-Codes (plus Response-Body) zurückmeldet. `404` heißt "Pfad existiert nicht", `400`
mit Validierungsfehler-JSON heißt "Pfad existiert, Parameter falsch belegt" - über den konkreten
Fehlertext (Feldname + erwartete/erhaltene Länge) ließ sich die tatsächliche Parameterbedeutung ableiten,
ganz ohne Netzwerk-Mitschnitt. Alternative wäre ein MITM-Proxy gewesen (siehe `network_security_config.xml`:
nur `storetools.lidlplus.com` ist per Certificate-Pinning geschützt, kein programmatischer
`OkHttp CertificatePinner` im Code gefunden, d. h. mitmproxy/Burp wäre grundsätzlich möglich gewesen).

**Praktischer Workaround ohne Proxy-Mitschnitt:** Da jedes Listenelement bereits ein `date`-Feld hat,
kann der beiliegende Client (`lidlplus_client.py`) den serverseitigen Datumsfilter umgehen: er lädt die
Ticket-Liste (mit Pagination) und filtert clientseitig nach Datum. Das funktioniert unabhängig davon, ob
der Server selbst einen Datumsfilter unterstützt.

### 3.1 Kein natives PDF pro Ticket - nur fuer "Rechnungen" mit `hasInvoice=true`

Die API liefert fuer normale Kassenbons **kein** PDF. Ein `ticket`-Detail-Objekt enthaelt zwar ein
Feld `hasInvoice`, aber bei allen 13 bisher im Testaccount vorhandenen Tickets steht es auf `false`.
Im APK-Bytecode (`classes5.dex`/`classes6.dex`) finden sich dazu passende Strings:

```
v3/{country}/invoice/{id}                              (classes5.dex)
/api/v1/{country}/invoice/{transactionId}/pdf           (classes6.dex, evtl. anderer Host/Feature)
DOWNLOAD_INVOICE, tickets_detail_certifiedinvoicebutton,
tickets_downloadinvoice_error, PDFRequest(pdfUrl=...), Pdf(url=...)
```

Das deutet auf eine **pro Beleg manuell in der App anzustoßende** "Rechnung anfordern"-Funktion hin
(vermutlich fuer eine offizielle, ggf. auch gegenueber dem Finanzamt gueltige Rechnung, getrennt vom
normalen Kassenbon) - danach wechselt vermutlich `hasInvoice` auf `true` und der Invoice-Endpoint liefert
eine PDF-URL. Nicht weiter verifiziert, da kein Testticket das je durchlaufen hat.

**Praktischer Ersatz:** Jedes Ticket-Detail-Objekt enthaelt unabhaengig davon immer ein
`htmlPrintedReceipt`-Feld - eine vollstaendige HTML-Nachbildung des gedruckten Kassenbons (Artikel,
MWST-Aufschluesselung, Zahlungsbeleg). `lidlplus_client.py ticket-pdf <id>` rendert dieses HTML per
headless Chrome (`Page.printToPDF` ueber CDP, wiederverwendet dieselbe Chrome-Infrastruktur wie
`login-auto`) zu einem echten, archivierbaren PDF - visuell identisch mit dem Bon an der Kasse.

## 4. Deep-Link-Routen (nur interne Navigation, keine REST-Endpunkte)

`/wallet`, `/cards`, `/tickets`, `/redeemCode`, `/legalinfo`, `/settings-countrychange` – werden von einer
Router-Klasse (`Uri`-Matching) für `lidlplus://`- bzw. App-Link-Navigation ausgewertet.

## 5. Certificate Pinning

`res/xml/network_security_config.xml`:

```xml
<domain-config>
    <domain includeSubdomains="true">storetools.lidlplus.com</domain>
    <pin-set>
        <pin digest="SHA-256">68l4rg3Z5YItaxllJZb2IMk9fK76lSGRywUKYyypAF8=</pin>
        <pin digest="SHA-256">QPz8KIddzL/ry99s10MzEtpjxO/PO9extQXCICCuAnQ=</pin>
    </pin-set>
</domain-config>
```

Nur `storetools.lidlplus.com` ist gepinnt (vermutlich Kassen-/POS-Terminal-Kommunikation, nicht relevant für
Login/Kassenbons). `connect.lidlplus.com`, `tickets.lidlplus.com`, `accounts.lidl.com` sind **nicht** gepinnt.

## 6. Alle gefundenen `*.lidlplus.com`-Hosts (Rohdaten, zur Referenz)

<details>
<summary>Ausklappen</summary>

```
alerts, announcements, appgateway, branddeals, brochures, clickandpick, consent, coupid, couponplus,
coupons, deposits, devices, digital-leaflet, employeeprogram, eticket, flashsales, giveaway,
grocerypickup, home, inviteyourfriends, localization, loyaltytab, mobile-otel, myip, offers, opengift,
partnersbenefits, payments, personalized-campaigns, persosurveys, product-catalog, productshowcase,
profile, purchaselottery, push-notifications, segments, selfscanning, shopping-list, stampcard,
stampcardbenefits, static-purchaselottery, stores, storetools, subscriptions, summary, surveys,
tickets, tipcards, travel, usermodel, versions, wifi, worldofneeds, wrapped
```
(jeweils mit `.lidlplus.com`, teils zusätzlich `-uat`/`-stg`-Varianten)

</details>

## 7. Wichtiger Hinweis

Das Basic-Auth-Feld `Basic YWRtaW46R2pNMDZSMUl3NDE0` (→ `admin:GjM06R1Iw414`), das man beim ersten
Grep-Durchlauf für OAuth halten könnte, gehört **nicht** zum Login – das ist Zugangsdaten für den
internen OpenTelemetry-Tracing-Export (`https://mobile-otel.lidlplus.com:4417/v1/traces`) und für die
eigentliche API irrelevant.
