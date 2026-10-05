<script lang="ts">
	import { euro } from '#lib/stores-ui';

	let { storeId, title }: { storeId: string; title: string } = $props();

	interface Series {
		marketId: string;
		label: string;
		points: { day: string; priceCents: number }[];
	}

	const COLORS = ['#4f8cff', '#f59e0b', '#10b981', '#ef4444', '#a855f7', '#14b8a6'];
	const W = 260;
	const H = 90;
	const PAD = 6;

	let series = $state<Series[] | null>(null);
	let failed = $state(false);

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

	const chart = $derived.by(() => {
		if (!series) return null;
		const all = series.flatMap((s) => s.points);
		if (all.length === 0) return null;
		const xs = all.map((p) => dayMs(p.day));
		const ys = all.map((p) => p.priceCents);
		const x0 = Math.min(...xs);
		const x1 = Math.max(...xs);
		const y0 = Math.min(...ys);
		const y1 = Math.max(...ys);
		const sx = (x: number) => (x1 === x0 ? W / 2 : PAD + ((x - x0) / (x1 - x0)) * (W - 2 * PAD));
		const sy = (y: number) => (y1 === y0 ? H / 2 : H - PAD - ((y - y0) / (y1 - y0)) * (H - 2 * PAD));
		return {
			y0,
			y1,
			lines: series.map((s, i) => ({
				color: COLORS[i % COLORS.length],
				pts: s.points.map((p) => [sx(dayMs(p.day)), sy(p.priceCents)] as const)
			}))
		};
	});
</script>

<div class="mt-2 rounded-lg bg-surface-container-low p-space-sm font-body-sm text-body-sm">
	{#if failed}
		<span class="text-on-surface-variant">Preisverlauf konnte nicht geladen werden.</span>
	{:else if !series}
		<span class="text-on-surface-variant">Lädt …</span>
	{:else if !chart}
		<span class="text-on-surface-variant">Noch kein Preisverlauf: erfasst wird ab dem nächsten Abruf der Angebote.</span>
	{:else}
		<div class="flex items-stretch gap-2">
			<div class="flex flex-col justify-between font-label-mono-xs text-label-mono-xs text-outline whitespace-nowrap">
				<span>{euro(chart.y1)}</span>
				{#if chart.y1 !== chart.y0}<span>{euro(chart.y0)}</span>{/if}
			</div>
			<svg viewBox="0 0 {W} {H}" class="w-full h-24" role="img" aria-label="Preisverlauf">
				{#each chart.lines as l (l.color)}
					{#if l.pts.length > 1}<polyline points={l.pts.map((p) => p.join(',')).join(' ')} fill="none" stroke={l.color} stroke-width="2" stroke-linejoin="round" />{/if}
					{#each l.pts as p, i (i)}<circle cx={p[0]} cy={p[1]} r="3" fill={l.color} />{/each}
				{/each}
			</svg>
		</div>
		<ul class="mt-1 space-y-0.5">
			{#each series as s, i (s.marketId)}
				{@const last = s.points[s.points.length - 1]}
				<li class="flex items-center gap-1.5">
					<span class="w-2 h-2 rounded-full shrink-0" style="background:{COLORS[i % COLORS.length]}"></span>
					<span class="min-w-0 truncate">{s.label}</span>
					<span class="ml-auto whitespace-nowrap">{euro(last.priceCents)} <span class="text-outline">({dayFmt(last.day)}, {s.points.length}×)</span></span>
				</li>
			{/each}
		</ul>
	{/if}
</div>
