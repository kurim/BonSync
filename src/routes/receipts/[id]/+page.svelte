<script lang="ts">
	import { enhance } from '$app/forms';
	import { getStoreUi, euro } from '$lib/stores-ui';
	import type { ReceiptMeta } from '$lib/server/modules/types';

	let { data, form } = $props();

	const r = $derived(data.receipt);
	const ui = $derived(getStoreUi(r.storeId, undefined, data.ui));
	const coupons = $derived(
		r.couponsJson ? (JSON.parse(r.couponsJson) as { label: string; amountCents: number }[]) : []
	);
	const meta = $derived(r.metaJson ? (JSON.parse(r.metaJson) as ReceiptMeta) : null);
	const itemsSubtotalCents = $derived(data.items.reduce((sum, item) => sum + item.priceCents, 0));
	const address = $derived(
		[r.marketStreet, [r.marketZip, r.marketCity].filter(Boolean).join(' ')].filter(Boolean).join(', ')
	);
	const shortId = $derived(r.externalId.length > 18 ? `…${r.externalId.slice(-14)}` : r.externalId);
	// Bon-Nr. ist für Menschen lesbar (steht auch auf dem gedruckten Bon) -> wo vorhanden der
	// opaken externalId vorziehen, die nur eine interne Store-ID ist.
	const idLabel = $derived(meta?.bonNr ?? shortId);
	// "Vollständig geladen" darf ein PDF nur einfordern, wenn das Modul überhaupt jemals eins
	// liefert (providesPdf) -- sonst bliebe der Beleg für PDF-lose Händler (z.B. Fressnapf) für
	// immer als "unvollständig" markiert.
	const complete = $derived(r.itemsFetched && (!data.providesPdf || r.pdfFetched));

	function formatTseTime(iso: string): string {
		const d = new Date(iso);
		return Number.isNaN(d.getTime()) ? iso : d.toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
	}

	let reprocessing = $state(false);
</script>

<svelte:head><title>{data.receipt.marketName ?? 'Beleg'} — BonSync</title></svelte:head>

