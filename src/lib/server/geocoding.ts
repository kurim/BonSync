import { eq } from 'drizzle-orm';
import { requestJson } from './http';
import { db } from './db';
import { marketGeocodes } from './db/schema';

// Adressen ziehen nicht um -> ein einmal ermittelter Punkt bleibt praktisch für immer gültig.
// Die TTL existiert nur, um irgendwann einen erneuten Versuch für Adressen zuzulassen, die
// beim ersten Mal nicht gefunden wurden (z.B. weil MapTiler den API-Key noch nicht kannte).
const CACHE_TTL_MS = 30 * 24 * 60 * 60 * 1000;

export function isMapTilerConfigured(): boolean {
	return Boolean(process.env.MAPTILER_API_KEY);
}

export function mapTileUrlTemplate(): string | null {
	const key = process.env.MAPTILER_API_KEY;
	if (!key) return null;
	// Dunkler Kartenstil passend zum "Midnight Ledger"-Theme statt der hellen Standardkarte.
	return `https://api.maptiler.com/maps/dataviz-dark/{z}/{x}/{y}.png?key=${key}`;
}

interface GeocodeResult {
	lat: number;
	lon: number;
}

interface MapTilerGeocodingResponse {
	features?: Array<{ center?: [number, number] }>;
}

/** Löst eine Adresse (Straße, PLZ Ort) zu Koordinaten auf — via MapTiler Geocoding API,
 * mit persistentem Cache in der DB (Adressen ändern sich nicht, ein Re-Geocode pro Neustart
 * wäre reine Verschwendung von API-Kontingent). Liefert `null`, wenn kein API-Key gesetzt ist
 * oder die Adresse nicht gefunden wurde -- nie einen falschen/geratenen Punkt. */
export async function geocodeAddress(address: string): Promise<GeocodeResult | null> {
	const cached = await db.select().from(marketGeocodes).where(eq(marketGeocodes.address, address)).get();
	if (cached && Date.now() - cached.fetchedAt < CACHE_TTL_MS) {
		return cached.lat != null && cached.lon != null ? { lat: cached.lat, lon: cached.lon } : null;
	}

	const key = process.env.MAPTILER_API_KEY;
	if (!key) return null;

	// Hausnummern-Spannen ("Mittelstr. 75-77") verwirren den Geocoder teils (er interpretiert den
	// Bindestrich als Bereichs-/Subtraktionssyntax statt als Adressbestandteil) und liefern dann
	// einen ungenauen bis falschen Punkt -- auf die erste Nummer der Spanne reduzieren behebt das
	// in aller Regel, ohne die tatsächlich angezeigte Adresse zu verändern (nur die Anfrage).
	const geocodeQuery = address.replace(/(\d+)\s*-\s*\d+/, '$1');

	let result: GeocodeResult | null = null;
	try {
		const url = `https://api.maptiler.com/geocoding/${encodeURIComponent(geocodeQuery)}.json?key=${key}&limit=1`;
		const { status, json } = await requestJson<MapTilerGeocodingResponse>(url);
		const center = status === 200 ? json.features?.[0]?.center : undefined;
		if (center) result = { lon: center[0], lat: center[1] };
	} catch {
		// Geocoding ist rein informativ (Kartenmarker) -> bei Fehler einfach ohne Punkt weiter
	}

	await db
		.insert(marketGeocodes)
		.values({ address, lat: result?.lat ?? null, lon: result?.lon ?? null, fetchedAt: Date.now() })
		.onConflictDoUpdate({
			target: marketGeocodes.address,
			set: { lat: result?.lat ?? null, lon: result?.lon ?? null, fetchedAt: Date.now() }
		})
		.run();

	return result;
}
