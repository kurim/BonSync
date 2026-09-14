<script lang="ts">
	import { euro } from '$lib/stores-ui';
	import type { Period } from './+page.server';

	let { data } = $props();

	const PERIOD_LABELS: Record<Period, string> = {
		month: 'Dieser Monat',
		'6months': 'Letzte 6 Monate',
		year: 'Dieses Jahr',
		'12months': 'Letzte 12 Monate'
	};

	let periodMenuOpen = $state(false);
	function closePeriodMenu() {
		periodMenuOpen = false;
	}

	// Balkendiagramm-Geometrie (gleiches Muster wie auf dem Dashboard).
	const chartTop = 20,
		chartBottom = 190,
		chartLeft = 48,
		chartRight = 600;
	const barWidth = $derived(Math.min(42, (chartRight - chartLeft) / (data.months.length * 2)));

	function niceCeil(value: number): number {
		if (value <= 0) return 100;
		const exponent = Math.floor(Math.log10(value));
		const magnitude = 10 ** exponent;
		const residual = value / magnitude;
		const niceResidual = residual <= 1 ? 1 : residual <= 2 ? 2 : residual <= 5 ? 5 : 10;
		return niceResidual * magnitude;
	}

	// Untergrenze 10000 Cent (100 €) statt 1 -- ein Floor von nur 1 Cent führte bei komplett
	// leeren Daten dazu, dass niceCeil(0.01) alle 5 y-Achsen-Ticks auf 0 rundete (identische
	// Keys im {#each yTicks} -> Svelte-Crash "each_key_duplicate").
	const maxMonthTotal = $derived(
		Math.max(10000, ...data.months.map((m) => Object.values(m.values).reduce((a, b) => a + b, 0)))
	);
	const niceMaxEuro = $derived(niceCeil(maxMonthTotal / 100));
	const scale = $derived((chartBottom - chartTop) / niceMaxEuro);
	const gap = $derived((chartRight - chartLeft - barWidth * data.months.length) / (data.months.length + 1));
	const yTicks = $derived([0, 0.25, 0.5, 0.75, 1].map((f) => Math.round(niceMaxEuro * f)));
	const avgMonthEuro = $derived(data.months.length > 0 ? maxMonthTotal > 0 ? Math.round(data.months.reduce((sum, m) => sum + Object.values(m.values).reduce((a, b) => a + b, 0), 0) / data.months.length) / 100 : 0 : 0);

	// Donut-Chart: Kreisumfang bei r=50 -> 2*PI*50 = 314.16
	const CIRCUMFERENCE = 314.16;
	const donutSegments = $derived(
		(() => {
			let offset = 0;
			return data.storeBreakdown.map((s) => {
				const length = (s.pct / 100) * CIRCUMFERENCE;
				const seg = { color: s.color, length, offset: -offset };
				offset += length;
				return seg;
			});
		})()
	);

	let tooltip = $state<{ x: number; y: number; text: string } | null>(null);
	function showTooltip(e: MouseEvent, text: string) {
		tooltip = { x: e.clientX, y: e.clientY, text };
	}
	function hideTooltip() {
		tooltip = null;
	}

	const FOCUS_LABELS: Record<string, string> = {
		supermarkt: 'Supermarkt',
		discounter: 'Discounter',
		drogerie: 'Drogerie'
	};
</script>

<svelte:head><title>Statistiken — BonSync</title></svelte:head>

<svelte:window onclick={(e) => { if (!(e.target as HTMLElement).closest('#period-dropdown-container')) closePeriodMenu(); }} />

