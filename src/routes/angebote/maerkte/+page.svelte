<script lang="ts">
	import { enhance } from '$app/forms';

	let { data, form } = $props();
	let searchStore = $state('');
	$effect(() => {
		if (!searchStore && data.stores[0]) searchStore = data.stores[0].id;
	});
	const storeName = (id: string) => data.stores.find((s) => s.id === id)?.name ?? id;
	const storeColor = (id: string) => data.stores.find((s) => s.id === id)?.color;
</script>

<svelte:head><title>Märkte wählen — BonSync</title></svelte:head>

<div class="flex flex-col w-full pb-space-xl font-body-md text-on-surface gap-space-lg">
	<div>
		<a href="/angebote" class="font-body-sm text-body-sm text-on-surface-variant"><i class="fa-solid fa-arrow-left"></i> Angebote</a>
		<h1 class="font-headline-xl text-headline-xl font-bold tracking-tight mt-1">Märkte wählen</h1>
		<p class="font-body-md text-body-md text-on-surface-variant mt-0.5">Für diese Märkte werden Angebote geladen.</p>
	</div>

	{#if data.stores.length === 0}
		<p class="rounded-xl bg-surface-container p-space-lg text-on-surface-variant font-body-sm text-body-sm">
			Keines der installierten Module bietet Angebote an. Aktualisiere die Module im <a href="/store" class="underline">Modul-Store</a>.
		</p>
	{:else}
		{#if form?.syncResult}<p class="rounded-xl bg-surface-container p-space-md font-body-sm text-body-sm">{form.syncResult}</p>{/if}
		{#if form?.addError}<p class="rounded-xl bg-error-container text-on-error-container p-space-md font-body-sm text-body-sm">{form.addError}</p>{/if}

		<section class="flex flex-col gap-space-sm">
			<h2 class="font-headline-sm text-headline-sm font-semibold">Gewählte Märkte</h2>
			<div class="rounded-xl bg-surface-container p-space-md shadow-md">
				{#each data.selected as m (m.storeId + m.marketId)}
					<div class="flex items-center gap-space-sm py-2">
						<span class="w-2 h-2 rounded-full shrink-0" style="background:{storeColor(m.storeId)}"></span>
						<div class="min-w-0 flex-1">
							<div class="font-body-md text-body-md font-medium truncate">{storeName(m.storeId)} {m.name ?? ''}</div>
							<div class="font-body-sm text-body-sm text-on-surface-variant truncate">{m.street}, {m.zipCode} {m.city}</div>
						</div>
						<form method="POST" action="?/remove" use:enhance>
							<input type="hidden" name="storeId" value={m.storeId} />
							<input type="hidden" name="marketId" value={m.marketId} />
							<button class="px-2 py-1 rounded-lg bg-surface-container-high font-body-sm text-body-sm" aria-label="Markt entfernen"><i class="fa-solid fa-xmark"></i></button>
						</form>
					</div>
				{:else}
					<p class="font-body-sm text-body-sm text-on-surface-variant text-center py-space-md">Noch keine Märkte gewählt.</p>
				{/each}
			</div>
		</section>

		{#if data.suggestions.length > 0}
			<section class="flex flex-col gap-space-sm">
				<h2 class="font-headline-sm text-headline-sm font-semibold">Aus deinen Einkäufen</h2>
				<div class="rounded-xl bg-surface-container p-space-md shadow-md">
					{#each data.suggestions as f (f.storeId + f.street + f.zip)}
						<div class="flex items-center gap-space-sm py-2">
							<span class="w-2 h-2 rounded-full shrink-0" style="background:{storeColor(f.storeId)}"></span>
							<div class="min-w-0 flex-1">
								<div class="font-body-md text-body-md font-medium truncate">{f.name}</div>
								<div class="font-body-sm text-body-sm text-on-surface-variant truncate">{f.street}, {f.zip} {f.city} · {f.count} Einkauf{f.count === 1 ? '' : 'e'}</div>
							</div>
							<form method="POST" action="?/adopt" use:enhance>
								<input type="hidden" name="storeId" value={f.storeId} />
								<input type="hidden" name="street" value={f.street} />
								<input type="hidden" name="zip" value={f.zip} />
								<button class="px-3 py-1 rounded-lg bg-primary text-on-primary font-body-sm text-body-sm">Übernehmen</button>
							</form>
						</div>
					{/each}
				</div>
			</section>
		{/if}

		<section class="flex flex-col gap-space-sm">
			<h2 class="font-headline-sm text-headline-sm font-semibold">Per PLZ suchen</h2>
			<form method="POST" action="?/search" use:enhance={() => async ({ update }) => update({ reset: false })} class="flex flex-col sm:flex-row gap-space-sm">
				<select name="storeId" bind:value={searchStore} class="h-10 px-space-md bg-surface-container-low rounded-xl font-body-sm text-body-sm cursor-pointer">
					{#each data.stores as s (s.id)}<option value={s.id}>{s.name}</option>{/each}
				</select>
				<input name="zip" value={form?.zip ?? ''} placeholder="PLZ oder Ort" class="h-10 px-space-md flex-1 bg-surface-container-low rounded-xl placeholder:text-outline font-body-sm text-body-sm shadow-inner" />
				<button class="h-10 px-space-md rounded-xl bg-primary text-on-primary font-body-sm text-body-sm">Suchen</button>
			</form>
			{#if form?.searchError}<p class="font-body-sm text-body-sm text-error">{form.searchError}</p>{/if}
			{#if form?.results}
				<div class="rounded-xl bg-surface-container p-space-md shadow-md">
					{#each form.results as m (m.id)}
						<div class="flex items-center gap-space-sm py-2">
							<div class="min-w-0 flex-1">
								<div class="font-body-md text-body-md font-medium truncate">{m.name ?? storeName(form.storeId)}</div>
								<div class="font-body-sm text-body-sm text-on-surface-variant truncate">{m.street}, {m.zipCode} {m.city}</div>
							</div>
							<form method="POST" action="?/add" use:enhance>
								<input type="hidden" name="storeId" value={form.storeId} />
								<input type="hidden" name="marketId" value={m.id} />
								<input type="hidden" name="name" value={m.name ?? ''} />
								<input type="hidden" name="street" value={m.street ?? ''} />
								<input type="hidden" name="zipCode" value={m.zipCode ?? ''} />
								<input type="hidden" name="city" value={m.city ?? ''} />
								<button class="px-3 py-1 rounded-lg bg-primary text-on-primary font-body-sm text-body-sm">Hinzufügen</button>
							</form>
						</div>
					{:else}
						<p class="font-body-sm text-body-sm text-on-surface-variant text-center py-space-md">Keine Märkte gefunden.</p>
					{/each}
				</div>
			{/if}
		</section>
	{/if}
</div>
