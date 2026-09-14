<script lang="ts">
	import { enhance } from '$app/forms';
	import { getStoreUi, euro, timeAgo, formatDate } from '$lib/stores-ui';
	import type { Range } from './+page.server';

	let { data } = $props();

	const RANGE_LABELS: Record<Range, string> = {
		month: 'Dieser Monat',
		'30days': 'Letzte 30 Tage',
		year: 'Jahr ' + new Date().getFullYear()
	};

	type RecentReceipt = (typeof data.recent)[number];
	let selectedReceipt = $state<RecentReceipt | null>(null);
	function openDrawer(r: RecentReceipt) {
		selectedReceipt = r;
	}
	function closeDrawer() {
		selectedReceipt = null;
	}

	let receiptsView = $state<'alle' | 'maerkte'>('alle');
	const visibleReceipts = $derived(receiptsView === 'alle' ? data.recent : data.recentPerStore);

	let syncing = $state(false);

	// Balkendiagramm-Geometrie.
	const chartTop = 20,
		chartBottom = 180,
		chartLeft = 48,
		chartRight = 500;
	const barWidth = 42;

	function niceCeil(value: number): number {
		if (value <= 0) return 100;
		const exponent = Math.floor(Math.log10(value));
		const magnitude = 10 ** exponent;
		const residual = value / magnitude;
		const niceResidual = residual <= 1 ? 1 : residual <= 2 ? 2 : residual <= 5 ? 5 : 10;
		return niceResidual * magnitude;
	}

	// Legende zeigt genau die Stores, die im Chart tatsächlich Balken haben -- statt einer festen
	// Liste, die ein neu installiertes Modul nie enthalten würde.
	const chartStoreIds = $derived([...new Set(data.months.flatMap((m) => Object.keys(m.values)))]);

	// Untergrenze 10000 Cent (100 €) statt 1 -- ein Floor von nur 1 Cent führte bei komplett
	// leeren Daten dazu, dass niceCeil(0.01) alle 5 y-Achsen-Ticks auf 0 rundete (identische
	// Keys im {#each yTicks} -> Svelte-Crash "each_key_duplicate").
	const maxMonthTotal = $derived(Math.max(10000, ...data.months.map((m) => Object.values(m.values).reduce((a, b) => a + b, 0))));
	const niceMaxEuro = $derived(niceCeil(maxMonthTotal / 100));
	const scale = $derived((chartBottom - chartTop) / niceMaxEuro);
	const gap = $derived((chartRight - chartLeft - barWidth * data.months.length) / (data.months.length + 1));
	const yTicks = $derived([0, 0.25, 0.5, 0.75, 1].map((f) => Math.round(niceMaxEuro * f)));

	let tooltip = $state<{ x: number; y: number; text: string } | null>(null);
	function showTooltip(e: MouseEvent, text: string) {
		tooltip = { x: e.clientX, y: e.clientY, text };
	}
	function hideTooltip() {
		tooltip = null;
	}
</script>

<svelte:head><title>Dashboard — BonSync</title></svelte:head>

