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

/** Lädt den Modul-Katalog des BonSync-Store -- wirft nie, sondern liefert bei Netzwerk-/Parse-
 * Fehlern `{ error }` zurück (gleiches Robustheits-Muster wie sync.ts#loadCredentials): ein nicht
 * erreichbarer Store darf die Store-Seite nicht mit einem 500er lahmlegen. */
export async function fetchStoreCatalog(): Promise<{ modules: CatalogEntry[] } | { error: string }> {
	try {
		const res = await fetch(CATALOG_URL);
		if (!res.ok) {
			return { error: `Store nicht erreichbar (HTTP ${res.status}).` };
		}
		const data = (await res.json()) as CatalogResponse;
		if (!Array.isArray(data.modules)) {
			return { error: 'Store-Katalog hat ein unerwartetes Format.' };
		}
		return { modules: data.modules };
	} catch (err) {
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
