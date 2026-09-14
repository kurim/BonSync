# Fahrplan: Supermarkt-Kassenbon-Hub (Node/SvelteKit, Multi-Store)

Planungsdokument für eine neue, eigenständige Anwendung, die die vier bereits
reverse-engineerten Kassenbon-APIs (REWE, PENNY, LIDL, ROSSMANN) als
an-/abschaltbare Module bündelt. Ein Runtime/eine Build-Pipeline (Node),
SvelteKit fullstack, Tailwind fürs Styling, Login zum Schutz der Daten.

Dieses Dokument wird **hier** (`/home/kurim/_receipts/`) gepflegt; das
eigentliche Projekt entsteht in einem neuen, separaten Arbeitsverzeichnis.

**Quellen** (jeweils die vollständige, live-verifizierte API-Doku – bei
Implementierung eines Moduls zuerst dort nachschlagen, nicht raten):

| Store | Dokument |
|---|---|
| REWE | [`rewe/api-rewe.md`](./rewe/api-rewe.md) |
| PENNY | [`penny/README.md`](./penny/README.md) |
| LIDL | [`lidl/LIDL_PLUS_API.md`](./lidl/LIDL_PLUS_API.md) (+ [`API_ANALYSE.md`](./lidl/API_ANALYSE.md) für Details/Sackgassen) |
| ROSSMANN | [`rossmann/rossmann-api-login-flow.md`](./rossmann/rossmann-api-login-flow.md) |

Referenz-Implementierungen (Python, funktionierend, zum 1:1-Übersetzen):
`rewe/webapp/rewe_auth.py`+`rewe_client.py`, `penny/webapp/penny_client.py`,
`lidl/lidlplus_client.py`, `rossmann/rossmann_login_test.py`.

---

## 1. Warum die vier APIs *nicht* über einen Kamm zu scheren sind

Auf den ersten Blick sehen alle vier wie "OAuth2 + JSON-Liste + PDF" aus.
Bei genauerem Hinsehen unterscheiden sie sich in fast jeder Dimension:

| | REWE | PENNY | LIDL | ROSSMANN |
|---|---|---|---|---|
| **Login-Typ** | OAuth2/PKCE (Keycloak) | OAuth2/PKCE (Keycloak) | OAuth2/PKCE (Duende IdentityServer) | **Plain Email+Passwort** (kein OAuth) |
| **Client-Secret** | keiner (Public Client) | keiner (Public Client) | **ja** (`LidlPlusNativeClient:secret`, Basic-Auth) | entfällt |
| **Redirect-Typ** | Custom-URI-Scheme (`de.rewe.app.mobile://redirect`) | **https-URL** (`https://www.penny.de/app/login`) | Custom-URI-Scheme (`com.lidlplus.app://callback`) | entfällt |
| **Zusatzparameter beim Login** | keine | keine | **ja**: `Country`, `language`, `force`, `track` (sonst Fehlerseite) | entfällt |
| **mTLS-Client-Zertifikat nötig** | **ja** (`mtls_prod.pfx`) | nein | nein | nein |
| **Bekannte Bot-Detection** | keine beobachtet | keine beobachtet | **ja**, reCAPTCHA Enterprise auf der Login-Seite | **ja**, Fastly blockt generische User-Agents (`406`) |
| **Pflicht-Header (Kassenbon-API)** | `Authorization`, mTLS | `Authorization`, `correlation-id` | `Authorization`, `App-Version`, `Operating-System`, `App`, `Accept-Language` (als Header, **nicht** Query!) | `x-api-key`, `x-correlation-id`, `App-Version`, `Build-Number`, `Platform`, `Android-Id`, `Reuse-Identifier`, exakter `User-Agent: okhttp/5.3.2` |
| **Bon-Liste: Wrapper** | `{data:{getEbons:{items,pagination}}}` (GraphQL-Hülle) | `{items,pagination}` | reines JSON-**Array** (kein Wrapper) | reines JSON-**Array** (kein Wrapper) |
| **Bon-Liste: Pagination** | `page`/`objectsPerPage`, `pagination.currentPage>=pageCount` | `page`/`objectsPerPage`, `pagination.currentPage>=pageCount` | `skip`/`take`, Ende wenn Seite < `take` | `take` (1000 = vermutlich alles), Continuation-Token-Mechanismus ungeklärt |
| **Server-seitiger Datumsfilter** | nein (client-seitig via `known_ids`) | nein (client-seitig via `known_ids`) | nein (client-seitig nach `date`) | nein (client-seitig via `known_ids`) |
| **PDF-Beleg** | natives PDF-Endpoint | natives PDF-Endpoint | **kein natives PDF** – nur `htmlPrintedReceipt`, muss per Headless-Browser zu PDF gerendert werden | natives PDF-Endpoint (Drittanbieter `anybill.de`) |
| **Einzelposten (Artikel)** | nur im PDF (Text-Parsing nötig) | nur im PDF (Text-Parsing nötig) | strukturiert im JSON (`TicketLineResponse`) | strukturiert im JSON (`data.lines[]`) |
| **Besonderheit** | User-ID (`reweId`) irrelevant, Bearer reicht | **`reweId`-Claim aus JWT** als Pfad-Parameter nötig | – | **Zwei-Stufen-Login**: Rossmann-Account → separater `anybill`-Drittanbieter-Token; Online-Bestellungen brauchen zusätzlich einen "Phantom-Token" (Header **ohne** `Bearer`-Präfix!) |

