export interface StoreUi {
	name: string;
	color: string;
	chip: string;
	logo: string | null;
}

// Feste, dezente Farbpalette für Module ohne eigene Manifest-Farbe -- deterministisch aus der
// id abgeleitet (dieselbe id ergibt immer dieselbe Farbe), statt bei jedem Rendern zufällig.
const FALLBACK_PALETTE = ['#6366f1', '#0ea5e9', '#10b981', '#f59e0b', '#ef4444', '#a855f7', '#14b8a6', '#ec4899'];

function hashString(s: string): number {
	let h = 0;
	for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0;
	return h;
}

/** Anzeige-Infos (Name/Farbe/Kürzel/Logo) für ein Modul. Jedes Modul wird zur Laufzeit aus einem
 * Zip-Paket installiert (siehe docs/module-format.md) -- es gibt keine fest eingebauten Module
 * mit hier hartkodierten Werten mehr, nur noch echte Manifest-Werte (`ui.color`/`ui.chip`/
 * `ui.logo`) oder den generischen Fallback. `override` ist das Ergebnis von
 * registry.ts#resolveUi -- Seiten mit Server-Zugriff auf die Modul-Registry (direkt, oder
 * client-seitig über an die Seite durchgereichte Page-Data) sollten es immer mitgeben, sonst
 * bekommt das Modul deterministisch einen generischen, aber konsistenten Look statt hier zu
 * einem Absturz (undefined.color etc.) zu führen -- z.B. für Belege eines bereits
 * deinstallierten Moduls. */
export function getStoreUi(id: string, displayName?: string, override?: Partial<StoreUi> | null): StoreUi {
	const name = override?.name ?? displayName ?? id.toUpperCase();
	return {
		name,
		color: override?.color ?? FALLBACK_PALETTE[hashString(id) % FALLBACK_PALETTE.length],
		chip: override?.chip ?? name.slice(0, 2).toUpperCase(),
		logo: override?.logo ?? null
	};
}

export function euro(cents: number): string {
	return (cents / 100).toLocaleString('de-DE', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' €';
}

export function formatDate(ts: number): string {
	const d = new Date(ts);
	const date = d.toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric' });
	const time = d.toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' });
	return `${date} · ${time}`;
}

export function timeAgo(ts: number | null): string {
	if (!ts) return 'nie';
	const diffMin = Math.round((Date.now() - ts) / 60000);
	if (diffMin < 1) return 'gerade eben';
	if (diffMin < 60) return `vor ${diffMin} Min.`;
	const diffH = Math.round(diffMin / 60);
	if (diffH < 24) return `vor ${diffH} Std.`;
	const diffD = Math.round(diffH / 24);
	return `vor ${diffD} Tag${diffD === 1 ? '' : 'en'}`;
}
