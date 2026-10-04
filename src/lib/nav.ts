// Hauptnavigation -- gemeinsame Quelle für die Sidebar (Desktop/iPad) und die Bottom-Navigation
// (iPhone/Handy, siehe BottomNav.svelte). `primary` = direkt in der Bottom-Leiste sichtbar; alles
// andere landet dort hinter "Mehr". Mobil ist BonSync vor allem zum Ansehen gedacht, daher nur die
// drei Ansichtsseiten als Hauptziele.
export type NavItem = { href: string; label: string; icon: string; primary?: boolean };

export const navItems: NavItem[] = [
	{ href: '/dashboard', label: 'Dashboard', icon: 'fa-solid fa-tachograph-digital', primary: true },
	{ href: '/receipts', label: 'Kassenzettel', icon: 'fa-solid fa-receipt', primary: true },
	{ href: '/angebote', label: 'Angebote', icon: 'fa-solid fa-tags' },
	{ href: '/deals', label: 'Deals für mich', icon: 'fa-solid fa-piggy-bank' },
	{ href: '/dealer-interfaces', label: 'Händler-Schnittstellen', icon: 'fa-regular fa-cloud' },
	{ href: '/filialen', label: 'Filial-Standorte', icon: 'fa-solid fa-location-dot' },
	{ href: '/statistics', label: 'Statistiken', icon: 'fa-solid fa-chart-column', primary: true },
	{ href: '/store', label: 'Modul-Store', icon: 'fa-solid fa-shop' },
	{ href: '/settings', label: 'Einstellungen', icon: 'fa-solid fa-gear' }
];

export function isActive(pathname: string, href: string): boolean {
	return pathname.startsWith(href);
}
