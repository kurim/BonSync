<script lang="ts">
	import { enhance } from '$app/forms';
	import { timeAgo } from '$lib/stores-ui';

	let { data, form } = $props();

	let installingId = $state<string | null>(null);
	let refreshing = $state(false);

	// Fehlermeldung/Ergebnis der zuletzt betätigten "Installieren/Aktualisieren"-Kachel -- via
	// storeId zugeordnet, damit ein Fehler bei einem Modul nicht fälschlich unter einem anderen
	// angezeigt wird (gleiches Muster wie der `flow`-State in dealer-interfaces/+page.svelte).
	const lastStoreResult = $derived(
		form && 'storeId' in form ? { id: form.storeId as string, error: (form as { storeError?: string }).storeError, installedId: (form as { storeInstalledId?: string }).storeInstalledId } : null
	);

	// --- Dangerzone: manueller Zip-Upload (identisch zum bisherigen Verhalten unter
	// Händler-Schnittstellen, nur hierher umgezogen) ---
	let installBusy = $state(false);
	let installOverwrite = $state(false);
	let dragOver = $state(false);
	let fileInputEl: HTMLInputElement | undefined = $state();
</script>

<svelte:head><title>Modul-Store — BonSync</title></svelte:head>

<div class="flex flex-col w-full pb-space-xl font-body-md text-on-surface">
	<div class="flex items-start justify-between gap-space-md mb-space-lg">
		<div class="flex items-center gap-space-sm">
			<div class="flex items-center justify-center w-7 h-7 rounded-lg bg-surface-container-high shadow-inner text-primary">
				<i class="fa-solid fa-shop text-[18px]"></i>
			</div>
			<div>
				<h1 class="font-headline-xl text-headline-xl text-on-surface font-bold tracking-tight">Modul-Store</h1>
				<p class="font-body-md text-body-md text-on-surface-variant mt-0.5">
					Händler-Module aus dem offiziellen <a class="text-primary hover:underline" href="https://github.com/kurim/BonSync-Store" target="_blank" rel="noopener">BonSync-Store</a> installieren.
				</p>
			</div>
		</div>
		<form
			method="POST"
			action="?/refreshCatalog"
			use:enhance={() => {
				refreshing = true;
				return async ({ update }) => {
					refreshing = false;
					await update();
				};
			}}
		>
			<div class="flex flex-col items-end gap-1">
				<button
					type="submit"
					disabled={refreshing}
					class="flex items-center gap-space-xs px-space-md h-9 rounded-lg bg-surface-container-high hover:bg-surface-container-highest text-on-surface font-label-mono-sm text-label-mono-sm font-semibold transition-all disabled:opacity-60"
				>
					<i class="fa-solid fa-arrows-rotate text-[14px] {refreshing ? 'animate-spin' : ''}"></i>
					{refreshing ? 'Aktualisiere…' : 'Katalog aktualisieren'}
				</button>
				{#if data.catalogFetchedAt}
					<span class="font-label-mono-xs text-label-mono-xs text-outline">Stand: {timeAgo(data.catalogFetchedAt)}</span>
				{/if}
			</div>
		</form>
	</div>

	{#if data.catalogError}
		<div class="rounded-xl bg-amber-950/30 border border-amber-500/20 text-amber-200 p-space-md flex items-start gap-2 mb-space-lg">
			<i class="fa-solid fa-triangle-exclamation text-[16px] shrink-0 mt-0.5"></i>
			<span class="font-body-sm text-body-sm">{data.catalogError}</span>
		</div>
	{:else}
		<div class="grid grid-cols-1 lg:grid-cols-2 gap-space-md mb-space-xl">
			{#each data.modules as { entry, isInstalled, hasUpdate, installedVersion } (entry.id)}
				<div class="rounded-xl bg-surface-container p-space-md shadow-md flex flex-col gap-space-sm border-l-[3px]" style="border-color:{entry.ui?.color ?? '#6366f1'}">
					<div class="flex items-start justify-between gap-space-sm">
						<div class="flex items-center gap-space-sm min-w-0">
							<div class="w-11 h-11 rounded-lg bg-surface-container-high flex items-center justify-center overflow-hidden shrink-0">
								{#if entry.ui?.logoUrl}
									<img src={entry.ui.logoUrl} alt="{entry.displayName} Logo" class="w-full h-full object-contain" />
								{:else}
									<span class="font-label-mono-sm text-label-mono-sm font-bold" style="color:{entry.ui?.color ?? undefined}">{entry.ui?.chip ?? entry.displayName.slice(0, 2).toUpperCase()}</span>
								{/if}
							</div>
							<div class="min-w-0">
								<div class="flex items-center gap-2 flex-wrap">
									<span class="font-headline-sm text-headline-sm font-bold truncate">{entry.displayName}</span>
									{#if isInstalled}
										<span class="px-2 py-0.5 rounded-full font-label-mono-xs text-label-mono-xs font-semibold bg-emerald-950/40 text-emerald-300">
											{hasUpdate ? 'Update verfügbar' : 'Installiert'}
										</span>
									{/if}
								</div>
								<div class="font-label-mono-xs text-label-mono-xs text-outline truncate">
									{entry.authDescription}{#if entry.authDescription} · {/if}v{entry.version}
								</div>
							</div>
						</div>
					</div>

					{#if entry.description}
						<p class="font-body-sm text-body-sm text-on-surface-variant">{entry.description}</p>
					{/if}

					{#if lastStoreResult?.id === entry.id && lastStoreResult.error}
						<p class="font-body-sm text-body-sm text-error">{lastStoreResult.error}</p>
					{/if}
					{#if lastStoreResult?.id === entry.id && lastStoreResult.installedId}
						<p class="font-body-sm text-body-sm text-emerald-400">Installiert.</p>
					{/if}

					<form
						method="POST"
						action="?/installFromStore"
						use:enhance={() => {
							installingId = entry.id;
							return async ({ update }) => {
								installingId = null;
								await update();
							};
						}}
					>
						<input type="hidden" name="id" value={entry.id} />
						<button
							type="submit"
							disabled={installingId === entry.id || (isInstalled && !hasUpdate)}
							class={[
								'w-full h-9 rounded-lg font-label-mono-sm text-label-mono-sm font-semibold transition-all disabled:opacity-50 disabled:cursor-not-allowed',
								hasUpdate || !isInstalled ? 'bg-primary text-on-primary-container hover:brightness-110' : 'bg-surface-container-high text-on-surface-variant'
							]}
						>
							{#if installingId === entry.id}
								<i class="fa-solid fa-arrows-rotate animate-spin text-[14px] mr-1"></i> Installiere…
							{:else if hasUpdate}
								Aktualisieren (v{installedVersion} → v{entry.version})
							{:else if isInstalled}
								Installiert
							{:else}
								Installieren
							{/if}
						</button>
					</form>
				</div>
			{/each}
		</div>
	{/if}

	<!-- Dangerzone: manueller Zip-Upload -- kein Katalog-Eintrag, keine Signatur-/Hash-Prüfung
	     gegen eine vertrauenswürdige Quelle wie beim Store-Katalog oben, siehe docs/module-format.md
	     Abschnitt 1 zum Vertrauensmodell. -->
	<div class="rounded-xl bg-error-container/10 border border-error/30 p-space-md flex flex-col gap-space-sm">
		<div class="flex items-center gap-space-sm">
			<div class="w-9 h-9 rounded-lg bg-error/10 flex items-center justify-center shrink-0 text-error">
				<i class="fa-solid fa-triangle-exclamation text-[16px]"></i>
			</div>
			<div class="flex-1 min-w-0">
				<div class="font-body-md text-body-md font-semibold text-error">Dangerzone — Eigenes Modul-Paket hochladen</div>
				<div class="font-body-sm text-body-sm text-on-surface-variant">
					Nur Pakete aus vertrauenswürdiger Quelle installieren — Module laufen ohne Sandbox mit vollem Zugriff auf Datenbank und Netzwerk (siehe <code class="font-label-mono-xs text-label-mono-xs bg-surface-container-high px-1 rounded">docs/module-format.md</code>).
				</div>
			</div>
		</div>

		{#if !form?.installPreview}
			<form
				method="POST"
				action="?/installPreview"
				enctype="multipart/form-data"
				use:enhance={() => {
					installBusy = true;
					return async ({ update }) => {
						installBusy = false;
						await update();
					};
				}}
			>
				<label
					class={[
						'h-10 rounded-lg border border-dashed flex items-center justify-center gap-2 font-label-mono-sm text-label-mono-sm transition-colors',
						installBusy
							? 'opacity-60 border-outline-variant/60 text-on-surface-variant'
							: dragOver
								? 'border-error bg-error/10 text-error cursor-pointer'
								: 'border-outline-variant/60 text-on-surface-variant cursor-pointer hover:bg-surface-container-high'
					]}
					ondragover={(e) => {
						e.preventDefault();
						if (!installBusy) dragOver = true;
					}}
					ondragleave={() => (dragOver = false)}
					ondrop={(e) => {
						e.preventDefault();
						dragOver = false;
						if (installBusy || !fileInputEl) return;
						const dropped = e.dataTransfer?.files;
						if (dropped && dropped.length > 0) {
							fileInputEl.files = dropped;
							fileInputEl.form?.requestSubmit();
						}
					}}
				>
					<i class="fa-solid {installBusy ? 'fa-arrows-rotate animate-spin' : 'fa-upload'} text-[14px]"></i>
					{installBusy ? 'Prüfe Paket…' : dragOver ? 'Zip hier ablegen' : 'Zip-Datei auswählen oder hierher ziehen'}
					<input
						bind:this={fileInputEl}
						type="file"
						name="file"
						accept=".zip"
						class="hidden"
						disabled={installBusy}
						onchange={(e) => e.currentTarget.form?.requestSubmit()}
					/>
				</label>
			</form>
			{#if form?.installError}
				<p class="font-body-sm text-body-sm text-error">{form.installError}</p>
			{/if}
			{#if form?.installedId}
				<p class="font-body-sm text-body-sm text-emerald-400">Modul "{form.installedId}" wurde installiert.</p>
			{/if}
		{:else}
			{@const preview = form.installPreview}
			{@const isUpgrade = preview.alreadyInstalled && preview.installedVersion !== null && preview.installedVersion !== preview.version}
			<div class="rounded-lg bg-surface-container-high/60 p-space-sm flex flex-col gap-space-xs">
				<div class="flex items-center justify-between gap-space-sm">
					<span class="font-body-md text-body-md font-semibold text-on-surface">{preview.displayName}</span>
					<span class="font-label-mono-xs text-label-mono-xs text-outline">
						{#if isUpgrade}v{preview.installedVersion} → v{preview.version}{:else}v{preview.version}{/if}
					</span>
				</div>
				{#if preview.description}
					<p class="font-body-sm text-body-sm text-on-surface-variant">{preview.description}</p>
				{/if}
				<div class="font-label-mono-xs text-label-mono-xs text-outline">
					{preview.id} · {preview.loginStrategyKind}{preview.author ? ` · ${preview.author}` : ''}
				</div>
				{#if preview.alreadyInstalled}
					<label class="flex items-start gap-2 mt-1 cursor-pointer">
						<input type="checkbox" bind:checked={installOverwrite} class="accent-error mt-0.5" />
						<span class="font-body-sm text-body-sm text-on-surface">
							{#if isUpgrade}
								<span class="font-semibold text-primary">Aktualisierung verfügbar (v{preview.installedVersion} installiert).</span>
								Auf v{preview.version} aktualisieren -- Belege/Zugangsdaten bleiben erhalten, nur Code+Manifest werden ersetzt.
							{:else}
								<span class="font-semibold text-error">Modul "{preview.id}" ist bereits in Version v{preview.installedVersion} installiert.</span>
								Trotzdem neu installieren -- Belege/Zugangsdaten bleiben erhalten, nur Code+Manifest werden ersetzt.
							{/if}
						</span>
					</label>
				{/if}
				<div class="flex items-center justify-end gap-space-sm mt-space-xs">
					<form method="POST" action="?/cancelInstall" use:enhance>
						<input type="hidden" name="stagingDir" value={preview.stagingDir} />
						<button type="submit" class="px-space-md py-1.5 rounded-lg font-label-mono-sm text-label-mono-sm font-semibold text-on-surface-variant hover:bg-surface-container-highest transition-colors">
							Abbrechen
						</button>
					</form>
					<form
						method="POST"
						action="?/installConfirm"
						use:enhance={() => {
							installBusy = true;
							return async ({ update }) => {
								installBusy = false;
								installOverwrite = false;
								await update();
							};
						}}
					>
						<input type="hidden" name="stagingDir" value={preview.stagingDir} />
						<input type="hidden" name="overwrite" value={installOverwrite} />
						<button
							type="submit"
							disabled={installBusy || (preview.alreadyInstalled && !installOverwrite)}
							class="px-space-md py-1.5 rounded-lg bg-primary text-on-primary-container font-label-mono-sm text-label-mono-sm font-semibold hover:brightness-110 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
						>
							{isUpgrade ? 'Aktualisieren' : preview.alreadyInstalled ? 'Installieren & überschreiben' : 'Installieren'}
						</button>
					</form>
				</div>
			</div>
		{/if}
	</div>
</div>
