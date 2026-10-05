import { fail } from '@sveltejs/kit';
import { getStoreUi } from '#lib/stores-ui';
import { listMetas, resolveUi } from '#lib/server/modules/registry';
import { currentOffers, listSelectedMarkets, supportsOffers, syncAllOffers } from '#lib/server/offers';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = async () => {
	const [offers, markets] = await Promise.all([currentOffers(), listSelectedMarkets()]);
	const marketName = new Map(markets.map((m) => [`${m.storeId}|${m.marketId}`, m.name ?? m.street ?? m.marketId]));
	const storeUi = Object.fromEntries(listMetas().map((m) => [m.id, getStoreUi(m.id, m.displayName, resolveUi(m.id))]));
	return {
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
	}
};
