import { existsSync, readFileSync } from 'node:fs';
import { extname, join, normalize, sep } from 'node:path';
import { error } from '@sveltejs/kit';
import { modulesDir } from '$lib/server/modules/registry';
import type { RequestHandler } from './$types';

/** Liefert eine Datei aus einem installierten Modul-Paket (${DATA_DIR}/modules/<id>/<file>) --
 * aktuell nur für das optionale Manifest-Logo (`ui.logo`, siehe manifest.ts) gedacht. Ein
 * `static/`-Ordner ist in einer gebauten adapter-node-App zur Laufzeit nicht beschreibbar, daher
 * müssen Modul-Assets dynamisch ausgeliefert werden statt beim Install dorthin kopiert zu werden. */
const ALLOWED_EXTENSIONS: Record<string, string> = {
	'.png': 'image/png',
	'.svg': 'image/svg+xml',
	'.jpg': 'image/jpeg',
	'.jpeg': 'image/jpeg',
	'.webp': 'image/webp'
};

const ID_PATTERN = /^[a-z0-9][a-z0-9-]{1,31}$/;

export const GET: RequestHandler = async ({ params }) => {
	if (!ID_PATTERN.test(params.id)) throw error(400, 'Ungültige Modul-Id');

	const contentType = ALLOWED_EXTENSIONS[extname(params.file).toLowerCase()];
	if (!contentType) throw error(400, 'Dateityp nicht erlaubt');

	const moduleDir = normalize(join(modulesDir(), params.id) + sep);
	const targetPath = normalize(join(moduleDir, params.file));
	if (!targetPath.startsWith(moduleDir)) throw error(400, 'Ungültiger Dateipfad');
	if (!existsSync(targetPath)) throw error(404, 'Datei nicht gefunden');

	const body = readFileSync(targetPath);
	return new Response(body, {
		headers: {
			'Content-Type': contentType,
			'Cache-Control': 'private, max-age=3600'
		}
	});
};
