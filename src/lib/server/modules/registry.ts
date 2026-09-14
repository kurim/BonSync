import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join, resolve, sep } from 'node:path';
import { pathToFileURL } from 'node:url';
import type { StoreModule, StoreModuleMeta } from './types';
import { parseManifest, type ModuleManifest } from './manifest';
import { createSdkForModule, type ModuleSdk } from './sdk';

/** Ein Modul exportiert entweder direkt ein fertiges StoreModule-Objekt, oder eine Fabrik, der
 * die Registry ein pro Modul vorkonfiguriertes ModuleSdk übergibt (siehe docs/module-format.md). */
export type StoreModuleExport = StoreModule | ((sdk: ModuleSdk) => StoreModule);

export interface LoadedModule {
	meta: StoreModuleMeta;
	manifest: ModuleManifest;
	ui?: { color?: string; logo?: string; chip?: string };
	authDescription?: string;
	module: StoreModule;
}

function dataDir(): string {
	return process.env.DATA_DIR ?? './data';
}

export function modulesDir(): string {
	return join(dataDir(), 'modules');
}

const registry = new Map<string, LoadedModule>();

function assertValidStoreModule(mod: unknown, manifest: ModuleManifest): asserts mod is StoreModule {
	if (typeof mod !== 'object' || mod === null) {
		throw new Error('Modul-Export ist kein Objekt (und keine Fabrikfunktion, die eines liefert).');
	}
	const m = mod as Record<string, unknown>;

	for (const fn of ['ensureFreshCredentials', 'fetchReceipts', 'fetchReceiptPdf'] as const) {
		if (typeof m[fn] !== 'function') {
			throw new Error(`Modul-Export: "${fn}" fehlt oder ist keine Funktion (Pflichtmethode).`);
		}
	}
	for (const fn of ['beginLogin', 'completeLogin', 'loginWithCredentials', 'fetchReceiptItems', 'fetchReceiptSavings', 'refreshMarketInfo'] as const) {
		if (fn in m && typeof m[fn] !== 'function') {
			throw new Error(`Modul-Export: "${fn}" ist vorhanden, aber keine Funktion.`);
		}
	}

	const kind = manifest.loginStrategy.kind;
	if ((kind === 'oauth-pkce-manual' || kind === 'oauth-pkce-redirect') && (typeof m.beginLogin !== 'function' || typeof m.completeLogin !== 'function')) {
		throw new Error(`Login-Strategie "${kind}" erfordert beginLogin() + completeLogin() -- mindestens eine Methode fehlt.`);
	}
	if (kind === 'credentials' && typeof m.loginWithCredentials !== 'function') {
		throw new Error('Login-Strategie "credentials" erfordert loginWithCredentials().');
	}
}

/** Lädt + validiert ein Modul-Paket aus `dir` wie loadModuleFromDirectory, registriert es aber
 * BEWUSST NICHT in der laufenden Registry -- für reine Probeläufe (siehe
 * packageInstaller.ts#stageZip), die ein bereits installiertes Modul mit derselben `id` nicht aus
 * dem Speicher verdrängen dürfen. Ein vorheriger Bug hier: `loadModuleFromDirectory` gefolgt von
 * `unregisterModule(id)` als "Probe rückgängig machen" hat bei einem Upgrade/Reupload einer
 * bereits installierten `id` genau DIESE registrierte Instanz überschrieben und anschließend
 * gelöscht -- das echte, laufende Modul verschwand dadurch schon beim bloßen Hochladen einer
 * Vorschau aus der Registry, nicht erst beim Bestätigen. */
async function resolveModuleFromDirectory(dir: string): Promise<LoadedModule> {
	const absoluteDir = resolve(dir);
	const manifestPath = join(absoluteDir, 'manifest.yaml');
	if (!existsSync(manifestPath)) {
		throw new Error(`${absoluteDir}: manifest.yaml fehlt.`);
	}
	const manifest = parseManifest(readFileSync(manifestPath, 'utf8'));

	const entryPath = resolve(absoluteDir, manifest.entry);
	// Mit Trenner vergleichen -- ohne ihn würde ".../modules/rewe-evil/index.js" den Prefix
	// ".../modules/rewe" ebenfalls erfüllen.
	if (!entryPath.startsWith(absoluteDir + sep)) {
		throw new Error(`${absoluteDir}: entry "${manifest.entry}" verlässt das Paketverzeichnis.`);
	}
	if (!existsSync(entryPath)) {
		throw new Error(`${absoluteDir}: entry-Datei "${manifest.entry}" nicht gefunden.`);
	}

	// Cache-Buster in der Import-URL: Node cached ESM-Module über ihre aufgelöste URL hinweg --
	// ohne das würde ein Re-Install/Upgrade unter demselben Pfad (siehe packageInstaller.ts) den
	// alten, bereits importierten Code liefern.
	const imported = (await import(/* @vite-ignore */ `${pathToFileURL(entryPath).href}?t=${Date.now()}`)) as {
		default: StoreModuleExport;
	};
	const sdk = createSdkForModule(manifest.id);
	const resolved = typeof imported.default === 'function' ? (imported.default as (sdk: ModuleSdk) => StoreModule)(sdk) : imported.default;
	assertValidStoreModule(resolved, manifest);

	return {
		meta: { id: manifest.id, displayName: manifest.displayName, loginStrategy: manifest.loginStrategy, implemented: true },
		manifest,
		ui: manifest.ui,
		authDescription: manifest.authDescription,
		module: resolved
	};
}

