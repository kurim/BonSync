<script lang="ts">
	import { enhance } from '$app/forms';
	import { euro } from '#lib/stores-ui';
	import PriceHistory from '#lib/components/PriceHistory.svelte';

	let { data } = $props();

	const dateFmt = new Intl.DateTimeFormat('de-DE', { day: '2-digit', month: '2-digit' });
	const product = $derived(data.product);
</script>

<svelte:head><title>{product ? product.title : 'Überwachte Produkte'} — BonSync</title></svelte:head>

<div class="flex flex-col w-full pb-space-xl font-body-md text-on-surface">
	<a href="/deals" class="mb-space-md font-body-sm text-body-sm text-on-surface-variant underline w-fit"><i class="fa-solid fa-arrow-left"></i> Deals für mich</a>

	{#if product}
		{@const ui = data.storeUi[product.storeId]}
		<div class="rounded-xl bg-surface-container p-space-lg shadow-md max-w-xl">
			<div class="flex items-center gap-1.5 mb-1">
				<span class="w-2 h-2 rounded-full shrink-0" style="background:{ui?.color}"></span>
				<span class="font-label-mono-xs text-label-mono-xs text-on-surface-variant">{ui?.name ?? product.storeId}</span>
			</div>
			<h1 class="font-headline-sm text-headline-sm font-semibold">{product.title}</h1>
			{#if product.current}
				<div class="flex flex-wrap items-baseline gap-x-2 mt-1">
					<span class="font-headline-sm text-headline-sm font-semibold whitespace-nowrap">{euro(product.current.priceCents)}</span>
					{#if product.current.originalPriceCents}<span class="font-body-sm text-body-sm text-outline line-through whitespace-nowrap">{euro(product.current.originalPriceCents)}</span>{/if}
					{#if product.current.validTo}<span class="font-label-mono-xs text-label-mono-xs text-outline">aktuell im Angebot, gültig bis {dateFmt.format(product.current.validTo)}</span>{/if}
				</div>
			{:else}
				<p class="mt-1 font-body-sm text-body-sm text-on-surface-variant">Zurzeit nicht im Angebot.</p>
			{/if}

			<form method="POST" action={product.watched ? '?/unwatch' : '?/watch'} use:enhance={() => async ({ update }) => update({ reset: false })} class="mt-space-md">
				<input type="hidden" name="storeId" value={product.storeId} />
				<input type="hidden" name="title" value={product.title} />
				<button class="h-10 px-space-md rounded-xl font-body-sm text-body-sm {product.watched ? 'bg-surface-container-high' : 'bg-primary text-on-primary'}">
					<i class="fa-solid {product.watched ? 'fa-bell-slash' : 'fa-bell'}"></i>
					{product.watched ? 'Überwachung beenden' : 'Preis überwachen'}
				</button>
			</form>

			<h2 class="mt-space-lg font-label-mono-xs text-label-mono-xs text-on-surface-variant uppercase">Preisverlauf je Markt</h2>
			<PriceHistory storeId={product.storeId} title={product.title} />
		</div>
	{:else}
		<h1 class="font-headline-sm text-headline-sm font-semibold mb-space-md">Überwachte Produkte</h1>
		{#if data.watched.length === 0}
			<p class="rounded-xl bg-surface-container p-space-lg text-on-surface-variant font-body-sm text-body-sm">
				Noch keine Produkte überwacht. Unter „Deals für mich“ bei einem Produkt „Preis überwachen“ wählen.
			</p>
		{:else}
			<ul class="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-space-md">
				{#each data.watched as w (w.storeId + w.title)}
					{@const ui = data.storeUi[w.storeId]}
					<li>
						<a href="/deals/produkt?s={encodeURIComponent(w.storeId)}&t={encodeURIComponent(w.title)}" class="flex items-center gap-1.5 rounded-xl bg-surface-container p-space-md shadow-md">
							<span class="w-2 h-2 rounded-full shrink-0" style="background:{ui?.color}"></span>
							<span class="min-w-0 truncate">{w.title}</span>
							<span class="ml-auto font-label-mono-xs text-label-mono-xs text-on-surface-variant">{ui?.name ?? w.storeId}</span>
						</a>
					</li>
				{/each}
			</ul>
		{/if}
	{/if}
</div>
