<script lang="ts">
	import { onMount, onDestroy } from 'svelte';
	import { getStoreUi } from '$lib/stores-ui';

	let { data } = $props();

	// UI-Werte kommen server-seitig aus der Modul-Registry (data.storeUi, siehe +page.server.ts);
	// Fallback nur für Belege eines mittlerweile deinstallierten Moduls, das in `data.storeUi`
	// (nur aktuell installierte Module) nicht mehr auftaucht.
	function storeUi(id: string) {
		return data.storeUi[id] ?? getStoreUi(id);
	}

	let searchValue = $state('');
	const filteredFilialen = $derived(
		searchValue.trim()
			? data.filialen.filter((f) => `${f.name} ${f.street} ${f.city}`.toLowerCase().includes(searchValue.toLowerCase()))
			: data.filialen
	);

	// --- Leaflet-Karte (nur Client, Leaflet braucht `window`) ---
	let mapEl: HTMLDivElement | undefined = $state();
	let mapInstance: import('leaflet').Map | null = null;

	onMount(async () => {
		if (!mapEl || !data.mapTileUrl) return;
		const L = (await import('leaflet')).default;
		await import('leaflet/dist/leaflet.css');

		const map = L.map(mapEl, { zoomControl: true, attributionControl: true });
		mapInstance = map;
		L.tileLayer(data.mapTileUrl, {
			attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> &copy; <a href="https://www.maptiler.com/copyright/">MapTiler</a>',
			maxZoom: 19
		}).addTo(map);

		const withCoords = data.filialen.filter((f) => f.lat != null && f.lon != null);
		if (withCoords.length > 0) {
			const bounds = L.latLngBounds(withCoords.map((f) => [f.lat as number, f.lon as number]));
			for (const f of withCoords) {
				const color = storeUi(f.storeId).color;
				L.circleMarker([f.lat as number, f.lon as number], {
					radius: 9,
					color,
					fillColor: color,
					fillOpacity: 0.85,
					weight: 2
				})
					.addTo(map)
					.bindPopup(`<b>${f.name}</b><br>${f.street}, ${f.zip} ${f.city}<br>${f.count} Einkauf${f.count === 1 ? '' : 'e'}`);
			}
			map.fitBounds(bounds.pad(0.25));
		} else {
			map.setView([51.16, 10.45], 6); // Deutschland-Übersicht als Fallback
		}
	});

	onDestroy(() => {
		mapInstance?.remove();
	});
</script>

<svelte:head><title>Filial-Standorte — BonSync</title></svelte:head>

<div class="flex flex-col w-full pb-space-xl font-body-md text-on-surface">
	<div class="flex flex-col md:flex-row md:items-end justify-between gap-space-md mb-space-lg">
		<div>
			<div class="flex items-center gap-space-sm">
				<div class="flex items-center justify-center w-7 h-7 rounded-lg bg-surface-container-high shadow-inner text-primary">
					<i class="fa-solid fa-location-dot text-[18px]"></i>
				</div>
				<h1 class="font-headline-xl text-headline-xl text-on-surface font-bold tracking-tight">Filial-Standorte</h1>
			</div>
			<p class="font-body-md text-body-md text-on-surface-variant mt-0.5 pl-space-md">
				Adressen stammen direkt aus deinen synchronisierten Belegen und werden bei jedem Sync aktualisiert.
			</p>
		</div>
		<div class="relative w-full md:w-80">
			<div class="absolute inset-y-0 left-0 pl-space-md flex items-center pointer-events-none text-outline">
				<i class="fa-solid fa-magnifying-glass text-[16px]"></i>
			</div>
			<input
				class="w-full h-10 pl-11 pr-space-md bg-surface-container-low rounded-xl text-on-surface placeholder:text-outline font-body-sm text-body-sm focus:outline-none focus:bg-surface-container transition-all shadow-inner"
				placeholder="Filiale oder Ort suchen …"
				type="text"
				bind:value={searchValue}
			/>
		</div>
	</div>

	<div class="grid grid-cols-1 md:grid-cols-12 gap-space-lg items-start">
		<!-- Karte -->
		<section class="col-span-7 flex flex-col gap-space-md">
			{#if data.mapTileUrl}
				<div bind:this={mapEl} class="w-full h-[560px] rounded-xl overflow-hidden bg-surface-container-low shadow-md"></div>
			{:else}
				<div class="w-full h-[560px] rounded-xl bg-surface-container p-space-lg flex flex-col items-center justify-center text-center gap-2 shadow-md">
					<i class="fa-solid fa-map-location-dot text-[28px] text-outline"></i>
					<p class="font-body-sm text-body-sm text-on-surface-variant max-w-sm">
						Karte nicht konfiguriert. In <code class="font-label-mono-xs text-label-mono-xs bg-surface-container-high px-1 rounded">.env</code> einen
						<code class="font-label-mono-xs text-label-mono-xs bg-surface-container-high px-1 rounded">MAPTILER_API_KEY</code> hinterlegen (kostenloser Key unter maptiler.com), um Filialen auf einer Karte zu sehen.
					</p>
				</div>
			{/if}
		</section>

		<!-- Liste -->
		<section class="col-span-5 flex flex-col gap-space-md">
			<div class="flex items-center justify-between">
				<h2 class="font-headline-sm text-headline-sm font-semibold flex items-center gap-2">
					<i class="fa-solid fa-list text-[18px] text-primary"></i>
					Filialen
				</h2>
				<span class="font-label-mono-xs text-label-mono-xs text-outline">{filteredFilialen.length} von {data.filialen.length}</span>
			</div>
			<div class="rounded-xl bg-surface-container p-space-md shadow-md">
				{#if filteredFilialen.length > 0}
					<div class="flex flex-col divide-y divide-surface-container-high/60">
						{#each filteredFilialen as f, i (f.address + f.storeId)}
							{@const ui = storeUi(f.storeId)}
							<div class="flex items-center gap-space-sm py-2">
								<span class="w-2 h-2 rounded-full shrink-0" style="background:{ui.color}"></span>
								<div class="min-w-0 flex-1">
									<div class="flex items-center gap-1.5">
										<span class="font-body-md text-body-md font-medium text-on-surface truncate">{f.name}</span>
										{#if i === 0}<span class="font-label-mono-xs text-label-mono-xs px-1.5 py-0.5 rounded bg-primary/20 text-primary shrink-0">Meistbesucht</span>{/if}
									</div>
									<div class="font-body-sm text-body-sm text-on-surface-variant truncate">{f.street}, {f.zip} {f.city}</div>
								</div>
								<span class="font-label-mono-sm text-label-mono-sm font-semibold text-on-surface shrink-0">{f.count} Einkauf{f.count === 1 ? '' : 'e'}</span>
							</div>
						{/each}
					</div>
				{:else}
					<p class="font-body-sm text-body-sm text-on-surface-variant text-center py-space-md">Noch keine Filialen mit Adressdaten synchronisiert.</p>
				{/if}
			</div>
		</section>
	</div>
</div>
