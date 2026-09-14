import { db } from '$lib/server/db';
import { receipts } from '$lib/server/db/schema';
import { geocodeAddress, mapTileUrlTemplate } from '$lib/server/geocoding';
import type { StoreId } from '$lib/server/modules/types';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async () => {
	const allReceipts = await db.select().from(receipts).all();

	// Filialen mit echten Adressdaten gruppieren + zählen (Kartenmarker + Liste) -- ohne
	// marketStreet ist keine sinnvolle Geocoding-Anfrage möglich, solche Belege werden hier
	// nicht als eigene Filiale gezählt (fließen aber weiterhin normal in die Kassenzettel-Liste).
	const filialeMap = new Map<
		string,
		{ storeId: StoreId; name: string; street: string; zip: string; city: string; count: number }
	>();
	for (const r of allReceipts) {
		if (!r.marketStreet || !r.marketCity) continue;
		const key = `${r.storeId}|${r.marketStreet}|${r.marketZip}|${r.marketCity}`;
		const existing = filialeMap.get(key);
		if (existing) {
			existing.count++;
		} else {
			filialeMap.set(key, {
				storeId: r.storeId as StoreId,
				name: r.marketName ?? 'Unbekannter Markt',
				street: r.marketStreet,
				zip: r.marketZip ?? '',
				city: r.marketCity,
				count: 1
			});
		}
	}
	const filialenSorted = [...filialeMap.values()].sort((a, b) => b.count - a.count);

	const filialen = await Promise.all(
		filialenSorted.map(async (f) => {
			const address = `${f.street}, ${f.zip} ${f.city}`.trim();
			const geo = await geocodeAddress(address);
			return { ...f, address, lat: geo?.lat ?? null, lon: geo?.lon ?? null };
		})
	);

	return { filialen, mapTileUrl: mapTileUrlTemplate() };
};
