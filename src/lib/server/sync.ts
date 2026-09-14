import { eq } from 'drizzle-orm';
import { db } from './db';
import { credentials, receipts, receiptItems, storeModules, appSettings } from './db/schema';
import { encryptJson, decryptJson } from './crypto';
import { getModule } from './modules/registry';
import { extractPdfText, parseReceiptMeta, hasReceiptMeta } from './receiptPdfParser';
import { publishSyncUpdate } from './mqtt';
import type { StoreId, StoredCredentials } from './modules/types';

/** Liefert `null` (statt zu werfen), wenn die gespeicherten Zugangsdaten nicht mehr entschlüsselt
 * werden können (z.B. nach einem geänderten APP_SECRET oder einem beschädigten Blob) -- ein
 * einzelner kaputter Credential-Datensatz darf nicht die komplette Händler-Schnittstellen-Seite
 * mit einem 500er lahmlegen (genau die Seite, auf der man die Verbindung sonst neu herstellen
 * würde). Alle Aufrufer behandeln `null` ohnehin schon als "nicht verbunden". */
export async function loadCredentials(storeId: StoreId): Promise<StoredCredentials | null> {
	const row = await db.select().from(credentials).where(eq(credentials.storeId, storeId)).get();
	if (!row) return null;
	try {
		return decryptJson<StoredCredentials>(row.encryptedBlob);
	} catch (err) {
		console.error(`[sync] Zugangsdaten für "${storeId}" nicht entschlüsselbar: ${err instanceof Error ? err.message : String(err)}`);
		return null;
	}
}

export async function saveCredentials(storeId: StoreId, creds: StoredCredentials) {
	const blob = encryptJson(creds);
	const now = Date.now();
	await db
		.insert(credentials)
		.values({ storeId, encryptedBlob: blob, updatedAt: now })
		.onConflictDoUpdate({ target: credentials.storeId, set: { encryptedBlob: blob, updatedAt: now } })
		.run();
	await db
		.insert(storeModules)
		.values({ id: storeId, status: 'connected' })
		.onConflictDoUpdate({ target: storeModules.id, set: { status: 'connected', lastError: null } })
		.run();
}

export interface SyncResult {
	storeId: StoreId;
	newReceipts: number;
	error?: string;
}

/** Ein Sync-Durchlauf für ein Modul: Liste holen, neue Bons upserten, PDF/Items ggf. eager nachladen.
 * Folgt dem Muster aus Fahrplan Abschnitt 5. */
export async function syncStore(storeId: StoreId): Promise<SyncResult> {
	const module = getModule(storeId);
	if (!module) return { storeId, newReceipts: 0, error: 'Modul noch nicht implementiert' };

	const storedCreds = await loadCredentials(storeId);
	if (!storedCreds) return { storeId, newReceipts: 0, error: 'Nicht verbunden' };

	try {
		const freshCreds = await module.ensureFreshCredentials(storedCreds);
		if (freshCreds !== storedCreds) await saveCredentials(storeId, freshCreds);

		const existingIds = await db
			.select({ externalId: receipts.externalId })
			.from(receipts)
			.where(eq(receipts.storeId, storeId))
			.all();
		const knownIds = new Set(existingIds.map((r) => r.externalId));

		const newReceipts = await module.fetchReceipts(freshCreds, knownIds);

		for (const r of newReceipts) {
			await db
				.insert(receipts)
				.values({
					id: `${storeId}:${r.externalId}`,
					storeId,
					externalId: r.externalId,
					timestamp: r.timestamp,
					totalCents: r.totalCents,
					marketName: r.market?.name,
					marketStreet: r.market?.street,
					marketZip: r.market?.zipCode,
					marketCity: r.market?.city,
					cancelled: r.cancelled,
					hasStructuredItems: r.hasStructuredItems
				})
				.onConflictDoNothing()
				.run();
		}

		const settings = await db.select().from(appSettings).where(eq(appSettings.id, 1)).get();
		const eagerLimit = settings?.eagerPdfLimit ?? 25;
		if (newReceipts.length > 0 && newReceipts.length <= eagerLimit) {
			for (const r of newReceipts) {
				await fetchAndStorePdfAndItems(storeId, r.externalId, freshCreds);
			}
		}

		const allForStore = await db.select().from(receipts).where(eq(receipts.storeId, storeId)).all();
		await db
			.update(storeModules)
			.set({ status: 'connected', lastSyncAt: Date.now(), lastError: null, receiptCount: allForStore.length })
			.where(eq(storeModules.id, storeId))
			.run();

		await publishSyncUpdate(storeId, newReceipts);

		return { storeId, newReceipts: newReceipts.length };
	} catch (err) {
		const message = err instanceof Error ? err.message : String(err);
		await db.update(storeModules).set({ status: 'error', lastError: message }).where(eq(storeModules.id, storeId)).run();
		return { storeId, newReceipts: 0, error: message };
	}
}

