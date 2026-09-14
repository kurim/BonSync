# Mitmachen bei BonSync

Danke für dein Interesse! Hier steht, wie Änderungen ins Projekt kommen und was dabei
erwartet wird.

## Wo gehört was hin?

- **BonSync (dieses Repo):** die SvelteKit-App selbst — Oberfläche, Datenbank, Sync-Orchestrator,
  Modul-SDK und Modul-Loader.
- **Händler-Module (REWE, PENNY, ROSSMANN, LIDL, …):** liegen im separaten
  [BonSync-Store](https://github.com/kurim/BonSync-Store)-Repo. Neue Händler oder Fixes an
  bestehenden Modulen bitte dort einreichen. Das Modul-Format ist in
  [`docs/module-format.md`](docs/module-format.md) beschrieben.

## Entwicklungsumgebung

```bash
cp .env.example .env   # APP_PASSWORD und APP_SECRET setzen (siehe Kommentare in der Datei)
npm install
npm run dev
```

Vor dem Einreichen müssen diese drei Kommandos sauber durchlaufen — die CI führt sie bei jedem
Pull Request ebenfalls aus:

```bash
npm run check                                  # svelte-check + TypeScript
npm run build                                  # Produktions-Build
npm audit --omit=dev --audit-level=moderate    # bekannte Schwachstellen in Laufzeit-Abhängigkeiten
```

Berührt eine Änderung das Dockerfile oder den Container-Start, bitte zusätzlich lokal bauen und
starten (`docker compose up --build -d`), die CI baut das Image bei PRs nur für `amd64`.

## Ablauf für Änderungen

1. Fork bzw. Feature-Branch von `main` anlegen (z.B. `feature/kurze-beschreibung`).
2. Kleine, fokussierte Commits mit aussagekräftiger Nachricht. Warum eine Änderung nötig ist,
   gehört in die Commit-Nachricht oder in einen Kommentar im Code — nicht nur ins PR.
3. Pull Request gegen `main` öffnen. Im PR kurz beschreiben: Was ändert sich, warum, und wie
   wurde es getestet.
4. Der Repo-Owner (siehe [`.github/CODEOWNERS`](.github/CODEOWNERS)) reviewt und merged.
   Direkte Pushes auf `main` sind nicht vorgesehen.

Größere Umbauten (neue Abhängigkeiten, Datenbank-Schema, Modul-SDK-Vertrag) bitte vorher als
Issue anreißen, damit die Richtung stimmt, bevor viel Arbeit reinfließt.

## Was beim Review geprüft wird

- **Sicherheit zuerst.** BonSync ist eine selbst gehostete Single-User-App, die Login-Daten und
  Belege von Händlern verwaltet und Module ohne Sandboxing mit vollen Server-Rechten ausführt.
  Alles, was Pfade, Uploads, Credentials, Session-Handling oder das Modul-Laden berührt, wird
  besonders genau angesehen. Neue Laufzeit-Abhängigkeiten brauchen einen guten Grund.
- **Datenbank-Änderungen** laufen über Drizzle: Schema in `src/lib/server/db/` anpassen,
  Migration mit `npm run db:generate` erzeugen und mit einreichen.
- **UI-Konventionen:** siehe [`CLAUDE.md`](CLAUDE.md) (u.a. Pointer-Cursor auf interaktiven
  Elementen) und [`docs/design.md`](docs/design.md).
- **Kommentare und Doku auf Deutsch**, wie im restlichen Projekt. Wenn sich Verhalten ändert,
  das in der README oder in `docs/` beschrieben ist, die Doku im selben PR mitziehen.

## Sicherheitslücken melden

Bitte keine öffentlichen Issues für Sicherheitsprobleme. Nutze stattdessen
„Report a vulnerability“ unter dem Security-Tab des Repos oder schreib den Owner direkt an.

## Lizenz

Mit dem Einreichen eines Beitrags erklärst du dich einverstanden, dass er unter der
[MIT-Lizenz](LICENSE) des Projekts veröffentlicht wird.
