import { createHash } from 'node:crypto';
import type { LoginStrategy } from './types';
import { isValidModuleId } from './manifest';
import { stageZip, commitStagedInstall, type ModuleSource } from './packageInstaller';

// Rollierendes "latest"-Release des BonSync-Store-Repos -- Zip-Assets + index.json werden dort bei
// jedem Push auf main neu gebaut und veröffentlicht (siehe scripts/build-store.mjs im Store-Repo).
const CATALOG_URL = 'https://github.com/kurim/BonSync-Store/releases/download/latest/index.json';

// Nur diese Hosts dürfen als Quelle für Paket-Zips und Logos im Katalog stehen. GitHub liefert
// Release-Assets per Redirect von github.com auf objects.githubusercontent.com aus, Logos liegen
// typischerweise unter raw.githubusercontent.com. Ein manipulierter Katalog kann den Server so
// nicht auf beliebige (z.B. interne) Adressen schicken.
const ALLOWED_HOSTS = new Set(['github.com', 'objects.githubusercontent.com', 'raw.githubusercontent.com']);
const CATALOG_TIMEOUT_MS = 10_000;
const DOWNLOAD_TIMEOUT_MS = 30_000;
// Obergrenze für den Zip-Download -- großzügig über MAX_TOTAL_BYTES aus packageInstaller.ts
// (das entpackte Limit), damit ein legitimes Paket nie hier hängen bleibt, ein hostiler Katalog
// aber keinen Multi-GB-Download in den Speicher erzwingen kann.
const MAX_ZIP_BYTES = 30 * 1024 * 1024;
const HEX_COLOR = /^#(?:[0-9a-fA-F]{3,4}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})$/;
const SHA256_HEX = /^[a-f0-9]{64}$/;

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

function assertAllowedUrl(raw: unknown, what: string): string {
	if (typeof raw !== 'string') throw new Error(`${what} fehlt.`);
	let u: URL;
	try {
		u = new URL(raw);
	} catch {
		throw new Error(`${what} ist keine gültige URL.`);
	}
	if (u.protocol !== 'https:' || !ALLOWED_HOSTS.has(u.hostname)) {
		throw new Error(`${what} zeigt auf einen nicht erlaubten Host (${u.hostname}).`);
	}
	return u.href;
}

/** Bringt einen Katalog-Eintrag in die Form, die der Rest der App voraussetzt: gültige Modul-Id,
 * hex-kodierter SHA-256, URLs nur von erlaubten Hosts, Farbe nur als Hex-Wert (landet ungeschützt
 * in `style`-Attributen, siehe store/+page.svelte). Alles, was nicht passt, wird verworfen oder
 * neutralisiert statt ungeprüft an die Oberfläche/den Installer weitergereicht. */
function sanitizeEntry(raw: CatalogEntry): CatalogEntry {
	if (!isValidModuleId(raw.id)) throw new Error(`Ungültige Modul-Id im Katalog: "${String(raw.id)}"`);
	if (typeof raw.sha256 !== 'string' || !SHA256_HEX.test(raw.sha256)) {
		throw new Error(`Ungültiger SHA-256 im Katalog für "${raw.id}".`);
	}
	const uiRaw = raw.ui && typeof raw.ui === 'object' ? raw.ui : null;
	return {
		id: raw.id,
		displayName: typeof raw.displayName === 'string' && raw.displayName.trim() ? raw.displayName : raw.id,
		version: typeof raw.version === 'string' ? raw.version : '',
		description: typeof raw.description === 'string' ? raw.description : null,
		author: typeof raw.author === 'string' ? raw.author : null,
		authDescription: typeof raw.authDescription === 'string' ? raw.authDescription : null,
		loginStrategy: raw.loginStrategy,
		sdkVersion: typeof raw.sdkVersion === 'number' ? raw.sdkVersion : 1,
		providesPdf: typeof raw.providesPdf === 'boolean' ? raw.providesPdf : true,
		ui: uiRaw
			? {
					color: typeof uiRaw.color === 'string' && HEX_COLOR.test(uiRaw.color) ? uiRaw.color : null,
					chip: typeof uiRaw.chip === 'string' ? uiRaw.chip.slice(0, 3) : null,
					logoUrl: typeof uiRaw.logoUrl === 'string' ? assertAllowedUrl(uiRaw.logoUrl, `Logo-URL von "${raw.id}"`) : null
				}
			: null,
		zipUrl: assertAllowedUrl(raw.zipUrl, `Paket-URL von "${raw.id}"`),
		sha256: raw.sha256.toLowerCase(),
		sizeBytes: typeof raw.sizeBytes === 'number' ? raw.sizeBytes : 0
	};
}

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
		const res = await fetch(CATALOG_URL, { signal: AbortSignal.timeout(CATALOG_TIMEOUT_MS) });
		if (!res.ok) {
			if (cache) return cache; // veralteter Katalog ist besser als ein Fehler, solange einer existiert
			return { error: `Store nicht erreichbar (HTTP ${res.status}).` };
		}
		const data = (await res.json()) as CatalogResponse;
		if (!Array.isArray(data.modules)) {
			if (cache) return cache;
			return { error: 'Store-Katalog hat ein unerwartetes Format.' };
		}
		cache = { modules: data.modules.map(sanitizeEntry), fetchedAt: Date.now() };
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
		// zipUrl wurde in sanitizeEntry bereits gegen ALLOWED_HOSTS geprüft; hier trotzdem erneut,
		// falls ein Aufrufer einmal einen Eintrag von außerhalb des Katalog-Caches durchreicht.
		const url = assertAllowedUrl(entry.zipUrl, 'Paket-URL');
		const res = await fetch(url, { signal: AbortSignal.timeout(DOWNLOAD_TIMEOUT_MS) });
		if (!res.ok) return { error: `Download fehlgeschlagen (HTTP ${res.status}).` };
		const declared = Number(res.headers.get('content-length') ?? 0);
		if (declared > MAX_ZIP_BYTES) return { error: 'Paket ist zu groß -- Installation abgebrochen.' };
		buffer = Buffer.from(await res.arrayBuffer());
		if (buffer.length > MAX_ZIP_BYTES) return { error: 'Paket ist zu groß -- Installation abgebrochen.' };
	} catch (err) {
		return { error: `Download fehlgeschlagen: ${err instanceof Error ? err.message : String(err)}` };
	}

	const actualSha256 = createHash('sha256').update(buffer).digest('hex');
	if (actualSha256 !== entry.sha256) {
		return { error: 'Heruntergeladenes Paket stimmt nicht mit dem erwarteten SHA-256 überein -- Installation abgebrochen.' };
	}

	try {
		const { stagingDir, manifest } = await stageZip(buffer);
		if (manifest.id !== entry.id) {
			return { error: `Paket-Manifest trägt die Id "${manifest.id}", der Katalog-Eintrag aber "${entry.id}" -- Installation abgebrochen.` };
		}
		await commitStagedInstall(stagingDir, manifest, { overwrite: opts.overwrite, source: 'store' satisfies ModuleSource });
		return { id: manifest.id };
	} catch (err) {
		return { error: err instanceof Error ? err.message : String(err) };
	}
}
