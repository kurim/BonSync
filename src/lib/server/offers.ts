import { existsSync, readdirSync, statSync, unlinkSync } from 'node:fs';
import { join } from 'node:path';
import { and, eq, inArray, lt, or, isNull, gte } from 'drizzle-orm';
import { db } from './db';
import { offers, selectedMarkets, receipts, receiptItems, appSettings } from './db/schema';
import { getModule } from './modules/registry';
import { loadCredentials } from './sync';
import { betterKind, isAllowed, kindRank, MATCH_LEVELS, matchKind, tokenize, type MatchKind, type MatchLevel } from '$lib/dealMatching';
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
				fetchedAt: now
			}));
		});
		// Erst löschen, dann einfügen -- ein Abruf liefert den kompletten aktuellen Stand.
		await db.delete(offers).where(eq(offers.storeId, storeId)).run();
		for (let i = 0; i < rows.length; i += 100) {
			await db.insert(offers).values(rows.slice(i, i + 100)).onConflictDoNothing().run();
		}
		pruneImageCache();
		return { storeId, count: rows.length };
	} catch (err) {
		return { storeId, count: 0, error: err instanceof Error ? err.message : String(err) };
	}
}

export async function syncAllOffers(): Promise<OfferSyncResult[]> {
	const storeIds = [...new Set((await listSelectedMarkets()).map((m) => m.storeId))].filter(supportsOffers);
	const results: OfferSyncResult[] = [];
	for (const id of storeIds) results.push(await syncOffers(id));
	return results;
}

/** Aktuell gültige Angebote der gewählten Märkte; abgelaufene werden verworfen. Ein Angebot mit
 * marketId '' (händlerweit) zählt, sobald für den Händler ein Markt gewählt ist. */
export async function currentOffers() {
	const selected = await listSelectedMarkets();
	if (selected.length === 0) return [];
	const now = Date.now();
	await db.delete(offers).where(and(lt(offers.validTo, now - 24 * 3600_000))).run();
	const rows = await db.select().from(offers).where(or(isNull(offers.validTo), gte(offers.validTo, now))).all();
	const key = new Set(selected.map((m) => `${m.storeId}|${m.marketId}`));
	const stores = new Set(selected.map((m) => m.storeId));
	const visible = rows.filter((o) => (o.marketId === '' ? stores.has(o.storeId) : key.has(`${o.storeId}|${o.marketId}`)));
	// Dasselbe Angebot in mehreren gewählten Märkten nur einmal zeigen, aber alle Märkte merken.
	const merged = new Map<string, (typeof rows)[number] & { marketIds: string[] }>();
	for (const o of visible) {
		const k = `${o.storeId}|${o.externalId}`;
		const e = merged.get(k);
		if (e) e.marketIds.push(o.marketId);
		else merged.set(k, { ...o, marketIds: [o.marketId] });
	}
	return [...merged.values()];
}

export async function getMatchLevel(): Promise<MatchLevel> {
	const s = await db.select().from(appSettings).where(eq(appSettings.id, 1)).get();
	return (MATCH_LEVELS as readonly string[]).includes(s?.dealsMatchLevel ?? '') ? (s!.dealsMatchLevel as MatchLevel) : 'brand';
}

export async function setMatchLevel(level: MatchLevel) {
	await db.update(appSettings).set({ dealsMatchLevel: level }).where(eq(appSettings.id, 1)).run();
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
export async function computeDeals(level: MatchLevel, sinceMs: number | null = Date.now() - 365 * 24 * 3600_000): Promise<Deal[]> {
	const current = await currentOffers();
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
			if (!k || !isAllowed(k, level)) continue;
			kind = kind ? betterKind(kind, k) : k;
			hits.push({ name: p.name, count: p.count });
		}
		if (!kind) continue;
		hits.sort((a, b) => b.count - a.count);
		deals.push({ offer, kind, items: hits.slice(0, 5), count: hits.reduce((s, h) => s + h.count, 0) });
	}
	return deals.sort((a, b) => kindRank(a.kind) - kindRank(b.kind) || b.count - a.count);
}