**Konsequenz für die Architektur:** Ein einziges starres "OAuth-Modul" reicht
nicht. Die Modul-Schnittstelle muss Login-Strategie, Header-Set und
PDF-Beschaffung pro Store austauschbar machen, darf aber trotzdem ein
gemeinsames Datenmodell für "Bon" und eine gemeinsame Pagination-/Sync-Logik
anbieten (die Grundmuster – Liste holen, gegen `known_ids` abgleichen, neue
PDFs lazy nachladen – sind bei allen vieren strukturell gleich).

---

## 2. Stack

- **SvelteKit** (Node-Adapter), eine Runtime/ein Build. `+page.svelte` +
  Tailwind fürs UI, `+server.ts`-Routen bzw. Form-Actions als Backend.
- **TypeScript** durchgängig, auch für die Store-Module.
- **SQLite** via `better-sqlite3` oder `drizzle-orm` (Datei-DB reicht für
  Selfhosted-Einzelhaushalt-Szenario, kein separater DB-Server nötig).
- **Tailwind CSS** für Styling, ggf. `shadcn-svelte` für Basis-Komponenten
  (Tabellen, Cards, Toggle-Switches für die Modul-An/Aus-Schalter).
- **Auth der App selbst:** Session-Cookie-Login, ein Passwort aus Env-Var,
  Hash via `@node-rs/argon2`. Kein externer Identity-Provider nötig für den
  Einzelhaushalt-Fall (s. vorheriges Gespräch).
- **PDF-Rendering (nur für LIDL nötig):** Playwright oder Puppeteer
  (`page.pdf()`), headless, on-demand beim Lazy-PDF-Abruf – nicht dauerhaft
  laufend, nur pro Aufruf gestartet.
- **Crypto/PKCE:** Node `crypto` (`randomBytes`, `createHash('sha256')`,
  Base64URL) – keine externe Lib nötig, ca. 15 Zeilen, einmal zentral bauen.
- **mTLS (nur REWE):** `.pfx` + Passphrase direkt an `https.Agent`/`undici`
  `Client` übergeben (`pfx`, `passphrase`) – kein PEM-Splitting nötig
  (einfacher als die aktuelle Python-Lösung).

---

## 3. Gemeinsames Datenmodell

```ts
// Kernfelder, die alle vier APIs liefern (auf gemeinsamen Nenner gebracht)
interface ReceiptSummary {
  storeModule: "rewe" | "penny" | "lidl" | "rossmann";
  id: string;                 // opake, store-eigene ID
  timestamp: string;          // ISO-8601, UTC wo möglich
  totalCents: number;         // IMMER Cent als Integer (REWE/PENNY liefern das nativ,
                               // LIDL/ROSSMANN liefern Euro-Float -> beim Mapping *100 runden)
  market: {
    name?: string;
    street?: string;
    zipCode?: string;
    city?: string;
  } | null;                   // PENNY liefert teils `null`
  cancelled: boolean;
  hasStructuredItems: boolean; // true bei LIDL/ROSSMANN (Items direkt im JSON),
                               // false bei REWE/PENNY (nur via PDF-Text-Parsing)
}

interface ReceiptItem {
  name: string;
  priceCents: number;
  quantity?: number;
  unitPriceCents?: number;
  taxCode?: string;
  discountExcluded?: boolean; // Pfand o.ä., von Rabatten ausgenommen
}
```

