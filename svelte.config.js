import adapter from '@sveltejs/adapter-node';
import { vitePreprocess } from '@sveltejs/vite-plugin-svelte';

/** @type {import('@sveltejs/kit').Config} */
const config = {
	preprocess: vitePreprocess(),
	kit: {
		adapter: adapter({
			out: 'build'
		}),
		// Content-Security-Policy -- SvelteKit versieht sein eigenes Init-Skript automatisch mit
		// Nonce/Hash ("auto"), alles andere kommt aus dem eigenen Origin. Externe Ziele sind nur die
		// MapTiler-Kacheln/-Geocoding (Filial-Karte) und die Logo-Bilder aus dem BonSync-Store-Katalog
		// (siehe storeCatalog.ts#ALLOWED_HOSTS). Weitere Security-Header setzt hooks.server.ts.
		csp: {
			mode: 'auto',
			directives: {
				'default-src': ['self'],
				'script-src': ['self'],
				// 'unsafe-inline' für Styles ist nötig, weil die Seiten Modul-Farben über
				// style="..."-Attribute setzen (Werte sind auf Hex-Farben eingeschränkt).
				'style-src': ['self', 'unsafe-inline'],
				'font-src': ['self', 'data:'],
				'img-src': [
					'self',
					'data:',
					'blob:',
					'https://api.maptiler.com',
					'https://github.com',
					'https://raw.githubusercontent.com',
					'https://objects.githubusercontent.com'
				],
				'connect-src': ['self', 'https://api.maptiler.com'],
				'frame-ancestors': ['none'],
				'object-src': ['none'],
				'base-uri': ['self'],
				'form-action': ['self']
			}
		}
	}
};

export default config;
