<script lang="ts">
	import '../app.css';
	import { page, navigating } from '$app/state';
	import { browser } from '$app/environment';

	let { data, children } = $props();

	const SIDEBAR_COLLAPSED_KEY = 'bonsync-sidebar-collapsed';
	// Direkt aus localStorage vorbelegt (statt erst in onMount) -> kein Aufblitzen der
	// ausgeklappten Sidebar beim Laden, wenn der Nutzer sie manuell eingeklappt hatte.
	let sidebarCollapsed = $state(browser ? localStorage.getItem(SIDEBAR_COLLAPSED_KEY) === '1' : false);
	function toggleSidebar() {
		sidebarCollapsed = !sidebarCollapsed;
		if (browser) localStorage.setItem(SIDEBAR_COLLAPSED_KEY, sidebarCollapsed ? '1' : '0');
	}

	let accountMenuOpen = $state(false);
	let accountMenuRef: HTMLDivElement | undefined = $state();
	function onWindowClick(e: MouseEvent) {
		if (accountMenuOpen && accountMenuRef && !accountMenuRef.contains(e.target as Node)) {
			accountMenuOpen = false;
		}
	}

	const navItems = [
		{ href: '/dashboard', label: 'Dashboard', icon: 'fa-solid fa-tachograph-digital' },
		{ href: '/receipts', label: 'Kassenzettel', icon: 'fa-solid fa-receipt' },
		{ href: '/dealer-interfaces', label: 'Händler-Schnittstellen', icon: 'fa-regular fa-cloud' },
		{ href: '/statistics', label: 'Statistiken', icon: 'fa-solid fa-chart-column' },
		{ href: '/settings', label: 'Einstellungen', icon: 'fa-solid fa-gear' }
	];
</script>

{#if data.authenticated}
	<div class="shell" class:compact={sidebarCollapsed}>
		<aside class="sidebar" class:compact={sidebarCollapsed}>
			<div class="brand">
				<div class="brand-mark"><img src="/logos/bonsync.png" alt="BonSync" /></div>
				<div class="brand-text"><b>BonSync</b><span>KASSENBON&nbsp;HUB</span></div>
				<button type="button" class="collapse-toggle" onclick={toggleSidebar} title={sidebarCollapsed ? 'Sidebar ausklappen' : 'Sidebar einklappen'}>
					<i class="fa-solid fa-chevron-left" style="font-size:12px;"></i>
				</button>
			</div>
			<nav>
				{#each navItems as item (item.href)}
					<a
						class="nav-item"
						class:active={page.url.pathname.startsWith(item.href)}
						href={item.href}
					>
						<i class="{item.icon} nav-icon"></i>
						<span class="nav-label">{item.label}</span>
					</a>
				{/each}
			</nav>
			<div class="sidebar-foot account-menu-wrap" bind:this={accountMenuRef}>
				{#if accountMenuOpen}
					<div class="account-menu">
						<form method="POST" action="/logout">
							<button type="submit" class="nav-item">
								<i class="fa-solid fa-right-from-bracket nav-icon"></i>
								<span class="nav-label">Abmelden</span>
							</button>
						</form>
					</div>
				{/if}
				<button type="button" class="nav-item account-trigger" onclick={() => (accountMenuOpen = !accountMenuOpen)}>
					<span class="foot-label">Konto</span>
					<i class="fa-solid fa-ellipsis-vertical nav-icon"></i>
				</button>
			</div>
		</aside>
		<main>
			{@render children()}
		</main>
	</div>
{:else}
	{@render children()}
{/if}

{#if navigating.to}
	<!-- Seitenweite Ladeanzeige während einer Navigation (SvelteKit lädt Detailseiten teils live
	     nach, siehe receipts/[id] -- ohne das wirkt ein Klick so, als hätte er nichts bewirkt).
	     Das Overlay fängt Klicks ab (kein erneutes Auslösen der Navigation) und läuft bewusst ohne
	     FontAwesome, damit es auch dann sichtbar ist, wenn Icon-Fonts noch nicht geladen sind. -->
	<div class="nav-overlay" aria-hidden="true">
		<div class="nav-spinner"></div>
	</div>
{/if}

<svelte:window onclick={onWindowClick} />

<style>
	.account-menu-wrap { position: relative; width: 100%; }
	.account-trigger { width: 100%; justify-content: space-between; }
	.account-menu {
		position: absolute;
		bottom: calc(100% + 6px);
		left: 0;
		right: 0;
		background: var(--surface);
		border: 1px solid var(--border);
		border-radius: 8px;
		box-shadow: var(--shadow);
		padding: 4px;
		z-index: 30;
	}

	.nav-overlay {
		position: fixed;
		inset: 0;
		z-index: 1000;
		display: flex;
		align-items: center;
		justify-content: center;
		background: color-mix(in srgb, var(--bg) 45%, transparent);
		cursor: wait;
	}
	.nav-spinner {
		width: 36px;
		height: 36px;
		border-radius: 50%;
		border: 3px solid var(--border);
		border-top-color: var(--accent);
		animation: nav-spin 2s linear infinite;
	}
	@keyframes nav-spin {
		to { transform: rotate(360deg); }
	}
</style>