`ReceiptItem[]` wird pro Store unterschiedlich beschafft: bei LIDL/ROSSMANN
direkt aus der Detail-Response, bei REWE/PENNY erst nach PDF-Download durch
Text-Extraktion (Regex-Parser, siehe `penny/README.md` Abschnitt 3 als
Vorlage für das Pattern – PDF ist dort reiner Text, kein Scan).

---

## 4. Modul-Contract

```ts
type LoginStrategy =
  | { kind: "oauth-pkce-redirect"; buildAuthorizeUrl(state: PkceState): string }
  | { kind: "credentials"; fields: ("email" | "password")[] };

interface StoreModule {
  id: "rewe" | "penny" | "lidl" | "rossmann";
  displayName: string;
  enabled: boolean;              // Toggle, aus DB/Config gelesen

  login: LoginStrategy;
  completeLogin(input: string | Record<string, string>, ctx: LoginContext): Promise<StoredCredentials>;
  refresh(creds: StoredCredentials): Promise<StoredCredentials>;

  fetchReceipts(creds: StoredCredentials, knownIds: Set<string>): Promise<ReceiptSummary[]>;
  fetchReceiptPdf(creds: StoredCredentials, receiptId: string): Promise<Buffer | null>;
  fetchReceiptItems?(creds: StoredCredentials, receiptId: string, pdf?: Buffer): Promise<ReceiptItem[]>;
}
```

- `StoredCredentials` ist ein store-spezifischer, aber einheitlich
  verschlüsselt abgelegter Blob (JSON in SQLite, at-rest verschlüsselt mit
  einem App-weiten Secret – Access-/Refresh-Token sind Bankdaten-nahes
  Zugangsmaterial, entsprechend behandeln).
- `refresh()` wird **vor** jedem `fetchReceipts()`/`fetchReceiptPdf()`-Call
  aufgerufen (nicht erst reaktiv auf `401`), analog zum bestehenden
  `rewe_auth.get_access_token()`-Caching-Muster (In-Memory-Cache pro Prozess,
  Refresh nur wenn `exp` bald erreicht ist).
- Rossmann bricht das Muster am stärksten (zweistufiger Login, kein
  klassisches Token-Refresh sondern Re-Login bei Bedarf) – das
  `credentials`-Zweig des `LoginStrategy`-Union-Typs deckt das ab, ohne die
  anderen drei Module zu verkomplizieren.

---

## 5. Sync-/PDF-Strategie (aus dem REWE-Prototyp übernehmen)

Bereits im laufenden `rewe/webapp/sync_service.py` erprobtes Muster, gilt
1:1 für alle vier Module:

1. `knownIds` aus DB laden.
2. `fetchReceipts(creds, knownIds)` – Modul paginiert intern und bricht ab,
   sobald eine bekannte ID auftaucht oder die letzte Seite erreicht ist.
3. Neue Bons in DB upserten.
4. PDF/Items **eager nur bei wenigen neuen Bons** (Cap, z. B. 25) laden –
   bei großem Erst-Sync (voller Verlauf) **lazy** beim Öffnen der
   Detailseite nachholen (verhindert hunderte Downloads beim ersten Lauf).

---

## 6. Store-spezifische Fallstricke (nicht vergessen beim Implementieren)

- **REWE:** mTLS zwingend, auch scheinbar öffentliche Endpunkte liefern ohne
  Client-Zertifikat `401` am Edge. `.pfx`-Passwort: `NC3hDTstMX9waPPV`.
- **PENNY:** `reweId` steckt im JWT (`access_token`), lokal decodieren statt
  extra API-Call. Kein Custom-URI-Scheme – Redirect ist eine normale
  `https`-URL, die der Browser lädt (zeigt ggf. Fehlerseite, Code steht
  trotzdem in der Adresszeile).
