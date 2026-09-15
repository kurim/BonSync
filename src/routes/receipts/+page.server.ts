import { desc, count } from 'drizzle-orm';
import { db } from '$lib/server/db';
import { receipts, receiptItems } from '$lib/server/db/schema';
import { getStoreUi } from '$lib/stores-ui';
import { listMetas, resolveUi } from '$lib/server/modules/registry';
import type { PageServerLoad } from './$types';

const PAGE_SIZE = 25;

function monthStart(): number {
	const d = new Date();
	d.setDate(1);
	d.setHours(0, 0, 0, 0);
	return d.getTime();
}

export const load: PageServerLoad = async ({ url }) => {
	const storeFilter = url.searchParams.get('store') ?? 'all';
	const search = (url.searchParams.get('q') ?? '').trim().toLowerCase();
	const page = Math.max(1, parseInt(url.searchParams.get('page') ?? '1', 10) || 1);

	const allRows = await db.select().from(receipts).orderBy(desc(receipts.timestamp)).all();

	// Filter-Pills sind bewusst dynamisch: nur Stores, für die tatsächlich Belege vorliegen,
	// bekommen einen Filter -- nicht alle installierten Module pauschal (ein Store ohne
	// synchronisierte Belege hätte sonst einen wirkungslosen Filter).
	const availableStores = [...new Set(allRows.map((r) => r.storeId))];

	let rows = allRows;
	if (storeFilter !== 'all') rows = rows.filter((r) => r.storeId === storeFilter);
	if (search) {
		rows = rows.filter((r) => `${r.marketName ?? ''} ${r.marketCity ?? ''}`.toLowerCase().includes(search));
	}

	const total = rows.length;
	const pageCount = Math.max(1, Math.ceil(total / PAGE_SIZE));
	const currentPage = Math.min(page, pageCount);
	const pageRows = rows.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE);

	const itemCountRows = await db
		.select({ receiptId: receiptItems.receiptId, itemCount: count() })
		.from(receiptItems)
		.groupBy(receiptItems.receiptId)
		.all();
	const itemCounts = new Map(itemCountRows.map((r) => [r.receiptId, r.itemCount]));

	const receiptsWithCounts = pageRows.map((r) => ({ ...r, itemCount: itemCounts.get(r.id) ?? 0 }));

	// UI-Werte aus der Registry, als serialisierbare Map an den Client durchgereicht (die
	// Registry selbst ist nur server-seitig verfügbar, siehe stores-ui.ts#getStoreUi). Über alle
	// installierten Module statt nur availableStores, damit ein Wechsel des Filters ohne
	// erneuten Serverroundtrip die richtige Farbe zeigt.
	const storeUi = Object.fromEntries(listMetas().map((m) => [m.id, getStoreUi(m.id, m.displayName, resolveUi(m.id))]));

	const monthCents = allRows
		.filter((r) => r.timestamp >= monthStart() && !r.cancelled)
		.reduce((sum, r) => sum + r.totalCents, 0);

	return {
		receipts: receiptsWithCounts,
		storeFilter,
		search,
		total,
		page: currentPage,
		pageCount,
		pageSize: PAGE_SIZE,
		availableStores,
		monthCents,
		storeUi
	};
};