/** Lädt ein Modul-Paket aus `dir` UND registriert es in der laufenden Registry -- genutzt beim
 * Boot-Scan sowie von packageInstaller.ts#commitStagedInstall nach einer echten Installation.
 * Für reine Validierungs-Probeläufe (Upload-Vorschau) stattdessen resolveModuleFromDirectory
 * (s.o.) verwenden, die die Registry unangetastet lässt. */
export async function loadModuleFromDirectory(dir: string): Promise<LoadedModule> {
	const loaded = await resolveModuleFromDirectory(dir);
	registry.set(loaded.manifest.id, loaded);
	return loaded;
}

/** Nur für Validierungs-Probeläufe (siehe packageInstaller.ts#stageZip): lädt + validiert ein
 * Modul-Paket vollständig (inkl. dynamischem import() + Formprüfung), ohne die Registry
 * anzufassen. */
export async function validateModuleDirectory(dir: string): Promise<LoadedModule> {
	return resolveModuleFromDirectory(dir);
}

/** Scannt beim Boot alle installierten Modul-Pakete unter `${DATA_DIR}/modules/*`. Ein defektes
 * Modul wirft nicht den ganzen Boot um -- Fehler werden geloggt, das Modul bleibt einfach
 * ungeladen (taucht dann nirgends in der UI auf, statt den Serverstart zu verhindern). */
export async function scanAndLoadModules(): Promise<void> {
	registry.clear();
	const dir = modulesDir();
	if (!existsSync(dir)) return;

	for (const entry of readdirSync(dir, { withFileTypes: true })) {
		if (!entry.isDirectory()) continue;
		const moduleDir = join(dir, entry.name);
		try {
			await loadModuleFromDirectory(moduleDir);
		} catch (err) {
			console.error(`[registry] Modul "${entry.name}" konnte nicht geladen werden: ${err instanceof Error ? err.message : String(err)}`);
		}
	}
}

export function getModule(id: string): StoreModule | null {
	return registry.get(id)?.module ?? null;
}

export function getMeta(id: string): StoreModuleMeta | undefined {
	return registry.get(id)?.meta;
}

/** Ersetzt das frühere statische STORE_METAS-Array -- bewusst ein Funktionsaufruf, damit
 * Aufrufer (scheduler.ts, dealer-interfaces/+page.server.ts) nach einem Install/Uninstall ohne
 * Serverneustart den aktuellen Stand sehen. */
export function listMetas(): StoreModuleMeta[] {
	return Array.from(registry.values()).map((loaded) => loaded.meta);
}

/** Für UI-Zugriff auf manifest-getriebene Zusatzinfos (ui/authDescription), die StoreModuleMeta
 * nicht trägt. */
export function listLoaded(): LoadedModule[] {
	return Array.from(registry.values());
}

export function getLoaded(id: string): LoadedModule | undefined {
	return registry.get(id);
}

/** Manifest-getriebene UI-Werte (Farbe/Kürzel/Logo) für ein installiertes Modul, mit dem
 * Logo-relativpfad zur passenden /module-assets-Route aufgelöst -- `null`, falls das Modul kein
 * `ui`-Feld im Manifest hat (dann greift stores-ui.ts's generischer Fallback). Zentral hier
 * statt in jeder Seite dupliziert, damit jede Seite, die ein Modul-Logo anzeigt (dealer-
 * interfaces, receipts/[id]), dieselbe Auflösung nutzt. */
export function resolveUi(id: string): { color?: string; chip?: string; logo?: string } | null {
	const ui = getLoaded(id)?.ui;
	if (!ui) return null;
	return { color: ui.color, chip: ui.chip, logo: ui.logo ? `/module-assets/${id}/${ui.logo}` : undefined };
}

export function unregisterModule(id: string): void {
	registry.delete(id);
}
