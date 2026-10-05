<script lang="ts">
	import { euro } from '#lib/stores-ui';

	let { storeId, title }: { storeId: string; title: string } = $props();

	interface Series {
		marketId: string;
		label: string;
		points: { day: string; priceCents: number }[];
	}

	const COLORS = ['#4f8cff', '#f59e0b', '#10b981', '#ef4444', '#a855f7', '#14b8a6'];
	const H = 300;
	const PAD = { top: 16, right: 20, bottom: 30, left: 64 };

	let series = $state<Series[] | null>(null);
	let failed = $state(false);
	let width = $state(640);

	$effect(() => {
		series = null;
		failed = false;
		const ctrl = new AbortController();
		fetch(`/deals/verlauf?s=${encodeURIComponent(storeId)}&t=${encodeURIComponent(title)}`, { signal: ctrl.signal })
			.then((r) => (r.ok ? r.json() : Promise.reject(new Error(String(r.status)))))
			.then((j: Series[]) => (series = j))
			.catch((e) => {
				if (e?.name !== 'AbortError') failed = true;
			});
		return () => ctrl.abort();
	});

	const dayMs = (d: string) => Date.parse(d + 'T00:00:00Z');
	const dayFmt = (d: string) => new Date(dayMs(d)).toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', timeZone: 'UTC' });
	const msFmt = (ms: number) => new Date(ms).toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', timeZone: 'UTC' });

	const stats = $derived.by(() => {
		if (!series) return null;
		const all = series.flatMap((s) => s.points);
		if (all.length === 0) return null;
		const prices = all.map((p) => p.priceCents);
		const days = new Set(all.map((p) => p.day));
		return { min: Math.min(...prices), max: Math.max(...prices), days: days.size };
	});

	const chart = $derived.by(() => {
		if (!series || !stats) return null;
		const all = series.flatMap((s) => s.points);
		const xs = all.map((p) => dayMs(p.day));
		const x0 = Math.min(...xs);
		const x1 = Math.max(...xs);
		// Y-Achse mit Luft nach oben und unten; bei nur einem Preis ±10 %.
		const span = stats.max - stats.min;
		const pad = span > 0 ? span * 0.15 : stats.max * 0.1;
		const y0 = Math.max(0, stats.min - pad);
		const y1 = stats.max + pad;
		const plotW = Math.max(width - PAD.left - PAD.right, 50);
		const plotH = H - PAD.top - PAD.bottom;
		const sx = (x: number) => (x1 === x0 ? PAD.left + plotW / 2 : PAD.left + ((x - x0) / (x1 - x0)) * plotW);
		const sy = (y: number) => PAD.top + plotH - ((y - y0) / (y1 - y0)) * plotH;
		const ticks = Array.from({ length: 5 }, (_, i) => y0 + ((y1 - y0) * i) / 4);
		const xTicks = x1 === x0 ? [x0] : [x0, x0 + (x1 - x0) / 2, x1];
		return {
			plotW,
			ticks: ticks.map((t) => ({ y: sy(t), label: euro(Math.round(t)) })),
			xTicks: xTicks.map((t) => ({ x: sx(t), label: msFmt(t) })),
			lines: series.map((s, i) => ({
				color: COLORS[i % COLORS.length],
				single: s.points.length === 1,
				pts: s.points.map((p) => [sx(dayMs(p.day)), sy(p.priceCents)] as const)
			}))
		};
	});
</script>

{#if failed}
	<p class="text-on-surface-variant font-body-sm text-body-sm">Preisverlauf konnte nicht geladen werden.</p>
{:else if !series}
	<p class="text-on-surface-variant font-body-sm text-body-sm">Lädt …</p>
{:else if !chart || !stats}
	<p class="text-on-surface-variant font-body-sm text-body-sm">Noch kein Preisverlauf: erfasst wird ab dem nächsten Abruf der Angebote.</p>
{:else}
	<div class="grid grid-cols-2 sm:grid-cols-4 gap-space-sm mb-space-md">
		{#each [{ l: 'Tiefstpreis', v: euro(stats.min) }, { l: 'Höchstpreis', v: euro(stats.max) }, { l: 'Erfasste Tage', v: String(stats.days) }, { l: 'Märkte', v: String(series.length) }] as t (t.l)}
			<div class="rounded-lg bg-surface-container-low p-space-md">
				<div class="font-label-mono-xs text-label-mono-xs text-on-surface-variant uppercase">{t.l}</div>
				<div class="font-headline-sm text-headline-sm font-semibold whitespace-nowrap">{t.v}</div>
			</div>
		{/each}
	</div>

	<div class="rounded-lg bg-surface-container-low p-space-sm" bind:clientWidth={width}>
		<svg width={width} height={H} viewBox="0 0 {width} {H}" role="img" aria-label="Preisverlauf je Markt" class="block">
			{#each chart.ticks as t (t.y)}
				<line x1={PAD.left} x2={PAD.left + chart.plotW} y1={t.y} y2={t.y} stroke="currentColor" stroke-opacity="0.12" />
				<text x={PAD.left - 8} y={t.y + 4} text-anchor="end" font-size="11" fill="currentColor" fill-opacity="0.6">{t.label}</text>
			{/each}
			{#each chart.xTicks as t (t.x)}
				<text x={t.x} y={H - 8} text-anchor="middle" font-size="11" fill="currentColor" fill-opacity="0.6">{t.label}</text>
			{/each}
			{#each chart.lines as l (l.color)}
				{#if l.single}<line x1={PAD.left} x2={PAD.left + chart.plotW} y1={l.pts[0][1]} y2={l.pts[0][1]} stroke={l.color} stroke-width="2" stroke-dasharray="6 5" stroke-opacity="0.6" />{/if}
				{#if l.pts.length > 1}<polyline points={l.pts.map((p) => p.join(',')).join(' ')} fill="none" stroke={l.color} stroke-width="2.5" stroke-linejoin="round" />{/if}
				{#each l.pts as p, i (i)}<circle cx={p[0]} cy={p[1]} r="5" fill={l.color} />{/each}
			{/each}
		</svg>
	</div>

	<ul class="mt-space-md grid grid-cols-1 md:grid-cols-2 gap-space-sm">
		{#each series as s, i (s.marketId)}
			{@const last = s.points[s.points.length - 1]}
			<li class="flex items-center gap-2 rounded-lg bg-surface-container-low p-space-md font-body-sm text-body-sm">
				<span class="w-3 h-3 rounded-full shrink-0" style="background:{COLORS[i % COLORS.length]}"></span>
				<span class="min-w-0 truncate">{s.label}</span>
				<span class="ml-auto whitespace-nowrap font-medium">{euro(last.priceCents)} <span class="text-outline font-normal">({dayFmt(last.day)}, {s.points.length}×)</span></span>
			</li>
		{/each}
	</ul>
{/if}
