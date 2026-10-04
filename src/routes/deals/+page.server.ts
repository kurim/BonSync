import { fail } from '@sveltejs/kit';
import { getStoreUi } from '$lib/stores-ui';
import { MATCH_LEVELS, type MatchLevel } from '$lib/dealMatching';
import { listMetas, resolveUi } from '$lib/server/modules/registry';
import { computeDeals, getMatchLevel, listSelectedMarkets, setMatchLevel } from '$lib/server/offers';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = async () => {
	const level = await getMatchLevel();
	const [deals, markets] = await Promise.all([computeDeals(level), listSelectedMarkets()]);
	const storeUi = Object.fromEntries(listMetas().map((m) => [m.id, getStoreUi(m.id, m.displayName, resolveUi(m.id))]));
	return {
		level,
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
	level: async ({ request }) => {
		const level = String((await request.formData()).get('level') ?? '');
		if (!(MATCH_LEVELS as readonly string[]).includes(level)) return fail(400, { error: 'Ungültige Stufe.' });
		await setMatchLevel(level as MatchLevel);
		return { saved: true };
	}
};
