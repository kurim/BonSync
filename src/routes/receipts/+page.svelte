<script lang="ts">
	import { goto } from '$app/navigation';
	import { getStoreUi, euro } from '$lib/stores-ui';

	let { data } = $props();

	// UI-Werte kommen server-seitig aus der Modul-Registry (data.storeUi, siehe +page.server.ts);
	// Fallback nur für Belege eines mittlerweile deinstallierten Moduls, das in `data.storeUi`
	// (nur aktuell installierte Module) nicht mehr auftaucht.
	function storeUi(id: string) {
		return data.storeUi[id] ?? getStoreUi(id);
	}

	// svelte-ignore state_referenced_locally -- bewusst nur als initialer Wert für das editierbare Feld
	let searchValue = $state(data.search);
	let searchInputEl: HTMLInputElement;

	function updateQuery(params: Record<string, string>) {
		const url = new URL(window.location.href);
		for (const [k, v] of Object.entries(params)) {
			if (v) url.searchParams.set(k, v);
			else url.searchParams.delete(k);
		}
		// Seitenwechsel/Filter/Suche setzen die Paginierung zurück, außer es wird explizit die
		// Seite selbst geändert (sonst würde man z.B. bei einer neuen Suche auf Seite 5 landen).
		if (!('page' in params)) url.searchParams.delete('page');
		goto(url.pathname + url.search, { keepFocus: true, noScroll: true });
	}

	let searchTimer: ReturnType<typeof setTimeout>;
	function onSearchInput(e: Event) {
		searchValue = (e.target as HTMLInputElement).value;
		clearTimeout(searchTimer);
		searchTimer = setTimeout(() => updateQuery({ q: searchValue }), 300);
	}

	function onKeydown(e: KeyboardEvent) {
		if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
			e.preventDefault();
			searchInputEl?.focus();
		}
	}

	const rangeStart = $derived((data.page - 1) * data.pageSize + 1);
	const rangeEnd = $derived(Math.min(data.page * data.pageSize, data.total));
</script>

<svelte:head><title>Kassenzettel — BonSync</title></svelte:head>
<svelte:window onkeydown={onKeydown} />

