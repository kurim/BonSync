import { existsSync, readdirSync, statSync, unlinkSync } from 'node:fs';
import { join } from 'node:path';
import { and, eq, inArray, lt, or, isNull, gte, sql } from 'drizzle-orm';
import { db } from './db';
import { offers, selectedMarkets, receipts, receiptItems, appSettings, hiddenOffers, offerPriceHistory, watchedOffers } from './db/schema';
import { getModule } from './modules/registry';
import { loadCredentials } from './sync';
import { betterKind, isAllowed, kindRank, matchKind, tokenize, type MatchKind, type MatchOptions } from '#lib/dealMatching';
import type { MarketRef, StoreId } from './modules/types';

/** Räumt zwischengespeicherte Angebotsbilder (siehe routes/angebote/bild) nach 30 Tagen auf. */
function pruneImageCache() {
	const dir = join(process.env.DATA_DIR ?? './data', 'cache', 'offer-images');
	if (!existsSync(dir)) return;
	const cutoff = Date.now() - 30 * 24 * 3600_000;
	for (const f of readdirSync(dir)) {
		try {
			if (statSync(join(dir, f)).mtimeMs < cutoff) unlinkSync(join(dir, f));
		} catch {
			// Datei wurde parallel entfernt
		}
	}
}

export async function listSelectedMarkets() {
	return db.select().from(selectedMarkets).all();
}

export async function addSelectedMarket(storeId: StoreId, m: MarketRef) {
	await db
		.insert(selectedMarkets)
		.values({ storeId, marketId: m.id, name: m.name ?? null, street: m.street ?? null, zipCode: m.zipCode ?? null, city: m.city ?? null })
		.onConflictDoNothing()
		.run();
}

export async function removeSelectedMarket(storeId: StoreId, marketId: string) {
	await db.delete(selectedMarkets).where(and(eq(selectedMarkets.storeId, storeId), eq(selectedMarkets.marketId, marketId))).run();
	await db.delete(offers).where(and(eq(offers.storeId, storeId), eq(offers.marketId, marketId))).run();
}

/** Module, die Angebote liefern können (implementieren searchMarkets + fetchOffers). */
export function supportsOffers(storeId: StoreId): boolean {
	const m = getModule(storeId);
	return !!m && typeof m.searchMarkets === 'function' && typeof m.fetchOffers === 'function';
}

export async function searchMarketsFor(storeId: StoreId, query: { zip?: string; text?: string }): Promise<MarketRef[]> {
	const module = getModule(storeId);
	if (!module?.searchMarkets) return [];
	const creds = await loadCredentials(storeId);
	return module.searchMarkets(creds ? await module.ensureFreshCredentials(creds) : null, query);
}

const norm = (s?: string | null) => (s ?? '').toLowerCase().replace(/straße|str\./g, 'str').replace(/[^a-z0-9äöüß]/g, '');

/** Findet zu einer aus Belegen bekannten Filiale (Adresse, aber ohne Markt-ID) den passenden
 * Markt des Moduls über eine PLZ-Suche + Straßenvergleich. `null` ohne eindeutigen Treffer. */
export async function resolveFiliale(storeId: StoreId, f: { street: string; zip: string }): Promise<MarketRef | null> {
	const found = await searchMarketsFor(storeId, { zip: f.zip });
	const street = norm(f.street).replace(/\d+.*$/, '');
	return found.find((m) => street && norm(m.street).startsWith(street)) ?? null;
}

export interface OfferSyncResult {
	storeId: StoreId;
	count: number;
	error?: string;
}

