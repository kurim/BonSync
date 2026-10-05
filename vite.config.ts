// Muss vor allen anderen Imports laufen -- lädt .env in process.env für den Dev-Server
// (Vite exponiert .env sonst nur als import.meta.env, nicht process.env; der Docker-Build
// bekommt seine Variablen direkt vom Container, ist also davon nicht betroffen).
import "dotenv/config";
import adapter from "@sveltejs/adapter-node";
import { sveltekit } from "@sveltejs/kit/vite";
import { vitePreprocess } from "@sveltejs/vite-plugin-svelte";
import tailwindcss from "@tailwindcss/vite";
import { defineConfig } from "vite";

export default defineConfig({
  plugins: [
    tailwindcss(),
    sveltekit({
      preprocess: vitePreprocess(),
      adapter: adapter({
        out: "build",
      }),
      // Prüft alle 5 Minuten, ob ein neuer Build ausgeliefert wird (siehe +layout.svelte: Hinweis
      // "Neue Version verfügbar"). Ohne Service Worker gibt es sonst keinen Weg, eine offene bzw.
      // installierte App auf eine neue Version hinzuweisen.
      version: {
        pollInterval: 5 * 60 * 1000,
      },
      // Content-Security-Policy -- SvelteKit versieht sein eigenes Init-Skript automatisch mit
      // Nonce/Hash ("auto"), alles andere kommt aus dem eigenen Origin. Externe Ziele sind nur die
      // MapTiler-Kacheln/-Geocoding (Filial-Karte) und die Logo-Bilder aus dem BonSync-Store-Katalog
      // (siehe storeCatalog.ts#ALLOWED_HOSTS). Weitere Security-Header setzt hooks.server.ts.
      csp: {
        mode: "auto",
        directives: {
          "default-src": ["self"],
          "script-src": ["self"],
          // 'unsafe-inline' für Styles ist nötig, weil die Seiten Modul-Farben über
          // style="..."-Attribute setzen (Werte sind auf Hex-Farben eingeschränkt).
          "style-src": ["self", "unsafe-inline"],
          "font-src": ["self", "data:"],
          "img-src": [
            "self",
            "data:",
            "blob:",
            "https://api.maptiler.com",
            "https://github.com",
            "https://raw.githubusercontent.com",
            "https://objects.githubusercontent.com",
          ],
          "connect-src": ["self", "https://api.maptiler.com"],
          "frame-ancestors": ["none"],
          "object-src": ["none"],
          "base-uri": ["self"],
          "form-action": ["self"],
        },
      },
    }),
  ],
  server: {
    port: 5173,
  },
});
