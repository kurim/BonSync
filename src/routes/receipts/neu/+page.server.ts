import { randomUUID } from 'node:crypto';
import { fail, redirect } from '@sveltejs/kit';
import { db } from '#lib/server/db';
import { receipts, receiptItems } from '#lib/server/db/schema';
import { MANUAL_STORE_ID } from '#lib/stores-ui';
import { detectStore, parseAmountCents, parseReceiptText, scoreParse } from '#lib/receiptTextParser';
import { listMetas } from '#lib/server/modules/registry';
import { isSupportedImage, MAX_IMAGE_BYTES, PAGE_SEG_MODES, recognizeText, OcrUnavailableError } from '#lib/server/ocr';
import type { Actions, PageServerLoad } from './$types';

const MAX_ITEMS = 300;

interface DraftItem {
	name: string;
	price: string;
}

/** Auswahl für „Händler“: installierte Module plus der Sammelposten für alles andere. */
function storeOptions() {
	return [...listMetas().map((m) => ({ id: m.id, name: m.displayName })), { id: MANUAL_STORE_ID, name: 'Sonstige' }];
}

export const load: PageServerLoad = async () => ({ stores: storeOptions() });

export const actions: Actions = {
	/** Foto -> OCR -> Vorschlag. Es wird noch nichts gespeichert; die Seite zeigt den Vorschlag zur
	 * Kontrolle und Korrektur, erst `save` legt den Beleg an. */
	scan: async ({ request }) => {
		const f = await request.formData();
		const file = f.getAll('photo').find((v) => v instanceof File && v.size > 0) ?? f.get('photo');
		if (!(file instanceof File) || file.size === 0) return fail(400, { scanError: 'Bitte ein Foto auswählen.' });
		if (file.size > MAX_IMAGE_BYTES) return fail(413, { scanError: 'Das Foto ist zu groß (maximal 10 MB).' });
		const buf = Buffer.from(await file.arrayBuffer());
		if (!isSupportedImage(buf)) return fail(400, { scanError: 'Nur JPEG-, PNG- oder WebP-Bilder werden unterstützt.' });

		try {
			const runs = (await Promise.all(PAGE_SEG_MODES.map((psm) => recognizeText(buf, psm)))).map((text) => ({
				text,
				parsed: parseReceiptText(text)
			}));
			const { text, parsed } = runs.reduce((best, r) => (scoreParse(r.parsed) > scoreParse(best.parsed) ? r : best));
			// Händler aus dem Kopf des Bons; ohne Treffer (oder ohne dieses Modul) landet er unter "Sonstige".
			const detected = detectStore(
				runs.map((r) => r.text.split(/\r?\n/).slice(0, 8).join('\n')).join('\n'),
				listMetas().map((m) => ({ id: m.id, displayName: m.displayName }))
			);
			return {
				draft: {
					storeId: detected ?? MANUAL_STORE_ID,
					marketName: parsed.marketName ?? '',
					marketStreet: parsed.marketStreet ?? '',
					marketZip: parsed.marketZip ?? '',
					marketCity: parsed.marketCity ?? '',
					timestamp: parsed.timestamp ?? Date.now(),
					totalCents: parsed.totalCents,
					items: parsed.items.map((i) => ({
						name: i.name,
						priceCents: i.priceCents,
						quantity: i.quantity,
						unitPriceCents: i.unitPriceCents,
						taxCode: i.taxCode
					})),
					rawText: text
				}
			};
		} catch (err) {
			const status = err instanceof OcrUnavailableError ? 503 : 500;
			return fail(status, { scanError: err instanceof Error ? err.message : String(err) });
		}
	},

	save: async ({ request }) => {
		const f = await request.formData();
		const marketName = String(f.get('marketName') ?? '').trim();
		const storeId = String(f.get('storeId') ?? MANUAL_STORE_ID);
		const marketStreet = String(f.get('marketStreet') ?? '').trim();
		const marketZip = String(f.get('marketZip') ?? '').trim();
		const marketCity = String(f.get('marketCity') ?? '').trim();
		const dateStr = String(f.get('date') ?? '');
		const timeStr = String(f.get('time') ?? '') || '12:00';
		const total = parseAmountCents(String(f.get('total') ?? ''));

		const names = f.getAll('itemName').map(String);
		const prices = f.getAll('itemPrice').map(String);
		const items: { name: string; priceCents: number }[] = [];
		const draftItems: DraftItem[] = [];
		for (let i = 0; i < Math.min(names.length, MAX_ITEMS); i++) {
			const name = names[i].trim();
			const price = (prices[i] ?? '').trim();
			if (!name && !price) continue; // leere Zeile ignorieren
			draftItems.push({ name, price });
			const cents = parseAmountCents(price);
			if (!name || cents === null) {
				return fail(400, { saveError: `Artikel ${items.length + 1}: Name und Preis (z.B. 1,29) werden benötigt.`, form: formState() });
			}
			items.push({ name, priceCents: cents });
		}

		function formState() {
			return {
				storeId,
				marketName,
				marketStreet,
				marketZip,
				marketCity,
				date: dateStr,
				time: timeStr,
				total: String(f.get('total') ?? ''),
				items: draftItems.length ? draftItems : [{ name: '', price: '' }]
			};
		}

		if (!storeOptions().some((o) => o.id === storeId)) return fail(400, { saveError: 'Händler unbekannt.', form: formState() });
		if (!marketName) return fail(400, { saveError: 'Bitte einen Marktnamen angeben.', form: formState() });
		const timestamp = new Date(`${dateStr}T${timeStr}`).getTime();
		if (!/^\d{4}-\d{2}-\d{2}$/.test(dateStr) || Number.isNaN(timestamp)) {
			return fail(400, { saveError: 'Bitte ein gültiges Datum angeben.', form: formState() });
		}
		if (total === null) return fail(400, { saveError: 'Bitte den Gesamtbetrag angeben (z.B. 12,34).', form: formState() });

		// Das Präfix im externalId markiert den Beleg als selbst erfasst (siehe stores-ui.ts#isManualReceipt),
		// auch wenn er einem Modul zugeordnet ist -- das Modul kennt diese Id nicht und kann nichts nachladen.
		const externalId = `manual-${randomUUID()}`;
		const id = `${storeId}:${externalId}`;
		await db
			.insert(receipts)
			.values({
				id,
				storeId,
				externalId,
				timestamp,
				totalCents: total,
				marketName,
				marketStreet: marketStreet || null,
				marketZip: marketZip || null,
				marketCity: marketCity || null,
				hasStructuredItems: items.length > 0,
				// Es gibt kein Modul, das Artikel/PDF nachladen könnte -- beides als erledigt markieren,
				// damit die Detailseite (receipts/[id]) keinen Nachladeversuch startet.
				itemsFetched: true,
				pdfUnavailable: true
			})
			.run();
		for (const item of items) {
			await db.insert(receiptItems).values({ receiptId: id, name: item.name, priceCents: item.priceCents }).run();
		}
		throw redirect(303, `/receipts/${id}`);
	}
};
