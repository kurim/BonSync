import { readFileSync } from 'node:fs';
import { rm } from 'node:fs/promises';
import { join } from 'node:path';
import { fail } from '@sveltejs/kit';
import { db } from '$lib/server/db';
import { storeModules } from '$lib/server/db/schema';
import { getMeta, getLoaded } from '$lib/server/modules/registry';
import { stageZip, commitStagedInstall, isValidStagingDir } from '$lib/server/modules/packageInstaller';
import { parseManifest } from '$lib/server/modules/manifest';
import { fetchStoreCatalog, installFromCatalogEntry } from '$lib/server/modules/storeCatalog';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = async () => {
	const catalog = await fetchStoreCatalog();
	if ('error' in catalog) {
		return { catalogError: catalog.error, modules: [] };
	}

	const modules = catalog.modules.map((entry) => {
		const installedVersion = getLoaded(entry.id)?.manifest.version ?? null;
		return {
			entry,
			installedVersion,
			isInstalled: installedVersion !== null,
			hasUpdate: installedVersion !== null && installedVersion !== entry.version
		};
	});

	return { catalogError: null, modules };
};

export const actions: Actions = {
	/** Installiert bzw. aktualisiert ein Modul aus dem Store-Katalog. Der Katalog wird hier
	 * server-seitig erneut geladen (statt dem Client zu vertrauen) und der Eintrag anhand der
	 * übermittelten `id` herausgesucht -- gleiches Prinzip wie `installConfirm` im manuellen
	 * Upload-Flow, das das Manifest ebenfalls selbst aus dem Staging-Verzeichnis liest. */
	installFromStore: async ({ request }) => {
		const data = await request.formData();
		const id = String(data.get('id') ?? '');

		const catalog = await fetchStoreCatalog();
		if ('error' in catalog) return fail(400, { storeError: catalog.error, storeId: id });

		const entry = catalog.modules.find((m) => m.id === id);
		if (!entry) return fail(400, { storeError: `Modul "${id}" nicht im Store-Katalog gefunden.`, storeId: id });

		const overwrite = Boolean(getMeta(id));
		const result = await installFromCatalogEntry(entry, { overwrite });
		if ('error' in result) return fail(400, { storeError: result.error, storeId: id });

		await db.insert(storeModules).values({ id: result.id }).onConflictDoNothing().run();
		return { storeInstalledId: result.id };
	},

	/** Erster Schritt der manuellen Zip-Installation (Dangerzone) -- siehe
	 * dealer-interfaces/+page.server.ts (historisch, vor dem Umzug hierher) für die identische
	 * Logik: extrahiert + validiert das Paket in ein Staging-Verzeichnis, committet aber noch
	 * nichts. */
	installPreview: async ({ request }) => {
		const data = await request.formData();
		const file = data.get('file');
		if (!(file instanceof File) || file.size === 0) {
			return fail(400, { installError: 'Bitte eine Zip-Datei auswählen.' });
		}

		try {
			const buffer = Buffer.from(await file.arrayBuffer());
			const { stagingDir, manifest } = await stageZip(buffer);
			return {
				installPreview: {
					stagingDir,
					id: manifest.id,
					displayName: manifest.displayName,
					version: manifest.version,
					author: manifest.author ?? null,
					description: manifest.description ?? null,
					loginStrategyKind: manifest.loginStrategy.kind,
					alreadyInstalled: Boolean(getMeta(manifest.id)),
					installedVersion: getLoaded(manifest.id)?.manifest.version ?? null
				}
			};
		} catch (err) {
			return fail(400, { installError: err instanceof Error ? err.message : String(err) });
		}
	},

	/** Zweiter Schritt: committet ein zuvor gestagtes Paket (Dangerzone). */
	installConfirm: async ({ request }) => {
		const data = await request.formData();
		const stagingDir = String(data.get('stagingDir') ?? '');
		const overwrite = data.get('overwrite') === 'true';

		if (!isValidStagingDir(stagingDir)) {
			return fail(400, { installError: 'Ungültige oder abgelaufene Installationssitzung -- bitte Zip erneut hochladen.' });
		}

		try {
			const manifest = parseManifest(readFileSync(join(stagingDir, 'manifest.yaml'), 'utf8'));
			await commitStagedInstall(stagingDir, manifest, { overwrite, source: 'uploaded' });
			await db.insert(storeModules).values({ id: manifest.id }).onConflictDoNothing().run();
			return { installedId: manifest.id };
		} catch (err) {
			return fail(400, { installError: err instanceof Error ? err.message : String(err) });
		}
	},

	/** Verwirft eine noch nicht bestätigte Installation (Dangerzone "Abbrechen"). */
	cancelInstall: async ({ request }) => {
		const data = await request.formData();
		const stagingDir = String(data.get('stagingDir') ?? '');
		if (isValidStagingDir(stagingDir)) {
			await rm(stagingDir, { recursive: true, force: true });
		}
		return { installPreview: null };
	}
};
