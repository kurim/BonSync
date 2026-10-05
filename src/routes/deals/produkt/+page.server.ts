import { fail } from '@sveltejs/kit';
import { getStoreUi } from '#lib/stores-ui';
import { listMetas, resolveUi } from '#lib/server/modules/registry';
import { currentOffers, isWatchedKey, listWatched, unwatchOffer, watchOffer, watchedKeys } from '#lib/server/offers';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ url }) => {
	const storeUi = Object.fromEntries(listMetas().map((m) => [m.id, getStoreUi(m.id, m.displayName, resolveUi(m.id))]));
	const storeId = url.searchParams.get('s');
	const title = url.searchParams.get('t');

	// Ohne Produkt: Liste der überwachten Produkte.
	if (!storeId || !title) {
		const watched = (await listWatched()).sort((a, b) => a.title.localeCompare(b.title, 'de'));
		return { product: null, storeUi, watched: watched.map((w) => ({ storeId: w.storeId, title: w.title })) };
	}

	const watched = await watchedKeys();
	const offers = (await currentOffers({ includeHidden: true })).filter((o) => o.storeId === storeId && o.title.toLowerCase().replace(/\s+/g, ' ').trim() === title.toLowerCase().replace(/\s+/g, ' ').trim());
	const now = offers[0];
	return {
		product: {
			storeId,
			title,
			watched: isWatchedKey(watched, storeId, title),
			current: now ? { priceCents: now.priceCents, originalPriceCents: now.originalPriceCents, validTo: now.validTo } : null
		},
		storeUi,
		watched: []
	};
};

export const actions: Actions = {
	watch: async ({ request }) => {
		const f = await request.formData();
		const storeId = String(f.get('storeId') ?? '');
		const title = String(f.get('title') ?? '');
		if (!storeId || !title) return fail(400, { error: 'Produkt fehlt' });
		await watchOffer(storeId, title);
		return { ok: true };
	},
	unwatch: async ({ request }) => {
		const f = await request.formData();
		const storeId = String(f.get('storeId') ?? '');
		const title = String(f.get('title') ?? '');
		if (!storeId || !title) return fail(400, { error: 'Produkt fehlt' });
		await unwatchOffer(storeId, title);
		return { ok: true };
	}
};
