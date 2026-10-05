import { getStoreUi } from '#lib/stores-ui';
import { listMetas, resolveUi } from '#lib/server/modules/registry';
import { computeDeals, getMatchOptions, hideOffer, isWatchedKey, listSelectedMarkets, setMatchOptions, unhideOffer, watchedKeys } from '#lib/server/offers';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ url }) => {
	const showHidden = url.searchParams.get('hidden') === '1';
	const matchOptions = await getMatchOptions();
	const [deals, markets, watched] = await Promise.all([computeDeals(matchOptions, undefined, showHidden), listSelectedMarkets(), watchedKeys()]);
	const storeUi = Object.fromEntries(listMetas().map((m) => [m.id, getStoreUi(m.id, m.displayName, resolveUi(m.id))]));
	return {
		matchOptions,
		showHidden,
		watchedCount: watched.size,
		hasMarkets: markets.length > 0,
		storeUi,
		deals: deals.map((d) => ({
			storeId: d.offer.storeId,
			externalId: d.offer.externalId,
			title: d.offer.title,
			brand: d.offer.brand,
			priceCents: d.offer.priceCents,
			originalPriceCents: d.offer.originalPriceCents,
			unitPriceText: d.offer.unitPriceText,
			validTo: d.offer.validTo,
			imageUrl: d.offer.imageUrl,
			hidden: d.offer.hidden,
			watched: isWatchedKey(watched, d.offer.storeId, d.offer.title),
			kind: d.kind,
			items: d.items,
			count: d.count
		}))
	};
};

export const actions: Actions = {
	options: async ({ request }) => {
		const f = await request.formData();
		await setMatchOptions({ brand: f.get('brand') === 'on', category: f.get('category') === 'on' });
		return { saved: true };
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
