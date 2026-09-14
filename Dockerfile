# syntax=docker/dockerfile:1

# Debian-Basis statt Alpine: Playwrights gebündeltes Chromium (für LIDL-Beleg-PDFs, siehe
# docs/api-lidlplus.md Abschnitt 4.4) ist gegen glibc gelinkt und läuft nicht auf Alpines musl.
# node:sqlite braucht ebenfalls keine native Compile-Toolchain, das bleibt unverändert einfach.
FROM node:22-bookworm-slim AS builder
WORKDIR /app
COPY package.json package-lock.json* .npmrc ./
RUN npm install
COPY . .
RUN npm run build
# Baut die Modul-Pakete (rewe/penny/lidl/rossmann) aus modules-src/ frisch zu
# modules-builtin/*.zip -- läuft VOR "npm prune", da esbuild/yazl nur devDependencies sind.
RUN npm run build:modules
RUN npm prune --omit=dev
# Chromium + Betriebssystem-Abhängigkeiten für Playwright (nur einmal hier, landet über
# node_modules/.cache bzw. den Standard-Browserpfad im Image, wird unten mitkopiert).
RUN npx playwright install --with-deps chromium

FROM node:22-bookworm-slim AS runtime
WORKDIR /app
ENV NODE_ENV=production
# node:sqlite ist in älteren 22.x-Patches noch hinter diesem Flag (in neueren
# Patches bereits Default-an) -- explizit setzen macht es versionsunabhängig sicher.
ENV NODE_OPTIONS=--experimental-sqlite
# gosu zum Rechte-Abgeben im Entrypoint (Debian-Äquivalent zu Alpines su-exec)
RUN groupadd -r bonsync && useradd -r -g bonsync bonsync

COPY --from=builder /app/build ./build
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/package.json ./package.json
# Modul-Pakete (siehe hooks.server.ts#seedBuiltinModulesOnce) -- werden beim allerersten Boot
# einer Instanz automatisch nach ${DATA_DIR}/modules/ installiert.
COPY --from=builder /app/modules-builtin ./modules-builtin
COPY --from=builder /root/.cache/ms-playwright /home/bonsync/.cache/ms-playwright
ENV PLAYWRIGHT_BROWSERS_PATH=/home/bonsync/.cache/ms-playwright
# `--with-deps` im Builder installierte die für Chromium nötigen Shared Libraries (u.a.
# libglib-2.0.so.0) nur DORT per apt -- die Runtime-Stage ist ein eigenes, frisches Image und
# hatte sie bisher nicht (Symptom: "error while loading shared libraries: libglib-2.0.so.0").
# `install-deps` installiert nur die OS-Pakete via apt, lädt keinen Browser erneut herunter.
RUN apt-get update \
	&& npx playwright install-deps chromium \
	&& apt-get install -y --no-install-recommends gosu \
	&& rm -rf /var/lib/apt/lists/* \
	&& chown -R bonsync:bonsync /home/bonsync/.cache
COPY docker-entrypoint.sh /usr/local/bin/docker-entrypoint.sh
RUN chmod +x /usr/local/bin/docker-entrypoint.sh

# Bewusst KEIN `USER bonsync` hier: der Container startet als root, damit der
# Entrypoint den gemounteten ./data-Ordner chownen kann, bevor er auf den
# unprivilegierten User wechselt (siehe docker-entrypoint.sh).
EXPOSE 3000
ENV PORT=3000
ENTRYPOINT ["docker-entrypoint.sh"]
CMD ["node", "build/index.js"]