<div class="flex flex-col w-full pb-space-xl font-body-md text-on-surface">
	<!-- Kopfzeile: Breadcrumb, Titel, Aktionen -->
	<div class="flex flex-col lg:flex-row lg:items-center justify-between gap-space-md mb-space-lg">
		<div class="flex flex-col gap-space-xs">
			<div class="flex items-center flex-wrap gap-space-xs font-label-mono-xs text-label-mono-xs text-outline">
				<a href="/receipts" class="hover:text-primary transition-colors">Kassenzettel</a>
				<span>/</span>
				{#if r.marketName}
					<a href="/receipts?q={encodeURIComponent(r.marketName)}" class="text-on-surface-variant hover:text-primary transition-colors">{r.marketName}</a>
				{:else}
					<span class="text-on-surface-variant">Unbekannter Markt</span>
				{/if}
				<span>/</span>
				<span class="text-primary font-medium tracking-wide">Beleg {idLabel}</span>
			</div>
			<div class="flex items-center gap-space-sm">
				<h1 class="font-headline-lg text-headline-lg text-on-surface font-semibold tracking-tight">Kassenbeleg Detailansicht</h1>
				<span
					class="px-2 py-0.5 rounded-full font-label-mono-xs text-label-mono-xs flex items-center gap-1"
					class:bg-surface-container-high={!r.cancelled}
					class:text-primary={!r.cancelled}
					class:bg-error-container={r.cancelled}
					class:text-on-error-container={r.cancelled}
				>
					<span class="w-1.5 h-1.5 rounded-full" class:bg-emerald-400={!r.cancelled} class:bg-error={r.cancelled}></span>
					{r.cancelled ? 'Storniert' : 'Erfasst'}
				</span>
			</div>
		</div>
		<div class="flex items-center flex-wrap gap-space-xs">
			{#if r.pdfFetched}
				<a
					class="flex items-center gap-space-xs px-space-md h-9 rounded-lg bg-surface-container-high hover:bg-surface-container-highest text-on-surface text-body-sm font-medium transition-all shadow-sm"
					href="/receipts/{r.id}/pdf"
					target="_blank"
				>
					<i class="fa-solid fa-file-pdf text-[16px] text-primary"></i>
					Original eBon (PDF)
				</a>
			{/if}
			<form
				method="POST"
				action="?/reprocess"
				use:enhance={() => {
					reprocessing = true;
					return async ({ update }) => {
						reprocessing = false;
						await update();
					};
				}}
			>
				<button
					class="flex items-center gap-space-xs px-space-md h-9 rounded-lg bg-surface-container-high hover:bg-surface-container-highest text-on-surface text-body-sm font-medium transition-all shadow-sm disabled:opacity-50"
					type="submit"
					disabled={reprocessing}
				>
					<i class="fa-solid fa-arrows-rotate text-[16px]"></i>
					{reprocessing ? 'Lese neu ein…' : 'Neu einlesen'}
				</button>
			</form>
			<a
				class="flex items-center gap-space-xs px-space-md h-9 rounded-lg bg-surface-container-high hover:bg-surface-container-highest text-on-surface text-body-sm font-medium transition-all shadow-sm"
				href="/receipts"
			>
				<i class="fa-solid fa-arrow-left text-[16px]"></i>
				Zurück
			</a>
		</div>
	</div>

	{#if form?.error}<p class="mb-space-md px-space-md py-space-sm rounded-lg bg-error-container text-on-error-container text-body-sm">{form.error}</p>{/if}
	{#if form?.success}<p class="mb-space-md px-space-md py-space-sm rounded-lg bg-emerald-950/30 text-emerald-300 text-body-sm">Neu eingelesen.</p>{/if}
	{#if data.fetchError}<p class="mb-space-md px-space-md py-space-sm rounded-lg bg-error-container text-on-error-container text-body-sm">{data.fetchError}</p>{/if}

	<!-- Hauptbereich: Ticket links, Übersicht/Zusatzinfos rechts -->
	<div class="grid grid-cols-1 md:grid-cols-12 gap-space-lg items-start">
		<!-- LINKS: Thermal-Ticket-Nachbildung mit den echten Beleg-/Artikeldaten -->
		<section class="col-span-6 2xl:col-span-5 flex flex-col gap-space-md">
			<div class="relative w-full rounded-xl bg-surface-container-lowest p-1 shadow-2xl overflow-hidden">
				<div class="absolute -top-12 -left-12 w-48 h-48 bg-primary/10 rounded-full blur-3xl pointer-events-none"></div>
				<div class="relative bg-surface-container-low rounded-lg p-space-md flex flex-col">
					<!-- Marke / Markt -->
					<div class="flex items-start justify-between pb-space-sm border-b border-outline-variant/30">
						<div class="flex items-center gap-space-sm">
							<div class="w-10 h-10 rounded-lg bg-surface-container-high flex items-center justify-center overflow-hidden shrink-0">
								{#if ui.logo}
									<img src={ui.logo} alt="{ui.name} Logo" class="w-full h-full object-contain" />
								{:else}
									<span class="font-label-mono-xs text-label-mono-xs font-bold" style="color:{ui.color}">{ui.chip}</span>
								{/if}
							</div>
							<div class="flex flex-col">
								<span class="font-headline-sm text-headline-sm text-on-surface font-bold leading-none">{r.marketName ?? 'Unbekannter Markt'}</span>
								{#if address}<span class="font-body-sm text-body-sm text-on-surface-variant">{address}</span>{/if}
							</div>
						</div>
						<span class="font-label-mono-xs text-label-mono-xs text-outline px-1.5 py-0.5 rounded bg-surface-container-high shrink-0">#{idLabel}</span>
					</div>

					<!-- Datum/Uhrzeit + Kasse/Bediener/Bon-Nr./USt-ID, sofern aus dem Beleg geparst -->
					<div class="grid grid-cols-2 gap-y-1 gap-x-2 py-space-sm font-label-mono-xs text-label-mono-xs text-outline-variant">
						<div>Datum: <span class="text-on-surface">{new Date(r.timestamp).toLocaleDateString('de-DE')}</span></div>
						<div class="text-right">Uhrzeit: <span class="text-on-surface">{new Date(r.timestamp).toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' })}</span></div>
						{#if meta?.kasse || meta?.bediener}
							<div>Kasse: <span class="text-on-surface">{meta.kasse ?? '—'}</span> · Bed.: <span class="text-on-surface">{meta.bediener ?? '—'}</span></div>
						{/if}
						{#if meta?.ustId}
							<div class="text-right">USt-IdNr.: <span class="text-on-surface-variant">{meta.ustId}</span></div>
						{/if}
					</div>

					<!-- Perforierte Trennlinie -->
					<div class="relative my-space-xs flex items-center justify-between">
						<div class="-ml-6 w-3 h-6 rounded-r-full bg-surface-container-lowest"></div>
						<div class="w-full mx-2 border-t border-dashed border-outline/30"></div>
						<div class="-mr-6 w-3 h-6 rounded-l-full bg-surface-container-lowest"></div>
					</div>

					{#if data.items.length > 0}
						<div class="flex justify-between items-center py-1 font-label-mono-xs text-label-mono-xs text-outline uppercase tracking-wider">
							<span>Artikelbezeichnung</span>
							<div class="flex gap-4">
								<span class="w-10 text-right">MWST</span>
								<span class="w-16 text-right">EUR</span>
							</div>
						</div>
						<div class="flex flex-col gap-1.5 py-space-xs font-label-mono-sm text-label-mono-sm text-on-surface">
							{#each data.items as item (item.id)}
								<div class="flex justify-between items-baseline group hover:bg-surface-container-highest/30 px-1 py-0.5 rounded transition-colors">
									<div class="flex flex-col truncate pr-2">
										<span class="truncate">{item.name}{item.discountExcluded ? ' *' : ''}</span>
										{#if item.quantity && item.quantity > 1 && item.unitPriceCents != null}
											<span class="font-label-mono-xs text-label-mono-xs text-outline">{item.quantity} x {euro(item.unitPriceCents)}</span>
										{/if}
									</div>
									<div class="flex gap-4 shrink-0 font-medium">
										<span class="w-10 text-right text-outline">{item.taxCode ?? '—'}</span>
										<span class="w-16 text-right">{euro(item.priceCents)}</span>
									</div>
								</div>
							{/each}
							{#each coupons as coupon (coupon.label)}
								<div class="flex justify-between items-baseline px-1 py-0.5 text-emerald-400 bg-emerald-950/20 rounded">
									<span class="truncate pr-2">{coupon.label}</span>
									<div class="flex gap-4 shrink-0 font-medium">
										<span class="w-10 text-right text-emerald-400/60">–</span>
										<span class="w-16 text-right">−{euro(coupon.amountCents)}</span>
									</div>
								</div>
							{/each}
						</div>
					{:else if r.itemsFetched}
						<p class="py-space-sm text-body-sm text-on-surface-variant">Für diesen Beleg konnten keine Einzelposten aus dem PDF geparst werden.</p>
					{:else}
						<p class="py-space-sm text-body-sm text-on-surface-variant">Artikel werden noch nicht geladen.</p>
					{/if}

					<!-- Summenblock -->
					<div class="mt-space-sm pt-space-sm border-t border-outline-variant/40 flex flex-col gap-1 font-label-mono-sm text-label-mono-sm">
						{#if data.items.length > 0}
							<div class="flex justify-between text-on-surface-variant">
								<span>Artikelsumme</span>
								<span>{euro(itemsSubtotalCents)}</span>
							</div>
						{/if}
						{#if r.savingsCents}
							<div class="flex justify-between text-emerald-400">
								<span>Ersparnis</span>
								<span>−{euro(r.savingsCents)}</span>
							</div>
						{/if}
						<div class="flex justify-between items-baseline pt-2 pb-1 border-b-2 border-primary">
							<span class="font-headline-md text-headline-md font-bold text-on-surface">GESAMTSUMME</span>
							<span class="font-label-mono-lg text-label-mono-lg font-bold text-primary tracking-tight">{euro(r.totalCents)}</span>
						</div>
					</div>

					<!-- Echte MwSt.-Aufschlüsselung aus dem Beleg (kein fixer %-Satz je Steuercode -
					     variiert je Kassensystem, siehe receiptPdfParser.ts parseReceiptMeta) -->
					{#if meta && meta.taxBreakdown.length > 0}
						<div class="mt-space-sm p-space-xs rounded bg-surface-container-high/60 flex flex-col gap-1">
							<div class="grid grid-cols-[1.3fr_1fr_1fr_1fr] text-outline font-label-mono-xs text-label-mono-xs uppercase pb-1 border-b border-outline-variant/30">
								<span>MwSt.-Satz</span>
								<span class="text-right">Netto</span>
								<span class="text-right">Steuer</span>
								<span class="text-right">Brutto</span>
							</div>
							{#each meta.taxBreakdown as row (row.code)}
								<div class="grid grid-cols-[1.3fr_1fr_1fr_1fr] text-on-surface-variant font-label-mono-xs text-label-mono-xs">
									<span>{row.code} = {row.percent.toLocaleString('de-DE', { minimumFractionDigits: 1 })}%</span>
									<span class="text-right">{euro(row.netCents)}</span>
									<span class="text-right">{euro(row.taxCents)}</span>
									<span class="text-right text-on-surface">{euro(row.grossCents)}</span>
								</div>
							{/each}
						</div>
					{/if}

					<!-- TSE-Beleghinweis (nur Zähler/Transaktion/Zeitraum -- keine erfundene QR-Grafik,
					     die Signatur selbst ist zu lang, um sinnvoll angezeigt zu werden) -->
					{#if meta && (meta.tseSignaturzaehler || (meta.tseStart && meta.tseStop))}
						<div class="mt-space-sm pt-space-xs flex items-center gap-1.5 font-label-mono-xs text-label-mono-xs text-outline">
							<i class="fa-solid fa-circle-check text-[13px] text-emerald-400"></i>
							<span>
								TSE-Beleg
								{#if meta.tseSignaturzaehler}· Zähler #{meta.tseSignaturzaehler}{/if}
								{#if meta.tseTransaktion}· Transaktion #{meta.tseTransaktion}{/if}
								{#if meta.tseStart && meta.tseStop}· {formatTseTime(meta.tseStart)}–{formatTseTime(meta.tseStop)}{/if}
							</span>
						</div>
					{/if}
				</div>
			</div>
		</section>

		<!-- RECHTS: Übersicht, Zahlungsart, Ersparnis/Bonus -->
		<section class="col-span-6 2xl:col-span-7 flex flex-col gap-space-md rounded-xl bg-surface-container-lowest p-1 shadow-2xl">
			<div class="rounded-xl bg-surface-container p-space-md shadow-md flex flex-col gap-space-md">
				<div class="flex flex-col sm:flex-row sm:items-center justify-between gap-space-sm">
					<div class="flex flex-col">
						<span class="font-label-mono-xs text-label-mono-xs text-on-surface-variant uppercase tracking-wider">Erfasster Betrag</span>
						<span class="font-headline-xl text-headline-xl font-bold text-primary">{euro(r.totalCents)}</span>
					</div>
					<div
						class={[
							'flex items-center gap-space-xs px-space-sm py-1.5 rounded-lg font-label-mono-xs text-label-mono-xs border',
							complete ? 'bg-emerald-950/30 text-emerald-300 border-emerald-500/20' : 'bg-amber-950/30 text-amber-300 border-amber-500/20'
						]}
					>
						<i class="fa-solid {complete ? 'fa-circle-check' : 'fa-triangle-exclamation'} text-[14px]"></i>
						{#if complete}
							{data.providesPdf ? 'PDF & Artikel synchronisiert' : 'Artikel synchronisiert'}
						{:else}
							{r.pdfFetched ? 'PDF synchronisiert' : 'Noch nicht vollständig geladen'}
						{/if}
					</div>
				</div>
				<div class="grid grid-cols-1 sm:grid-cols-3 gap-space-sm pt-space-xs border-t border-surface-container-high">
					<div class="flex flex-col gap-0.5">
						<span class="font-label-mono-xs text-label-mono-xs text-outline">Markt</span>
						<span class="font-body-md text-body-md text-on-surface font-medium">{r.marketName ?? '—'}</span>
					</div>
					{#if meta?.paymentMethod}
						<div class="flex flex-col gap-0.5">
							<span class="font-label-mono-xs text-label-mono-xs text-outline">Zahlungsart</span>
							<span class="font-body-md text-body-md text-on-surface font-medium">{meta.paymentMethod}{meta.paymentAmountCents != null ? ` · ${euro(meta.paymentAmountCents)}` : ''}</span>
						</div>
					{/if}
					<div class="flex flex-col gap-0.5">
						<span class="font-label-mono-xs text-label-mono-xs text-outline">Beleg-ID</span>
						<span class="font-label-mono-sm text-label-mono-sm text-primary-fixed truncate">{r.externalId}</span>
					</div>
				</div>
			</div>

			{#if meta?.loyaltyNote}
				<div class="rounded-xl bg-surface-container p-space-md shadow-md flex items-center gap-space-sm">
					<div class="p-2 rounded-lg bg-primary/20 text-primary shrink-0">
						<i class="fa-solid fa-tags text-[18px]"></i>
					</div>
					<span class="font-body-md text-body-md text-on-surface">{meta.loyaltyNote}</span>
				</div>
			{/if}

			{#if r.savingsCents || coupons.length > 0}
				<div class="rounded-xl bg-surface-container p-space-md shadow-md flex flex-col gap-space-sm">
					<div class="flex items-center gap-space-xs font-body-md text-body-md font-bold text-emerald-400">
						<i class="fa-solid fa-piggy-bank text-[18px]"></i>
						Du hast {euro(r.savingsCents ?? 0)} gespart
					</div>
					{#each coupons as coupon (coupon.label)}
						<div class="flex justify-between text-body-sm text-on-surface-variant">
							<span>{coupon.label}</span>
							<span class="font-label-mono-sm text-label-mono-sm text-on-surface">{euro(coupon.amountCents)}</span>
						</div>
					{/each}
				</div>
			{/if}
		</section>
	</div>
</div>
