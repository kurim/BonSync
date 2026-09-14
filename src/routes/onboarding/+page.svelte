<script lang="ts">
	import { enhance } from '$app/forms';

	let { data, form } = $props();

	let currentStep = $state<1 | 2>(1);

	// Nach erfolgreicher Passwortänderung automatisch zu Schritt 2 weiterschalten.
	$effect(() => {
		if (form && 'passwordChanged' in form && form.passwordChanged) currentStep = 2;
	});

	let showCurrent = $state(false);
	let showNew = $state(false);
	let showConfirm = $state(false);
	let changingPassword = $state(false);

	let selectedIds = $state<Set<string>>(new Set());
	function toggleSelected(id: string, checked: boolean) {
		const next = new Set(selectedIds);
		if (checked) next.add(id);
		else next.delete(id);
		selectedIds = next;
	}
	let installingSelected = $state(false);
	let finishing = $state(false);

	function resultFor(id: string) {
		return form && 'installResults' in form ? (form.installResults as { id: string; error?: string }[]).find((r) => r.id === id) : undefined;
	}
</script>

<svelte:head><title>Einrichtung — BonSync</title></svelte:head>

<div class="min-h-screen flex items-center justify-center p-space-lg font-body-md text-on-surface">
	<div class="w-full max-w-2xl flex flex-col gap-space-lg">
		<div class="flex flex-col items-center gap-space-xs text-center">
			<div class="flex items-center justify-center w-12 h-12 rounded-xl bg-surface-container-high shadow-inner text-primary mb-space-xs">
				<i class="fa-solid fa-wand-magic-sparkles text-[22px]"></i>
			</div>
			<h1 class="font-headline-xl text-headline-xl font-bold tracking-tight">Willkommen bei BonSync</h1>
			<p class="font-body-md text-body-md text-on-surface-variant">Zwei kurze Schritte, dann geht's los.</p>
		</div>

		<div class="flex items-center justify-center gap-space-sm">
			<div class="flex items-center gap-2 font-label-mono-xs text-label-mono-xs {currentStep === 1 ? 'text-primary font-semibold' : 'text-outline'}">
				<span class="w-5 h-5 rounded-full flex items-center justify-center {currentStep === 1 ? 'bg-primary text-on-primary-container' : 'bg-surface-container-high'}">1</span>
				Passwort
			</div>
			<div class="w-8 h-px bg-outline-variant/40"></div>
			<div class="flex items-center gap-2 font-label-mono-xs text-label-mono-xs {currentStep === 2 ? 'text-primary font-semibold' : 'text-outline'}">
				<span class="w-5 h-5 rounded-full flex items-center justify-center {currentStep === 2 ? 'bg-primary text-on-primary-container' : 'bg-surface-container-high'}">2</span>
				Händler
			</div>
		</div>

		{#if currentStep === 1}
			<div class="bg-surface-container-low rounded-xl p-space-lg shadow-xl">
				<h2 class="font-headline-md text-headline-md text-on-surface mb-space-md flex items-center gap-2">
					<i class="fa-solid fa-key text-[20px] text-primary"></i>
					Passwort ändern
				</h2>
				<p class="font-body-sm text-body-sm text-on-surface-variant mb-space-md">
					Du hast dich mit dem in <code class="font-label-mono-xs text-label-mono-xs bg-surface-container-high px-1 rounded">APP_PASSWORD</code> hinterlegten Passwort angemeldet. Vergib jetzt ein eigenes -- oder überspringe diesen Schritt, falls du bereits ein starkes Passwort gesetzt hast.
				</p>

				{#if form?.passwordError}
					<p class="mb-space-md px-space-md py-space-sm rounded-lg bg-error-container text-on-error-container text-body-sm">{form.passwordError}</p>
				{/if}

				<form
					method="POST"
					action="?/changePassword"
					use:enhance={() => {
						changingPassword = true;
						return async ({ update }) => {
							changingPassword = false;
							await update();
						};
					}}
					class="flex flex-col gap-space-md"
				>
					<input type="text" name="username" autocomplete="username" value="bonsync" class="sr-only" tabindex="-1" aria-hidden="true" />
					<div class="flex flex-col gap-space-xs">
						<label class="font-label-mono-sm text-label-mono-sm text-on-surface font-medium" for="current-password">Aktuelles Passwort</label>
						<div class="relative">
							<input
								id="current-password"
								name="currentPassword"
								class="w-full h-[38px] bg-surface-container-lowest text-on-surface font-label-mono-md text-label-mono-md px-space-md pr-10 rounded-lg focus:outline-none focus:ring-1 focus:ring-primary transition-all"
								type={showCurrent ? 'text' : 'password'}
								autocomplete="current-password"
								required
							/>
							<button type="button" class="absolute right-2.5 top-1/2 -translate-y-1/2 text-outline hover:text-on-surface transition-colors" onclick={() => (showCurrent = !showCurrent)} aria-label={showCurrent ? 'Passwort verbergen' : 'Passwort anzeigen'}>
								<i class="fa-regular {showCurrent ? 'fa-eye-slash' : 'fa-eye'} text-[18px]"></i>
							</button>
						</div>
					</div>
					<div class="flex flex-col gap-space-xs">
						<label class="font-label-mono-sm text-label-mono-sm text-on-surface font-medium" for="new-password">Neues Passwort</label>
						<div class="relative">
							<input
								id="new-password"
								name="newPassword"
								class="w-full h-[38px] bg-surface-container-lowest text-on-surface font-label-mono-md text-label-mono-md px-space-md pr-10 rounded-lg focus:outline-none focus:ring-1 focus:ring-primary transition-all"
								type={showNew ? 'text' : 'password'}
								autocomplete="new-password"
								minlength="8"
								required
							/>
							<button type="button" class="absolute right-2.5 top-1/2 -translate-y-1/2 text-outline hover:text-on-surface transition-colors" onclick={() => (showNew = !showNew)} aria-label={showNew ? 'Passwort verbergen' : 'Passwort anzeigen'}>
								<i class="fa-regular {showNew ? 'fa-eye-slash' : 'fa-eye'} text-[18px]"></i>
							</button>
						</div>
					</div>
					<div class="flex flex-col gap-space-xs">
						<label class="font-label-mono-sm text-label-mono-sm text-on-surface font-medium" for="confirm-password">Neues Passwort bestätigen</label>
						<div class="relative">
							<input
								id="confirm-password"
								name="confirmPassword"
								class="w-full h-[38px] bg-surface-container-lowest text-on-surface font-label-mono-md text-label-mono-md px-space-md pr-10 rounded-lg focus:outline-none focus:ring-1 focus:ring-primary transition-all"
								type={showConfirm ? 'text' : 'password'}
								autocomplete="new-password"
								minlength="8"
								required
							/>
							<button type="button" class="absolute right-2.5 top-1/2 -translate-y-1/2 text-outline hover:text-on-surface transition-colors" onclick={() => (showConfirm = !showConfirm)} aria-label={showConfirm ? 'Passwort verbergen' : 'Passwort anzeigen'}>
								<i class="fa-regular {showConfirm ? 'fa-eye-slash' : 'fa-eye'} text-[18px]"></i>
							</button>
						</div>
					</div>
					<div class="flex items-center gap-space-sm pt-space-xs">
						<button
							class="flex-1 flex items-center justify-center gap-space-xs h-[38px] rounded-lg bg-primary text-on-primary-container font-label-mono-sm text-label-mono-sm font-semibold hover:brightness-110 transition-all disabled:opacity-60"
							type="submit"
							disabled={changingPassword}
						>
							{changingPassword ? 'Ändere…' : 'Weiter'}
						</button>
						<button
							type="button"
							class="h-[38px] px-space-lg rounded-lg text-on-surface-variant hover:text-on-surface hover:bg-surface-container-high font-label-mono-sm text-label-mono-sm font-medium transition-all"
							onclick={() => (currentStep = 2)}
						>
							Überspringen
						</button>
					</div>
				</form>
			</div>
		{:else}
			<div class="bg-surface-container-low rounded-xl p-space-lg shadow-xl">
				<h2 class="font-headline-md text-headline-md text-on-surface mb-space-xs flex items-center gap-2">
					<i class="fa-solid fa-shop text-[20px] text-primary"></i>
					Händler auswählen
				</h2>
				<p class="font-body-sm text-body-sm text-on-surface-variant mb-space-md">
					Wähle, welche Module aus dem <a class="text-primary hover:underline" href="https://github.com/kurim/BonSync-Store" target="_blank" rel="noopener">BonSync-Store</a> installiert werden sollen -- weitere lassen sich jederzeit später über den Store-Tab nachinstallieren.
				</p>

				{#if data.catalogError}
					<div class="rounded-lg bg-amber-950/30 border border-amber-500/20 text-amber-200 p-space-md flex items-start gap-2 mb-space-md">
						<i class="fa-solid fa-triangle-exclamation text-[16px] shrink-0 mt-0.5"></i>
						<span class="font-body-sm text-body-sm">{data.catalogError}</span>
					</div>
				{:else}
					<form
						method="POST"
						action="?/installSelected"
						use:enhance={() => {
							installingSelected = true;
							return async ({ update }) => {
								installingSelected = false;
								await update();
							};
						}}
						class="flex flex-col gap-space-sm"
					>
						<div class="flex flex-col divide-y divide-surface-container-high/60 rounded-lg bg-surface-container-lowest/60 mb-space-sm">
							{#each data.modules as entry (entry.id)}
								{@const result = resultFor(entry.id)}
								<label class="flex items-center gap-space-sm p-space-sm cursor-pointer">
									<input
										type="checkbox"
										name="moduleIds"
										value={entry.id}
										checked={selectedIds.has(entry.id)}
										onchange={(e) => toggleSelected(entry.id, e.currentTarget.checked)}
										class="accent-primary"
									/>
									<div class="w-9 h-9 rounded-lg bg-surface-container-high flex items-center justify-center overflow-hidden shrink-0">
										{#if entry.ui?.logoUrl}
											<img src={entry.ui.logoUrl} alt="{entry.displayName} Logo" class="w-full h-full object-contain" />
										{:else}
											<span class="font-label-mono-xs text-label-mono-xs font-bold" style="color:{entry.ui?.color ?? undefined}">{entry.ui?.chip ?? entry.displayName.slice(0, 2).toUpperCase()}</span>
										{/if}
									</div>
									<div class="flex-1 min-w-0">
										<div class="font-body-md text-body-md font-medium text-on-surface">{entry.displayName}</div>
										<div class="font-label-mono-xs text-label-mono-xs text-outline truncate">{entry.authDescription}</div>
									</div>
									{#if result?.error}
										<span class="font-body-sm text-body-sm text-error shrink-0">{result.error}</span>
									{:else if result}
										<i class="fa-solid fa-circle-check text-emerald-400 text-[16px] shrink-0"></i>
									{/if}
								</label>
							{/each}
						</div>
						{#if form && 'installSelectedError' in form && form.installSelectedError}
							<p class="font-body-sm text-body-sm text-error">{form.installSelectedError}</p>
						{/if}
						<button
							type="submit"
							disabled={installingSelected || selectedIds.size === 0}
							class="h-[38px] rounded-lg bg-surface-container-high hover:bg-surface-container-highest text-on-surface font-label-mono-sm text-label-mono-sm font-semibold transition-all disabled:opacity-50 disabled:cursor-not-allowed"
						>
							{installingSelected ? 'Installiere…' : `Ausgewählte installieren (${selectedIds.size})`}
						</button>
					</form>
				{/if}

				<form
					method="POST"
					action="?/finish"
					use:enhance={() => {
						finishing = true;
					}}
					class="pt-space-md mt-space-md border-t border-outline-variant/20"
				>
					<button
						type="submit"
						disabled={finishing}
						class="w-full flex items-center justify-center gap-space-xs h-[38px] rounded-lg bg-primary text-on-primary-container font-label-mono-sm text-label-mono-sm font-semibold hover:brightness-110 transition-all disabled:opacity-60"
					>
						{finishing ? 'Fertigstellen…' : 'Fertigstellen'}
					</button>
				</form>
			</div>
		{/if}
	</div>
</div>