/** Lädt Angebote für alle gewählten Märkte eines Händlers und ersetzt dessen gespeicherte Angebote. */
export async function syncOffers(storeId: StoreId): Promise<OfferSyncResult> {
	const module = getModule(storeId);
	if (!module?.fetchOffers) return { storeId, count: 0, error: 'Modul bietet keine Angebote an' };
	const markets = await db.select().from(selectedMarkets).where(eq(selectedMarkets.storeId, storeId)).all();
	if (markets.length === 0) return { storeId, count: 0 };

	try {
		const stored = await loadCredentials(storeId);
		const creds = stored ? await module.ensureFreshCredentials(stored) : null;
		const refs: MarketRef[] = markets.map((m) => ({
			id: m.marketId,
			name: m.name ?? undefined,
			street: m.street ?? undefined,
			zipCode: m.zipCode ?? undefined,
			city: m.city ?? undefined
		}));
		const fetched = await module.fetchOffers(creds, refs);
		const now = Date.now();
		const known = new Set(refs.map((r) => r.id));
		const rows = fetched.flatMap((o) => {
			const ids = o.marketIds?.length ? o.marketIds.filter((id) => known.has(id)) : [''];
			return ids.map((marketId) => ({
				storeId,
				marketId,
				externalId: o.externalId,
				title: o.title,
				brand: o.brand ?? null,
				priceCents: o.priceCents,
				originalPriceCents: o.originalPriceCents ?? null,
				unitPriceText: o.unitPriceText ?? null,
				validFrom: o.validFrom ?? null,
				validTo: o.validTo ?? null,
				imageUrl: o.imageUrl ?? null,
				category: o.category ?? null,
				fetchedAt: now
			}));
		});
		// Erst löschen, dann einfügen -- ein Abruf liefert den kompletten aktuellen Stand.
		await db.delete(offers).where(eq(offers.storeId, storeId)).run();
		for (let i = 0; i < rows.length; i += 100) {
			await db.insert(offers).values(rows.slice(i, i + 100)).onConflictDoNothing().run();
		}
		await recordPriceHistory(rows, now);
		pruneImageCache();
		return { storeId, count: rows.length };
	} catch (err) {
		return { storeId, count: 0, error: err instanceof Error ? err.message : String(err) };
	}
}

/** Hält den Preis jedes abgerufenen Angebots pro Markt und Tag fest (mehrere Abrufe am selben Tag
 * überschreiben sich). Fehler hier dürfen den Abruf selbst nicht scheitern lassen. */
async function recordPriceHistory(
	rows: { storeId: string; marketId: string; title: string; priceCents: number; originalPriceCents: number | null }[],
	now: number
) {
	try {
		const day = new Date(now).toISOString().slice(0, 10);
		const byKey = new Map<string, typeof offerPriceHistory.$inferInsert>();
		for (const r of rows) {
			const nameKey = hiddenKey(r.title);
			const key = `${r.storeId}|${nameKey}|${r.marketId}`;
			const prev = byKey.get(key);
			// Dasselbe Produkt kann in mehreren Kategorien stehen: der günstigste Preis zählt.
			if (prev && prev.priceCents <= r.priceCents) continue;
			byKey.set(key, { storeId: r.storeId, nameKey, marketId: r.marketId, day, priceCents: r.priceCents, originalPriceCents: r.originalPriceCents });
		}
		const values = [...byKey.values()];
		for (let i = 0; i < values.length; i += 100) {
			await db
				.insert(offerPriceHistory)
				.values(values.slice(i, i + 100))
				.onConflictDoUpdate({
					target: [offerPriceHistory.storeId, offerPriceHistory.nameKey, offerPriceHistory.marketId, offerPriceHistory.day],
					set: { priceCents: sql`excluded.price_cents`, originalPriceCents: sql`excluded.original_price_cents` }
				})
				.run();
		}
	} catch (err) {
		console.error('Preisverlauf konnte nicht gespeichert werden:', err);
	}
}

export async function watchOffer(storeId: StoreId, title: string) {
	await db.insert(watchedOffers).values({ storeId, nameKey: hiddenKey(title), title: title.trim(), since: Date.now() }).onConflictDoNothing().run();
}

export async function unwatchOffer(storeId: StoreId, title: string) {
	await db.delete(watchedOffers).where(and(eq(watchedOffers.storeId, storeId), eq(watchedOffers.nameKey, hiddenKey(title)))).run();
}

export async function listWatched() {
	return db.select().from(watchedOffers).all();
}

