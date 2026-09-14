import { readFileSync } from 'node:fs';
import { rm } from 'node:fs/promises';
import { join } from 'node:path';
import { eq, inArray } from 'drizzle-orm';
import { fail } from '@sveltejs/kit';
import { db } from '$lib/server/db';
import { storeModules, receipts, receiptItems, credentials, installedModules } from '$lib/server/db/schema';
import { listMetas, getMeta, getModule, getLoaded, resolveUi, modulesDir, unregisterModule } from '$lib/server/modules/registry';
import { stageZip, commitStagedInstall, isValidStagingDir } from '$lib/server/modules/packageInstaller';
import { parseManifest } from '$lib/server/modules/manifest';
import { loadCredentials, saveCredentials, syncStore, reprocessStore, isReprocessing, pdfDir } from '$lib/server/sync';
import { geocodeAddress, mapTileUrlTemplate } from '$lib/server/geocoding';
import type { StoreId } from '$lib/server/modules/types';
import type { Actions, PageServerLoad } from './$types';

/** Echte, aus dem Modul-Interface abgeleitete Fähigkeiten statt erfundener Feature-Tags —
 * jedes Tag entspricht einer tatsächlich implementierten optionalen StoreModule-Methode. */
function capabilityTags(id: StoreId): string[] {
	const module = getModule(id);
	if (!module) return [];
	const tags: string[] = ['PDF-Export'];
	if (module.fetchReceiptItems) tags.push('Artikel-Erkennung');
	if (module.fetchReceiptSavings) tags.push('Rabatt-Tracking');
	if (module.refreshMarketInfo) tags.push('Markt-Auflösung');
	return tags;
}

/** Reale, pro Modul unterschiedliche Login-/Transport-Mechanik der 4 eingebauten Module (siehe
 * jeweilige Autoren-Quelle in modules-src/) — kein Marketing-Text, sondern was das Modul
 * tatsächlich tut. Für jedes andere (hochgeladene) Modul greift stattdessen dessen eigenes
 * `authDescription`-Manifestfeld, siehe resolveUi/getLoaded unten. */
const AUTH_DESCRIPTIONS: Record<StoreId, string> = {
	rewe: 'REST-Client · mTLS · OAuth 2.0 (PKCE)',
	penny: 'REST-Client · OAuth 2.0 (PKCE, Keycloak)',
	lidl: 'REST-Client · OAuth 2.0 (PKCE, Duende)',
	rossmann: 'REST-Client · E-Mail/Passwort · Zwei-Stufen-Token'
};

