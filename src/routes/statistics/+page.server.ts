import { db } from '$lib/server/db';
import { receipts, receiptItems } from '$lib/server/db/schema';
import { getStoreUi } from '$lib/stores-ui';
import { listMetas } from '$lib/server/modules/registry';
import type { StoreId } from '$lib/server/modules/types';
import type { PageServerLoad } from './$types';

/** Grobe, real existierende Handelsform je Kette (keine Nutzerdaten -- allgemein bekannte
 * Fakten über die vier eingebauten Händler) für die "Discounter-Quote"-Kennzahl. Für ein
 * beliebig installiertes Modul ohne Eintrag hier bleibt die Kategorie schlicht unbekannt
 * (siehe Fallback bei den Zugriffsstellen unten) statt zu raten. */
const STORE_CATEGORY: Record<string, 'supermarkt' | 'discounter' | 'drogerie'> = {
	rewe: 'supermarkt',
	penny: 'discounter',
	lidl: 'discounter',
	rossmann: 'drogerie'
};

const PERIODS = ['month', '6months', 'year', '12months'] as const;
export type Period = (typeof PERIODS)[number];

function monthStart(offsetMonths: number): number {
	const d = new Date();
	d.setDate(1);
	d.setHours(0, 0, 0, 0);
	d.setMonth(d.getMonth() - offsetMonths);
	return d.getTime();
}

function resolvePeriod(period: Period): { start: number; monthsBack: number } {
	if (period === 'month') return { start: monthStart(0), monthsBack: 1 };
	if (period === '12months') return { start: monthStart(11), monthsBack: 12 };
	if (period === 'year') {
		const now = new Date();
		return { start: new Date(now.getFullYear(), 0, 1).getTime(), monthsBack: now.getMonth() + 1 };
	}
	return { start: monthStart(5), monthsBack: 6 };
}

interface TaxBreakdownEntry {
	code: string;
	percent: number;
	netCents: number;
	taxCents: number;
	grossCents: number;
}

