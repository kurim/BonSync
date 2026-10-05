import { error, json } from '@sveltejs/kit';
import { priceHistory } from '#lib/server/offers';
import type { RequestHandler } from './$types';

// Preisverlauf eines Angebots-Produkts (je Markt eine Reihe), wird beim Aufklappen einer Karte geladen.
export const GET: RequestHandler = async ({ url }) => {
	const storeId = url.searchParams.get('s');
	const title = url.searchParams.get('t');
	if (!storeId || !title) error(400, 'Händler und Produkt fehlen');
	return json(await priceHistory(storeId, title));
};