/** Lädt PDF (falls noch nicht lokal vorhanden) + Artikel und speichert sie. Idempotent —
 * bereits vorhandene Artikelzeilen werden vor dem Neueinfügen gelöscht, damit ein erneuter
 * Aufruf (z.B. nach einem Parser-Fix) nicht dupliziert, sondern sauber ersetzt. Ein bereits
 * heruntergeladenes PDF wird wiederverwendet statt erneut von der Store-API zu laden. */
export async function fetchAndStorePdfAndItems(
	storeId: StoreId,
	externalId: string,
	creds: StoredCredentials,
	options: { forcePdfRefetch?: boolean } = {}
) {
	const module = getModule(storeId);
	if (!module) return;
	const id = `${storeId}:${externalId}`;
	const { existsSync, mkdirSync, readFileSync, writeFileSync } = await import('node:fs');
	const path = pdfPath(storeId, externalId);

	let pdf: Buffer | null = !options.forcePdfRefetch && existsSync(path) ? readFileSync(path) : null;
	if (!pdf) {
		pdf = await module.fetchReceiptPdf(creds, externalId);
		if (pdf) {
			mkdirSync(pdfDir(storeId), { recursive: true });
			writeFileSync(path, pdf);
			await db.update(receipts).set({ pdfFetched: true, pdfUnavailable: false }).where(eq(receipts.id, id)).run();
		} else {
			// Modul hat explizit `null` geliefert -- laut Vertrag heißt das "kein PDF für diesen
			// Beleg", nicht "vorübergehend nicht erreichbar" (ein echter Netzwerk-/Auth-Fehler wirft
			// stattdessen, siehe StoreModule-Doku). Ohne diese Markierung würde die Detailseite bei
			// jedem Aufruf erneut (erfolglos) nachladen, siehe receipts/[id]/+page.server.ts.
			await db.update(receipts).set({ pdfUnavailable: true }).where(eq(receipts.id, id)).run();
		}
	}

	if (module.fetchReceiptItems) {
		const items = await module.fetchReceiptItems(creds, externalId, pdf ?? undefined);
		await db.delete(receiptItems).where(eq(receiptItems.receiptId, id)).run();
		for (const item of items) {
			await db
				.insert(receiptItems)
				.values({
					receiptId: id,
					name: item.name,
					priceCents: item.priceCents,
					quantity: item.quantity,
					unitPriceCents: item.unitPriceCents,
					taxCode: item.taxCode,
					discountExcluded: item.discountExcluded
				})
				.run();
		}
		await db.update(receipts).set({ itemsFetched: true }).where(eq(receipts.id, id)).run();
	}

	if (module.fetchReceiptSavings) {
		try {
			const savings = await module.fetchReceiptSavings(creds, externalId, pdf ?? undefined);
			if (savings) {
				await db
					.update(receipts)
					.set({
						savingsCents: savings.totalSavingsCents,
						couponsJson: savings.coupons.length > 0 ? JSON.stringify(savings.coupons) : null
					})
					.where(eq(receipts.id, id))
					.run();
			}
		} catch {
			// Ersparnis ist rein informativ -> Fehler hier soll den restlichen Sync nicht abbrechen
		}
	}

	if (pdf) {
		try {
			const meta = parseReceiptMeta(await extractPdfText(pdf));
			if (hasReceiptMeta(meta)) {
				await db.update(receipts).set({ metaJson: JSON.stringify(meta) }).where(eq(receipts.id, id)).run();
			}
		} catch {
			// Metadaten (TSE/Zahlungsart/MwSt.-Aufschlüsselung) sind rein informativ -> bei
			// Fehlschlag (z.B. unbekanntes Bon-Format) den restlichen Sync nicht abbrechen
		}
	}

	if (module.refreshMarketInfo) {
		try {
			const market = await module.refreshMarketInfo(creds, externalId, pdf ?? undefined);
			if (market && (market.name || market.street || market.city)) {
				await db
					.update(receipts)
					.set({
						marketName: market.name,
						marketStreet: market.street,
						marketZip: market.zipCode,
						marketCity: market.city
					})
					.where(eq(receipts.id, id))
					.run();
			}
		} catch {
			// nur ein Nachbesserungsversuch -> Fehler hier soll den restlichen Sync nicht abbrechen
		}
	}
}

