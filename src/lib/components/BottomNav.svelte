<script lang="ts">
	import { page } from '$app/state';
	import { navItems, isActive } from '$lib/nav';

	let { appVersion }: { appVersion: string } = $props();

	const primaryItems = navItems.filter((i) => i.primary);
	const moreItems = navItems.filter((i) => !i.primary);

	let moreOpen = $state(false);
	let sheetRef: HTMLDivElement | undefined = $state();

	const moreActive = $derived(moreItems.some((i) => isActive(page.url.pathname, i.href)));

	// Nach jeder Navigation (auch per Zurück-Geste) das Sheet schließen.
	$effect(() => {
		page.url.pathname;
		moreOpen = false;
	});

	$effect(() => {
		if (moreOpen) sheetRef?.focus();
	});

	function onKeydown(e: KeyboardEvent) {
		if (moreOpen && e.key === 'Escape') moreOpen = false;
	}
</script>

<svelte:window onkeydown={onKeydown} />

{#if moreOpen}
	<button type="button" class="sheet-backdrop" aria-label="Menü schließen" onclick={() => (moreOpen = false)}></button>
	<div class="sheet" role="dialog" aria-modal="true" aria-label="Weitere Bereiche" tabindex="-1" bind:this={sheetRef}>
		{#each moreItems as item (item.href)}
			<a
				class="nav-item"
				class:active={isActive(page.url.pathname, item.href)}
				aria-current={isActive(page.url.pathname, item.href) ? 'page' : undefined}
				href={item.href}
			>
				<i class="{item.icon} nav-icon"></i>
				<span class="nav-label">{item.label}</span>
			</a>
		{/each}
		<div class="sheet-foot">
			<form method="POST" action="/logout">
				<button type="submit" class="nav-item">
					<i class="fa-solid fa-right-from-bracket nav-icon"></i>
					<span class="nav-label">Abmelden</span>
				</button>
			</form>
			<span class="sheet-version mono">{appVersion}</span>
		</div>
	</div>
{/if}

<nav class="bottom-nav" aria-label="Hauptnavigation">
	{#each primaryItems as item (item.href)}
		{@const active = isActive(page.url.pathname, item.href)}
		<a class="tab" class:active href={item.href} aria-current={active ? 'page' : undefined}>
			<i class={item.icon}></i>
			<span>{item.label}</span>
		</a>
	{/each}
	<button
		type="button"
		class="tab"
		class:active={moreActive || moreOpen}
		aria-expanded={moreOpen}
		onclick={() => (moreOpen = !moreOpen)}
	>
		<i class="fa-solid fa-ellipsis"></i>
		<span>Mehr</span>
	</button>
</nav>

<style>
	/* display wird global in app.css per Media Query gesteuert (nur mobil sichtbar) -- hier bewusst
	   kein display setzen, sonst würde die spezifischere Svelte-Klasse das überschreiben. */
	.bottom-nav {
		position: fixed;
		left: 0;
		right: 0;
		bottom: 0;
		z-index: 40;
		flex-direction: row;
		gap: 0;
		padding: 0 env(safe-area-inset-right) env(safe-area-inset-bottom) env(safe-area-inset-left);
		background: color-mix(in srgb, var(--surface) 94%, transparent);
		backdrop-filter: blur(10px);
		border-top: 1px solid var(--border);
	}
	.tab {
		flex: 1 1 0;
		height: 56px;
		display: flex;
		flex-direction: column;
		align-items: center;
		justify-content: center;
		gap: 4px;
		background: none;
		border: none;
		color: var(--text-muted);
		font-size: 11px;
		font-weight: 600;
		-webkit-tap-highlight-color: transparent;
	}
	.tab i {
		font-size: 18px;
	}
	.tab.active {
		color: var(--accent);
	}
	.tab.active span {
		color: var(--text);
	}

	.sheet-backdrop {
		position: fixed;
		inset: 0;
		z-index: 38;
		border: none;
		background: color-mix(in srgb, var(--bg) 55%, transparent);
	}
	.sheet {
		position: fixed;
		left: calc(8px + env(safe-area-inset-left));
		right: calc(8px + env(safe-area-inset-right));
		bottom: calc(56px + env(safe-area-inset-bottom) + 8px);
		z-index: 39;
		display: flex;
		flex-direction: column;
		gap: 2px;
		padding: 6px;
		background: var(--surface);
		border: 1px solid var(--border);
		border-radius: 12px;
		box-shadow: var(--shadow);
		outline: none;
	}
	.sheet .nav-item {
		padding: 12px;
	}
	.sheet-foot {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 8px;
		margin-top: 4px;
		padding-top: 4px;
		border-top: 1px solid var(--border);
	}
	.sheet-foot form {
		flex: 1;
	}
	.sheet-version {
		font-size: 10px;
		color: var(--text-muted);
		opacity: 0.7;
		padding-right: 8px;
	}
</style>