<div class="flex flex-col w-full pb-space-xl font-body-md text-on-surface">
	<div class="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-space-md mb-space-xl">
		<div class="flex flex-col gap-space-xs">
			<div class="flex items-center gap-space-sm">
				<div class="flex items-center justify-center w-7 h-7 rounded-lg bg-surface-container-high shadow-inner text-primary">
					<i class="fa-solid fa-tachograph-digital text-[18px]"></i>
				</div>
				<h1 class="font-headline-xl text-headline-xl tracking-tight text-on-surface">Dashboard</h1>
				<span class="font-label-mono-xs text-label-mono-xs px-2 py-0.5 rounded-full bg-surface-container-highest text-on-surface-variant font-medium">{data.rangeBadge}</span>
			</div>
			<p class="font-body-md text-body-md text-on-surface-variant pl-space-md">Übersicht über alle angebundenen Kassenbon-Module &amp; Auswertungen</p>
		</div>
		<div class="flex items-center gap-space-sm flex-wrap">
			<div class="flex items-center rounded-lg bg-surface-container-high p-1 font-label-mono-sm text-label-mono-sm">
				{#each Object.entries(RANGE_LABELS) as [value, label] (value)}
					<a
						href="?range={value}"
						class="px-space-md py-1.5 rounded-md transition-colors {data.range === value ? 'bg-primary/20 text-primary border border-primary/30' : 'text-on-surface-variant hover:text-on-surface'}"
					>
						{label}
					</a>
				{/each}
			</div>
			<form method="POST" action="/dealer-interfaces?/syncAll" use:enhance={() => { syncing = true; return async ({ update }) => { syncing = false; await update(); }; }}>
				<button
					type="submit"
					disabled={syncing}
					class="flex items-center gap-space-xs px-space-lg h-[38px] rounded-lg bg-primary text-on-primary-container font-label-mono-md text-label-mono-md font-semibold hover:brightness-110 transition-all shadow-[0_0_16px_rgba(128,131,255,0.35)] disabled:opacity-60 cursor-pointer"
				>
					<i class="fa-solid fa-arrows-rotate {syncing ? 'animate-spin' : ''}"></i>
					{syncing ? 'Synchronisiere…' : 'Jetzt synchronisieren'}
				</button>
			</form>
		</div>
	</div>

	<!-- KPI Cards -->
	<div class="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-space-md mb-space-xl">
		<div class="relative overflow-hidden rounded-xl bg-surface-container-low p-space-lg shadow-md">
			<div class="absolute -right-6 -bottom-6 w-24 h-24 rounded-full bg-primary/10 blur-xl pointer-events-none"></div>
			<div class="flex items-center justify-between mb-space-sm">
				<span class="font-label-mono-xs text-label-mono-xs uppercase text-on-surface-variant font-semibold tracking-wider">Ausgaben {data.rangeLabel}</span>
				{#if data.pctChange !== null}
					<span class="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded font-label-mono-xs text-label-mono-xs {data.pctChange >= 0 ? 'text-secondary bg-secondary-container/40' : 'text-primary bg-primary/10'}">
						<i class="fa-solid {data.pctChange >= 0 ? 'fa-arrow-up' : 'fa-arrow-down'} text-[12px]"></i>{data.pctChange >= 0 ? '+' : ''}{data.pctChange}%
					</span>
				{/if}
			</div>
			<div class="flex items-baseline gap-space-sm mb-space-xs">
				<span class="font-headline-xl text-headline-xl font-bold text-on-surface tracking-tight">{euro(data.totalCents)}</span>
			</div>
			<div class="pt-space-xs mt-space-xs border-t border-surface-container-highest flex items-center justify-between font-body-sm text-body-sm text-on-surface-variant">
				<span>{data.receiptCount} Kassenbeleg{data.receiptCount === 1 ? '' : 'e'}</span>
				<span class="text-outline font-label-mono-xs text-label-mono-xs">vs. {euro(data.prevTotalCents)} Vorperiode</span>
			</div>
		</div>

		<div class="relative overflow-hidden rounded-xl bg-surface-container-low p-space-lg shadow-md">
			<div class="absolute -right-6 -bottom-6 w-24 h-24 rounded-full bg-secondary/10 blur-xl pointer-events-none"></div>
			<div class="flex items-center justify-between mb-space-sm">
				<span class="font-label-mono-xs text-label-mono-xs uppercase text-on-surface-variant font-semibold tracking-wider">Bons {data.rangeLabel}</span>
			</div>
			<div class="flex items-baseline gap-space-sm mb-space-xs">
				<span class="font-headline-xl text-headline-xl font-bold text-on-surface tracking-tight">{data.receiptCount}</span>
				<span class="font-body-sm text-body-sm text-on-surface-variant">Belege</span>
			</div>
			<div class="pt-space-xs mt-space-xs border-t border-surface-container-highest flex items-center justify-between font-body-sm text-body-sm text-on-surface-variant">
				<span>{data.receiptCount > 0 ? `Ø ${euro(data.avgCents)} pro Einkauf` : 'Noch keine Bons'}</span>
				{#if data.countDelta !== 0}
					<span class="text-outline font-label-mono-xs text-label-mono-xs">{data.countDelta > 0 ? `Mehr (+${data.countDelta})` : `Weniger (${data.countDelta})`}</span>
				{:else}
					<span class="text-outline font-label-mono-xs text-label-mono-xs">Stabil (±0)</span>
				{/if}
			</div>
		</div>

		<div class="relative overflow-hidden rounded-xl bg-surface-container-low p-space-lg shadow-md">
			<div class="absolute -right-6 -bottom-6 w-24 h-24 rounded-full bg-error/10 blur-xl pointer-events-none"></div>
			<div class="flex items-center justify-between mb-space-sm">
				<span class="font-label-mono-xs text-label-mono-xs uppercase text-on-surface-variant font-semibold tracking-wider">Top-Supermarkt</span>
				{#if data.topStore}<span class="font-label-mono-xs text-label-mono-xs font-medium text-on-surface-variant">{euro(data.topStore.cents)}</span>{/if}
			</div>
			{#if data.topStore}
				<div class="flex items-center gap-space-sm mb-space-xs">
					<span class="w-3.5 h-3.5 rounded-full flex-shrink-0" style="background:{data.topStore.color}; box-shadow:0 0 10px {data.topStore.color}99;"></span>
					<span class="font-headline-lg text-headline-lg font-bold text-on-surface tracking-tight">{data.topStore.name}</span>
				</div>
				<div class="pt-space-xs mt-space-xs border-t border-surface-container-highest flex items-center justify-between font-body-sm text-body-sm text-on-surface-variant">
					<span>{data.topStore.pct}% des Umsatzes</span>
					<span class="font-label-mono-xs text-label-mono-xs font-semibold" style="color:{data.topStore.color}">{data.topStore.count} Einkäufe</span>
				</div>
			{:else}
				<div class="font-headline-sm text-headline-sm text-on-surface-variant">—</div>
				<div class="font-body-sm text-body-sm text-on-surface-variant mt-space-xs">Noch keine Daten</div>
			{/if}
		</div>

		<div class="relative overflow-hidden rounded-xl bg-surface-container-low p-space-lg shadow-md">
			<div class="absolute -right-6 -bottom-6 w-24 h-24 rounded-full bg-tertiary-container/20 blur-xl pointer-events-none"></div>
			<div class="flex items-center justify-between mb-space-sm">
				<span class="font-label-mono-xs text-label-mono-xs uppercase text-on-surface-variant font-semibold tracking-wider">Letzter Sync</span>
				<a href="/dealer-interfaces" class="font-label-mono-xs text-label-mono-xs text-primary hover:underline">Verwalten</a>
			</div>
			<div class="flex items-baseline gap-space-sm mb-space-xs">
				<span class="font-headline-md text-headline-md font-bold text-on-surface tracking-tight">{timeAgo(data.syncStatus.lastSyncAt)}</span>
				{#if data.syncStatus.lastSyncAt}<span class="font-body-sm text-body-sm text-outline">{new Date(data.syncStatus.lastSyncAt).toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' })} Uhr</span>{/if}
			</div>
			<div class="pt-space-xs mt-space-xs border-t border-surface-container-highest flex items-center justify-between font-body-sm text-body-sm text-on-surface-variant flex-wrap gap-1">
				<div class="flex items-center gap-1.5">
					<span class="w-2 h-2 rounded-full" style={data.syncStatus.connectedCount < data.syncStatus.enabledCount ? 'background:var(--warning); box-shadow:0 0 8px rgba(245,158,11,0.6);' : 'background:var(--success); box-shadow:0 0 8px rgba(16,185,129,0.6);'}></span>
					<span class="font-medium text-on-surface">{data.syncStatus.connectedCount} / {data.syncStatus.enabledCount} Module aktiv</span>
				</div>
				{#if data.syncStatus.offlineModules.length > 0}
					<span class="font-label-mono-xs text-label-mono-xs text-outline">{data.syncStatus.offlineModules.join(', ')} Offline</span>
				{/if}
			</div>
		</div>
	</div>

	<!-- Chart + Recent Receipts -->
	<div class="grid grid-cols-1 md:grid-cols-12 gap-space-md mb-space-xl">
		<div class="col-span-6 flex flex-col justify-between rounded-xl bg-surface-container-low p-space-lg shadow-lg">
			<div>
				<div class="flex flex-wrap items-center justify-between gap-space-sm mb-space-md">
					<div>
						<h2 class="font-headline-sm text-headline-sm font-semibold text-on-surface">Ausgaben nach Markt <span class="font-body-sm text-body-sm font-normal text-on-surface-variant">· letzte 6 Monate</span></h2>
						<p class="font-body-sm text-body-sm text-on-surface-variant mt-0.5">Entwicklung {data.sixMonthRangeLabel}</p>
					</div>
					<div class="flex items-center gap-space-xs px-space-sm py-1 rounded-lg bg-surface-container">
						<span class="font-label-mono-xs text-label-mono-xs text-on-surface-variant">Gesamt 6M:</span>
						<span class="font-label-mono-sm text-label-mono-sm text-primary font-bold">{euro(data.sixMonthTotalCents)}</span>
					</div>
				</div>
				<div class="relative w-full" style="aspect-ratio: 520 / 220;">
					<svg viewBox="0 0 520 220" width="100%" height="100%" preserveAspectRatio="none" style="display:block; overflow:visible;" role="img" aria-label="Monatsausgaben je Supermarkt, letzte sechs Monate">
						{#each yTicks as tick (tick)}
							{@const y = chartBottom - tick * scale}
							<line x1={chartLeft} y1={y} x2={chartRight} y2={y} class="text-surface-container-highest" stroke="currentColor" stroke-dasharray={tick === 0 ? 'none' : '2 4'} stroke-width="1" />
							<text x={chartLeft - 8} y={y + 3} class="text-outline font-label-mono-xs" fill="currentColor" font-size="9.5" text-anchor="end">{tick} €</text>
						{/each}
						{#each data.months as month, i (month.label + i)}
							{@const x = chartLeft + gap + i * (barWidth + gap)}
							{@const entries = Object.entries(month.values).filter(([, cents]) => cents > 0)}
							{@const total = entries.reduce((sum, [, c]) => sum + c, 0)}
							{#each entries as [storeId, cents], si (storeId)}
								{@const h = (cents / 100) * scale}
								{@const yOffset = entries.slice(0, si).reduce((acc, [, c]) => acc + (c / 100) * scale, 0)}
								<rect
									x={x} y={chartBottom - yOffset - h} width={barWidth} height={h}
									fill={getStoreUi(storeId).color}
									role="img" aria-label="{getStoreUi(storeId).name} {month.label}: {euro(cents)}"
									onmouseenter={(e) => showTooltip(e, `${getStoreUi(storeId).name} · ${month.label}: ${euro(cents)}`)}
									onmousemove={(e) => showTooltip(e, `${getStoreUi(storeId).name} · ${month.label}: ${euro(cents)}`)}
									onmouseleave={hideTooltip}
								/>
							{/each}
							{#if total > 0}
								<text x={x + barWidth / 2} y={chartBottom - (total / 100) * scale - 6} class="text-on-surface font-label-mono-xs font-semibold" fill="currentColor" font-size="10" text-anchor="middle">{euro(total)}</text>
							{/if}
							<text x={x + barWidth / 2} y="196" class="text-on-surface-variant font-label-mono-sm" fill="currentColor" font-size="11" text-anchor="middle">{month.label}</text>
						{/each}
					</svg>
				</div>
			</div>
			<div class="pt-space-md mt-space-md border-t border-surface-container-highest flex flex-wrap items-center justify-between gap-space-sm">
				<div class="flex items-center flex-wrap gap-space-md font-label-mono-xs text-label-mono-xs">
					{#each chartStoreIds as id (id)}
						{@const meta = getStoreUi(id)}
						<div class="flex items-center gap-1.5"><span class="w-2.5 h-2.5 rounded-sm" style="background:{meta.color}"></span><span class="text-on-surface">{meta.name}</span></div>
					{/each}
				</div>
				<a href="/statistics" class="font-label-mono-xs text-label-mono-xs text-primary hover:underline flex items-center gap-0.5">
					Vollständige Historie
					<i class="fa-solid fa-arrow-right text-[12px]"></i>
				</a>
			</div>
		</div>

		<div class="col-span-6 flex flex-col justify-between rounded-xl bg-surface-container-low p-space-lg shadow-lg">
			<div>
				<div class="flex items-center justify-between mb-space-sm">
					<div>
						<h2 class="font-headline-sm text-headline-sm font-semibold text-on-surface">Neueste Belege</h2>
						<p class="font-body-sm text-body-sm text-on-surface-variant mt-0.5">Letzte synchronisierte Bons</p>
					</div>
					<div class="flex items-center gap-1 bg-surface-container p-1 rounded-lg font-label-mono-xs text-label-mono-xs">
						<button type="button" class="px-space-sm py-1 rounded cursor-pointer transition-colors {receiptsView === 'alle' ? 'bg-primary/20 text-primary font-semibold' : 'text-on-surface-variant hover:text-on-surface'}" onclick={() => (receiptsView = 'alle')}>Alle</button>
						<button type="button" class="px-space-sm py-1 rounded cursor-pointer transition-colors {receiptsView === 'maerkte' ? 'bg-primary/20 text-primary font-semibold' : 'text-on-surface-variant hover:text-on-surface'}" onclick={() => (receiptsView = 'maerkte')}>Märkte</button>
					</div>
				</div>
				{#if visibleReceipts.length === 0}
					<div class="py-space-lg text-center text-on-surface-variant font-body-sm text-body-sm">Noch keine Belege synchronisiert.</div>
				{:else}
					<div class="flex flex-col gap-space-xs mt-space-sm">
						{#each visibleReceipts as r (r.id)}
							{@const ui = getStoreUi(r.storeId)}
							<button
								type="button"
								onclick={() => openDrawer(r)}
								class="flex items-center justify-between gap-space-sm p-space-sm rounded-xl bg-surface-container/60 hover:bg-surface-container border border-transparent transition-all cursor-pointer text-left"
							>
								<div class="flex items-center gap-space-sm min-w-0">
									<span class="flex-shrink-0 py-1 px-2 text-[10px] tracking-wider font-extrabold uppercase text-center rounded-md flex items-center justify-center gap-1.5" style="background:color-mix(in srgb, {ui.color} 16%, transparent); color:{ui.color}; border:1px solid color-mix(in srgb, {ui.color} 35%, transparent);">
										<span class="w-1.5 h-1.5 rounded-full" style="background:{ui.color}"></span>{ui.name}
									</span>
									<div class="min-w-0">
										<h3 class="font-body-sm text-body-sm font-semibold text-on-surface truncate">{r.marketName ?? 'Unbekannter Markt'}</h3>
										<span class="font-label-mono-xs text-label-mono-xs text-on-surface-variant">{formatDate(r.timestamp)}</span>
									</div>
								</div>
								<div class="flex items-center gap-space-xs flex-shrink-0">
									<span class="font-label-mono-sm text-label-mono-sm font-bold text-on-surface">{euro(r.totalCents)}</span>
									<i class="fa-solid fa-chevron-right text-[14px] text-outline"></i>
								</div>
							</button>
						{/each}
					</div>
				{/if}
			</div>
			{#if receiptsView === 'alle'}
				<div class="pt-space-md mt-space-md border-t border-surface-container-highest flex items-center justify-between">
					<span class="font-body-sm text-body-sm text-on-surface-variant">Zeigt {data.recent.length} von {data.receiptCount} Belegen im gewählten Zeitraum</span>
					<a href="/receipts" class="font-label-mono-xs text-label-mono-xs text-primary hover:underline flex items-center gap-0.5">
						Alle Kassenzettel ansehen
						<i class="fa-solid fa-arrow-right text-[12px]"></i>
					</a>
				</div>
			{/if}
		</div>
	</div>

	<!-- Sync status banner -->
	<div class="rounded-xl bg-surface-container-low p-space-md shadow-md flex flex-wrap items-center justify-between gap-space-md">
		<div class="flex items-center gap-space-md">
			<div class="w-9 h-9 rounded-xl bg-primary/10 flex items-center justify-center text-primary flex-shrink-0">
				<i class="fa-solid fa-bolt text-[18px]"></i>
			</div>
			<div>
				{#if data.activeStoreNames.length > 0}
					<h4 class="font-body-sm text-body-sm font-semibold text-on-surface">Automatischer Kassenbon-Import aktiv</h4>
					<p class="font-label-mono-xs text-label-mono-xs text-on-surface-variant">{data.activeStoreNames.join(', ')} synchronisier{data.activeStoreNames.length === 1 ? 't' : 'en'} automatisch im Hintergrund.</p>
				{:else}
					<h4 class="font-body-sm text-body-sm font-semibold text-on-surface">Kein automatischer Import aktiv</h4>
					<p class="font-label-mono-xs text-label-mono-xs text-on-surface-variant">Keine Module verbunden -- unter Märkte einrichten.</p>
				{/if}
			</div>
		</div>
		<div class="flex items-center gap-space-sm">
			<span
				class="inline-flex items-center gap-1.5 px-space-sm py-1 rounded-full font-label-mono-xs text-label-mono-xs font-medium"
				style={data.pollingEnabled ? 'background:var(--success-soft); color:var(--success);' : 'background:var(--critical-soft); color:var(--critical);'}
			>
				<span class="w-1.5 h-1.5 rounded-full" style={data.pollingEnabled ? 'background:var(--success);' : 'background:var(--critical);'}></span>
				Live-Polling {data.pollingEnabled ? 'an' : 'aus'}
			</span>
			<a href="/dealer-interfaces" class="font-label-mono-xs text-label-mono-xs px-space-md py-1.5 rounded-lg bg-surface-container-high hover:bg-surface-container-highest text-on-surface-variant hover:text-on-surface transition-colors">Modulübersicht</a>
		</div>
	</div>
</div>

<div class="drawer-backdrop" class:open={!!selectedReceipt} onclick={closeDrawer} role="presentation"></div>
<aside class="drawer" class:open={!!selectedReceipt}>
	{#if selectedReceipt}
		{@const ui = getStoreUi(selectedReceipt.storeId)}
		<div class="drawer-head">
			<div>
				<span class="store-badge" style="background:color-mix(in srgb, {ui.color} 16%, transparent); color:{ui.color}; margin-bottom:8px;">
					<span class="store-dot" style="background:{ui.color}"></span>{ui.name}
				</span>
				<h3 style="font-size:16px; font-weight:800;">{selectedReceipt.marketName ?? 'Unbekannter Markt'}</h3>
				<div class="mono" style="font-size:12px; color:var(--text-muted); margin-top:3px;">
					{formatDate(selectedReceipt.timestamp)}{selectedReceipt.marketCity ? ` · ${selectedReceipt.marketCity}` : ''}
				</div>
			</div>
			<button class="drawer-close" onclick={closeDrawer} aria-label="Schließen">
				<i class="fa-solid fa-xmark"></i>
			</button>
		</div>
		<div class="drawer-body">
			<div class="receipt-slip">
				{#each selectedReceipt.items as item (item.id)}
					<div class="item-line">
						<span><span class="qty">{item.quantity ?? 1}×</span>{item.name}</span>
						<span class="price">{euro(item.priceCents)}</span>
					</div>
				{/each}
				<div class="item-line" style="font-weight:700;{selectedReceipt.items.length > 0 ? ' border-top:1px solid var(--border); margin-top:4px; padding-top:10px;' : ''}">
					<span>Gesamt</span><span class="price">{euro(selectedReceipt.totalCents)}</span>
				</div>
			</div>
			{#if selectedReceipt.cancelled}
				<p class="alert error" style="margin:0;">Dieser Bon wurde storniert.</p>
			{/if}
			<div style="display:flex; gap:8px;">
				{#if selectedReceipt.pdfFetched}
					<a class="btn" href="/receipts/{selectedReceipt.id}/pdf" target="_blank" style="flex:1; justify-content:center;">
						<i class="fa-solid fa-file-pdf"></i>
						PDF öffnen
					</a>
				{/if}
				<a class="btn primary" href="/receipts/{selectedReceipt.id}" style="flex:1; justify-content:center;">
					Beleg öffnen
					<i class="fa-solid fa-chevron-right"></i>
				</a>
			</div>
		</div>
	{/if}
</aside>

{#if tooltip}
	<div class="fixed z-[70] pointer-events-none rounded-lg px-space-sm py-1 font-label-mono-sm text-label-mono-sm text-on-surface bg-surface-container-high shadow-2xl whitespace-nowrap" style="left:{tooltip.x + 12}px; top:{tooltip.y - 28}px;">
		{tooltip.text}
	</div>
{/if}
