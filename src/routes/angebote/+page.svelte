<script lang="ts">
	import { enhance } from '$app/forms';
	import { euro } from '#lib/stores-ui';

	let { data, form } = $props();

	let search = $state('');
	let storeFilter = $state('');
	let categoryFilter = $state('');
	let refreshing = $state(false);

	const filtered = $derived(
		data.offers.filter(
			(o) =>
				(!storeFilter || o.storeId === storeFilter) &&
				(!categoryFilter || o.categories.includes(categoryFilter)) &&
				(!search.trim() || `${o.brand ?? ''} ${o.title}`.toLowerCase().includes(search.trim().toLowerCase()))
		)
	);
	const categories = $derived([...new Set(data.offers.flatMap((o) => o.categories))].sort((a, b) => a.localeCompare(b, 'de')));
	const storeIds = $derived([...new Set(data.offers.map((o) => o.storeId))]);
	const dateFmt = new Intl.DateTimeFormat('de-DE', { day: '2-digit', month: '2-digit' });
</script>

<svelte:head><title>Angebote — BonSync</title></svelte:head>

<div class="flex flex-col w-full pb-space-xl font-body-md text-on-surface">
	<div class="flex flex-col md:flex-row md:items-end justify-between gap-space-md mb-space-lg">
		<div>
			<div class="flex items-center gap-space-sm">
				<div class="flex items-center justify-center w-7 h-7 rounded-lg bg-surface-container-high shadow-inner text-primary">
					<i class="fa-solid fa-tags text-[18px]"></i>
				</div>
				<h1 class="font-headline-xl text-headline-xl text-on-surface font-bold tracking-tight">Angebote</h1>
			</div>
			<p class="font-body-md text-body-md text-on-surface-variant mt-0.5 pl-space-md">Aktuelle Angebote aller Händler für deine gewählten Märkte.</p>
		</div>
		<div class="flex items-center gap-space-sm">
			<a href="/angebote/maerkte" class="h-10 px-space-md inline-flex items-center gap-2 rounded-xl bg-surface-container-high font-body-sm text-body-sm">
				<i class="fa-solid fa-location-dot"></i> Märkte wählen
			</a>
			<form
				method="POST"
				action="?/refresh"
				use:enhance={() => {
					refreshing = true;
					return async ({ update }) => {
						await update();
						refreshing = false;
					};
				}}
			>
				<button class="h-10 px-space-md inline-flex items-center gap-2 rounded-xl bg-primary text-on-primary font-body-sm text-body-sm" disabled={refreshing || !data.hasMarkets}>
					<i class="fa-solid fa-rotate {refreshing ? 'fa-spin' : ''}"></i> Aktualisieren
				</button>
			</form>
		</div>
	</div>

	{#if form?.refreshError}
		<p class="mb-space-md rounded-xl bg-error-container text-on-error-container p-space-md font-body-sm text-body-sm">{form.refreshError}</p>
	{/if}

	{#if form?.refreshed}
		<p class="mb-space-md rounded-xl bg-surface-container p-space-md font-body-sm text-body-sm">
			Geladen: {form.refreshed.map((r) => `${data.storeUi[r.storeId]?.name ?? r.storeId} ${r.count} Angebot${r.count === 1 ? '' : 'e'}`).join(', ') || 'kein Händler mit gewähltem Markt'}.
		</p>
	{/if}

	{#if !data.offersSupported}
		<p class="rounded-xl bg-surface-container p-space-lg text-on-surface-variant font-body-sm text-body-sm">
			Keines der installierten Module liefert Angebote. Aktualisiere die Module im <a href="/store" class="underline">Modul-Store</a>.
		</p>
	{:else if !data.hasMarkets}
		<p class="rounded-xl bg-surface-container p-space-lg text-on-surface-variant font-body-sm text-body-sm">
			Noch keine Märkte gewählt. <a href="/angebote/maerkte" class="underline">Märkte auswählen</a>, um Angebote zu sehen.
		</p>
	{:else}
		<div class="flex flex-col sm:flex-row gap-space-sm mb-space-md">
			<input
				class="h-10 px-space-md flex-1 bg-surface-container-low rounded-xl text-on-surface placeholder:text-outline font-body-sm text-body-sm shadow-inner"
				placeholder="Angebot suchen …"
				bind:value={search}
			/>
			<select class="h-10 px-space-md bg-surface-container-low rounded-xl font-body-sm text-body-sm cursor-pointer" bind:value={storeFilter}>
				<option value="">Alle Händler</option>
				{#each storeIds as id (id)}<option value={id}>{data.storeUi[id]?.name ?? id}</option>{/each}
			</select>
			{#if categories.length > 0}
				<select class="h-10 px-space-md bg-surface-container-low rounded-xl font-body-sm text-body-sm cursor-pointer" bind:value={categoryFilter} aria-label="Kategorie">
					<option value="">Alle Kategorien</option>
					{#each categories as c (c)}<option value={c}>{c}</option>{/each}
				</select>
			{/if}
		</div>
		{#if data.hiddenCount > 0}
			<p class="mb-space-md font-body-sm text-body-sm text-on-surface-variant">
				{data.hiddenCount} Produkt{data.hiddenCount === 1 ? '' : 'e'} ausgeblendet ·
				<a href={data.showHidden ? '/angebote' : '/angebote?hidden=1'} class="underline">{data.showHidden ? 'Ausgeblendete verbergen' : 'Ausgeblendete anzeigen'}</a>
			</p>
		{/if}

		{#if filtered.length === 0}
			<p class="rounded-xl bg-surface-container p-space-lg text-on-surface-variant font-body-sm text-body-sm">
				Keine Angebote gefunden. Mit „Aktualisieren“ werden sie neu geladen.
			</p>
		{:else}
			<div class="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-space-md">
				{#each filtered as o (o.storeId + o.externalId)}
					{@const ui = data.storeUi[o.storeId]}
					<div class="rounded-xl bg-surface-container p-space-md shadow-md flex gap-space-md {o.hidden ? 'opacity-50' : ''}">
						{#if o.imageUrl}<img src="/angebote/bild?s={encodeURIComponent(o.storeId)}&id={encodeURIComponent(o.externalId)}" alt="" class="w-16 h-16 object-contain rounded bg-white shrink-0" loading="lazy" onerror={(e) => ((e.currentTarget as HTMLImageElement).style.display = 'none')} />{/if}
						<div class="min-w-0 flex-1">
							<div class="flex items-center gap-1.5 mb-1">
								<span class="w-2 h-2 rounded-full shrink-0" style="background:{ui?.color}"></span>
								<span class="font-label-mono-xs text-label-mono-xs text-on-surface-variant">{ui?.name ?? o.storeId}</span>
								<form method="POST" action={o.hidden ? '?/unhide' : '?/hide'} use:enhance class="ml-auto">
									<input type="hidden" name="storeId" value={o.storeId} />
									<input type="hidden" name="title" value={o.title} />
									<button
										class="px-1.5 py-0.5 rounded text-outline hover:text-on-surface"
										title={o.hidden ? 'Wieder einblenden' : 'Dieses Produkt ausblenden'}
										aria-label={o.hidden ? 'Wieder einblenden' : 'Dieses Produkt ausblenden'}
									>
										<i class="fa-solid {o.hidden ? 'fa-eye' : 'fa-eye-slash'}"></i>
									</button>
								</form>
							</div>
							<div class="font-body-md text-body-md font-medium">{o.title}</div>
							{#if o.brand}<div class="font-body-sm text-body-sm text-on-surface-variant">{o.brand}</div>{/if}
							<div class="flex flex-wrap items-baseline gap-x-2 mt-1">
								<span class="font-headline-sm text-headline-sm font-semibold whitespace-nowrap">{euro(o.priceCents)}</span>
								{#if o.originalPriceCents}<span class="font-body-sm text-body-sm text-outline line-through whitespace-nowrap">{euro(o.originalPriceCents)}</span>{/if}
							</div>
							{#if o.unitPriceText}<div class="font-body-sm text-body-sm text-on-surface-variant">{o.unitPriceText}</div>{/if}
							{#if o.validFrom || o.validTo}
								<div class="font-label-mono-xs text-label-mono-xs text-outline mt-1">
									{o.validFrom && o.validFrom > Date.now() ? `ab ${dateFmt.format(o.validFrom)} ` : ''}{o.validTo ? `gültig bis ${dateFmt.format(o.validTo)}` : ''}
								</div>
							{/if}
						</div>
					</div>
				{/each}
			</div>
		{/if}
	{/if}
</div>
