# BonSync — Supermarkt-Kassenbon-Hub

Selbst gehostete SvelteKit-App, die digitale Kassenbons mehrerer Supermärkte in einem
Dashboard sammelt (Ausgaben, Artikel, Statistiken, optional MQTT/Home-Assistant-Anbindung).

BonSync selbst bringt **keine** Händler-Anbindung fest eingebaut mit — die gesamte
Kommunikation mit einem Markt (Login, Beleg-Liste, PDF-Download, Artikelerkennung) steckt in
einem austauschbaren **Modul**. Offizielle Module (u.a. REWE, PENNY, LIDL, ROSSMANN) pflegt und
baut das separate [BonSync-Store](https://github.com/kurim/BonSync-Store)-Repo; sie werden zur
Laufzeit über die Oberfläche installiert, nicht mitkompiliert. Wie ein Modul aufgebaut ist und
wie man ein eigenes schreibt, steht in [`docs/module-format.md`](docs/module-format.md).

## Setup

```bash
cp .env.example .env
# .env anpassen: APP_PASSWORD, APP_SECRET (siehe Kommentare in der Datei)
npm install
npm run dev
```

Erster Login: Passwort aus `APP_PASSWORD`. Der Hash wird beim allerersten Start automatisch in
die DB geschrieben; danach ist `APP_PASSWORD` irrelevant und das Passwort wird über
**Einstellungen → Passwort ändern** verwaltet.

Direkt im Anschluss führt das **Onboarding** durch die Ersteinrichtung, inklusive Auswahl, welche
Module aus dem BonSync-Store gleich installiert werden sollen — das lässt sich jederzeit später
über den Modul-Store nachholen.

## Module installieren & verwalten

Alles dazu läuft über zwei Seiten in der Oberfläche:

- **Modul-Store** (`/store`): Katalog der offiziellen Module aus dem BonSync-Store, Installation
  per Klick (inkl. SHA-256-Prüfung des Downloads). Über die **Dangerzone** am Ende derselben Seite
  lässt sich zusätzlich ein selbst gebautes oder von Dritten bezogenes Modul als Zip hochladen —
  Format und Vertrag dafür stehen in [`docs/module-format.md`](docs/module-format.md).
- **Händler-Schnittstellen** (`/dealer-interfaces`): zeigt jedes installierte Modul als Karte mit
  Sync-Status, verbindet Zugangsdaten und stößt manuelle Syncs an.

Deinstallieren geht über das ⋮-Menü der jeweiligen Modul-Karte; ob dabei auch vorhandene Belege,
Artikel und Zugangsdaten gelöscht werden, ist eine explizite Checkbox (Standard: nein, damit eine
spätere Neuinstallation an die bestehende Sync-Historie anknüpft).

## Ein Modul verbinden

Wie eine Verbindung hergestellt wird, hängt von der `loginStrategy` ab, die das jeweilige Modul in
seinem Manifest angibt — die Karte auf **Händler-Schnittstellen** passt sich automatisch daran an:

- **OAuth/PKCE** (`oauth-pkce-manual` / `oauth-pkce-redirect`): „Login-Seite öffnen“ klickt, den
  angezeigten Link in einem neuen Tab öffnen und beim Markt einloggen. Der Redirect danach zeigt
  auf eine Adresse, die BonSync nicht selbst entgegennehmen kann (Custom-URI-Scheme oder eine
  Domain, die dem Markt gehört — teils mit Fehlerseite) — der Login-Code steht trotzdem in der
  Adresszeile. Komplette URL kopieren, in BonSync einfügen, „Verbinden“ klicken.
- **Zugangsdaten** (`credentials`): E-Mail + Passwort direkt in der Modul-Karte eingeben und
  „Verbinden“ klicken. Ob und wie ein solches Modul abgelaufene Zugangsdaten selbst erneuert
  (Token-Refresh) oder einen erneuten Login verlangt, ist Sache des jeweiligen Moduls.

Modul-spezifische Eigenheiten (z.B. welche Marktdaten ein Händler liefert oder ob überhaupt ein
PDF verfügbar ist) sind in der Doku des jeweiligen Moduls im BonSync-Store beschrieben, nicht hier.

## Docker

Fertige Images liegen in der GitHub Container Registry
(`ghcr.io/kurim/bonsync`, für `amd64` und `arm64`) — selbst bauen ist nicht
nötig. `latest` folgt dem `main`-Branch (bleeding edge). Release-Tags
(`v1.2.3`) bekommen zusätzlich das exakte Tag (`v1.2.3`, unveränderlich) sowie
`stable`, das immer auf den neuesten Release zeigt.

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
src/lib/server/modules/    Modul-Vertrag (types.ts), Registry, Modul-SDK, Paket-Installer,
                            Store-Katalog — siehe docs/module-format.md
src/lib/server/sync.ts     Sync-Orchestrator (Liste holen, upserten, PDF lazy/eager)
src/lib/server/auth.ts     App-Login (Session-Cookie, scrypt-Passwort-Hash)
src/lib/server/crypto.ts   AES-256-GCM-Verschlüsselung der Store-Credentials
src/lib/server/pkce.ts     PKCE-Helper, dem Modul-SDK zugrunde liegend
src/lib/server/http.ts     HTTP-Client (inkl. mTLS) für das Modul-SDK
src/lib/server/htmlToPdf.ts  Headless HTML→PDF-Rendering für Module ohne natives PDF
src/lib/server/mqtt.ts     Optionale MQTT-Publikation neuer Belege
src/lib/server/scheduler.ts  Automatischer Hintergrund-Sync
src/routes/                Dashboard, Kassenzettel, Händler-Schnittstellen, Modul-Store,
                            Filial-Standorte, Statistiken, Einstellungen
```

## Mitmachen

Wie Änderungen an BonSync selbst ablaufen (Setup, Checks, Review-Kriterien) steht in
[`CONTRIBUTING.md`](CONTRIBUTING.md). Neue Händler oder Fixes an bestehenden Modulen gehören ins
[BonSync-Store](https://github.com/kurim/BonSync-Store)-Repo, nicht hierher.
