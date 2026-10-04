# Changelog

Alle nennenswerten Änderungen an BonSync stehen in dieser Datei.

Das Format folgt [Keep a Changelog](https://keepachangelog.com/de/1.1.0/), die Versionierung
[Semantic Versioning](https://semver.org/lang/de/). Ein gepushter Tag `vX.Y.Z` erzeugt automatisch
ein GitHub-Release, dessen Text der passende Abschnitt `## [X.Y.Z]` aus dieser Datei ist
(siehe `.github/workflows/docker.yml`, Job `release`). Vor dem Taggen also den Abschnitt
`[Unreleased]` in eine Versionsnummer mit Datum umbenennen.

## [Unreleased]

### Added

- Neuer Menüpunkt „Angebote“: aktuelle Angebote aller Händler für die gewählten Märkte, mit Suche und
  Händlerfilter. Märkte werden aus den Filialen der Belege vorgeschlagen oder per PLZ-Suche ergänzt.
- Neuer Menüpunkt „Deals für mich“: Angebote, die zu bisher gekauften Artikeln passen, mit Kaufanzahl.
  Wie ähnlich ein Angebot sein darf (gleiches Produkt, gleiche Marke, ähnliche Produktart wie
  Pepsi Cola ↔ Coca-Cola) ist einstellbar.
- Modul-Vertrag: optionale Methoden `searchMarkets` und `fetchOffers` (siehe `docs/module-format.md`).
  Angebote kommen aus den Händler-Modulen -- ohne Modul-Update zeigen die Seiten einen Hinweis.

## [0.2.1] - 2026-10-04

### Added

- PENNY-Bon: zusätzliche Vorteile vom Bon-Ende ("Deine zusätzlichen Vorteile heute") werden angezeigt.

## [0.2.0] - 2026-10-04

### Added

- Installierbare Web-App (PWA): vollständiges Manifest mit `id`, `start_url`, `scope`, Sprache,
  Beschreibung und App-Shortcuts für Kassenzettel und Statistiken.
- Maskierbare App-Icons (192 und 512 px), damit Android das Icon nicht mit weißem Rand zuschneidet.
- iOS-Meta-Tags für die installierte App (Vollbild, transparente Statusleiste, App-Titel) und
  `theme-color` passend zum App-Hintergrund.
- Bottom-Navigation auf iPhone und Handy (hoch und quer) mit Dashboard, Kassenzettel, Statistiken
  und „Mehr“ für die übrigen Bereiche, die Version und Abmelden. iPad und Desktop behalten die
  Sidebar.
- `CHANGELOG.md` und automatische GitHub-Releases aus diesem Changelog beim Push eines `v*`-Tags.
- Hinweis „Neue Version verfügbar“ mit „Neu laden“, sobald auf dem Server ein neuer Build läuft
  (Prüfung alle 5 Minuten).
- Kassenzettel auf dem Handy als Kartenliste statt breiter Tabelle.

### Changed

- Mobile Kopfzeile statt der horizontal scrollenden Navigationsleiste unter 768 px.
- Inhalte berücksichtigen Notch, Statusleiste und Home-Indikator (`viewport-fit=cover`,
  `env(safe-area-inset-*)`).
- Volle Höhe über `100dvh`, damit die Ansicht auf iOS nicht mit der Adressleiste springt.
- Lade-Overlay beim Seitenwechsel erscheint erst nach 150 ms und flackert so bei schnellen
  Wechseln nicht mehr.
- Kein Gummiband-Effekt am Seitenende in der installierten App.

### Fixed

- Installierte App auf iOS 27: Der verwischte Rand unter der Statusleiste ist auf dem Handy
  kaschiert (deckende Statusleiste, 16-px-Streifen in Kopfzeilenfarbe, Kopfzeile darunter).
- „Abmelden“ war auf dem Handy nicht erreichbar, weil das Konto-Menü dort ausgeblendet war.
- Breite Tabellen machten die Seite auf dem Handy breiter als den Bildschirm.

## [0.1.0] - 2026-10-03

### Added

- Kassenbon-Hub mit dynamischem Modulsystem für Händler-Schnittstellen (REWE, PENNY, ROSSMANN,
  LIDL) und Modul-Store mit gecachtem Katalog.
- Dashboard, Kassenzettel-Liste und -Detailansicht mit PDF, Statistiken und Filial-Karte.
- REWE-Bon: gesammelter Bonus pro Einkauf wird erkannt und angezeigt.
- Onboarding-Assistent, Login mit Rate-Limit, MQTT-Anbindung und automatischer Sync.
- Docker-Image in der GitHub Container Registry (`:latest`, `:stable`, `:vX.Y.Z`) mit
  App-Version in der Oberfläche.

### Security

- Content-Security-Policy, Security-Header, Pfadvalidierung und Allowlist für den Store-Katalog.

[Unreleased]: https://github.com/kurim/BonSync/compare/v0.2.0...HEAD
[0.2.0]: https://github.com/kurim/BonSync/compare/v0.1.0...v0.2.0
[0.1.0]: https://github.com/kurim/BonSync/releases/tag/v0.1.0
