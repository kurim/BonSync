<script lang="ts">
	import { untrack } from 'svelte';
	import { enhance } from '$app/forms';
	import { getStoreUi, timeAgo, euro } from '$lib/stores-ui';
	import ConfirmUninstallDialog from '$lib/components/ConfirmUninstallDialog.svelte';

	let { data, form } = $props();

	interface FlowState {
		authorizeUrl?: string;
		error?: string;
		success?: boolean;
	}
	let flow = $state<Record<string, FlowState>>({});

	$effect(() => {
		if (!form || !('storeId' in form)) return;
		const id = form.storeId as string;
		untrack(() => {
			const next: FlowState = { ...flow[id] };
			if (form && 'authorizeUrl' in form) next.authorizeUrl = form.authorizeUrl as string;
			if (form && 'error' in form) next.error = form.error as string;
			if (form && 'success' in form && form.success) {
				next.success = true;
				next.authorizeUrl = undefined;
			}
			flow = { ...flow, [id]: next };
		});
	});

	function statusLabel(status: string) {
		if (status === 'connected') return 'Verbunden';
		if (status === 'expiring') return 'Token läuft ab';
		if (status === 'error') return 'Handlung nötig';
		return 'Login erforderlich';
	}

	type Category = 'active' | 'attention' | 'offline';
	function statusCategory(s: { enabled: boolean; status: string }): Category {
		if (s.status === 'error' || s.status === 'expiring') return 'attention';
		if (s.enabled && s.status === 'connected') return 'active';
		return 'offline';
	}

	function redirectHint(kind: string) {
		if (kind === 'oauth-pkce-manual') {
			return 'Login-Redirect ist ein Custom-URI-Scheme, das der Browser nicht öffnen kann. Nach dem Login die resultierende URL aus der Adressleiste hier einfügen.';
		}
		return 'Der Redirect zeigt ggf. eine Fehlerseite (die Domain gehört dem Markt, nicht BonSync) — der Code steht trotzdem in der Adressleiste. Diese URL hier einfügen.';
	}

	let searchValue = $state('');
	let statusFilter = $state<'all' | Category>('all');
	let searchInputEl: HTMLInputElement;

	const implementedStores = $derived(data.stores.filter((s) => s.implemented));
	const statusCounts = $derived({
		all: implementedStores.length,
		active: implementedStores.filter((s) => statusCategory(s) === 'active').length,
		attention: implementedStores.filter((s) => statusCategory(s) === 'attention').length,
		offline: implementedStores.filter((s) => statusCategory(s) === 'offline').length
	});

	const filteredStores = $derived(
		data.stores.filter((s) => {
			if (statusFilter !== 'all' && (!s.implemented || statusCategory(s) !== statusFilter)) return false;
			if (!searchValue.trim()) return true;
			const q = searchValue.toLowerCase();
			return s.displayName.toLowerCase().includes(q) || s.capabilities.some((c) => c.toLowerCase().includes(q));
		})
	);

	function onKeydown(e: KeyboardEvent) {
		if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
			e.preventDefault();
			searchInputEl?.focus();
		}
	}

	/** Schließt alle offenen Modul-Menüs (<details class="store-menu">), sobald außerhalb
	 * geklickt wird -- native <details> kennt das sonst nicht. */
	function closeMenusOnOutsideClick(e: MouseEvent) {
		document.querySelectorAll('details.store-menu[open]').forEach((el) => {
			if (!el.contains(e.target as Node)) el.removeAttribute('open');
		});
	}

	let syncingAll = $state(false);
	let uninstallDialogs: Record<string, { open: () => void } | undefined> = {};

	const connectionRatePct = $derived(data.syncStatus.enabledCount > 0 ? Math.round((data.syncStatus.connectedCount / data.syncStatus.enabledCount) * 100) : 0);
	const savingsRatePct = $derived(data.totalReceipts > 0 ? Math.round((data.receiptsWithSavings / data.totalReceipts) * 100) : 0);
