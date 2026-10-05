<script lang="ts">
	import { enhance } from '$app/forms';
	import { euro } from '#lib/stores-ui';
	import { MATCH_KIND_LABEL } from '#lib/dealMatching';
	import PriceHistory from '#lib/components/PriceHistory.svelte';

	let { data } = $props();

	const dateFmt = new Intl.DateTimeFormat('de-DE', { day: '2-digit', month: '2-digit' });
	let formEl: HTMLFormElement | undefined = $state();
	let openKey = $state<string | null>(null);
</script>

<svelte:head><title>Deals für mich — BonSync</title></svelte:head>

<div class="flex flex-col w-full pb-space-xl font-body-md text-on-surface">
	<div class="flex flex-col md:flex-row md:items-end justify-between gap-space-md mb-space-lg">
		<div>
			<div class="flex items-center gap-space-sm">
				<div class="flex items-center justify-center w-7 h-7 rounded-lg bg-surface-container-high shadow-inner text-primary">
					<i class="fa-solid fa-piggy-bank text-[18px]"></i>
				</div>
				<h1 class="font-headline-xl text-headline-xl font-bold tracking-tight">Deals für mich</h1>
			</div>
			<p class="font-body-md text-body-md text-on-surface-variant mt-0.5 pl-space-md">
				Aktuelle Angebote, die zu dem passen, was du in den letzten 12 Monaten gekauft hast.
			</p>
		</div>
		<form bind:this={formEl} method="POST" action="?/options" use:enhance={() => async ({ update }) => update({ reset: false })} class="flex flex-col gap-1 font-body-sm text-body-sm">
			<label class="flex items-center gap-2 cursor-pointer">
				<input type="checkbox" name="brand" checked={data.matchOptions.brand} onchange={() => formEl?.requestSubmit()} class="cursor-pointer" />
				Gleiche Marke zeigen <span class="text-outline">(z.B. Exquisa Sahnig ↔ Exquisa Skyr Drink)</span>
			</label>
			<label class="flex items-center gap-2 cursor-pointer">
				<input type="checkbox" name="category" checked={data.matchOptions.category} onchange={() => formEl?.requestSubmit()} class="cursor-pointer" />
				Ähnliche Produktart zeigen <span class="text-outline">(z.B. Pepsi Cola ↔ Coca-Cola)</span>
			</label>
		</form>
	</div>

	{#if !data.hasMarkets}
		<p class="rounded-xl bg-surface-container p-space-lg text-on-surface-variant font-body-sm text-body-sm">
			Noch keine Märkte gewählt. <a href="/angebote/maerkte" class="underline">Märkte auswählen</a>, damit Angebote geladen werden.
		</p>
	{:else if data.deals.length === 0}
		<p class="rounded-xl bg-surface-container p-space-lg text-on-surface-variant font-body-sm text-body-sm">
			Aktuell passt kein Angebot zu deinen Einkäufen. Eine großzügigere Stufe oben zeigt mehr Treffer.
		</p>
	{:else}
		<p class="mb-space-md font-body-sm text-body-sm text-on-surface-variant">
			<a href={data.showHidden ? '/deals' : '/deals?hidden=1'} class="underline">{data.showHidden ? 'Ausgeblendete verbergen' : 'Ausgeblendete Produkte anzeigen'}</a>
		</p>
		<div class="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-space-md">
			{#each data.deals as d (d.storeId + d.externalId)}
				{@const ui = data.storeUi[d.storeId]}
				<div class="rounded-xl bg-surface-container p-space-md shadow-md flex gap-space-md {d.hidden ? 'opacity-50' : ''}">
					{#if d.imageUrl}<img src="/angebote/bild?s={encodeURIComponent(d.storeId)}&id={encodeURIComponent(d.externalId)}" alt="" class="w-16 h-16 object-contain rounded bg-white shrink-0" loading="lazy" onerror={(e) => ((e.currentTarget as HTMLImageElement).style.display = 'none')} />{/if}
					<div class="min-w-0 flex-1">
						<div class="flex items-center gap-1.5 mb-1">
							<span class="w-2 h-2 rounded-full shrink-0" style="background:{ui?.color}"></span>
							<span class="font-label-mono-xs text-label-mono-xs text-on-surface-variant">{ui?.name ?? d.storeId}</span>
							<span class="ml-auto font-label-mono-xs text-label-mono-xs px-1.5 py-0.5 rounded bg-primary/20 text-primary">{d.count}× gekauft</span>
							<form method="POST" action={d.hidden ? '?/unhide' : '?/hide'} use:enhance>
								<input type="hidden" name="storeId" value={d.storeId} />
								<input type="hidden" name="title" value={d.title} />
								<button
									class="px-1.5 py-0.5 rounded text-outline hover:text-on-surface"
									title={d.hidden ? 'Wieder einblenden' : 'Dieses Produkt ausblenden'}
									aria-label={d.hidden ? 'Wieder einblenden' : 'Dieses Produkt ausblenden'}
								>
									<i class="fa-solid {d.hidden ? 'fa-eye' : 'fa-eye-slash'}"></i>
								</button>
							</form>
						</div>
						<div class="font-body-md text-body-md font-medium">{d.title}</div>
						<div class="flex flex-wrap items-baseline gap-x-2 mt-1">
							<span class="font-headline-sm text-headline-sm font-semibold whitespace-nowrap">{euro(d.priceCents)}</span>
							{#if d.originalPriceCents}<span class="font-body-sm text-body-sm text-outline line-through whitespace-nowrap">{euro(d.originalPriceCents)}</span>{/if}
							{#if d.unitPriceText}<span class="font-body-sm text-body-sm text-on-surface-variant">{d.unitPriceText}</span>{/if}
						</div>
						<div class="font-body-sm text-body-sm text-on-surface-variant mt-1">
							{MATCH_KIND_LABEL[d.kind]} · du kaufst: {d.items.map((i) => `${i.name} (${i.count}×)`).join(', ')}
						</div>
						{#if d.validTo}<div class="font-label-mono-xs text-label-mono-xs text-outline mt-1">gültig bis {dateFmt.format(d.validTo)}</div>{/if}
						<button
							type="button"
							class="mt-1 font-label-mono-xs text-label-mono-xs text-primary underline"
							aria-expanded={openKey === d.storeId + d.externalId}
							onclick={() => (openKey = openKey === d.storeId + d.externalId ? null : d.storeId + d.externalId)}
						>
							<i class="fa-solid fa-chart-line"></i> Preisverlauf
						</button>
						{#if openKey === d.storeId + d.externalId}<PriceHistory storeId={d.storeId} title={d.title} />{/if}
					</div>
				</div>
			{/each}
		</div>
	{/if}
</div>
