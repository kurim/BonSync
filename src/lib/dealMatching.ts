// Abgleich von gekauften Artikelnamen mit Angebotstiteln ("Deals für mich"). Bewusst
// deterministisch und ohne Produktkatalog: Kassenbon-Namen sind händlerspezifisch abgekürzt
// ("PEPSI COLA ZERO 1,5L EW"), also wird normalisiert und über Token-Mengen verglichen.
// Rein und ohne Server-Importe, damit es auch clientseitig/in Tests nutzbar bleibt.

export type MatchLevel = 'variant' | 'brand' | 'category';
export const MATCH_LEVELS: readonly MatchLevel[] = ['variant', 'brand', 'category'];

/** Wie nah ein Angebot am gekauften Artikel liegt (aufsteigend unschärfer). */
export type MatchKind = 'same' | 'variant' | 'brand' | 'category';

const KIND_RANK: Record<MatchKind, number> = { same: 0, variant: 1, brand: 2, category: 3 };
const LEVEL_MAX_RANK: Record<MatchLevel, number> = { variant: 1, brand: 2, category: 3 };

// Wörter ohne Aussagekraft für die Produktidentität (Verpackung, Werbefloskeln, Mengen-Füller).
const STOPWORDS = new Set([
	'ew', 'mw', 'dose', 'dosen', 'flasche', 'flaschen', 'pet', 'glas', 'tray', 'kasten', 'pack', 'packung', 'stk', 'stueck',
	'je', 'pro', 'und', 'oder', 'mit', 'ohne', 'der', 'die', 'das', 'von', 'im', 'in', 'aus',
	'bio', 'frisch', 'frische', 'neu', 'aktion', 'angebot', 'original', 'klassisch', 'classic', 'versch', 'verschiedene', 'sorten',
	'ca', 'g', 'kg', 'ml', 'l', 'cl', 'x'
]);

// Zusätze, die eine Variante desselben Produkts kennzeichnen ("Pepsi Cola" vs. "Pepsi Cola Zero").
const VARIANT_WORDS = new Set(['zero', 'light', 'max', 'diet', 'sugarfree', 'vanilla', 'vanille', 'cherry', 'kirsch', 'lemon', 'zitrone', 'koffeinfrei']);

function fold(s: string): string {
	return s
		.toLowerCase()
		.replace(/ä/g, 'ae')
		.replace(/ö/g, 'oe')
		.replace(/ü/g, 'ue')
		.replace(/ß/g, 'ss')
		.replace(/é|è/g, 'e');
}

/** Zerlegt einen Namen in bedeutungstragende Tokens: Kleinschreibung, Umlaute gefaltet, Mengen
 * ("1,5l", "6x0,33", "500g", "10%") und Stoppwörter entfernt, Plural-"s"/"n" nicht angefasst. */
export function tokenize(name: string): string[] {
	const cleaned = fold(name)
		.replace(/\d+\s*x\s*\d+(?:[.,]\d+)?\s*(?:l|ml|cl|g|kg)?/g, ' ')
		.replace(/\d+(?:[.,]\d+)?\s*(?:l|ml|cl|g|kg|%|stk|st)\b/g, ' ')
		.replace(/[^a-z0-9]+/g, ' ');
	const out: string[] = [];
	for (const t of cleaned.split(' ')) {
		if (t.length < 2 || /^\d+$/.test(t) || STOPWORDS.has(t) || out.includes(t)) continue;
		out.push(t);
	}
	return out;
}

/** Bestimmt die Art des Treffers oder `null`. Heuristik:
 *  - same:     gleiche Token-Menge
 *  - variant:  eine Menge ist Teilmenge der anderen (Pepsi Cola ⊂ Pepsi Cola Zero), min. 2 Tokens
 *              bzw. das erste Token (Marke) ist dabei
 *  - brand:    gleiches erstes Token (Marke), z.B. Pepsi Max ~ Pepsi Cola
 *  - category: mindestens ein gemeinsames Nicht-Varianten-Token, z.B. "cola" (Pepsi Cola ~ Coca Cola) */
export function matchKind(purchased: string[], offer: string[]): MatchKind | null {
	if (purchased.length === 0 || offer.length === 0) return null;
	const a = new Set(purchased);
	const b = new Set(offer);
	const shared = purchased.filter((t) => b.has(t));
	if (shared.length === 0) return null;

	if (shared.length === a.size && shared.length === b.size) return 'same';

	const [small, big] = a.size <= b.size ? [a, b] : [b, a];
	const subset = [...small].every((t) => big.has(t));
	if (subset && (small.size >= 2 || purchased[0] === offer[0])) return 'variant';

	if (purchased[0] === offer[0]) return 'brand';

	if (shared.some((t) => !VARIANT_WORDS.has(t) && t.length >= 3)) return 'category';
	return null;
}

export function isAllowed(kind: MatchKind, level: MatchLevel): boolean {
	return KIND_RANK[kind] <= LEVEL_MAX_RANK[level];
}

export function betterKind(a: MatchKind, b: MatchKind): MatchKind {
	return KIND_RANK[a] <= KIND_RANK[b] ? a : b;
}

export function kindRank(kind: MatchKind): number {
	return KIND_RANK[kind];
}

export const MATCH_KIND_LABEL: Record<MatchKind, string> = {
	same: 'gleiches Produkt',
	variant: 'Variante',
	brand: 'gleiche Marke',
	category: 'ähnliche Produktart'
};
