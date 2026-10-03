<script lang="ts">
	import '../app.css';
	import { page, navigating, updated } from '$app/state';
	import { browser } from '$app/environment';
	import { navItems, isActive } from '$lib/nav';
	import BottomNav from '$lib/components/BottomNav.svelte';

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
</script>

{#if data.authenticated && page.url.pathname !== '/onboarding'}
	<div class="shell" class:compact={sidebarCollapsed}>
		<aside class="sidebar" class:compact={sidebarCollapsed}>
			<div class="brand">
				<div class="brand-mark"><img src="/logos/bonsync.png" alt="BonSync" /></div>
				<div class="brand-text">
						<b>BonSync</b>
						<span>KASSENBON&nbsp;HUB</span>
						<span class="brand-version">{data.appVersion}</span>
					</div>
				<button type="button" class="collapse-toggle" onclick={toggleSidebar} title={sidebarCollapsed ? 'Sidebar ausklappen' : 'Sidebar einklappen'}>
					<i class="fa-solid fa-chevron-left" style="font-size:12px;"></i>
				</button>
			</div>
			<nav>
				{#each navItems as item (item.href)}
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
		<!-- Nur mobil sichtbar (iPhone/Handy, siehe app.css): schlanke Kopfzeile statt Sidebar. -->
		<header class="mobile-header">
			<a href="/dashboard" class="brand-link">
				<span class="brand-mark"><img src="/logos/bonsync.png" alt="" /></span>
				<b>BonSync</b>
			</a>
		</header>
		<main>
			{@render children()}
		</main>
	</div>
	<BottomNav appVersion={data.appVersion} />
{:else}
	{@render children()}
{/if}

{#if updated.current}
	<!-- Neuer Build auf dem Server (Polling, siehe svelte.config.js#kit.version). Die nächste
	     Navigation lädt ohnehin die ganze Seite neu; der Hinweis macht das sofort möglich. -->
	<div class="update-toast" role="status">
		<i class="fa-solid fa-rotate"></i>
		<span>Neue Version verfügbar</span>
		<button type="button" onclick={() => location.reload()}>Neu laden</button>
	</div>
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
	.brand-link { display: flex; align-items: center; gap: 8px; }
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

	.update-toast {
		position: fixed;
		right: calc(16px + env(safe-area-inset-right));
		bottom: calc(16px + env(safe-area-inset-bottom));
		z-index: 50;
		display: flex;
		align-items: center;
		gap: 10px;
		padding: 10px 10px 10px 14px;
		background: var(--surface-2);
		border: 1px solid var(--border);
		border-radius: 10px;
		box-shadow: var(--shadow);
		font-size: 13px;
		font-weight: 600;
	}
	.update-toast i {
		color: var(--accent);
	}
	.update-toast button {
		padding: 6px 12px;
		border: none;
		border-radius: 7px;
		background: var(--accent);
		color: var(--accent-ink);
		font-weight: 700;
	}
	/* Mobil über der Bottom-Navigation (56px) statt darunter, gleiche Query wie in app.css. */
	@media (max-width: 767px), (max-height: 500px) and (pointer: coarse) {
		.update-toast {
			left: calc(12px + env(safe-area-inset-left));
			right: calc(12px + env(safe-area-inset-right));
			bottom: calc(56px + env(safe-area-inset-bottom) + 12px);
		}
		.update-toast span {
			flex: 1;
		}
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
		/* Erst nach 150ms sichtbar: schnelle Seitenwechsel sollen nicht aufflackern. Klicks fängt
		   das Overlay trotzdem sofort ab. */
		opacity: 0;
		animation: nav-overlay-in 0.15s ease-out 0.15s forwards;
	}
	@keyframes nav-overlay-in {
		to { opacity: 1; }
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
