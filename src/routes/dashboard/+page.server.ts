import { desc, inArray, eq } from 'drizzle-orm';
import { db } from '$lib/server/db';
import { receipts, receiptItems, storeModules, appSettings } from '$lib/server/db/schema';
import { getStoreUi } from '$lib/stores-ui';
import { listMetas, resolveUi } from '$lib/server/modules/registry';
import type { PageServerLoad } from './$types';

const RANGES = ['month', '30days', 'year'] as const;
export type Range = (typeof RANGES)[number];

function monthStart(offsetMonths: number): number {
	const d = new Date();
	d.setDate(1);
	d.setHours(0, 0, 0, 0);
	d.setMonth(d.getMonth() - offsetMonths);
	return d.getTime();
}

function resolveRange(range: Range): { start: number; label: string; badge: string } {
	const now = new Date();
	if (range === '30days') return { start: Date.now() - 30 * 86_400_000, label: 'in den letzten 30 Tagen', badge: 'Letzte 30 Tage' };
	if (range === 'year') {
		return { start: new Date(now.getFullYear(), 0, 1).getTime(), label: `im Jahr ${now.getFullYear()}`, badge: `Jahr ${now.getFullYear()}` };
	}
	return { start: monthStart(0), label: 'diesen Monat', badge: now.toLocaleDateString('de-DE', { month: 'long', year: 'numeric' }) };
}