</script>

<svelte:head><title>Händler-Schnittstellen — BonSync</title></svelte:head>
<svelte:window onkeydown={onKeydown} onclick={closeMenusOnOutsideClick} />

<div class="flex flex-col w-full pb-space-xl font-body-md text-on-surface">
	<div class="flex flex-col md:flex-row md:items-end justify-between gap-space-md mb-space-lg">
		<div>
			<div class="flex items-center gap-space-sm">
				<div class="flex items-center justify-center w-7 h-7 rounded-lg bg-surface-container-high shadow-inner text-primary">
					<i class="fa-regular fa-cloud text-[18px]"></i>
				</div>
				<h1 class="font-headline-xl text-headline-xl text-on-surface font-bold tracking-tight">Händler-Schnittstellen</h1>
			</div>
			<p class="font-body-md text-body-md text-on-surface-variant mt-0.5 pl-space-md">
				Angebundene Händlerkonten verwalten, Zugangsdaten pflegen, manuell synchronisieren.
			</p>
		</div>
		<form
			method="POST"
			action="?/syncAll"
			use:enhance={() => {
				syncingAll = true;
				return async ({ update }) => {
					syncingAll = false;
					await update();
				};
			}}
		>
			<button
				class="flex items-center gap-space-xs px-space-md h-10 rounded-lg bg-primary text-on-primary-container font-label-mono-sm text-label-mono-sm font-semibold shadow-sm hover:brightness-110 transition-all disabled:opacity-60"
				type="submit"
				disabled={syncingAll}
			>
				<i class="fa-solid fa-arrows-rotate text-[18px]"></i>
				{syncingAll ? 'Synchronisiere…' : 'Alle synchronisieren'}
			</button>
		</form>
	</div>

	<!-- Kennzahlen -->
	<div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-space-sm mb-space-lg">
		<div class="rounded-xl bg-surface-container p-space-md shadow-sm flex flex-col gap-space-xs">
			<div class="flex items-center justify-between">
				<span class="font-label-mono-xs text-label-mono-xs text-outline uppercase tracking-wider">Verbundene Händler</span>
				<div class="w-8 h-8 rounded-lg bg-surface-container-high flex items-center justify-center text-primary shrink-0">
					<i class="fa-solid fa-store text-[16px]"></i>
				</div>
			</div>
			<span class="font-headline-md text-headline-md font-bold text-on-surface">{implementedStores.length} Märkte</span>
			<div class="flex items-center justify-between font-label-mono-xs text-label-mono-xs text-outline">
				<span>{data.syncStatus.connectedCount} von {data.syncStatus.enabledCount} aktiv synchronisiert</span>
				<span class="text-on-surface font-semibold">{connectionRatePct}%</span>
			</div>
			<div class="h-1 rounded-full bg-surface-container-high overflow-hidden">
				<div class="h-full bg-primary rounded-full" style="width:{connectionRatePct}%"></div>
			</div>
		</div>

		<div class="rounded-xl bg-surface-container p-space-md shadow-sm flex flex-col gap-space-xs">
			<div class="flex items-center justify-between">
				<span class="font-label-mono-xs text-label-mono-xs text-outline uppercase tracking-wider">Automatisch importiert</span>
				<div class="w-8 h-8 rounded-lg bg-surface-container-high flex items-center justify-center text-primary shrink-0">
					<i class="fa-solid fa-receipt text-[16px]"></i>
				</div>
			</div>
			<span class="font-headline-md text-headline-md font-bold text-on-surface">{data.totalReceipts} Belege</span>
			<div class="flex items-center gap-1 font-label-mono-xs text-label-mono-xs text-emerald-400">
				<i class="fa-solid fa-arrow-trend-up text-[13px]"></i>
				<span>+{data.newThisMonth} im {data.monthLabel}</span>
			</div>
			<div class="font-label-mono-xs text-label-mono-xs text-outline">Ø {data.avgReceiptsPerWeek.toLocaleString('de-DE', { maximumFractionDigits: 1 })} Belege / Woche</div>
		</div>

		<div class="rounded-xl bg-surface-container p-space-md shadow-sm flex flex-col gap-space-xs">
			<div class="flex items-center justify-between">
				<span class="font-label-mono-xs text-label-mono-xs text-outline uppercase tracking-wider">Schnittstellen-Status</span>
				<div class="w-8 h-8 rounded-lg bg-secondary-container/50 flex items-center justify-center text-secondary shrink-0">
					<i class="fa-solid fa-tower-broadcast text-[16px]"></i>
				</div>
			</div>
			<span class="font-headline-md text-headline-md font-bold text-on-surface">{connectionRatePct}%</span>
			<div class="flex items-center gap-1.5 font-label-mono-xs text-label-mono-xs" class:text-amber-300={data.syncStatus.erroringStore} class:text-outline={!data.syncStatus.erroringStore}>
				<span class="w-1.5 h-1.5 rounded-full shrink-0" class:bg-amber-400={data.syncStatus.erroringStore} class:bg-emerald-400={!data.syncStatus.erroringStore}></span>
				<span class="truncate">{data.syncStatus.erroringStore ? `${data.syncStatus.erroringStore.displayName} erfordert erneute Anmeldung` : 'Alle Schnittstellen verbunden'}</span>
			</div>
			<div class="h-1 rounded-full bg-surface-container-high overflow-hidden">
				<div class="h-full rounded-full" class:bg-amber-400={data.syncStatus.erroringStore} class:bg-primary={!data.syncStatus.erroringStore} style="width:{connectionRatePct}%"></div>
			</div>
		</div>

		<div class="rounded-xl bg-surface-container p-space-md shadow-sm flex flex-col gap-space-xs">
			<div class="flex items-center justify-between">
				<span class="font-label-mono-xs text-label-mono-xs text-outline uppercase tracking-wider">Rabatte &amp; Coupons</span>
				<div class="w-8 h-8 rounded-lg bg-emerald-950/40 flex items-center justify-center text-emerald-400 shrink-0">
					<i class="fa-solid fa-piggy-bank text-[16px]"></i>
				</div>
			</div>
			<span class="font-headline-md text-headline-md font-bold text-on-surface">{euro(data.totalSavingsCents)}</span>
			<div class="flex items-center justify-between font-label-mono-xs text-label-mono-xs text-outline">
				<span>{data.totalCoupons} Coupon{data.totalCoupons === 1 ? '' : 's'} erfasst</span>
				<span class="text-on-surface font-semibold">{savingsRatePct}% der Belege</span>
			</div>
			<div class="h-1 rounded-full bg-surface-container-high overflow-hidden">
				<div class="h-full bg-emerald-400 rounded-full" style="width:{savingsRatePct}%"></div>
			</div>
		</div>
	</div>

	<!-- Suche + Status-Filter -->
	<div class="flex flex-col gap-space-md mb-space-lg">
		<div class="relative w-full">
			<div class="absolute inset-y-0 left-0 pl-space-md flex items-center pointer-events-none text-outline">
				<i class="fa-solid fa-magnifying-glass text-[18px]"></i>
			</div>
			<input
				bind:this={searchInputEl}
				class="w-full h-12 pl-12 pr-space-md bg-surface-container-low rounded-xl text-on-surface placeholder:text-outline font-body-md text-body-md focus:outline-none focus:bg-surface-container transition-all shadow-inner"
				placeholder="Händler filtern …"
				type="text"
				bind:value={searchValue}
			/>
			<div class="absolute inset-y-0 right-0 pr-space-md flex items-center gap-space-xs pointer-events-none">
				<span class="font-label-mono-xs text-label-mono-xs px-1.5 py-0.5 rounded bg-surface-container-high text-outline">⌘K</span>
			</div>
		</div>
		<div class="flex items-center gap-space-xs overflow-x-auto pb-1">
			{#each [['all', `Alle (${statusCounts.all})`], ['active', `Aktiv (${statusCounts.active})`], ['attention', `Handlung nötig (${statusCounts.attention})`], ['offline', `Offline (${statusCounts.offline})`]] as [key, label] (key)}
				<button
					class={[
						'flex items-center gap-1.5 px-4 py-1.5 rounded-full font-label-mono-sm text-label-mono-sm transition-all whitespace-nowrap cursor-pointer',
						statusFilter === key ? 'bg-on-surface text-surface shadow-md font-semibold' : 'bg-surface-container-low hover:bg-surface-container text-on-surface-variant hover:text-on-surface font-medium'
					]}
					type="button"
					onclick={() => (statusFilter = key as typeof statusFilter)}
				>
					{#if key === 'attention' && statusCounts.attention > 0}<span class="w-2 h-2 rounded-full bg-amber-500"></span>{/if}
					{label}
				</button>
			{/each}
		</div>
	</div>

	<div class="flex flex-col gap-space-lg items-start">
		<!-- Händler-Module -->
		<section class="w-full flex flex-col gap-space-md">
			<div class="flex items-center justify-between">
				<h2 class="font-headline-sm text-headline-sm font-semibold flex items-center gap-2">
					<i class="fa-solid fa-server text-[18px] text-primary"></i>
					Verbundene Händler-Module
				</h2>
				<span class="font-label-mono-xs text-label-mono-xs text-outline">{implementedStores.length} Module konfiguriert</span>
			</div>

			{#each filteredStores as store (store.id)}
				{@const ui = getStoreUi(store.id, store.displayName, store.ui)}
				{@const isOAuth = store.loginStrategy.kind === 'oauth-pkce-manual' || store.loginStrategy.kind === 'oauth-pkce-redirect'}
				{@const isCredentials = store.loginStrategy.kind === 'credentials'}
				{@const f = flow[store.id] ?? {}}
				{@const category = statusCategory(store)}
				<div class="rounded-xl bg-surface-container p-space-md shadow-md flex flex-col gap-space-sm border-l-[3px]" style="border-color:{category === 'attention' ? '#f59e0b' : ui.color}">
					<div class="flex items-start justify-between gap-space-sm">
						<div class="flex items-center gap-space-sm min-w-0">
							<div class="w-11 h-11 rounded-lg bg-surface-container-high flex items-center justify-center overflow-hidden shrink-0">
								{#if ui.logo}
									<img src={ui.logo} alt="{ui.name} Logo" class="w-full h-full object-contain" />
								{:else}
									<span class="font-label-mono-sm text-label-mono-sm font-bold" style="color:{ui.color}">{ui.chip}</span>
								{/if}
							</div>
							<div class="min-w-0">
								<div class="flex items-center gap-2 flex-wrap">
									<span class="font-headline-sm text-headline-sm font-bold truncate">{store.displayName}</span>
									<span
										class={[
											'px-2 py-0.5 rounded-full font-label-mono-xs text-label-mono-xs font-semibold flex items-center gap-1',
											category === 'active' ? 'bg-emerald-950/40 text-emerald-300' : category === 'attention' ? 'bg-amber-950/40 text-amber-300' : 'bg-surface-container-high text-outline'
										]}
									>
										<span class="w-1.5 h-1.5 rounded-full" class:bg-emerald-400={category === 'active'} class:bg-amber-400={category === 'attention'} class:bg-outline={category === 'offline'}></span>
										{store.implemented ? statusLabel(store.status) : 'Bald verfügbar'}
									</span>
								</div>
								{#if store.authDescription || store.version}
									<div class="font-label-mono-xs text-label-mono-xs text-outline truncate">
										{store.authDescription}{#if store.authDescription && store.version} · {/if}{#if store.version}v{store.version}{/if}
									</div>
								{/if}
							</div>
						</div>
						<div class="flex items-center gap-1 shrink-0">
							{#if store.hasCredentials}
								<form method="POST" action="?/syncOne" use:enhance>
									<input type="hidden" name="storeId" value={store.id} />
									<button class="w-8 h-8 rounded-lg hover:bg-surface-container-high flex items-center justify-center text-on-surface-variant hover:text-primary transition-colors" type="submit" title="Jetzt synchronisieren">
										<i class="fa-solid fa-arrows-rotate text-[18px]"></i>
									</button>
								</form>
							{/if}
							<details class="store-menu relative">
								<summary class="list-none cursor-pointer w-8 h-8 rounded-lg hover:bg-surface-container-high flex items-center justify-center text-on-surface-variant [&::-webkit-details-marker]:hidden">
									<i class="fa-solid fa-ellipsis-vertical text-[18px]"></i>
								</summary>
								<div class="absolute right-0 top-full mt-1 w-52 rounded-lg bg-surface-container-high shadow-lg border border-outline-variant/30 p-1 z-20">
									{#if store.receiptCount > 0}
										<form method="POST" action="?/reprocessAll" use:enhance>
											<input type="hidden" name="storeId" value={store.id} />
											<button
												type="submit"
												disabled={store.reprocessing}
												class="w-full text-left px-2.5 py-1.5 rounded font-body-sm text-body-sm text-on-surface hover:bg-surface-container-highest flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
												title="Parst alle bereits lokal gespeicherten Belege dieses Marktes neu (z.B. nach einem Parser-Fix) -- rein aus dem vorhandenen PDF, ohne den Händler erneut zu kontaktieren. Belege ohne lokales PDF bleiben unverändert."
											>
												<i class="fa-solid fa-rotate text-[14px] {store.reprocessing ? 'animate-spin' : ''}"></i>
												{store.reprocessing ? 'Läuft im Hintergrund…' : 'Alle Belege neu einlesen'}
											</button>
										</form>
										<div class="h-px bg-outline-variant/20 my-1"></div>
									{/if}
									{#if store.hasCredentials}
										<form method="POST" action="?/disconnect" use:enhance>
											<input type="hidden" name="storeId" value={store.id} />
											<button type="submit" class="w-full text-left px-2.5 py-1.5 rounded font-body-sm text-body-sm text-error hover:bg-error-container/20 flex items-center gap-2">
												<i class="fa-solid fa-right-from-bracket text-[14px]"></i> Abmelden
											</button>
										</form>
									{:else}
										<div class="px-2.5 py-1.5 font-body-sm text-body-sm text-outline">Nicht verbunden</div>
									{/if}
									<div class="h-px bg-outline-variant/20 my-1"></div>
									<button
										type="button"
										onclick={() => uninstallDialogs[store.id]?.open()}
										class="w-full text-left px-2.5 py-1.5 rounded font-body-sm text-body-sm text-error hover:bg-error-container/20 flex items-center gap-2"
									>
										<i class="fa-solid fa-trash-can text-[14px]"></i> Modul deinstallieren
									</button>
								</div>
							</details>
							<form method="POST" action="?/toggle" use:enhance>
								<input type="hidden" name="storeId" value={store.id} />
								<input type="hidden" name="enabled" value={(!store.enabled).toString()} />
								<div class="switch">
									<input type="checkbox" id="sw-{store.id}" checked={store.enabled} onchange={(e) => e.currentTarget.form?.requestSubmit()} disabled={!store.implemented} />
									<label for="sw-{store.id}"></label>
								</div>
							</form>
						</div>
					</div>

					{#if store.implemented}
						{#if store.lastError}
							<div class="flex items-start gap-2 px-space-sm py-space-xs rounded-lg bg-amber-950/30 border border-amber-500/20 text-amber-200 text-body-sm">
								<i class="fa-solid fa-triangle-exclamation text-[14px] shrink-0 mt-0.5"></i>
								<span>{store.lastError}</span>
							</div>
						{/if}

						{#if store.hasCredentials}
							<div class="grid grid-cols-2 gap-space-sm">
								<div class="rounded-lg bg-surface-container-high/60 p-space-sm min-w-0">
									<div class="font-label-mono-xs text-label-mono-xs text-outline uppercase mb-1">Verbindung</div>
									<div class="font-body-sm text-body-sm text-on-surface font-medium truncate">Zugangsdaten hinterlegt</div>
									<div class="font-label-mono-xs text-label-mono-xs text-outline mt-0.5">{store.receiptCount} Bons insgesamt</div>
								</div>
								<div class="rounded-lg bg-surface-container-high/60 p-space-sm min-w-0">
									<div class="font-label-mono-xs text-label-mono-xs text-outline uppercase mb-1">{data.monthLabel} Belege</div>
									<div class="flex items-baseline justify-between gap-1">
										<span class="font-body-sm text-body-sm text-on-surface font-semibold">{store.monthCount} Belege</span>
										<span class="font-label-mono-sm text-label-mono-sm font-bold text-on-surface shrink-0">{euro(store.monthCents)}</span>
									</div>
									<div class="font-label-mono-xs text-label-mono-xs text-outline mt-0.5 truncate">Letzter Sync: {timeAgo(store.lastSyncAt)}</div>
								</div>
							</div>
							{#if store.capabilities.length > 0}
								<div class="flex flex-wrap gap-1">
									{#each store.capabilities as cap (cap)}
										<span class="px-1.5 py-0.5 rounded bg-surface-container-high text-on-surface-variant font-label-mono-xs text-label-mono-xs">{cap}</span>
									{/each}
								</div>
							{/if}
							{#if store.status === 'error'}
								{#if isOAuth}
									<p class="font-body-sm text-body-sm text-outline">Verbindung fehlgeschlagen — erneut anmelden, um {ui.name} wieder zu verbinden.</p>
									<form method="POST" action="?/oauthBeginLogin" use:enhance>
										<input type="hidden" name="storeId" value={store.id} />
										<button class="w-full h-9 rounded-lg bg-primary text-on-primary-container font-label-mono-sm text-label-mono-sm font-semibold hover:brightness-110 transition-all" type="submit">
											Erneut anmelden
										</button>
									</form>
									{#if f.authorizeUrl}
										<a class="flex items-center justify-center h-9 rounded-lg bg-surface-container-high hover:bg-surface-container-highest text-on-surface font-label-mono-sm text-label-mono-sm transition-all" href={f.authorizeUrl} target="_blank" rel="noopener">
											→ Zu {ui.name} öffnen (neuer Tab)
										</a>
										<form method="POST" action="?/oauthCompleteLogin" use:enhance class="flex gap-2">
											<input class="flex-1 min-w-0 h-9 px-3 rounded-lg bg-surface-container-low text-on-surface placeholder:text-outline font-body-sm text-body-sm focus:outline-none focus:bg-background" type="text" name="redirectUrl" placeholder="Redirect-URL nach Login einfügen" required />
											<input type="hidden" name="storeId" value={store.id} />
											<button class="h-9 px-4 rounded-lg bg-primary text-on-primary-container font-label-mono-sm text-label-mono-sm font-semibold" type="submit">Verbinden</button>
										</form>
									{/if}
									{#if f.error}<p class="text-body-sm text-error">{f.error}</p>{/if}
									{#if f.success}<p class="text-body-sm text-emerald-400">Erfolgreich verbunden.</p>{/if}
								{:else if isCredentials}
									<p class="font-body-sm text-body-sm text-outline">Anmeldefehler (Passwort geändert o.ä.) — {ui.name} kennt kein automatisches Token-Refresh, nur ein erneuter Login hilft.</p>
									<form method="POST" action="?/credentialsLogin" use:enhance class="flex flex-col gap-2">
										<input type="hidden" name="storeId" value={store.id} />
										<input class="h-9 px-3 rounded-lg bg-surface-container-low text-on-surface placeholder:text-outline font-body-sm text-body-sm focus:outline-none focus:bg-background" type="email" name="email" placeholder="E-Mail" autocomplete="username" required />
										<input class="h-9 px-3 rounded-lg bg-surface-container-low text-on-surface placeholder:text-outline font-body-sm text-body-sm focus:outline-none focus:bg-background" type="password" name="password" placeholder="Passwort" autocomplete="current-password" required />
										<button class="w-full h-9 rounded-lg bg-primary text-on-primary-container font-label-mono-sm text-label-mono-sm font-semibold hover:brightness-110 transition-all" type="submit">Erneut anmelden</button>
									</form>
									{#if f.error}<p class="text-body-sm text-error">{f.error}</p>{/if}
									{#if f.success}<p class="text-body-sm text-emerald-400">Erfolgreich verbunden.</p>{/if}
								{/if}
							{/if}
						{:else if isOAuth}
							<p class="font-body-sm text-body-sm text-on-surface-variant">{redirectHint(store.loginStrategy.kind)}</p>
							<form method="POST" action="?/oauthBeginLogin" use:enhance>
								<input type="hidden" name="storeId" value={store.id} />
								<button class="w-full h-9 rounded-lg bg-primary text-on-primary-container font-label-mono-sm text-label-mono-sm font-semibold hover:brightness-110 transition-all" type="submit">Login-Seite öffnen</button>
							</form>
							{#if f.authorizeUrl}
								<a class="flex items-center justify-center h-9 rounded-lg bg-surface-container-high hover:bg-surface-container-highest text-on-surface font-label-mono-sm text-label-mono-sm transition-all" href={f.authorizeUrl} target="_blank" rel="noopener">
									→ Zu {ui.name} öffnen (neuer Tab)
								</a>
								<form method="POST" action="?/oauthCompleteLogin" use:enhance class="flex gap-2">
									<input class="flex-1 min-w-0 h-9 px-3 rounded-lg bg-surface-container-low text-on-surface placeholder:text-outline font-body-sm text-body-sm focus:outline-none focus:bg-background" type="text" name="redirectUrl" placeholder="Redirect-URL nach Login einfügen" required />
									<input type="hidden" name="storeId" value={store.id} />
									<button class="h-9 px-4 rounded-lg bg-primary text-on-primary-container font-label-mono-sm text-label-mono-sm font-semibold" type="submit">Verbinden</button>
								</form>
							{/if}
							{#if f.error}<p class="text-body-sm text-error">{f.error}</p>{/if}
							{#if f.success}<p class="text-body-sm text-emerald-400">Erfolgreich verbunden.</p>{/if}
						{:else if isCredentials}
							<form method="POST" action="?/credentialsLogin" use:enhance class="flex flex-col gap-2">
								<input type="hidden" name="storeId" value={store.id} />
								<input class="h-9 px-3 rounded-lg bg-surface-container-low text-on-surface placeholder:text-outline font-body-sm text-body-sm focus:outline-none focus:bg-background" type="email" name="email" placeholder="E-Mail" autocomplete="username" required />
								<input class="h-9 px-3 rounded-lg bg-surface-container-low text-on-surface placeholder:text-outline font-body-sm text-body-sm focus:outline-none focus:bg-background" type="password" name="password" placeholder="Passwort" autocomplete="current-password" required />
								<button class="w-full h-9 rounded-lg bg-primary text-on-primary-container font-label-mono-sm text-label-mono-sm font-semibold hover:brightness-110 transition-all" type="submit">Anmelden</button>
							</form>
							{#if f.error}<p class="text-body-sm text-error">{f.error}</p>{/if}
							{#if f.success}<p class="text-body-sm text-emerald-400">Erfolgreich verbunden.</p>{/if}
						{/if}
					{/if}
				</div>
				<ConfirmUninstallDialog storeId={store.id} displayName={store.displayName} bind:this={uninstallDialogs[store.id]} />
			{:else}
				<div class="rounded-xl bg-surface-container p-space-lg text-center text-body-sm text-on-surface-variant">Keine Module gefunden.</div>
			{/each}
		</section>
	</div>
</div>
