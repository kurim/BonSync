import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { error } from '@sveltejs/kit';
import { and, eq } from 'drizzle-orm';
import { db } from '#lib/server/db';
import { offers } from '#lib/server/db/schema';
import { rawRequest } from '#lib/server/http';
import type { RequestHandler } from './$types';

// Produktbilder der Angebote werden über den eigenen Server geladen und zwischengespeichert: Die
// CSP der App erlaubt keine fremden Bild-Hosts, und CDNs sperren Hotlinking teils per Referer.
// Geholt wird nur eine URL, die als Angebotsbild in der Datenbank steht (kein offener Proxy), und
// erst beim ersten Anzeigen (img loading="lazy"), danach aus dem Cache.
const MAX_BYTES = 3 * 1024 * 1024;
const BROWSER_UA = 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36';

function cacheDir(): string {
	const dir = join(process.env.DATA_DIR ?? './data', 'cache', 'offer-images');
	mkdirSync(dir, { recursive: true });
	return dir;
}

function isPublicHttps(raw: string): URL | null {
	try {
		const u = new URL(raw);
		if (u.protocol !== 'https:') return null;
		const h = u.hostname.toLowerCase();
		if (h === 'localhost' || h.endsWith('.local') || h.endsWith('.internal') || /^[\d.]+$/.test(h) || h.includes(':')) return null;
		return u;
	} catch {
		return null;
	}
}

async function download(start: URL): Promise<{ body: Buffer; type: string } | null> {
	let url = start;
	for (let hop = 0; hop < 4; hop++) {
		const res = await rawRequest(url.toString(), { headers: { 'User-Agent': BROWSER_UA, Accept: 'image/avif,image/webp,image/*,*/*;q=0.8' } });
		if (res.status >= 300 && res.status < 400 && res.headers.location) {
			const next = isPublicHttps(new URL(String(res.headers.location), url).toString());
			if (!next) return null;
			url = next;
			continue;
		}
		const type = String(res.headers['content-type'] ?? '').split(';')[0].trim().toLowerCase();
		if (res.status !== 200 || !type.startsWith('image/') || type.includes('svg') || res.body.length === 0 || res.body.length > MAX_BYTES) return null;
		return { body: res.body, type };
	}
	return null;
}

export const GET: RequestHandler = async ({ url }) => {
	const storeId = url.searchParams.get('s') ?? '';
	const externalId = url.searchParams.get('id') ?? '';
	const row = await db.select({ imageUrl: offers.imageUrl }).from(offers).where(and(eq(offers.storeId, storeId), eq(offers.externalId, externalId))).get();
	const source = row?.imageUrl ? isPublicHttps(row.imageUrl) : null;
	if (!source) throw error(404, 'Kein Bild');

	const key = createHash('sha256').update(source.toString()).digest('hex');
	const file = join(cacheDir(), key);
	const typeFile = `${file}.type`;
	if (!(existsSync(file) && existsSync(typeFile))) {
		let img: Awaited<ReturnType<typeof download>> = null;
		try {
			img = await download(source);
		} catch (err) {
			console.error(`[offers] Bild konnte nicht geladen werden (${source.hostname}): ${err instanceof Error ? err.message : String(err)}`);
		}
		if (!img) throw error(404, 'Bild nicht verfügbar');
		writeFileSync(file, img.body);
		writeFileSync(typeFile, img.type);
	}

	return new Response(readFileSync(file), {
		headers: {
			'Content-Type': readFileSync(typeFile, 'utf8'),
			'Cache-Control': 'private, max-age=604800, immutable',
			'X-Content-Type-Options': 'nosniff'
		}
	});
};