export const load: PageServerLoad = async ({ url }) => {
	// Pro Request neu ermittelt (statt statischem Array), damit ein frisch installiertes/
	// deinstalliertes Modul ohne Serverneustart berücksichtigt wird.
	const STORE_ORDER = listMetas().map((m) => m.id);

	// UI-Werte (Name/Farbe/Kürzel/Logo) aus der Registry, direkt aus dem jeweiligen Manifest --
	// als serialisierbare Map an den Client durchgereicht, da die Registry selbst nur
	// server-seitig verfügbar ist (siehe stores-ui.ts#getStoreUi).
	const storeUi = Object.fromEntries(listMetas().map((m) => [m.id, getStoreUi(m.id, m.displayName, resolveUi(m.id))]));

	const rangeParam = url.searchParams.get('range');
	const range: Range = (RANGES as readonly string[]).includes(rangeParam ?? '') ? (rangeParam as Range) : 'month';
	const { start, label: rangeLabel, badge: rangeBadge } = resolveRange(range);

	const allReceipts = await db.select().from(receipts).all();
	const inRange = allReceipts.filter((r) => r.timestamp >= start && !r.cancelled);

	// Für "Dieser Monat" gegen den kompletten Vormonat vergleichen (nicht nur die gleiche Anzahl
	// Tage davor) -- sonst wirkt der Vergleich früh im Monat verzerrt (wenige Tage vs. wenige
	// Tage Ende Vormonat statt vs. dessen Gesamtsumme). Für 30-Tage/Jahr gibt es kein sauberes
	// Kalenderäquivalent, daher dort ein gleich langes Fenster direkt davor.
	const [prevStart, prevEnd] = range === 'month' ? [monthStart(1), monthStart(0)] : [start - (Date.now() - start), start];
	const prevRange = allReceipts.filter((r) => r.timestamp >= prevStart && r.timestamp < prevEnd && !r.cancelled);

	const totalCents = inRange.reduce((sum, r) => sum + r.totalCents, 0);
	const prevTotalCents = prevRange.reduce((sum, r) => sum + r.totalCents, 0);
	const pctChange = prevTotalCents > 0 ? Math.round(((totalCents - prevTotalCents) / prevTotalCents) * 1000) / 10 : null;

	const receiptCount = inRange.length;
	const prevReceiptCount = prevRange.length;
	const countDelta = receiptCount - prevReceiptCount;
	const avgCents = receiptCount > 0 ? Math.round(totalCents / receiptCount) : 0;

	const byStore = new Map<string, number>();
	for (const r of inRange) byStore.set(r.storeId, (byStore.get(r.storeId) ?? 0) + r.totalCents);
	let topStore: { id: string; name: string; color: string; cents: number; pct: number; count: number } | null = null;
	if (byStore.size > 0) {
		const [id, cents] = [...byStore.entries()].sort((a, b) => b[1] - a[1])[0];
		const pct = totalCents > 0 ? Math.round((cents / totalCents) * 100) : 0;
		const count = inRange.filter((r) => r.storeId === id).length;
		const ui = storeUi[id] ?? getStoreUi(id);
		topStore = { id, name: ui.name, color: ui.color, cents, pct, count };
	}

	// Fester 6-Monats-Balkenchart, unabhängig vom oben gewählten Zeitraum-Filter (wie im Mockup
	// als eigener Block mit fixem Fenster).
	const months: { label: string; values: Record<string, number> }[] = [];
	for (let i = 5; i >= 0; i--) {
		const mStart = monthStart(i);
		const mEnd = i === 0 ? Date.now() : monthStart(i - 1);
		const mLabel = new Date(mStart).toLocaleDateString('de-DE', { month: 'short' });
		const values: Record<string, number> = Object.fromEntries(STORE_ORDER.map((s) => [s, 0]));
		for (const r of allReceipts) {
			if (!r.cancelled && r.timestamp >= mStart && r.timestamp < mEnd) {
				values[r.storeId] = (values[r.storeId] ?? 0) + r.totalCents;
			}
		}
		months.push({ label: mLabel, values });
	}
	const sixMonthTotalCents = months.reduce((sum, m) => sum + Object.values(m.values).reduce((a, b) => a + b, 0), 0);
	const sixMonthRangeLabel = (() => {
		const first = new Date(monthStart(5));
		const last = new Date();
		return `${first.toLocaleDateString('de-DE', { month: 'long' })} bis ${last.toLocaleDateString('de-DE', { month: 'long', year: 'numeric' })}`;
	})();

	const recentRows = await db.select().from(receipts).orderBy(desc(receipts.timestamp)).limit(5).all();
	const recentByStoreRows = await Promise.all(
		STORE_ORDER.map((id) => db.select().from(receipts).where(eq(receipts.storeId, id)).orderBy(desc(receipts.timestamp)).limit(1).get())
	);
	const recentByStore = recentByStoreRows.filter((r): r is NonNullable<typeof r> => !!r).sort((a, b) => b.timestamp - a.timestamp);

	const recentIds = [...new Set([...recentRows.map((r) => r.id), ...recentByStore.map((r) => r.id)])];
	const recentItems = recentIds.length > 0 ? await db.select().from(receiptItems).where(inArray(receiptItems.receiptId, recentIds)).all() : [];
	const itemsByReceipt = new Map<string, typeof recentItems>();
	for (const item of recentItems) {
		const list = itemsByReceipt.get(item.receiptId) ?? [];
		list.push(item);
		itemsByReceipt.set(item.receiptId, list);
	}
	const recent = recentRows.map((r) => ({ ...r, items: itemsByReceipt.get(r.id) ?? [] }));
	const recentPerStore = recentByStore.map((r) => ({ ...r, items: itemsByReceipt.get(r.id) ?? [] }));

	const modules = await db.select().from(storeModules).all();
	const enabledModules = modules.filter((m) => m.enabled);
	const connectedCount = enabledModules.filter((m) => m.status === 'connected').length;
	const offlineModules = enabledModules.filter((m) => m.status !== 'connected').map((m) => (storeUi[m.id] ?? getStoreUi(m.id)).name);
	const lastSyncAt = modules.reduce<number | null>(
		(latest, m) => (m.lastSyncAt && (!latest || m.lastSyncAt > latest) ? m.lastSyncAt : latest),
		null
	);
	const activeStoreNames = enabledModules.filter((m) => m.status === 'connected').map((m) => (storeUi[m.id] ?? getStoreUi(m.id)).name);

	const settings = await db.select().from(appSettings).where(eq(appSettings.id, 1)).get();
	const pollingEnabled = (settings?.syncIntervalMinutes ?? 0) > 0;

	return {
		range,
		rangeLabel,
		rangeBadge,
		totalCents,
		prevTotalCents,
		pctChange,
		receiptCount,
		countDelta,
		avgCents,
		topStore,
		months,
		sixMonthTotalCents,
		sixMonthRangeLabel,
		recent,
		recentPerStore,
		syncStatus: { enabledCount: enabledModules.length, connectedCount, lastSyncAt, offlineModules },
		pollingEnabled,
		activeStoreNames,
		storeUi
	};
};