<div class="flex flex-col w-full pb-space-xl font-body-md text-on-surface">
	<div class="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-space-md mb-space-xl">
		<div class="flex flex-col gap-space-xs">
			<div class="flex items-center gap-space-sm">
				<div class="flex items-center justify-center w-7 h-7 rounded-lg bg-surface-container-high shadow-inner text-primary">
					<i class="fa-solid fa-chart-column text-[18px]"></i>
				</div>
				<h1 class="font-headline-xl text-headline-xl tracking-tight text-on-surface">Statistiken</h1>
			</div>
			<p class="font-body-md text-body-md text-on-surface-variant pl-space-md">Ausgabenanalysen, Händlervergleiche &amp; Einkaufsgewohnheiten im Detail</p>
		</div>
		<div class="relative" id="period-dropdown-container">
			<button
				type="button"
				class="flex items-center gap-space-xs px-space-md h-[38px] rounded-lg bg-surface-container-high hover:bg-surface-container-highest text-on-surface font-label-mono-sm text-label-mono-sm transition-all shadow-sm cursor-pointer"
				onclick={() => (periodMenuOpen = !periodMenuOpen)}
			>
				<i class="fa-solid fa-calendar-days text-primary"></i>
				{PERIOD_LABELS[data.period]}
				<i class="fa-solid fa-chevron-down text-[12px]"></i>
			</button>
			{#if periodMenuOpen}
				<div class="absolute right-0 mt-space-xs w-52 py-space-xs rounded-xl bg-surface-container-high shadow-2xl z-50">
					{#each Object.entries(PERIOD_LABELS) as [value, label] (value)}
						<a
							href="?period={value}"
							onclick={closePeriodMenu}
							class="block w-full text-left px-space-md py-space-xs font-label-mono-sm text-label-mono-sm hover:bg-surface-container-highest transition-colors {data.period === value ? 'text-primary font-semibold' : 'text-on-surface'}"
						>
							{label}
						</a>
					{/each}
				</div>
			{/if}
		</div>
	</div>

	<!-- KPI Cards -->
	<div class="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-space-md mb-space-xl">
		<div class="relative overflow-hidden rounded-xl bg-surface-container-low p-space-lg shadow-md">
			<div class="absolute -right-6 -bottom-6 w-24 h-24 rounded-full bg-primary/10 blur-xl pointer-events-none"></div>
			<div class="flex items-center justify-between mb-space-sm">
				<span class="font-label-mono-xs text-label-mono-xs uppercase text-on-surface-variant font-semibold tracking-wider">Gesamt-Ausgaben</span>
				<div class="w-8 h-8 rounded-lg bg-surface-container-high flex items-center justify-center text-primary">
					<i class="fa-solid fa-money-bill-wave text-[18px]"></i>
				</div>
			</div>
			<div class="flex items-baseline gap-space-sm mb-space-xs">
				<span class="font-headline-xl text-headline-xl font-bold text-on-surface tracking-tight">{euro(data.totalCents)}</span>
			</div>
			<div class="flex items-center gap-space-xs flex-wrap">
				{#if data.pctChange !== null}
					<span class="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded font-label-mono-xs text-label-mono-xs {data.pctChange >= 0 ? 'text-secondary bg-secondary-container/40' : 'text-primary bg-primary/10'}">
						<i class="fa-solid {data.pctChange >= 0 ? 'fa-arrow-up' : 'fa-arrow-down'} text-[12px]"></i>{data.pctChange >= 0 ? '+' : ''}{data.pctChange}%
					</span>
					<span class="font-body-sm text-body-sm text-on-surface-variant">vs. vorheriger Zeitraum ({euro(data.prevTotalCents)})</span>
				{:else}
					<span class="font-body-sm text-body-sm text-on-surface-variant">Kein Vergleichszeitraum verfügbar</span>
				{/if}
			</div>
		</div>

		<div class="relative overflow-hidden rounded-xl bg-surface-container-low p-space-lg shadow-md">
			<div class="absolute -right-6 -bottom-6 w-24 h-24 rounded-full bg-secondary/10 blur-xl pointer-events-none"></div>
			<div class="flex items-center justify-between mb-space-sm">
				<span class="font-label-mono-xs text-label-mono-xs uppercase text-on-surface-variant font-semibold tracking-wider">Belege Gesamt</span>
				<div class="w-8 h-8 rounded-lg bg-surface-container-high flex items-center justify-center text-secondary">
					<i class="fa-solid fa-receipt text-[18px]"></i>
				</div>
			</div>
			<div class="flex items-baseline gap-space-sm mb-space-xs">
				<span class="font-headline-xl text-headline-xl font-bold text-on-surface tracking-tight">{data.receiptCount} Bon{data.receiptCount === 1 ? '' : 's'}</span>
			</div>
			<div class="flex items-center gap-space-xs">
				{#if data.receiptCount > 0}
					<span class="font-label-mono-sm text-label-mono-sm text-primary font-medium">Ø {euro(data.avgCents)}</span>
					<span class="font-body-sm text-body-sm text-on-surface-variant">pro dokumentiertem Einkauf</span>
				{:else}
					<span class="font-body-sm text-body-sm text-on-surface-variant">Noch keine Belege im Zeitraum</span>
				{/if}
			</div>
		</div>

		<div class="relative overflow-hidden rounded-xl bg-surface-container-low p-space-lg shadow-md">
			<div class="absolute -right-6 -bottom-6 w-24 h-24 rounded-full bg-error/10 blur-xl pointer-events-none"></div>
			<div class="flex items-center justify-between mb-space-sm">
				<span class="font-label-mono-xs text-label-mono-xs uppercase text-on-surface-variant font-semibold tracking-wider">Häufigster Markt</span>
				<div class="w-8 h-8 rounded-lg bg-surface-container-high flex items-center justify-center text-error">
					<i class="fa-solid fa-store text-[18px]"></i>
				</div>
			</div>
			{#if data.topStore}
				<div class="flex items-baseline gap-space-sm mb-space-xs flex-wrap">
					<span class="font-headline-xl text-headline-xl font-bold text-on-surface tracking-tight">{data.topStore.name}</span>
					{#if data.topBranch}<span class="font-label-mono-sm text-label-mono-sm text-on-surface-variant font-medium">{data.topBranch}</span>{/if}
				</div>
				<div class="flex items-center gap-space-xs">
					<span class="inline-flex items-center px-1.5 py-0.5 rounded text-error font-label-mono-xs text-label-mono-xs bg-error-container/40">{data.topStore.pct}% Anteil</span>
					<span class="font-body-sm text-body-sm text-on-surface-variant">{data.topStore.count} Einkäufe im Zeitraum</span>
				</div>
			{:else}
				<div class="font-headline-sm text-headline-sm text-on-surface-variant">—</div>
				<div class="font-body-sm text-body-sm text-on-surface-variant">Noch keine Daten</div>
			{/if}
		</div>

		<div class="relative overflow-hidden rounded-xl bg-surface-container-low p-space-lg shadow-md">
			<div class="absolute -right-6 -bottom-6 w-24 h-24 rounded-full bg-tertiary-container/20 blur-xl pointer-events-none"></div>
			<div class="flex items-center justify-between mb-space-sm">
				<span class="font-label-mono-xs text-label-mono-xs uppercase text-on-surface-variant font-semibold tracking-wider">Rabatte &amp; Coupons</span>
				<div class="w-8 h-8 rounded-lg bg-surface-container-high flex items-center justify-center text-tertiary">
					<i class="fa-solid fa-piggy-bank text-[18px]"></i>
				</div>
			</div>
			<div class="flex items-baseline gap-space-sm mb-space-xs">
				<span class="font-headline-xl text-headline-xl font-bold text-tertiary tracking-tight">{euro(data.savingsCents)}</span>
			</div>
			<div class="flex items-center gap-space-xs">
				<span class="font-label-mono-xs text-label-mono-xs text-primary font-medium">{data.savingsPct}% Einsparung</span>
				<span class="font-body-sm text-body-sm text-on-surface-variant">auf {data.savingsCount} Beleg{data.savingsCount === 1 ? '' : 'en'} erfasst</span>
			</div>
		</div>
	</div>

	<!-- Chart + Donut -->
	<div class="grid grid-cols-1 md:grid-cols-12 gap-space-md mb-space-xl">
		<div class="col-span-6 2xl:col-span-7 flex flex-col justify-between rounded-xl bg-surface-container-low p-space-lg shadow-lg">
			<div class="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-space-sm mb-space-md">
				<div>
					<h2 class="font-headline-sm text-headline-sm font-semibold text-on-surface">Monatliche Ausgaben nach Supermarkt</h2>
					<p class="font-body-sm text-body-sm text-on-surface-variant mt-0.5">Entwicklung über {data.months.length === 1 ? 'den aktuellen Monat' : `die letzten ${data.months.length} Monate`}</p>
				</div>
				<div class="flex items-center gap-space-xs px-space-sm py-1 rounded-lg bg-surface-container">
					<span class="font-label-mono-xs text-label-mono-xs text-on-surface-variant">Mittelwert:</span>
					<span class="font-label-mono-sm text-label-mono-sm text-primary font-bold">{avgMonthEuro.toLocaleString('de-DE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} € / Mo</span>
				</div>
			</div>
			<div class="flex flex-wrap items-center gap-space-md mb-space-lg py-space-xs px-space-sm rounded-lg bg-surface-container/60">
				{#each data.storeBreakdown as s (s.id)}
					<div class="flex items-center gap-1.5">
						<span class="w-3 h-3" style="background:{s.color}"></span>
						<span class="font-label-mono-xs text-label-mono-xs text-on-surface">{s.name}</span>
					</div>
				{/each}
			</div>
			<div class="relative w-full h-72">
				<svg viewBox="0 0 620 220" width="100%" height="100%" style="display:block; overflow:visible;" role="img" aria-label="Monatsausgaben je Supermarkt">
					{#each yTicks as tick (tick)}
						{@const y = chartBottom - tick * scale}
						<line x1={chartLeft} y1={y} x2={chartRight} y2={y} class="text-surface-container-highest" stroke="currentColor" stroke-dasharray={tick === 0 ? 'none' : '3 3'} stroke-width="1" />
						<text x={chartLeft - 8} y={y + 3} class="text-outline font-label-mono-xs" fill="currentColor" font-size="10" text-anchor="end">{tick} €</text>
					{/each}
					{#each data.months as month, i (month.label + i)}
						{@const x = chartLeft + gap + i * (barWidth + gap)}
						{@const entries = Object.entries(month.values).filter(([, cents]) => cents > 0)}
						{@const total = entries.reduce((sum, [, c]) => sum + c, 0)}
						{#each entries as [storeId, cents], si (storeId)}
							{@const h = (cents / 100) * scale}
							{@const yOffset = entries.slice(0, si).reduce((acc, [, c]) => acc + (c / 100) * scale, 0)}
							<rect
								x={x}
								y={chartBottom - yOffset - h}
								width={barWidth}
								height={h}
								fill={data.storeBreakdown.find((s) => s.id === storeId)?.color ?? '#666'}
								role="img"
								aria-label="{storeId} {month.label}: {euro(cents)}"
								onmouseenter={(e) => showTooltip(e, `${storeId.toUpperCase()} · ${month.label}: ${euro(cents)}`)}
								onmousemove={(e) => showTooltip(e, `${storeId.toUpperCase()} · ${month.label}: ${euro(cents)}`)}
								onmouseleave={hideTooltip}
							/>
						{/each}
						{#if total > 0}
							<text x={x + barWidth / 2} y={chartBottom - (total / 100) * scale - 6} class="text-on-surface font-label-mono-xs font-semibold" fill="currentColor" font-size="10" text-anchor="middle">{euro(total)}</text>
						{/if}
						<text x={x + barWidth / 2} y={chartBottom + 18} class="text-on-surface-variant font-label-mono-sm" fill="currentColor" font-size="11" text-anchor="middle">{month.label}</text>
					{/each}
				</svg>
			</div>
		</div>

		<div class="col-span-6 2xl:col-span-5 flex flex-col justify-between rounded-xl bg-surface-container-low p-space-lg shadow-lg">
			<div class="flex items-center justify-between mb-space-sm">
				<div>
					<h2 class="font-headline-sm text-headline-sm font-semibold text-on-surface">Marktanteile</h2>
					<p class="font-body-sm text-body-sm text-on-surface-variant">Ausgabenanteil &amp; Transaktionsvolumen</p>
				</div>
				<span class="font-label-mono-sm text-label-mono-sm font-semibold text-primary px-space-xs py-0.5 rounded bg-surface-container-high">{data.storeBreakdown.length} Märkte</span>
			</div>
			{#if data.storeBreakdown.length > 0 && data.topStore}
				<div class="flex items-center justify-center gap-space-lg py-space-sm">
					<div class="relative w-36 h-36 flex-shrink-0 flex items-center justify-center">
						<svg class="w-full h-full -rotate-90" viewBox="0 0 120 120">
							<circle cx="60" cy="60" r="50" fill="none" stroke="currentColor" stroke-width="15" class="text-surface-container-highest" opacity="0.3" />
							{#each donutSegments as seg, i (i)}
								<circle cx="60" cy="60" r="50" fill="none" stroke={seg.color} stroke-width="15" stroke-dasharray="{seg.length} {CIRCUMFERENCE}" stroke-dashoffset={seg.offset} />
							{/each}
						</svg>
						<div class="absolute inset-0 flex flex-col items-center justify-center text-center pointer-events-none">
							<span class="font-label-mono-xs text-label-mono-xs text-on-surface-variant uppercase">Top Markt</span>
							<span class="font-headline-sm text-headline-sm font-bold text-on-surface">{data.topStore.name}</span>
							<span class="font-label-mono-xs text-label-mono-xs font-medium" style="color:{data.topStore.color}">{data.topStore.pct}%</span>
						</div>
					</div>
					<div class="flex flex-col gap-space-xs">
						<div class="p-space-xs rounded bg-surface-container">
							<span class="font-label-mono-xs text-label-mono-xs text-on-surface-variant block">Hauptfokus</span>
							<span class="font-body-md text-body-md font-semibold text-on-surface">{data.focusCategory ? FOCUS_LABELS[data.focusCategory] : '—'}</span>
						</div>
						<div class="p-space-xs rounded bg-surface-container">
							<span class="font-label-mono-xs text-label-mono-xs text-on-surface-variant block">Discounter-Quote</span>
							<span class="font-label-mono-md text-label-mono-md font-bold text-primary">{data.discounterQuote}% Gesamt</span>
						</div>
					</div>
				</div>
				<div class="flex flex-col gap-space-xs mt-space-sm">
					{#each data.storeBreakdown as s (s.id)}
						<div class="flex items-center justify-between p-space-xs rounded-lg bg-surface-container/50 hover:bg-surface-container transition-colors">
							<div class="flex items-center gap-space-sm min-w-0">
								<span class="w-2.5 h-2.5 rounded-full flex-shrink-0" style="background:{s.color}"></span>
								<div class="flex flex-col min-w-0">
									<span class="font-body-md text-body-md font-medium text-on-surface truncate">{s.name}</span>
									<span class="font-label-mono-xs text-label-mono-xs text-on-surface-variant">{s.count} Einkäufe • Ø {euro(s.avgCents)}</span>
								</div>
							</div>
							<div class="text-right flex-shrink-0">
								<span class="font-label-mono-sm text-label-mono-sm font-semibold text-on-surface block">{euro(s.cents)}</span>
								<span class="font-label-mono-xs text-label-mono-xs font-bold" style="color:{s.color}">{s.pct}%</span>
							</div>
						</div>
					{/each}
				</div>
			{:else}
				<div class="flex-1 flex items-center justify-center text-on-surface-variant font-body-sm text-body-sm py-space-xl">Noch keine Belege im Zeitraum.</div>
			{/if}
		</div>
	</div>

	<!-- Timing + Top-Artikel -->
	<div class="grid grid-cols-1 lg:grid-cols-12 gap-space-md mb-space-xl">
		<div class="lg:col-span-6 flex flex-col justify-between rounded-xl bg-surface-container-low p-space-lg shadow-lg">
			<div>
				<div class="flex items-center justify-between mb-space-xs flex-wrap gap-space-xs">
					<h2 class="font-headline-sm text-headline-sm font-semibold text-on-surface">Einkaufszeiten &amp; Wochentage</h2>
					{#if data.receiptCount > 0}
						<span class="inline-flex items-center gap-1 font-label-mono-xs text-label-mono-xs text-secondary font-medium bg-secondary-container/30 px-2 py-0.5 rounded">
							<i class="fa-solid fa-clock text-[12px]"></i> Peak: {data.peakDay.label === 'Sa' ? 'Samstag' : data.peakDay.label} · {data.peakSlotLabel}
						</span>
					{/if}
				</div>
				<p class="font-body-sm text-body-sm text-on-surface-variant mb-space-md">Häufigkeitsverteilung der Kassenzettel-Zeitstempel im gewählten Zeitraum</p>
				{#if data.receiptCount > 0}
					<div class="flex flex-col gap-space-xs mb-space-md">
						{#each data.weekday as d (d.label)}
							<div class="flex items-center gap-space-sm">
								<span class="w-8 font-label-mono-xs text-label-mono-xs {d.label === data.peakDay.label ? 'text-primary font-bold' : 'text-on-surface-variant'}">{d.label}</span>
								<div class="flex-1 h-3 rounded-full bg-surface-container-highest overflow-hidden">
									<div class="h-full rounded-full {d.label === data.peakDay.label ? 'bg-primary shadow-[0_0_8px_rgba(192,193,255,0.7)]' : 'bg-primary/40'}" style="width: {Math.max(d.pct, 1)}%"></div>
								</div>
								<span class="w-16 text-right font-label-mono-xs text-label-mono-xs {d.label === data.peakDay.label ? 'text-primary font-bold' : 'text-on-surface-variant'}">{d.pct}% ({d.count})</span>
							</div>
						{/each}
					</div>
					<div class="grid grid-cols-4 gap-space-xs pt-space-xs">
						<div class="p-space-xs rounded bg-surface-container text-center">
							<span class="font-label-mono-xs text-label-mono-xs text-on-surface-variant block">Morgens</span>
							<span class="font-label-mono-xs text-label-mono-xs text-outline block">07-10 Uhr</span>
							<span class="font-label-mono-sm text-label-mono-sm font-semibold text-on-surface mt-0.5 block">{data.daySlots.morning}%</span>
						</div>
						<div class="p-space-xs rounded bg-surface-container-high text-center">
							<span class="font-label-mono-xs text-label-mono-xs text-primary font-medium block">Mittag</span>
							<span class="font-label-mono-xs text-label-mono-xs text-outline block">10-14 Uhr</span>
							<span class="font-label-mono-sm text-label-mono-sm font-bold text-primary mt-0.5 block">{data.daySlots.midday}%</span>
						</div>
						<div class="p-space-xs rounded bg-surface-container text-center">
							<span class="font-label-mono-xs text-label-mono-xs text-on-surface-variant block">Nachmittag</span>
							<span class="font-label-mono-xs text-label-mono-xs text-outline block">14-18 Uhr</span>
							<span class="font-label-mono-sm text-label-mono-sm font-semibold text-on-surface mt-0.5 block">{data.daySlots.afternoon}%</span>
						</div>
						<div class="p-space-xs rounded bg-surface-container text-center">
							<span class="font-label-mono-xs text-label-mono-xs text-on-surface-variant block">Abend</span>
							<span class="font-label-mono-xs text-label-mono-xs text-outline block">18-22 Uhr</span>
							<span class="font-label-mono-sm text-label-mono-sm font-semibold text-on-surface mt-0.5 block">{data.daySlots.evening}%</span>
						</div>
					</div>
				{:else}
					<div class="py-space-xl text-center text-on-surface-variant font-body-sm text-body-sm">Noch keine Belege im Zeitraum.</div>
				{/if}
			</div>
		</div>

		<div class="lg:col-span-6 flex flex-col justify-between rounded-xl bg-surface-container-low p-space-lg shadow-lg">
			<div>
				<div class="flex items-center justify-between mb-space-xs">
					<h2 class="font-headline-sm text-headline-sm font-semibold text-on-surface">Top-Artikel</h2>
					<span class="font-label-mono-sm text-label-mono-sm text-on-surface-variant">Gesamt: {euro(data.totalCents)}</span>
				</div>
				<p class="font-body-sm text-body-sm text-on-surface-variant mb-space-md">Meistgekaufte Artikel nach erfassten Belegpositionen</p>
				{#if data.topItems.length > 0}
					<div class="flex flex-col gap-space-sm">
						{#each data.topItems as item (item.name)}
							{@const pct = data.totalCents > 0 ? Math.round((item.cents / data.totalCents) * 1000) / 10 : 0}
							<div class="flex flex-col gap-1">
								<div class="flex items-center justify-between gap-space-sm">
									<span class="font-body-md text-body-md font-medium text-on-surface truncate">{item.name}</span>
									<div class="flex items-center gap-space-sm flex-shrink-0">
										<span class="font-label-mono-sm text-label-mono-sm font-semibold text-on-surface">{euro(item.cents)}</span>
										<span class="font-label-mono-xs text-label-mono-xs text-on-surface-variant">{item.count}×</span>
									</div>
								</div>
								<div class="w-full h-2 rounded-full bg-surface-container-highest overflow-hidden">
									<div class="h-full bg-primary rounded-full" style="width: {Math.max(pct, 2)}%"></div>
								</div>
							</div>
						{/each}
					</div>
				{:else}
					<div class="py-space-lg text-center text-on-surface-variant font-body-sm text-body-sm">Keine Artikeldaten für diesen Zeitraum erfasst.</div>
				{/if}
			</div>
			{#if data.taxBreakdown.length > 0}
				<div class="mt-space-md pt-space-sm flex items-center justify-between bg-surface-container/30 px-space-md py-space-xs rounded-lg flex-wrap gap-space-xs">
					<div class="flex items-center gap-space-md flex-wrap">
						{#each data.taxBreakdown as t (t.code)}
							<div class="flex items-center gap-1.5">
								<span class="font-label-mono-xs text-label-mono-xs text-on-surface-variant">{t.percent}% MwSt.:</span>
								<span class="font-label-mono-sm text-label-mono-sm text-on-surface font-semibold">{euro(t.taxCents)}</span>
							</div>
						{/each}
					</div>
					<span class="font-label-mono-xs text-label-mono-xs text-outline">Basis: {data.taxReceiptCount} Beleg{data.taxReceiptCount === 1 ? '' : 'e'} mit ausgelesener MwSt.-Angabe</span>
				</div>
			{/if}
		</div>
	</div>
</div>

{#if tooltip}
	<div class="fixed z-[70] pointer-events-none rounded-lg px-space-sm py-1 font-label-mono-sm text-label-mono-sm text-on-surface bg-surface-container-high shadow-2xl whitespace-nowrap" style="left:{tooltip.x + 12}px; top:{tooltip.y - 28}px;">
		{tooltip.text}
	</div>
{/if}
