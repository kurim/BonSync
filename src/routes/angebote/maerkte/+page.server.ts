import { fail } from '@sveltejs/kit';
import { eq } from 'drizzle-orm';
import { db } from '$lib/server/db';
import { receipts } from '$lib/server/db/schema';
import { getStoreUi } from '$lib/stores-ui';
import { listMetas, resolveUi } from '$lib/server/modules/registry';
import { addSelectedMarket, listSelectedMarkets, removeSelectedMarket, resolveFiliale, searchMarketsFor, supportsOffers, syncOffers } from '$lib/server/offers';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = async () => {
	const metas = listMetas().filter((m) => supportsOffers(m.id));
	const selected = await listSelectedMarkets();
	const supported = new Set(metas.map((m) => m.id));

	// Vorschläge: Filialen aus den Belegen (Adresse, aber ohne Markt-ID) -- beim Übernehmen wird
	// per PLZ-Suche der passende Markt des Moduls aufgelöst (resolveFiliale).
	const all = await db.select().from(receipts).all();
	const seen = new Map<string, { storeId: string; name: string; street: string; zip: string; city: string; count: number }>();
	for (const r of all) {
		if (!supported.has(r.storeId) || !r.marketStreet || !r.marketZip) continue;
		const key = `${r.storeId}|${r.marketStreet}|${r.marketZip}`;
		const e = seen.get(key);
		if (e) e.count++;
		else seen.set(key, { storeId: r.storeId, name: r.marketName ?? 'Markt', street: r.marketStreet, zip: r.marketZip, city: r.marketCity ?? '', count: 1 });
	}
	const taken = new Set(selected.map((m) => `${m.storeId}|${(m.street ?? '').toLowerCase()}|${m.zipCode}`));
	const suggestions = [...seen.values()]
		.filter((f) => !taken.has(`${f.storeId}|${f.street.toLowerCase()}|${f.zip}`))
		.sort((a, b) => b.count - a.count);

	return {
		stores: metas.map((m) => ({ id: m.id, ...getStoreUi(m.id, m.displayName, resolveUi(m.id)) })),
		selected,
		suggestions
	};
};

export const actions: Actions = {
	search: async ({ request }) => {
		const f = await request.formData();
		const storeId = String(f.get('storeId') ?? '');
		const zip = String(f.get('zip') ?? '').trim();
		if (!supportsOffers(storeId)) return fail(400, { searchError: 'Händler unbekannt oder ohne Angebote.', storeId, zip });
		if (!zip) return fail(400, { searchError: 'Bitte eine PLZ oder einen Ort eingeben.', storeId, zip });
		try {
			const results = await searchMarketsFor(storeId, /^\d{5}$/.test(zip) ? { zip } : { text: zip });
			return { results, storeId, zip };
		} catch (err) {
			return fail(502, { searchError: err instanceof Error ? err.message : String(err), storeId, zip });
		}
	},
	add: async ({ request }) => {
		const f = await request.formData();
		const storeId = String(f.get('storeId') ?? '');
		if (!supportsOffers(storeId)) return fail(400, { addError: 'Händler unbekannt oder ohne Angebote.' });
		const id = String(f.get('marketId') ?? '');
		if (!id) return fail(400, { addError: 'Markt fehlt.' });
		await addSelectedMarket(storeId, {
			id,
			name: String(f.get('name') ?? '') || undefined,
			street: String(f.get('street') ?? '') || undefined,
			zipCode: String(f.get('zipCode') ?? '') || undefined,
			city: String(f.get('city') ?? '') || undefined
		});
		void syncOffers(storeId);
		return { added: true };
	},
	adopt: async ({ request }) => {
		const f = await request.formData();
		const storeId = String(f.get('storeId') ?? '');
		if (!supportsOffers(storeId)) return fail(400, { addError: 'Händler unbekannt oder ohne Angebote.' });
		try {
			const market = await resolveFiliale(storeId, { street: String(f.get('street') ?? ''), zip: String(f.get('zip') ?? '') });
			if (!market) return fail(404, { addError: 'Diese Filiale wurde in der Marktsuche des Händlers nicht gefunden -- bitte per PLZ-Suche wählen.' });
			await addSelectedMarket(storeId, market);
			void syncOffers(storeId);
			return { added: true };
		} catch (err) {
			return fail(502, { addError: err instanceof Error ? err.message : String(err) });
		}
	},
	remove: async ({ request }) => {
		const f = await request.formData();
		await removeSelectedMarket(String(f.get('storeId') ?? ''), String(f.get('marketId') ?? ''));
		return { removed: true };
	}
};
