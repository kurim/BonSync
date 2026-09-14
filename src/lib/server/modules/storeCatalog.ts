import { createHash } from 'node:crypto';
import type { LoginStrategy } from './types';
import { stageZip, commitStagedInstall, type ModuleSource } from './packageInstaller';

// Rollierendes "latest"-Release des BonSync-Store-Repos -- Zip-Assets + index.json werden dort bei
// jedem Push auf main neu gebaut und veröffentlicht (siehe scripts/build-store.mjs im Store-Repo).
const CATALOG_URL = 'https://github.com/kurim/BonSync-Store/releases/download/latest/index.json';

export interface CatalogEntry {
	id: string;
	displayName: string;
	version: string;
	description: string | null;
	author: string | null;
	authDescription: string | null;
	loginStrategy: LoginStrategy;
	sdkVersion: number;
	providesPdf: boolean;
	ui: { color: string | null; chip: string | null; logoUrl: string | null } | null;
	zipUrl: string;
	sha256: string;
	sizeBytes: number;
}

interface CatalogResponse {
	schemaVersion: number;
	modules: CatalogEntry[];
}

// Prozessweiter In-Memory-Cache -- ohne das würde jeder Aufruf der Store-Seite (und jeder
// Onboarding-Schritt 2) den Katalog neu vom GitHub-Release laden, obwohl der sich nur bei einem
// Push auf BonSync-Store ändert. `force` (Refresh-Button) umgeht den Cache bewusst.
const CACHE_TTL_MS = 10 * 60 * 1000;
let cache: { modules: CatalogEntry[]; fetchedAt: number } | null = null;

/** Lädt den Modul-Katalog des BonSync-Store (gecacht, siehe CACHE_TTL_MS) -- wirft nie, sondern
 * liefert bei Netzwerk-/Parse-Fehlern `{ error }` zurück (gleiches Robustheits-Muster wie
 * sync.ts#loadCredentials): ein nicht erreichbarer Store darf die Store-Seite nicht mit einem
 * 500er lahmlegen. */
export async function fetchStoreCatalog(
	opts: { force?: boolean } = {}
): Promise<{ modules: CatalogEntry[]; fetchedAt: number } | { error: string }> {
	if (!opts.force && cache && Date.now() - cache.fetchedAt < CACHE_TTL_MS) {
		return cache;
	}

	try {
		const res = await fetch(CATALOG_URL);
		if (!res.ok) {
			if (cache) return cache; // veralteter Katalog ist besser als ein Fehler, solange einer existiert
			return { error: `Store nicht erreichbar (HTTP ${res.status}).` };
		}
		const data = (await res.json()) as CatalogResponse;
		if (!Array.isArray(data.modules)) {
			if (cache) return cache;
			return { error: 'Store-Katalog hat ein unerwartetes Format.' };
		}
		cache = { modules: data.modules, fetchedAt: Date.now() };
		return cache;
	} catch (err) {
		if (cache) return cache;
		return { error: `Store nicht erreichbar: ${err instanceof Error ? err.message : String(err)}` };
	}
}

/** Lädt das Zip eines Katalog-Eintrags herunter, prüft den SHA-256 gegen den vom Katalog
 * angegebenen Wert (Integritätsschutz gegen eine beschädigte/manipulierte Übertragung -- ersetzt
 * kein Vertrauen in die Quelle selbst, siehe docs/module-format.md Abschnitt 1) und installiert es
 * anschließend über dieselbe Stage+Commit-Pipeline wie ein manueller Zip-Upload. */
export async function installFromCatalogEntry(
	entry: CatalogEntry,
	opts: { overwrite: boolean }
): Promise<{ id: string } | { error: string }> {
	let buffer: Buffer;
	try {
		const res = await fetch(entry.zipUrl);
		if (!res.ok) return { error: `Download fehlgeschlagen (HTTP ${res.status}).` };
		buffer = Buffer.from(await res.arrayBuffer());
	} catch (err) {
		return { error: `Download fehlgeschlagen: ${err instanceof Error ? err.message : String(err)}` };
	}

	const actualSha256 = createHash('sha256').update(buffer).digest('hex');
	if (actualSha256 !== entry.sha256) {
		return { error: 'Heruntergeladenes Paket stimmt nicht mit dem erwarteten SHA-256 überein -- Installation abgebrochen.' };
	}

	try {
		const { stagingDir, manifest } = await stageZip(buffer);
		await commitStagedInstall(stagingDir, manifest, { overwrite: opts.overwrite, source: 'store' satisfies ModuleSource });
		return { id: manifest.id };
	} catch (err) {
		return { error: err instanceof Error ? err.message : String(err) };
	}
}
