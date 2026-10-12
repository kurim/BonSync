import { randomUUID } from 'node:crypto';
import { fail, redirect } from '@sveltejs/kit';
import { db } from '#lib/server/db';
import { receipts, receiptItems } from '#lib/server/db/schema';
import { MANUAL_STORE_ID } from '#lib/stores-ui';
import { parseAmountCents, parseReceiptText } from '#lib/receiptTextParser';
import { isSupportedImage, MAX_IMAGE_BYTES, recognizeText, OcrUnavailableError } from '#lib/server/ocr';
import type { Actions } from './$types';

const MAX_ITEMS = 300;

interface DraftItem {
	name: string;
	price: string;
}

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
			const text = await recognizeText(buf);
			const parsed = parseReceiptText(text);
			return {
				draft: {
					marketName: parsed.marketName ?? '',
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
				marketName,
				date: dateStr,
				time: timeStr,
				total: String(f.get('total') ?? ''),
				items: draftItems.length ? draftItems : [{ name: '', price: '' }]
			};
		}

		if (!marketName) return fail(400, { saveError: 'Bitte einen Marktnamen angeben.', form: formState() });
		const timestamp = new Date(`${dateStr}T${timeStr}`).getTime();
		if (!/^\d{4}-\d{2}-\d{2}$/.test(dateStr) || Number.isNaN(timestamp)) {
			return fail(400, { saveError: 'Bitte ein gültiges Datum angeben.', form: formState() });
		}
		if (total === null) return fail(400, { saveError: 'Bitte den Gesamtbetrag angeben (z.B. 12,34).', form: formState() });

		const externalId = randomUUID();
		const id = `${MANUAL_STORE_ID}:${externalId}`;
		await db
			.insert(receipts)
			.values({
				id,
				storeId: MANUAL_STORE_ID,
				externalId,
				timestamp,
				totalCents: total,
				marketName,
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
