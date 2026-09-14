import { rm } from 'node:fs/promises';
import { join } from 'node:path';
import { eq, inArray } from 'drizzle-orm';
import { fail } from '@sveltejs/kit';
import { db } from '$lib/server/db';
import { storeModules, receipts, receiptItems, credentials, installedModules } from '$lib/server/db/schema';
import { listMetas, getModule, getLoaded, resolveUi, modulesDir, unregisterModule } from '$lib/server/modules/registry';
import { loadCredentials, saveCredentials, syncStore, reprocessStore, isReprocessing, pdfDir } from '$lib/server/sync';
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
				authDescription: getLoaded(meta.id)?.authDescription,
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

	return {
		stores,
		syncStatus: { enabledCount, connectedCount, lastSyncAt, erroringStore },
		totalReceipts: allReceipts.length,
		newThisMonth,
		avgReceiptsPerWeek,
		totalSavingsCents,
		totalCoupons,
		receiptsWithSavings,
		monthLabel
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
	}
};