/** Schlüssel `storeId|nameKey` aller überwachten Produkte, zum schnellen Abgleich mit Angeboten. */
export async function watchedKeys(): Promise<Set<string>> {
	return new Set((await listWatched()).map((w) => `${w.storeId}|${w.nameKey}`));
}

export const isWatchedKey = (watched: Set<string>, storeId: string, title: string) => watched.has(`${storeId}|${hiddenKey(title)}`);

export interface PriceSeries {
	marketId: string;
	label: string;
	points: { day: string; priceCents: number }[];
}

/** Preisverlauf eines Produkts, je Markt eine Reihe (älteste zuerst). */
export async function priceHistory(storeId: StoreId, title: string): Promise<PriceSeries[]> {
	const rows = await db
		.select()
		.from(offerPriceHistory)
		.where(and(eq(offerPriceHistory.storeId, storeId), eq(offerPriceHistory.nameKey, hiddenKey(title))))
		.all();
	const markets = await db.select().from(selectedMarkets).where(eq(selectedMarkets.storeId, storeId)).all();
	const label = (id: string) => {
		const m = markets.find((x) => x.marketId === id);
		return m ? [m.name, m.city].filter(Boolean).join(', ') || id : id || 'Markt';
	};
	const series = new Map<string, PriceSeries>();
	for (const r of rows) {
		let s = series.get(r.marketId);
		if (!s) series.set(r.marketId, (s = { marketId: r.marketId, label: label(r.marketId), points: [] }));
		s.points.push({ day: r.day, priceCents: r.priceCents });
	}
	for (const s of series.values()) s.points.sort((a, b) => a.day.localeCompare(b.day));
	return [...series.values()].sort((a, b) => a.label.localeCompare(b.label, 'de'));
}

export async function syncAllOffers(): Promise<OfferSyncResult[]> {
	const storeIds = [...new Set((await listSelectedMarkets()).map((m) => m.storeId))].filter(supportsOffers);
	const results: OfferSyncResult[] = [];
	for (const id of storeIds) results.push(await syncOffers(id));
	return results;
}

/** Schlüssel eines ausgeblendeten Produkts: Händler + Produktname (Groß-/Kleinschreibung und
 * Leerraum egal). Bewusst nicht die Angebots-ID, die sich mit jedem Prospekt ändert. */
function hiddenKey(title: string): string {
	return title.toLowerCase().replace(/\s+/g, ' ').trim();
}

export async function hideOffer(storeId: string, title: string) {
	if (!title.trim()) return;
	await db.insert(hiddenOffers).values({ storeId, nameKey: hiddenKey(title), title: title.trim() }).onConflictDoNothing().run();
}

export async function unhideOffer(storeId: string, title: string) {
	await db.delete(hiddenOffers).where(and(eq(hiddenOffers.storeId, storeId), eq(hiddenOffers.nameKey, hiddenKey(title)))).run();
}

/** Aktuell gültige Angebote der gewählten Märkte; abgelaufene werden verworfen. Ein Angebot mit
 * marketId '' (händlerweit) zählt, sobald für den Händler ein Markt gewählt ist. Ausgeblendete
 * Produkte fehlen, außer mit `includeHidden` (dann mit `hidden: true` markiert). */
export async function currentOffers(options: { includeHidden?: boolean } = {}) {
	const selected = await listSelectedMarkets();
	if (selected.length === 0) return [];
	const now = Date.now();
	await db.delete(offers).where(and(lt(offers.validTo, now - 24 * 3600_000))).run();
	const rows = await db.select().from(offers).where(or(isNull(offers.validTo), gte(offers.validTo, now))).all();
	const key = new Set(selected.map((m) => `${m.storeId}|${m.marketId}`));
	const stores = new Set(selected.map((m) => m.storeId));
	const hidden = new Set((await db.select().from(hiddenOffers).all()).map((h) => `${h.storeId}|${h.nameKey}`));
	const visible = rows.filter((o) => (o.marketId === '' ? stores.has(o.storeId) : key.has(`${o.storeId}|${o.marketId}`)));
	// Dasselbe Angebot nur einmal zeigen, aber alle Märkte und Kategorien merken: gleiche
	// externalId in mehreren gewählten Märkten, und inhaltsgleiche Angebote mit unterschiedlicher ID
	// (REWE führt ein Produkt teils in mehreren Kategorien auf).
	const merged = new Map<string, (typeof rows)[number] & { marketIds: string[]; categories: string[]; hidden: boolean }>();
	for (const o of visible) {
		const k = [o.storeId, o.title, o.unitPriceText ?? '', o.priceCents, o.validFrom ?? '', o.validTo ?? ''].join('|');
		const e = merged.get(k);
		if (e) {
			e.marketIds.push(o.marketId);
			if (o.category && !e.categories.includes(o.category)) e.categories.push(o.category);
		} else {
			merged.set(k, { ...o, marketIds: [o.marketId], categories: o.category ? [o.category] : [], hidden: hidden.has(`${o.storeId}|${hiddenKey(o.title)}`) });
		}
	}
	return [...merged.values()].filter((o) => options.includeHidden || !o.hidden);
}