<div class="flex flex-col w-full pb-space-xl font-body-md text-on-surface">
	<!-- Titel + Live-Kennzahlen -->
	<div class="flex flex-col md:flex-row md:items-end justify-between gap-space-md mb-space-lg">
		<div>
			<div class="flex items-center gap-space-sm">
				<div class="flex items-center justify-center w-7 h-7 rounded-lg bg-surface-container-high shadow-inner text-primary">
					<i class="fa-solid fa-receipt text-[18px]"></i>
				</div>
				<h1 class="font-headline-xl text-headline-xl text-on-surface font-bold tracking-tight">Kassenzettel</h1>
			</div>
			<p class="font-body-md text-body-md text-on-surface-variant mt-0.5 pl-space-md">
				<span class="font-label-mono-md text-label-mono-md font-semibold text-on-surface">{data.total}</span> Beleg{data.total === 1 ? '' : 'e'} gefunden
			</p>
		</div>
		<div class="flex flex-wrap items-center gap-space-sm">
			<div class="flex items-center gap-space-sm px-space-md py-space-xs rounded-xl bg-surface-container shadow-sm">
				<div class="w-8 h-8 rounded-lg bg-secondary-container/50 flex items-center justify-center text-secondary">
					<i class="fa-solid fa-wallet text-[18px]"></i>
				</div>
				<div class="flex flex-col">
					<span class="font-label-mono-xs text-label-mono-xs text-outline">Diesen Monat</span>
					<span class="font-label-mono-sm text-label-mono-sm font-semibold text-on-surface">{euro(data.monthCents)}</span>
				</div>
			</div>
		</div>
	</div>

	<!-- Suche + Händler-Filter -->
	<div class="flex flex-col gap-space-md mb-space-lg">
		<div class="relative w-full">
			<div class="absolute inset-y-0 left-0 pl-space-md flex items-center pointer-events-none text-outline">
				<i class="fa-solid fa-magnifying-glass text-[18px]"></i>
			</div>
			<input
				bind:this={searchInputEl}
				class="w-full h-12 pl-12 pr-space-md bg-surface-container-low rounded-xl text-on-surface placeholder:text-outline font-body-md text-body-md focus:outline-none focus:bg-surface-container transition-all shadow-inner"
				placeholder="Markt oder Ort suchen …"
				type="text"
				value={searchValue}
				oninput={onSearchInput}
			/>
			<div class="absolute inset-y-0 right-0 pr-space-md flex items-center gap-space-xs pointer-events-none">
				<span class="font-label-mono-xs text-label-mono-xs px-1.5 py-0.5 rounded bg-surface-container-high text-outline">⌘K</span>
			</div>
		</div>

		<div class="flex items-center gap-space-xs overflow-x-auto pb-1">
			<button
				class={[
					'flex items-center px-4 py-1.5 rounded-md font-label-mono-sm text-label-mono-sm font-semibold transition-all whitespace-nowrap cursor-pointer',
					data.storeFilter === 'all' ? 'bg-on-surface text-surface shadow-md' : 'bg-surface-container-low hover:bg-surface-container text-on-surface-variant hover:text-on-surface font-medium'
				]}
				type="button"
				onclick={() => updateQuery({ store: 'all' })}
			>
				Alle
			</button>
			{#each data.availableStores as id (id)}
				{@const meta = storeUi(id)}
				<button
					class={[
						'flex items-center gap-2 px-4 py-1.5 rounded-md font-label-mono-sm text-label-mono-sm transition-all whitespace-nowrap cursor-pointer',
						data.storeFilter === id ? 'bg-on-surface text-surface shadow-md font-semibold' : 'font-medium'
					]}
					style={data.storeFilter === id
						? ''
						: `background:color-mix(in srgb, ${meta.color} 16%, transparent); color:${meta.color}; border:1px solid color-mix(in srgb, ${meta.color} 35%, transparent);`}
					type="button"
					onclick={() => updateQuery({ store: id })}
				>
					<span class="w-2 h-2 rounded-full" style="background:{meta.color}"></span>
					{meta.name}
				</button>
			{/each}
		</div>
	</div>

	<!-- Beleg-Tabelle -->
	<div class="w-full rounded-2xl bg-surface-container-low shadow-xl overflow-hidden flex flex-col">
		<div class="overflow-x-auto w-full">
			<table class="w-full text-left border-collapse">
				<thead>
					<tr class="bg-surface-container-lowest/60 text-outline uppercase font-label-mono-xs text-label-mono-xs tracking-wider">
						<th class="py-space-md px-space-lg font-medium" scope="col">Markt</th>
						<th class="py-space-md px-space-md font-medium text-right" scope="col">Datum</th>
						<th class="py-space-md px-space-md font-medium" scope="col">Filiale / Ort</th>
						<th class="py-space-md px-space-md font-medium text-center" scope="col">Artikel</th>
						<th class="py-space-md px-space-md font-medium text-right" scope="col">Betrag</th>
						<th class="py-space-md px-space-lg font-medium text-right" scope="col">Aktionen</th>
					</tr>
				</thead>
				<tbody class="divide-y divide-surface-container/30 text-on-surface font-body-md text-body-md">
					{#each data.receipts as r (r.id)}
						{@const meta = storeUi(r.storeId)}
						<tr class="group hover:bg-surface-container/60 transition-colors cursor-pointer" onclick={() => goto(`/receipts/${r.id}`)}>
							<td class="py-2.5 px-space-lg whitespace-nowrap">
								<span
									class="inline-flex flex-shrink-0 items-center justify-center gap-1.5 py-1 px-2 rounded-md text-[10px] font-extrabold uppercase tracking-wider text-center"
									style="background:color-mix(in srgb, {meta.color} 16%, transparent); color:{meta.color}; border:1px solid color-mix(in srgb, {meta.color} 35%, transparent);"
								>
									<span class="w-1.5 h-1.5 rounded-full" style="background:{meta.color}"></span>{meta.name}
								</span>
							</td>
							<td class="py-2.5 px-space-md whitespace-nowrap text-right font-label-mono-sm text-label-mono-sm text-on-surface-variant">
								{new Date(r.timestamp).toLocaleDateString('de-DE')} <span class="text-outline mx-1">·</span> {new Date(r.timestamp).toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' })}
							</td>
							<td class="py-2.5 px-space-md whitespace-nowrap font-body-md text-body-md text-on-surface">
								{r.marketName ?? '—'}{r.marketCity ? `, ${r.marketCity}` : ''}
							</td>
							<td class="py-2.5 px-space-md whitespace-nowrap text-center font-label-mono-sm text-label-mono-sm font-semibold text-on-surface">
								{r.itemCount > 0 ? r.itemCount : '—'}
							</td>
							<td class="py-2.5 px-space-md whitespace-nowrap text-right font-label-mono-md text-label-mono-md font-bold text-on-surface">
								{euro(r.totalCents)}
							</td>
							<td class="py-2.5 px-space-lg whitespace-nowrap text-right">
								{#if r.pdfFetched}
									<a
										class="inline-flex items-center justify-center w-8 h-8 rounded-lg bg-surface-container text-on-surface-variant group-hover:text-primary group-hover:bg-primary/10 transition-colors"
										href="/receipts/{r.id}/pdf"
										target="_blank"
										title="PDF öffnen"
										onclick={(e) => e.stopPropagation()}
									>
										<i class="fa-solid fa-file-pdf text-[18px]"></i>
									</a>
								{/if}
							</td>
						</tr>
					{:else}
						<tr>
							<td colspan="6">
								<div class="flex flex-col items-center justify-center py-16 text-center px-4">
									<div class="w-12 h-12 rounded-full bg-surface-container flex items-center justify-center text-outline mb-3">
										<i class="fa-solid fa-magnifying-glass-minus text-[22px]"></i>
									</div>
									<p class="font-headline-sm text-headline-sm font-semibold text-on-surface">Keine Belege gefunden</p>
									<p class="font-body-sm text-body-sm text-on-surface-variant mt-1 max-w-sm">Passe deinen Suchbegriff oder die Händler-Filterung an.</p>
								</div>
							</td>
						</tr>
					{/each}
				</tbody>
			</table>
		</div>

		{#if data.total > 0}
			<div class="p-space-md bg-surface-container-lowest/50 flex flex-col sm:flex-row items-center justify-between gap-space-sm">
				<div class="flex items-center gap-space-xs text-on-surface-variant font-label-mono-xs text-label-mono-xs">
					<span>Zeige</span>
					<span class="font-semibold text-on-surface">{rangeStart}–{rangeEnd}</span>
					<span>von</span>
					<span class="font-semibold text-on-surface">{data.total}</span>
					<span>Belegen</span>
				</div>
				<div class="flex items-center gap-space-sm">
					<span class="font-label-mono-xs text-label-mono-xs text-outline">Seite {data.page} von {data.pageCount}</span>
					<div class="flex items-center gap-1">
						<button
							class={[
								'w-8 h-8 rounded-lg flex items-center justify-center transition-colors',
								data.page <= 1 ? 'bg-surface-container text-outline opacity-40 cursor-not-allowed' : 'bg-surface-container hover:bg-surface-container-high text-on-surface'
							]}
							type="button"
							disabled={data.page <= 1}
							onclick={() => updateQuery({ page: String(data.page - 1) })}
							aria-label="Vorherige Seite"
						>
							<i class="fa-solid fa-chevron-left text-[16px]"></i>
						</button>
						<button
							class={[
								'w-8 h-8 rounded-lg flex items-center justify-center transition-colors',
								data.page >= data.pageCount ? 'bg-surface-container text-outline opacity-40 cursor-not-allowed' : 'bg-surface-container hover:bg-surface-container-high text-on-surface'
							]}
							type="button"
							disabled={data.page >= data.pageCount}
							onclick={() => updateQuery({ page: String(data.page + 1) })}
							aria-label="Nächste Seite"
						>
							<i class="fa-solid fa-chevron-right text-[16px]"></i>
						</button>
					</div>
				</div>
			</div>
		{/if}
	</div>
</div>
