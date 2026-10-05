import { getStoreUi } from '#lib/stores-ui';
import { listMetas, resolveUi } from '#lib/server/modules/registry';
import { computeDeals, getMatchOptions, listSelectedMarkets, setMatchOptions } from '#lib/server/offers';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = async () => {
	const matchOptions = await getMatchOptions();
	const [deals, markets] = await Promise.all([computeDeals(matchOptions), listSelectedMarkets()]);
	const storeUi = Object.fromEntries(listMetas().map((m) => [m.id, getStoreUi(m.id, m.displayName, resolveUi(m.id))]));
	return {
		matchOptions,
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
	}
};
