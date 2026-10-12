/** Heuristischer Parser für OCR-Text eines (deutschen) Kassenzettels. Die Ergebnisse sind nur ein
 * Vorschlag: OCR liest Bons selten fehlerfrei, deshalb korrigiert der Nutzer sie vor dem Speichern
 * (siehe routes/receipts/neu). Reine Funktion ohne Server-Abhängigkeiten, damit sie auch testbar
 * bleibt. */

export interface ParsedItem {
	name: string;
	priceCents: number;
	quantity: number | null;
	unitPriceCents: number | null;
	taxCode: string | null;
}

export interface ParsedReceipt {
	marketName: string | null;
	/** epoch ms, null wenn kein Datum erkannt wurde */
	timestamp: number | null;
	totalCents: number | null;
	items: ParsedItem[];
}

const AMOUNT = String.raw`-?\d{1,5}[.,]\d{2}-?`;
// "BIO MILCH 1,19 B", "BROT 2,49 *B", "PFAND -0,25 A"; Steuer-Kennbuchstabe optional.
const ITEM_LINE = new RegExp(String.raw`^(.*?\S)\s+(${AMOUNT})\s*(?:\*?\s?([A-Z]))?\s*$`);
// Folgezeile zur Menge: "2 x 0,89", "3 Stk x 1,29", "0,458 kg x 3,99 EUR/kg"
const QUANTITY_LINE = new RegExp(String.raw`^\s*(\d+(?:[.,]\d+)?)\s*(?:stk\.?|st\.?|kg)?\s*[x*]\s*(${AMOUNT})`, 'i');
const TOTAL_LINE = /\b(summe|gesamt(?:betrag|summe)?|total|zu zahlen|zahlbetrag|endbetrag|betrag)\b/i;
// Alles hinter der Summe (Zahlart, Wechselgeld, Steuerblock, TSE-Daten) sind keine Artikel.
const AFTER_TOTAL = /\b(bar|ec|girocard|karte|mastercard|visa|gegeben|rückgeld|rueckgeld|mwst|ust|netto|brutto|tse)\b/i;

export function parseAmountCents(text: string): number | null {
	const m = text.trim().match(/^(-)?(\d{1,5})[.,](\d{2})(-)?$/);
	if (!m) return null;
	const cents = parseInt(m[2], 10) * 100 + parseInt(m[3], 10);
	return m[1] || m[4] ? -cents : cents;
}

function parseDate(text: string): number | null {
	const d = text.match(/\b(\d{1,2})[./](\d{1,2})[./](\d{4}|\d{2})\b/);
	if (!d) return null;
	const day = parseInt(d[1], 10);
	const month = parseInt(d[2], 10);
	let year = parseInt(d[3], 10);
	if (year < 100) year += 2000;
	if (day < 1 || day > 31 || month < 1 || month > 12) return null;
	const t = text.slice(d.index! + d[0].length).match(/\b([01]?\d|2[0-3]):([0-5]\d)\b/);
	const date = new Date(year, month - 1, day, t ? parseInt(t[1], 10) : 12, t ? parseInt(t[2], 10) : 0);
	return Number.isNaN(date.getTime()) ? null : date.getTime();
}

export function parseReceiptText(text: string): ParsedReceipt {
	const lines = text
		.split(/\r?\n/)
		.map((l) => l.replace(/\s+/g, ' ').trim())
		.filter(Boolean);

	// Marktname: erste Zeile, die überwiegend aus Buchstaben besteht (Kopfzeile des Bons).
	const marketName =
		lines.slice(0, 6).find((l) => (l.match(/\p{L}/gu)?.length ?? 0) >= 3 && !/\d{2}[./:]\d{2}/.test(l)) ?? null;

	let timestamp: number | null = null;
	let totalCents: number | null = null;
	const items: ParsedItem[] = [];
	let inItems = true;

	for (const line of lines) {
		timestamp ??= parseDate(line);

		if (TOTAL_LINE.test(line)) {
			const amount = line.match(new RegExp(`(${AMOUNT})\\s*(?:EUR|€)?\\s*$`));
			const cents = amount ? parseAmountCents(amount[1]) : null;
			if (cents !== null && cents > 0 && totalCents === null) {
				totalCents = cents;
				inItems = false;
			}
			continue;
		}
		if (!inItems || AFTER_TOTAL.test(line)) continue;

		const q = line.match(QUANTITY_LINE);
		if (q && items.length > 0) {
			const last = items[items.length - 1];
			const unit = parseAmountCents(q[2]);
			const qty = parseFloat(q[1].replace(',', '.'));
			// Nur ganzzahlige Mengen übernehmen (receipt_items.quantity ist INTEGER); bei Gewichtsware
			// bleibt die Menge leer, der Einzelpreis (je kg) wird trotzdem gemerkt.
			last.quantity = Number.isInteger(qty) && qty > 0 ? qty : null;
			last.unitPriceCents = unit;
			continue;
		}

		const m = line.match(ITEM_LINE);
		if (!m) continue;
		const priceCents = parseAmountCents(m[2]);
		if (priceCents === null || priceCents === 0) continue;
		// Zeilen, die nur aus Zahlen/Sonderzeichen bestehen (Telefon, Datum, Kartennummer), sind keine Artikel.
		if ((m[1].match(/\p{L}/gu)?.length ?? 0) < 2) continue;
		items.push({ name: m[1], priceCents, quantity: null, unitPriceCents: null, taxCode: m[3] ?? null });
	}

	// Ohne erkennbare Summenzeile die Artikelsumme als Vorschlag nehmen.
	if (totalCents === null && items.length > 0) {
		totalCents = items.reduce((sum, i) => sum + i.priceCents, 0);
	}

	return { marketName, timestamp, totalCents, items };
}