const reprocessingStores = new Set<StoreId>();

export function isReprocessing(storeId: StoreId): boolean {
	return reprocessingStores.has(storeId);
}

/** Liest bereits lokal zwischengespeicherte Belege eines Marktes neu ein (Artikel/Ersparnis/
 * Marktdaten aus dem vorhandenen PDF) -- z.B. um einen Parser-/Markt-Namens-Fix rückwirkend
 * anzuwenden. Bewusst NUR Belege mit lokal vorhandenem PDF (siehe pdfPath) -- Belege, die noch
 * nie einzeln geöffnet wurden, haben oft keins, und das PDF live nachzuladen würde bei Märkten
 * mit vielen historischen Belegen (z.B. mehrere hundert bei REWE) ebenso viele Live-Anfragen an
 * die Store-API auslösen, nur um sie zu parsen -- ein Neu-Einlesen-Button darf sowas nicht
 * unbemerkt im Hintergrund tun. Fehlende PDFs bleiben unangetastet (zählen als "übersprungen").
 * Läuft im Hintergrund (nicht awaited vom Aufrufer), damit ein einzelner HTTP-Request bei vielen
 * Belegen nicht lange offen gehalten werden muss. */
export async function reprocessStore(storeId: StoreId): Promise<void> {
	if (reprocessingStores.has(storeId)) return;
	reprocessingStores.add(storeId);
	try {
		const module = getModule(storeId);
		if (!module) return;
		const { existsSync } = await import('node:fs');

		const storedCreds = await loadCredentials(storeId);
		// Wie beim Einzel-Beleg-Reprocess: auch ohne (gültige) Zugangsdaten versuchen -- das
		// lokale PDF reicht für Artikel-/Markt-Neuparsing bei den meisten Modulen bereits aus.
		const effectiveCreds: StoredCredentials = storedCreds ?? {};
		let creds = effectiveCreds;
		if (storedCreds) {
			try {
				creds = await module.ensureFreshCredentials(storedCreds);
			} catch {
				creds = storedCreds;
			}
		}

		const all = await db.select().from(receipts).where(eq(receipts.storeId, storeId)).all();
		const cached = all.filter((r) => existsSync(pdfPath(storeId, r.externalId)));
		let ok = 0;
		let failed = 0;
		for (const r of cached) {
			try {
				await fetchAndStorePdfAndItems(storeId, r.externalId, creds);
				ok++;
			} catch (err) {
				failed++;
				console.error(`[reprocess] ${storeId}:${r.externalId} fehlgeschlagen: ${err instanceof Error ? err.message : String(err)}`);
			}
		}
		const skipped = all.length - cached.length;
		console.log(`[reprocess] ${storeId} abgeschlossen: ${ok} ok, ${failed} Fehler, ${skipped} übersprungen (kein lokales PDF) von ${all.length} gesamt`);
	} finally {
		reprocessingStores.delete(storeId);
	}
}

export function pdfDir(storeId: StoreId): string {
	return `${process.env.DATA_DIR ?? './data'}/receipts/${storeId}`;
}

export function pdfPath(storeId: StoreId, externalId: string): string {
	return `${pdfDir(storeId)}/${externalId}.pdf`;
}