export const load: PageServerLoad = async () => {
	const rows = await db.select().from(storeModules).all();
	const rowById = new Map(rows.map((r) => [r.id, r]));
	const allReceipts = await db.select().from(receipts).all();

	const thisMonthStart = (() => {
		const d = new Date();
		d.setDate(1);
		d.setHours(0, 0, 0, 0);
		return d.getTime();
	})();
	const monthLabel = new Date().toLocaleDateString('de-DE', { month: 'long' });

	const stores = await Promise.all(
		listMetas().map(async (meta) => {
			const row = rowById.get(meta.id);
			const matching = allReceipts.filter((r) => r.storeId === meta.id);
			const monthMatching = matching.filter((r) => r.timestamp >= thisMonthStart);
			const creds = await loadCredentials(meta.id);
			return {
				id: meta.id,
				displayName: meta.displayName,
				loginStrategy: meta.loginStrategy,
				implemented: meta.implemented,
				enabled: row?.enabled ?? true,
				status: row?.status ?? 'disconnected',
				lastError: row?.lastError ?? null,
				lastSyncAt: row?.lastSyncAt ?? null,
				receiptCount: matching.length,
				monthCount: monthMatching.length,
				monthCents: monthMatching.reduce((sum, r) => sum + r.totalCents, 0),
				hasCredentials: creds !== null,
				capabilities: meta.implemented ? capabilityTags(meta.id) : [],
				authDescription: AUTH_DESCRIPTIONS[meta.id] ?? getLoaded(meta.id)?.authDescription,
				version: getLoaded(meta.id)?.manifest.version,
				ui: resolveUi(meta.id),
				reprocessing: isReprocessing(meta.id)
			};
		})
	);

	const implementedStores = stores.filter((s) => s.implemented);
	const enabledCount = implementedStores.filter((s) => s.enabled).length;
	const connectedCount = implementedStores.filter((s) => s.enabled && s.status === 'connected').length;
	const lastSyncAt = implementedStores.reduce<number | null>(
		(latest, s) => (s.lastSyncAt && (!latest || s.lastSyncAt > latest) ? s.lastSyncAt : latest),
		null
	);
	const erroringStore = implementedStores.find((s) => s.status === 'error') ?? null;

	const newThisMonth = allReceipts.filter((r) => r.timestamp >= thisMonthStart).length;

	const oldestTimestamp = allReceipts.reduce<number | null>(
		(min, r) => (min === null || r.timestamp < min ? r.timestamp : min),
		null
	);
	const weeksTracked = oldestTimestamp ? Math.max(1, (Date.now() - oldestTimestamp) / (7 * 24 * 60 * 60 * 1000)) : 1;
	const avgReceiptsPerWeek = allReceipts.length / weeksTracked;

	let totalSavingsCents = 0;
	let totalCoupons = 0;
	let receiptsWithSavings = 0;
	for (const r of allReceipts) {
		if (r.savingsCents) {
			totalSavingsCents += r.savingsCents;
			receiptsWithSavings++;
		}
		if (r.couponsJson) {
			try {
				totalCoupons += (JSON.parse(r.couponsJson) as unknown[]).length;
			} catch {
				// beschädigtes JSON ignorieren, rein informative Kennzahl
			}
		}
	}

	// Filialen mit echten Adressdaten gruppieren + zählen (Kartenmarker + Liste) -- ohne
	// marketStreet ist keine sinnvolle Geocoding-Anfrage möglich, solche Belege werden hier
	// nicht als eigene Filiale gezählt (fließen aber weiterhin normal in die Kassenzettel-Liste).
	const filialeMap = new Map<
		string,
		{ storeId: StoreId; name: string; street: string; zip: string; city: string; count: number }
	>();
	for (const r of allReceipts) {
		if (!r.marketStreet || !r.marketCity) continue;
		const key = `${r.storeId}|${r.marketStreet}|${r.marketZip}|${r.marketCity}`;
		const existing = filialeMap.get(key);
		if (existing) {
			existing.count++;
		} else {
			filialeMap.set(key, {
				storeId: r.storeId as StoreId,
				name: r.marketName ?? 'Unbekannter Markt',
				street: r.marketStreet,
				zip: r.marketZip ?? '',
				city: r.marketCity,
				count: 1
			});
		}
	}
	const filialenSorted = [...filialeMap.values()].sort((a, b) => b.count - a.count);

	const filialen = await Promise.all(
		filialenSorted.map(async (f) => {
			const address = `${f.street}, ${f.zip} ${f.city}`.trim();
			const geo = await geocodeAddress(address);
			return { ...f, address, lat: geo?.lat ?? null, lon: geo?.lon ?? null };
		})
	);

	return {
		stores,
		syncStatus: { enabledCount, connectedCount, lastSyncAt, erroringStore },
		totalReceipts: allReceipts.length,
		newThisMonth,
		avgReceiptsPerWeek,
		totalSavingsCents,
		totalCoupons,
		receiptsWithSavings,
		monthLabel,
		filialen,
		mapTileUrl: mapTileUrlTemplate()
	};
};

