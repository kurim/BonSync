import { eq } from 'drizzle-orm';
import { error } from '@sveltejs/kit';
import { existsSync, readFileSync } from 'node:fs';
import { db } from '$lib/server/db';
import { receipts } from '$lib/server/db/schema';
import { loadCredentials, fetchAndStorePdfAndItems, pdfPath } from '$lib/server/sync';
import { getModule } from '$lib/server/modules/registry';
import type { StoreId } from '$lib/server/modules/types';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = async ({ params }) => {
	const receipt = await db.select().from(receipts).where(eq(receipts.id, params.id)).get();
	if (!receipt) throw error(404, 'Beleg nicht gefunden');

	const storeId = receipt.storeId as StoreId;
	const path = pdfPath(storeId, receipt.externalId);

	if (!existsSync(path)) {
		const module = getModule(storeId);
		const creds = module ? await loadCredentials(storeId) : null;
		if (!module || !creds) throw error(404, 'PDF (noch) nicht verfügbar');
		const fresh = await module.ensureFreshCredentials(creds);
		await fetchAndStorePdfAndItems(storeId, receipt.externalId, fresh);
		if (!existsSync(path)) throw error(502, 'PDF konnte nicht geladen werden');
	}

	const body = readFileSync(path);
	return new Response(body, {
		headers: {
			'Content-Type': 'application/pdf',
			'Content-Disposition': `inline; filename="${storeId}-${receipt.externalId}.pdf"`
		}
	});
};
