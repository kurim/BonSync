# BonSync — Supermarkt-Kassenbon-Hub

SvelteKit-App, die Kassenbon-APIs mehrerer Supermärkte als an-/abschaltbare
Module bündelt. Siehe [`docs/fahrplan-supermarkt-hub.md`](docs/fahrplan-supermarkt-hub.md)
für den vollständigen Architekturplan.

**Aktueller Stand (Phase 1–5 des Fahrplans):** Grundgerüst, Modul-Registry
sowie REWE-, PENNY- und ROSSMANN-Modul sind fertig und funktionsfähig. LIDL
ist im UI sichtbar, aber noch nicht angebunden (letzte Folge-Phase).

## Setup

```bash
cp .env.example .env
# .env anpassen: APP_PASSWORD, APP_SECRET (siehe Kommentare in der Datei)
npm install
npm run dev
```

Das REWE-mTLS-Zertifikat ist eine feste App-Ressource (identisch für jede
Installation der offiziellen REWE-App, siehe `docs/api-rewe.md` Abschnitt 1.1)
und reist direkt im REWE-Modul-Paket mit (Quelle: `rewe/module/` im
[BonSync-Store](https://github.com/kurim/BonSync-Store)-Repo) — kein
manuelles Bereitstellen mehr nötig. `REWE_CERT_DIR` in `.env` bleibt als
optionaler Override verfügbar, falls REWE das Zertifikat rotiert.

Erster Login: Passwort aus `APP_PASSWORD`. Der Hash wird beim allerersten
Start automatisch in die DB geschrieben; danach ist `APP_PASSWORD` irrelevant
und das Passwort wird über **Einstellungen → Passwort ändern** verwaltet.

## REWE / PENNY verbinden

Beide laufen über denselben manuellen PKCE-Flow (Login-Redirect zeigt auf eine
Adresse, die BonSync nicht selbst entgegennehmen kann):

1. **Märkte** öffnen → beim jeweiligen Markt „Login-Seite öffnen“ klicken.
2. Den angezeigten Link in einem neuen Tab öffnen und einloggen.
3. Der Redirect zeigt auf `de.rewe.app.mobile://redirect?code=...&state=...`
   (REWE, Custom-URI-Scheme — der Browser kann das gar nicht öffnen) bzw.
   `https://www.penny.de/app/login?code=...&state=...` (PENNY, evtl. eine
   Fehlerseite, da die Domain PENNY gehört, nicht BonSync). In beiden Fällen
   steht der Code trotzdem in der Adresszeile — komplette URL kopieren.
4. In BonSync einfügen und „Verbinden“ klicken.

## ROSSMANN verbinden

Kein OAuth — direkt E-Mail + Passwort in der Markt-Karte eingeben und
„Anmelden“ klicken. ROSSMANN kennt kein Token-Refresh; schlägt ein Sync mit
Auth-Fehler fehl, hilft nur ein erneuter Login über dieselbe Karte.

PENNY-Marktdaten: Liefert die Ebons-API nur eine 4-stellige Marktnummer statt
vollem Adressobjekt, wird sie über die öffentliche PENNY-Marktliste
(`https://www.penny.de/.rest/market`) aufgelöst — aber nur, wenn die Nummer
bundesweit eindeutig ist (ca. 30 % sind es nicht, siehe Kommentar in
`pennyMarkets.ts`). Sonst bleibt es bei der reinen Nummer, statt eine
möglicherweise falsche Adresse zu zeigen.

## Docker

Fertige Images liegen in der GitHub Container Registry
(`ghcr.io/kurim/bonsync`, für `amd64` und `arm64`) — selbst bauen ist nicht
nötig. `latest` folgt dem `main`-Branch, Release-Tags (`v1.2.3`) bekommen
zusätzlich `1.2.3`, `1.2` und `1`.

```bash
cp .env.example .env   # anpassen
docker compose pull
docker compose up -d
```

Ohne Compose:

```bash
docker run -d --name bonsync --restart unless-stopped \
  -p 3000:3000 --env-file .env -v ./data:/app/data \
  ghcr.io/kurim/bonsync:latest
```

Update auf die neueste Version: `docker compose pull && docker compose up -d`.
Wer lieber aus dem Quellcode baut: `docker compose up --build -d`.

**Wichtig:** `ORIGIN` in `.env` muss exakt der URL entsprechen, unter der du
BonSync im Browser öffnest (z.B. `http://192.168.1.50:3000`). Ohne
passendes `ORIGIN` lehnt der Server jedes Formular mit „Cross-site POST form
submissions are forbidden“ ab — das ist SvelteKits CSRF-Schutz, kein Bug in
BonSync selbst, er kennt nur ohne diese Variable seine eigene Adresse nicht.

Der Container läuft intern als unprivilegierter User; ein Entrypoint chownt
den gemounteten `./data`-Ordner beim Start passend, damit `docker compose up`
(auch mit `sudo`, wodurch `./data` sonst root gehören würde) sofort schreiben
kann — kein manuelles `chmod`/`chown` auf dem Host nötig.

Volume: `./data` (SQLite-DB, heruntergeladene PDFs, installierte Modul-Pakete).

## Struktur

```
src/lib/server/db/         Drizzle-Schema + SQLite-Verbindung
src/lib/server/modules/    StoreModule-Contract, Registry, REWE-/PENNY-/ROSSMANN-Modul
src/lib/server/receiptPdfParser.ts   PDF-Text-Extraktion + Artikel-Regex-Parser (REWE/PENNY)
src/lib/server/pennyMarkets.ts        PENNY-Marktnummer -> Adresse (öffentliche Marktliste, mit Eindeutigkeits-Check)
src/lib/server/sync.ts     Sync-Orchestrator (Liste holen, upserten, PDF lazy/eager)
src/lib/server/auth.ts     App-Login (Session-Cookie, scrypt-Passwort-Hash)
src/lib/server/crypto.ts   AES-256-GCM-Verschlüsselung der Store-Credentials
src/routes/                Dashboard, Kassenzettel, Märkte, Einstellungen
```

## Nächste Schritte

Siehe Fahrplan Abschnitt 7: LIDL-Modul (Bot-Detection/reCAPTCHA, kein
natives PDF — Headless-Browser-Rendering von `htmlPrintedReceipt` nötig,
komplexester Fall — bewusst zuletzt).