export const actions: Actions = {
	toggle: async ({ request }) => {
		const data = await request.formData();
		const id = String(data.get('storeId')) as StoreId;
		const enabled = data.get('enabled') === 'true';
		await db.update(storeModules).set({ enabled }).where(eq(storeModules.id, id)).run();
		return { ok: true };
	},

	oauthBeginLogin: async ({ request }) => {
		const data = await request.formData();
		const id = String(data.get('storeId')) as StoreId;
		const module = getModule(id);
		if (!module?.beginLogin) return fail(400, { error: 'Modul unterstützt keinen Login-Start.', storeId: id });
		const { url } = await module.beginLogin();
		return { authorizeUrl: url, storeId: id };
	},

	oauthCompleteLogin: async ({ request }) => {
		const data = await request.formData();
		const id = String(data.get('storeId')) as StoreId;
		const redirectUrl = String(data.get('redirectUrl') ?? '');
		const module = getModule(id);
		if (!module?.completeLogin) return fail(400, { error: 'Modul unterstützt keinen Login-Abschluss.', storeId: id });
		try {
			const creds = await module.completeLogin({ redirectUrl });
			await saveCredentials(id, creds);
			return { success: true, storeId: id };
		} catch (err) {
			return fail(400, { error: err instanceof Error ? err.message : String(err), storeId: id });
		}
	},

	credentialsLogin: async ({ request }) => {
		const data = await request.formData();
		const id = String(data.get('storeId')) as StoreId;
		const email = String(data.get('email') ?? '');
		const password = String(data.get('password') ?? '');
		const module = getModule(id);
		if (!module?.loginWithCredentials) {
			return fail(400, { error: 'Modul unterstützt keinen Zugangsdaten-Login.', storeId: id });
		}
		try {
			const creds = await module.loginWithCredentials({ email, password });
			await saveCredentials(id, creds);
			return { success: true, storeId: id };
		} catch (err) {
			return fail(400, { error: err instanceof Error ? err.message : String(err), storeId: id });
		}
	},

	/** Trennt ein Modul: löscht die gespeicherten Zugangsdaten und setzt den Status zurück.
	 * Bereits synchronisierte Belege bleiben erhalten -- nur die Verbindung wird gekappt. */
	disconnect: async ({ request }) => {
		const data = await request.formData();
		const id = String(data.get('storeId')) as StoreId;
		await db.delete(credentials).where(eq(credentials.storeId, id)).run();
		await db
			.update(storeModules)
			.set({ status: 'disconnected', lastError: null })
			.where(eq(storeModules.id, id))
			.run();
		return { success: true, storeId: id, disconnected: true };
	},

	syncOne: async ({ request }) => {
		const data = await request.formData();
		const id = String(data.get('storeId')) as StoreId;
		const result = await syncStore(id);
		return { syncResult: result };
	},

	/** Liest ALLE bereits erfassten Belege eines Marktes neu ein (z.B. um einen Parser-/
	 * Markt-Namens-Fix rückwirkend anzuwenden) -- läuft im Hintergrund weiter, die Aktion selbst
	 * kehrt sofort zurück, damit ein Markt mit vielen Belegen ohne lokales PDF (Live-Nachladen
	 * von der Store-API nötig) keinen einzelnen Request minutenlang offen hält. */
	reprocessAll: async ({ request }) => {
		const data = await request.formData();
		const id = String(data.get('storeId')) as StoreId;
		if (isReprocessing(id)) return { reprocessStoreId: id, alreadyRunning: true };
		reprocessStore(id).catch((err) => console.error(`[reprocess] ${id} abgebrochen: ${err instanceof Error ? err.message : String(err)}`));
		return { reprocessStoreId: id, started: true };
	},

	syncAll: async () => {
		const results = [];
		for (const meta of listMetas()) {
			if (!meta.implemented) continue;
			const row = await db.select().from(storeModules).where(eq(storeModules.id, meta.id)).get();
			if (row && !row.enabled) continue;
			results.push(await syncStore(meta.id));
		}
		return { syncResults: results };
	},

	/** Deinstalliert ein Modul-Paket: entfernt es immer aus der laufenden Registry + dem
	 * Paketverzeichnis. Nur wenn `deleteData` gesetzt ist, werden zusätzlich Belege, Artikel,
	 * Zugangsdaten und heruntergeladene PDFs dieses Marktes gelöscht -- ohne Häkchen bleibt die
	 * gesamte Sync-Historie erhalten und eine spätere Neuinstallation derselben `id` knüpft
	 * daran nahtlos an (siehe ConfirmUninstallDialog.svelte für die Rückfrage). */
	uninstall: async ({ request }) => {
		const data = await request.formData();
		const id = String(data.get('storeId')) as StoreId;
		const deleteData = data.get('deleteData') === 'true';

		unregisterModule(id);

		if (deleteData) {
			const rows = await db.select({ id: receipts.id }).from(receipts).where(eq(receipts.storeId, id)).all();
			const receiptIds = rows.map((r) => r.id);
			if (receiptIds.length > 0) {
				await db.delete(receiptItems).where(inArray(receiptItems.receiptId, receiptIds)).run();
			}
			await db.delete(receipts).where(eq(receipts.storeId, id)).run();
			await db.delete(credentials).where(eq(credentials.storeId, id)).run();
			await db.delete(storeModules).where(eq(storeModules.id, id)).run();
			await rm(pdfDir(id), { recursive: true, force: true });
		}

		await db.delete(installedModules).where(eq(installedModules.id, id)).run();
		await rm(join(modulesDir(), id), { recursive: true, force: true });

		return { success: true, storeId: id, uninstalled: true };
	},

	/** Erster Schritt der Zip-Installation: extrahiert + validiert (inkl. probeweisem Laden,
	 * siehe stageZip) das hochgeladene Paket in ein Staging-Verzeichnis, committet aber noch
	 * nichts. Der `stagingDir`-Pfad reist als verstecktes Feld zum Client und mit
	 * `installConfirm`/`cancelInstall` zurück -- dort erneut gegen Manipulation geprüft
	 * (siehe isValidStagingDir). */
	installPreview: async ({ request }) => {
		const data = await request.formData();
		const file = data.get('file');
		if (!(file instanceof File) || file.size === 0) {
			return fail(400, { installError: 'Bitte eine Zip-Datei auswählen.' });
		}

		try {
			const buffer = Buffer.from(await file.arrayBuffer());
			const { stagingDir, manifest } = await stageZip(buffer);
			return {
				installPreview: {
					stagingDir,
					id: manifest.id,
					displayName: manifest.displayName,
					version: manifest.version,
					author: manifest.author ?? null,
					description: manifest.description ?? null,
					loginStrategyKind: manifest.loginStrategy.kind,
					alreadyInstalled: Boolean(getMeta(manifest.id)),
					installedVersion: getLoaded(manifest.id)?.manifest.version ?? null
				}
			};
		} catch (err) {
			return fail(400, { installError: err instanceof Error ? err.message : String(err) });
		}
	},

	/** Zweiter Schritt: committet ein zuvor gestagtes Paket. Liest das Manifest erneut selbst aus
	 * dem Staging-Verzeichnis (statt einem clientseitig mitgeschickten Wert zu vertrauen). */
	installConfirm: async ({ request }) => {
		const data = await request.formData();
		const stagingDir = String(data.get('stagingDir') ?? '');
		const overwrite = data.get('overwrite') === 'true';

		if (!isValidStagingDir(stagingDir)) {
			return fail(400, { installError: 'Ungültige oder abgelaufene Installationssitzung -- bitte Zip erneut hochladen.' });
		}

		try {
			const manifest = parseManifest(readFileSync(join(stagingDir, 'manifest.yaml'), 'utf8'));
			await commitStagedInstall(stagingDir, manifest, { overwrite, source: 'uploaded' });
			await db.insert(storeModules).values({ id: manifest.id }).onConflictDoNothing().run();
			return { installedId: manifest.id };
		} catch (err) {
			return fail(400, { installError: err instanceof Error ? err.message : String(err) });
		}
	},

	/** Verwirft eine noch nicht bestätigte Installation (Klick auf "Abbrechen" in der Vorschau)
	 * -- löscht das Staging-Verzeichnis, damit es nicht dauerhaft unter DATA_DIR liegen bleibt. */
	cancelInstall: async ({ request }) => {
		const data = await request.formData();
		const stagingDir = String(data.get('stagingDir') ?? '');
		if (isValidStagingDir(stagingDir)) {
			await rm(stagingDir, { recursive: true, force: true });
		}
		return { installPreview: null };
	}
};
