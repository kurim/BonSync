import { eq } from 'drizzle-orm';
import { error, fail } from '@sveltejs/kit';
import { db } from '$lib/server/db';
import { receipts, receiptItems } from '$lib/server/db/schema';
import { loadCredentials, fetchAndStorePdfAndItems } from '$lib/server/sync';
import { getModule, getLoaded, resolveUi } from '$lib/server/modules/registry';
import type { StoreId, StoredCredentials } from '$lib/server/modules/types';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ params }) => {
	let receipt = await db.select().from(receipts).where(eq(receipts.id, params.id)).get();
	if (!receipt) throw error(404, 'Beleg nicht gefunden');

	let fetchError: string | null = null;
	const providesPdf = getLoaded(receipt.storeId)?.manifest.providesPdf ?? true;

	// Lazy-Nachladen beim Öffnen der Detailseite (Fahrplan Abschnitt 5): PDF/Artikel werden
	// erst hier geholt, nicht schon beim Sync — vermeidet Massen-Downloads bei großem Erst-Sync.
	// `pdfFetched` nur einfordern, wenn der Händler überhaupt PDFs liefert (providesPdf) -- sonst
	// würde hier bei jedem Seitenaufruf erneut (erfolglos) nachgeladen, weil pdfFetched für so
	// ein Modul nie true wird.
	if (!receipt.itemsFetched || (providesPdf && !receipt.pdfFetched)) {
		const storeId = receipt.storeId as StoreId;
		const module = getModule(storeId);
		const creds = module ? await loadCredentials(storeId) : null;
		if (module && creds) {
			try {
				const fresh = await module.ensureFreshCredentials(creds);
				await fetchAndStorePdfAndItems(storeId, receipt.externalId, fresh);
				receipt = (await db.select().from(receipts).where(eq(receipts.id, params.id)).get()) ?? receipt;
			} catch (err) {
				fetchError = err instanceof Error ? err.message : String(err);
			}
		} else if (!creds) {
			fetchError = 'Markt nicht verbunden — PDF/Artikel können nicht nachgeladen werden.';
		}
	}

	const items = await db.select().from(receiptItems).where(eq(receiptItems.receiptId, params.id)).all();
	return { receipt, items, fetchError, providesPdf, ui: resolveUi(receipt.storeId) };
};

export const actions: Actions = {
	/** Liest Artikel/PDF für einen BEREITS erfassten Beleg neu ein — z.B. nach einem Fix am
	 * PDF-Parser, damit alte, mit dem kaputten Stand geparste Belege nicht falsch bleiben. */
	reprocess: async ({ params }) => {
		const receipt = await db.select().from(receipts).where(eq(receipts.id, params.id)).get();
		if (!receipt) return fail(404, { error: 'Beleg nicht gefunden' });
		const storeId = receipt.storeId as StoreId;
		const module = getModule(storeId);
		if (!module) return fail(400, { error: 'Modul nicht implementiert' });

		const creds = await loadCredentials(storeId);
		// Ohne gültige Zugangsdaten trotzdem versuchen, falls ein PDF schon lokal vorliegt —
		// REWE/PENNY parsen dann rein aus der Datei, ohne die Store-API erneut anzusprechen.
		const effectiveCreds: StoredCredentials = creds ?? {};
		try {
			const fresh = creds ? await module.ensureFreshCredentials(creds) : effectiveCreds;
			await fetchAndStorePdfAndItems(storeId, receipt.externalId, fresh);
			return { success: true };
		} catch (err) {
			return fail(400, { error: err instanceof Error ? err.message : String(err) });
		}
	}
};
