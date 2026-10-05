import { fail } from '@sveltejs/kit';
import { getStoreUi } from '#lib/stores-ui';
import { listMetas, resolveUi } from '#lib/server/modules/registry';
import { currentOffers, hideOffer, listSelectedMarkets, supportsOffers, syncAllOffers, unhideOffer } from '#lib/server/offers';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ url }) => {
	const showHidden = url.searchParams.get('hidden') === '1';
	const [all, markets] = await Promise.all([currentOffers({ includeHidden: true }), listSelectedMarkets()]);
	const hiddenCount = all.filter((o) => o.hidden).length;
	const offers = showHidden ? all : all.filter((o) => !o.hidden);
	const marketName = new Map(markets.map((m) => [`${m.storeId}|${m.marketId}`, m.name ?? m.street ?? m.marketId]));
	const storeUi = Object.fromEntries(listMetas().map((m) => [m.id, getStoreUi(m.id, m.displayName, resolveUi(m.id))]));
	return {
		showHidden,
		hiddenCount,
		hasMarkets: markets.length > 0,
		offersSupported: listMetas().some((m) => supportsOffers(m.id)),
		storeUi,
		offers: offers
			.map((o) => ({
				storeId: o.storeId,
				externalId: o.externalId,
				title: o.title,
				brand: o.brand,
				priceCents: o.priceCents,
				originalPriceCents: o.originalPriceCents,
				unitPriceText: o.unitPriceText,
				validFrom: o.validFrom,
				validTo: o.validTo,
				imageUrl: o.imageUrl,
				categories: o.categories,
				hidden: o.hidden,
				markets: o.marketIds.filter((id) => id !== '').map((id) => marketName.get(`${o.storeId}|${id}`) ?? id)
			}))
			.sort((a, b) => a.title.localeCompare(b.title, 'de'))
	};
};

export const actions: Actions = {
	refresh: async () => {
		const results = await syncAllOffers();
		const errors = results.filter((r) => r.error).map((r) => `${r.storeId}: ${r.error}`);
		if (errors.length > 0) return fail(502, { refreshError: errors.join(' · ') });
		return { refreshed: results.map((r) => ({ storeId: r.storeId, count: r.count })) };
	},
	hide: async ({ request }) => {
		const f = await request.formData();
		await hideOffer(String(f.get('storeId') ?? ''), String(f.get('title') ?? ''));
		return { hiddenChanged: true };
	},
	unhide: async ({ request }) => {
		const f = await request.formData();
		await unhideOffer(String(f.get('storeId') ?? ''), String(f.get('title') ?? ''));
		return { hiddenChanged: true };
	}
};
