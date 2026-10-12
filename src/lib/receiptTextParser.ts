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
	marketStreet: string | null;
	marketZip: string | null;
	marketCity: string | null;
	/** epoch ms, null wenn kein Datum erkannt wurde */
	timestamp: number | null;
	totalCents: number | null;
	items: ParsedItem[];
}

const AMOUNT = String.raw`-?\d{1,5}[.,]\d{2}-?`;
// "BIO MILCH 1,19 B", "BROT 2,49 *B", "PFAND -0,25 A", dm: "Balea Shampoo 1,95 1" (Steuerklasse als
// Ziffer); Steuer-Kennung optional, ein abschließendes "|" ist meist ein falsch gelesener Rand.
const ITEM_LINE = new RegExp(String.raw`^(.*?\S)\s+(${AMOUNT})\s*(?:\*?\s?([A-Z0-9]))?[\s|!]*$`);
// Menge als Präfix in derselben Zeile (dm): "4x 0,95 Prof. Klarsichttüten K 3,80 1"
const QUANTITY_PREFIX = new RegExp(String.raw`^(\d{1,3})\s*[xX×]\s*(${AMOUNT})\s+(.+)$`);
// Folgezeile zur Menge: "2 x 0,89", "3 Stk x 1,29", "0,458 kg x 3,99 EUR/kg"
const QUANTITY_LINE = new RegExp(String.raw`^\s*(\d+(?:[.,]\d+)?)\s*(?:stk\.?|st\.?|kg)?\s*[x*]\s*(${AMOUNT})\s*(?:eur|€)?(?:\/kg)?\s*$`, 'i');
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

	// Anschrift im Kopf: "40721 Hilden" (PLZ + Ort), die Zeile davor mit Hausnummer ist die Straße.
	let marketStreet: string | null = null;
	let marketZip: string | null = null;
	let marketCity: string | null = null;
	const head = lines.slice(0, 10);
	const zipIdx = head.findIndex((l) => /(?:^|\s)\d{5}\s+\p{Lu}[\p{L}\- ]{2,}$/u.test(l));
	if (zipIdx >= 0) {
		const m = head[zipIdx].match(/(\d{5})\s+(\p{Lu}[\p{L}\- ]{2,})$/u)!;
		marketZip = m[1];
		marketCity = m[2].trim();
		const street = head.slice(Math.max(0, zipIdx - 2), zipIdx).reverse().find((l) => /\p{L}{3,}.*\d+\s*[a-z]?$/iu.test(l));
		marketStreet = street ?? null;
	}

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
		let name = m[1];
		let quantity: number | null = null;
		let unitPriceCents: number | null = null;
		const qp = name.match(QUANTITY_PREFIX);
		if (qp) {
			quantity = parseInt(qp[1], 10);
			unitPriceCents = parseAmountCents(qp[2]);
			name = qp[3];
		}
		// Zeilen, die nur aus Zahlen/Sonderzeichen bestehen (Telefon, Datum, Kartennummer), sind keine Artikel.
		if ((name.match(/\p{L}/gu)?.length ?? 0) < 2) continue;
		items.push({ name, priceCents, quantity, unitPriceCents, taxCode: m[3] ?? null });
	}

	// Ohne erkennbare Summenzeile die Artikelsumme als Vorschlag nehmen.
	if (totalCents === null && items.length > 0) {
		totalCents = items.reduce((sum, i) => sum + i.priceCents, 0);
	}

	return { marketName, marketStreet, marketZip, marketCity, timestamp, totalCents, items };
}

/** Wie gut passt ein Erkennungsergebnis? Eine Artikelsumme, die exakt die Summe des Bons trifft, ist
 * das stärkste Zeichen für fehlerfreie Positionen; sonst zählen erkannte Artikel. Dient dazu, aus
 * mehreren OCR-Läufen (verschiedene Seitenanalyse-Modi) den besten zu wählen. */
export function scoreParse(p: ParsedReceipt): number {
	const sum = p.items.reduce((a, i) => a + i.priceCents, 0);
	return p.items.length + (p.totalCents !== null ? 1 : 0) + (p.timestamp !== null ? 1 : 0) + (p.totalCents !== null && sum === p.totalCents ? 10 : 0);
}

/** Findet unter den Händler-Modulen das, dessen Id oder Anzeigename im Kopf des Bons als eigenes
 * Wort vorkommt ("dm-drogerie markt" -> Modul "dm"). null = keiner passt. */
export function detectStore(text: string, stores: { id: string; displayName: string }[]): string | null {
	const head = text.split(/\r?\n/).slice(0, 8).join(' ').toLowerCase();
	for (const s of stores) {
		for (const token of new Set([s.id.toLowerCase(), s.displayName.toLowerCase()])) {
			if (!token) continue;
			const esc = token.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
			if (new RegExp(`(^|[^\\p{L}\\p{N}])${esc}([^\\p{L}\\p{N}]|$)`, 'u').test(head)) return s.id;
		}
	}
	return null;
}