export async function getMatchOptions(): Promise<MatchOptions> {
	const s = await db.select().from(appSettings).where(eq(appSettings.id, 1)).get();
	return { brand: s?.dealsMatchBrand ?? true, category: s?.dealsMatchCategory ?? false };
}

export async function setMatchOptions(options: MatchOptions) {
	await db.update(appSettings).set({ dealsMatchBrand: options.brand, dealsMatchCategory: options.category }).where(eq(appSettings.id, 1)).run();
}

export interface Deal {
	offer: Awaited<ReturnType<typeof currentOffers>>[number];
	kind: MatchKind;
	/** Gekaufte Artikel, auf die der Treffer zurückgeht, mit Kaufanzahl. */
	items: { name: string; count: number }[];
	/** Summe der gekauften Stückzahlen aller zugeordneten Artikel. */
	count: number;
}

/** Gekaufte Artikel (nicht stornierte Belege, optional seit `sinceMs`) zu Namen mit Stückzahl
 * zusammenfassen und mit den aktuellen Angeboten abgleichen. */
export async function computeDeals(
	options: MatchOptions,
	sinceMs: number | null = Date.now() - 365 * 24 * 3600_000,
	includeHidden = false
): Promise<Deal[]> {
	const current = await currentOffers({ includeHidden });
	if (current.length === 0) return [];

	const rcpts = await db.select({ id: receipts.id, ts: receipts.timestamp }).from(receipts).where(eq(receipts.cancelled, false)).all();
	const ids = rcpts.filter((r) => sinceMs == null || r.ts >= sinceMs).map((r) => r.id);
	const purchased = new Map<string, { name: string; count: number; tokens: string[] }>();
	for (let i = 0; i < ids.length; i += 500) {
		const items = await db.select().from(receiptItems).where(inArray(receiptItems.receiptId, ids.slice(i, i + 500))).all();
		for (const it of items) {
			if (it.priceCents <= 0) continue; // Pfand-Rückgabe, Rabattzeilen etc.
			const tokens = tokenize(it.name);
			if (tokens.length === 0) continue;
			const key = tokens.join(' ');
			const e = purchased.get(key);
			const n = it.quantity && it.quantity > 0 ? it.quantity : 1;
			if (e) e.count += n;
			else purchased.set(key, { name: it.name, count: n, tokens });
		}
	}

	const deals: Deal[] = [];
	for (const offer of current) {
		const offerTokens = tokenize(`${offer.brand ?? ''} ${offer.title}`);
		let kind: MatchKind | null = null;
		const hits: { name: string; count: number }[] = [];
		for (const p of purchased.values()) {
			const k = matchKind(p.tokens, offerTokens);
			if (!k || !isAllowed(k, options)) continue;
			kind = kind ? betterKind(kind, k) : k;
			hits.push({ name: p.name, count: p.count });
		}
		if (!kind) continue;
		hits.sort((a, b) => b.count - a.count);
		deals.push({ offer, kind, items: hits.slice(0, 5), count: hits.reduce((s, h) => s + h.count, 0) });
	}
	return deals.sort((a, b) => kindRank(a.kind) - kindRank(b.kind) || b.count - a.count);
}