- **LIDL:** `Country`+`language` als Query-Parameter beim Authorize-Call
  **zwingend**, sonst Fehlerseite. `Accept-Language` (Bon-API) muss **Header**
  sein, nicht Query (`400`-Fehler sonst). Ticket-Detail nur unter `v3`, `v2`
  liefert für Detail einen leeren `400`. Kein natives PDF → Headless-Browser-
  Rendering von `htmlPrintedReceipt` einplanen. Login-Seite hat reCAPTCHA –
  **kein** automatisierter Login als einziger Pfad, manuellen Fallback
  (Code aus Redirect-URL manuell einfügen) immer vorsehen.
- **ROSSMANN:** Ohne exakten `User-Agent: okhttp/5.3.2` blockt Fastly mit
  `406`. Zwei getrennte Auth-Ebenen (Rossmann-Account → `anybill`-Token).
  Phantom-Token (nur für Online-Bestellungen) braucht **keinen**
  `Bearer`-Präfix im Header – Sonderfall, leicht zu übersehen.

---

## 7. Phasenplan

1. **Grundgerüst:** SvelteKit-Projekt, Tailwind, SQLite+Drizzle-Schema
   (`stores`, `credentials`, `receipts`, `receipt_items`), Passwort-Login
   für die App selbst.
2. **Modul-Registry + gemeinsame Bausteine:** `StoreModule`-Interface, PKCE-
   Hilfsfunktionen, verschlüsselte Credential-Ablage, generischer Sync-
   Orchestrator (Abschnitt 5), An/Aus-Toggle-UI.
3. **Referenzmodul REWE:** 1:1-Port aus `rewe/webapp/rewe_auth.py` +
   `rewe_client.py` (mTLS via `.pfx` direkt in Node, einfacher als Python).
   Validiert die gesamte Registry/Sync-Pipeline end-to-end.
4. **PENNY-Modul:** strukturell fast identisch zu REWE (Keycloak-PKCE ohne
   mTLS), günstigster nächster Schritt zur Bestätigung, dass die
   Modul-Abstraktion trägt.
5. **ROSSMANN-Modul:** erster Bruch mit dem OAuth-Muster (`credentials`-
   Login-Strategie), testet die Flexibilität des Interfaces.
6. **LIDL-Modul:** komplexester Fall (Bot-Detection, Headless-PDF-Rendering)
   – bewusst zuletzt, da hier am ehesten manuelle Fallbacks/UX-Overhead
   nötig sind (Redirect-Code manuell einfügen, ggf. Login öfter nötig als
   bei den anderen).
7. **Dashboard/UI:** monatliche Ausgaben-Übersicht store-übergreifend
   (Aggregation über alle aktivierten Module), Einzelbon-Ansicht mit
   PDF/Items, Modul-Einstellungen.
8. **Erledigt:** MQTT/Home-Assistant-Publishing (`src/lib/server/mqtt.ts`) --
   veröffentlicht bei jedem Sync neue Belege (`<baseTopic>receipt/new`) und
   den Monatsumsatz je Markt als Home-Assistant-MQTT-Discovery-Sensor
   (`sensor.bonsync_<store>_ausgaben_monat`), konfigurierbar unter /settings.

---

## 8. Offene Risiken / später zu klären

- LIDL-Login lässt sich nicht zuverlässig automatisieren (reCAPTCHA) – UX
  muss den manuellen Redirect-Code-Copy-Paste-Schritt sauber anleiten.
- ROSSMANN-Pagination jenseits von `take=1000` ist ungeklärt
  (Continuation-Token-Mechanismus nicht verifiziert) – bei Konten mit sehr
  vielen Bons ggf. nachrecherchieren.
- PENNY: unklar, ob/wann Keycloak den `refresh_token` rotiert – defensiv
  immer den ggf. neuen Wert übernehmen, alten verwerfen.
- Alle vier APIs sind inoffiziell und nicht versioniert – Endpunkte/Felder
  können sich bei App-Updates ändern. Für jedes Modul denselben
  Verifikations-Workflow wie bisher vorsehen (APK ziehen, `apktool d`,
  gezielt gegen Live-Account testen), nicht blind auf Dauerhaltbarkeit
  vertrauen.
