export interface StoreUi {
	name: string;
	color: string;
	chip: string;
	logo: string | null;
}

/** Kuratierte Namen/Farben/Kürzel für die 4 eingebauten Module, als Fallback für Seiten ohne
 * Zugriff auf die Modul-Registry (z.B. Dashboard/Kassenzettel-Liste, die nur Farb-Punkte/Badges
 * zeigen, kein Logo-Bild). Das Logo selbst kommt ausschließlich aus dem jeweiligen Modul-Paket
 * (manifest.yaml `ui.logo`, ausgeliefert über /module-assets/<id>/..., siehe registry.ts#resolveUi)
 * -- nicht mehr aus static/, damit ein Modul-Paket wirklich eigenständig bleibt. */
const BUILTIN_STORE_UI: Record<string, StoreUi> = {
	rewe: { name: 'REWE', color: 'var(--rewe)', chip: 'RE', logo: null },
	penny: { name: 'PENNY', color: 'var(--penny)', chip: 'PY', logo: null },
	lidl: { name: 'LIDL', color: 'var(--lidl)', chip: 'LI', logo: null },
	rossmann: { name: 'ROSSMANN', color: 'var(--rossmann)', chip: 'RO', logo: null }
};

// Feste, dezente Farbpalette für Module ohne eigene Manifest-Farbe -- deterministisch aus der
// id abgeleitet (dieselbe id ergibt immer dieselbe Farbe), statt bei jedem Rendern zufällig.
const FALLBACK_PALETTE = ['#6366f1', '#0ea5e9', '#10b981', '#f59e0b', '#ef4444', '#a855f7', '#14b8a6', '#ec4899'];

function hashString(s: string): number {
	let h = 0;
	for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0;
	return h;
}

/** Anzeige-Infos (Name/Farbe/Kürzel/Logo) für ein Modul -- bekannte eingebaute Module behalten
 * ihre kuratierten Werte, jedes andere `id` (z.B. per Zip installiert, siehe
 * docs/module-format.md) bekommt deterministisch einen generischen, aber konsistenten Look statt
 * hier zu einem Absturz (undefined.color etc.) zu führen. `override` erlaubt Seiten mit Zugriff
 * auf die Modul-Registry (aktuell nur dealer-interfaces), echte Manifest-Werte
 * (ui.color/ui.chip/ui.logo aus dem Zip, siehe registry.ts) statt des generischen Fallbacks zu
 * verwenden. */
export function getStoreUi(id: string, displayName?: string, override?: Partial<StoreUi> | null): StoreUi {
	const builtin = BUILTIN_STORE_UI[id];
	if (builtin && !override) return builtin;

	const name = override?.name ?? displayName ?? builtin?.name ?? id.toUpperCase();
	return {
		name,
		color: override?.color ?? builtin?.color ?? FALLBACK_PALETTE[hashString(id) % FALLBACK_PALETTE.length],
		chip: override?.chip ?? builtin?.chip ?? name.slice(0, 2).toUpperCase(),
		logo: override?.logo !== undefined ? override.logo : (builtin?.logo ?? null)
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