export const load: PageServerLoad = async ({ url }) => {
	// Pro Request neu ermittelt (statt statischem Array), damit ein frisch installiertes/
	// deinstalliertes Modul ohne Serverneustart berücksichtigt wird.
	const STORE_ORDER: StoreId[] = listMetas().map((m) => m.id);

	const periodParam = url.searchParams.get('period');
	const period: Period = (PERIODS as readonly string[]).includes(periodParam ?? '') ? (periodParam as Period) : '6months';
	const { start, monthsBack } = resolvePeriod(period);

	const allReceipts = await db.select().from(receipts).all();
	const inPeriod = allReceipts.filter((r) => r.timestamp >= start && !r.cancelled);

	// Vergleichszeitraum gleicher Länge direkt davor, für die Veränderungs-Kennzahl.
	const periodLength = Date.now() - start;
	const prevStart = start - periodLength;
	const prevPeriod = allReceipts.filter((r) => r.timestamp >= prevStart && r.timestamp < start && !r.cancelled);

	const totalCents = inPeriod.reduce((sum, r) => sum + r.totalCents, 0);
	const prevTotalCents = prevPeriod.reduce((sum, r) => sum + r.totalCents, 0);
	const pctChange = prevTotalCents > 0 ? Math.round(((totalCents - prevTotalCents) / prevTotalCents) * 1000) / 10 : null;

	const receiptCount = inPeriod.length;
	const avgCents = receiptCount > 0 ? Math.round(totalCents / receiptCount) : 0;

	// Ausgaben & Häufigkeit je Markt im Zeitraum.
	const byStore = new Map<StoreId, { cents: number; count: number }>();
	for (const id of STORE_ORDER) byStore.set(id, { cents: 0, count: 0 });
	for (const r of inPeriod) {
		const entry = byStore.get(r.storeId as StoreId);
		if (entry) {
			entry.cents += r.totalCents;
			entry.count += 1;
		}
	}
	const storeBreakdown = STORE_ORDER.map((id) => {
		const entry = byStore.get(id)!;
		const ui = getStoreUi(id);
		return {
			id,
			name: ui.name,
			color: ui.color,
			cents: entry.cents,
			count: entry.count,
			avgCents: entry.count > 0 ? Math.round(entry.cents / entry.count) : 0,
			pct: totalCents > 0 ? Math.round((entry.cents / totalCents) * 1000) / 10 : 0
		};
	})
		.filter((s) => s.count > 0)
		.sort((a, b) => b.cents - a.cents);

	const topStore = storeBreakdown[0] ?? null;

	// Häufigste einzelne Filiale (Name+Ort) des Top-Marktes -- echte, aus den Belegen
	// abgeleitete Filialangabe statt einer erfundenen Adresse.
	let topBranch: string | null = null;
	if (topStore) {
		const branchCounts = new Map<string, number>();
		for (const r of inPeriod) {
			if (r.storeId !== topStore.id || !r.marketName) continue;
			const key = r.marketCity ? `${r.marketName} · ${r.marketCity}` : r.marketName;
			branchCounts.set(key, (branchCounts.get(key) ?? 0) + 1);
		}
		if (branchCounts.size > 0) {
			topBranch = [...branchCounts.entries()].sort((a, b) => b[1] - a[1])[0][0];
		}
	}

	const discounterCents = storeBreakdown.filter((s) => STORE_CATEGORY[s.id] === 'discounter').reduce((sum, s) => sum + s.cents, 0);
	const discounterQuote = totalCents > 0 ? Math.round((discounterCents / totalCents) * 1000) / 10 : 0;
	const focusCategory = topStore ? (STORE_CATEGORY[topStore.id] ?? null) : null;

	const savingsReceipts = inPeriod.filter((r) => r.savingsCents !== null && r.savingsCents !== undefined);
	const savingsCents = savingsReceipts.reduce((sum, r) => sum + (r.savingsCents ?? 0), 0);
	const savingsPct = totalCents + savingsCents > 0 ? Math.round((savingsCents / (totalCents + savingsCents)) * 1000) / 10 : 0;

	// Balkendiagramm: monatsweise Summen je Markt über den gewählten Zeitraum.
	const months: { label: string; values: Record<string, number> }[] = [];
	for (let i = monthsBack - 1; i >= 0; i--) {
		const mStart = monthStart(i);
		const mEnd = i === 0 ? Date.now() : monthStart(i - 1);
		const label = new Date(mStart).toLocaleDateString('de-DE', { month: 'short' });
		const values: Record<string, number> = Object.fromEntries(STORE_ORDER.map((s) => [s, 0]));
		for (const r of allReceipts) {
			if (r.cancelled) continue;
			if (r.timestamp >= mStart && r.timestamp < mEnd) {
				values[r.storeId] = (values[r.storeId] ?? 0) + r.totalCents;
			}
		}
		months.push({ label, values });
	}

	// Wochentags- & Tageszeit-Verteilung -- direkt aus den echten Beleg-Zeitstempeln.
	const WEEKDAY_LABELS = ['So', 'Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa'];
	const weekdayCounts = new Array(7).fill(0);
	const slots = { morning: 0, midday: 0, afternoon: 0, evening: 0, other: 0 };
	for (const r of inPeriod) {
		const d = new Date(r.timestamp);
		weekdayCounts[d.getDay()]++;
		const h = d.getHours();
		if (h >= 7 && h < 10) slots.morning++;
		else if (h >= 10 && h < 14) slots.midday++;
		else if (h >= 14 && h < 18) slots.afternoon++;
		else if (h >= 18 && h < 22) slots.evening++;
		else slots.other++;
	}
	// Mo-So statt So-Sa anzeigen (JS-getDay(): 0=So).
	const weekdayOrder = [1, 2, 3, 4, 5, 6, 0];
	const weekday = weekdayOrder.map((idx) => ({
		label: WEEKDAY_LABELS[idx],
		count: weekdayCounts[idx],
		pct: receiptCount > 0 ? Math.round((weekdayCounts[idx] / receiptCount) * 1000) / 10 : 0
	}));
	const peakDay = weekday.reduce((max, d) => (d.count > max.count ? d : max), weekday[0]);
	const slotPct = (n: number) => (receiptCount > 0 ? Math.round((n / receiptCount) * 1000) / 10 : 0);
	const daySlots = {
		morning: slotPct(slots.morning),
		midday: slotPct(slots.midday),
		afternoon: slotPct(slots.afternoon),
		evening: slotPct(slots.evening),
		other: slotPct(slots.other)
	};
	const peakSlotLabel =
		([
			['morning', 'Morgens (07-10 Uhr)'],
			['midday', 'Mittags (10-14 Uhr)'],
			['afternoon', 'Nachmittags (14-18 Uhr)'],
			['evening', 'Abends (18-22 Uhr)'],
			['other', 'Sonstige Zeiten']
		] as const
	).reduce((max, [key, label]) => (daySlots[key] > max.pct ? { key, label, pct: daySlots[key] } : max), {
		key: 'other',
		label: 'Sonstige Zeiten',
		pct: -1
	}).label;

	// Top-Artikel: echte Produktnamen aus den erfassten Belegpositionen (nur Posten mit
	// positivem Preis, damit Rabatt-/Storno-Zeilen wie "App-Preis-Rabatt" nicht mitzählen).
	const periodIds = new Set(inPeriod.map((r) => r.id));
	const allItems = periodIds.size > 0 ? await db.select().from(receiptItems).all() : [];
	const itemTotals = new Map<string, { cents: number; count: number }>();
	for (const item of allItems) {
		if (!periodIds.has(item.receiptId) || item.priceCents <= 0) continue;
		const key = item.name.trim();
		const entry = itemTotals.get(key) ?? { cents: 0, count: 0 };
		entry.cents += item.priceCents;
		entry.count += 1;
		itemTotals.set(key, entry);
	}
	const topItems = [...itemTotals.entries()]
		.map(([name, v]) => ({ name, cents: v.cents, count: v.count }))
		.sort((a, b) => b.cents - a.cents)
		.slice(0, 6);

	// MwSt.-Aufschlüsselung: nur aus den Belegen, bei denen das PDF tatsächlich geparst und
	// die Steuer-Tabelle erkannt wurde (deutlich weniger als alle Belege -- ehrlich als
	// Teilmenge ausgewiesen statt als vollständige Zahl präsentiert).
	const taxByCode = new Map<string, { percent: number; netCents: number; taxCents: number }>();
	let taxReceiptCount = 0;
	for (const r of inPeriod) {
		if (!r.metaJson) continue;
		try {
			const meta = JSON.parse(r.metaJson) as { taxBreakdown?: TaxBreakdownEntry[] };
			if (!meta.taxBreakdown || meta.taxBreakdown.length === 0) continue;
			taxReceiptCount++;
			for (const entry of meta.taxBreakdown) {
				const cur = taxByCode.get(entry.code) ?? { percent: entry.percent, netCents: 0, taxCents: 0 };
				cur.netCents += entry.netCents;
				cur.taxCents += entry.taxCents;
				taxByCode.set(entry.code, cur);
			}
		} catch {
			// Ungültiges/älteres JSON-Format -- überspringen statt den Seitenaufbau abzubrechen.
		}
	}
	const taxBreakdown = [...taxByCode.entries()]
		.map(([code, v]) => ({ code, percent: v.percent, taxCents: v.taxCents }))
		.sort((a, b) => a.percent - b.percent);

	return {
		period,
		totalCents,
		pctChange,
		prevTotalCents,
		receiptCount,
		avgCents,
		topStore,
		topBranch,
		discounterQuote,
		focusCategory,
		savingsCents,
		savingsCount: savingsReceipts.length,
		savingsPct,
		storeBreakdown,
		months,
		weekday,
		peakDay,
		daySlots,
		peakSlotLabel,
		topItems,
		taxBreakdown,
		taxReceiptCount
	};
};
