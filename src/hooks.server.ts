import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { eq } from 'drizzle-orm';
import type { Handle } from '@sveltejs/kit';
import { redirect } from '@sveltejs/kit';
import { bootstrapSettings, isValidSession, SESSION_COOKIE } from '$lib/server/auth';
import { ensureSchema, db } from '$lib/server/db';
import { appSettings, storeModules } from '$lib/server/db/schema';
import { listMetas, scanAndLoadModules } from '$lib/server/modules/registry';
import { installModulePackage, clearStagingDir } from '$lib/server/modules/packageInstaller';
import { startSyncScheduler } from '$lib/server/scheduler';

/** Installiert die im Repo mitgelieferten Builtin-Module (modules-builtin/*.zip) NUR beim
 * allerersten Boot einer Instanz (Feld ist noch NULL) -- ein bewusst deinstalliertes Builtin
 * (siehe registry.ts/packageInstaller.ts) soll beim nächsten Neustart nicht ungefragt
 * wiederkehren, eine frische Instanz aber trotzdem sofort alle 4 Module vorfinden. */
async function seedBuiltinModulesOnce(): Promise<void> {
	const settings = await db.select().from(appSettings).where(eq(appSettings.id, 1)).get();
	if (settings?.builtinModulesSeededAt) return;

	const builtinDir = join(process.cwd(), 'modules-builtin');
	let files: string[] = [];
	try {
		files = readdirSync(builtinDir).filter((f) => f.endsWith('.zip'));
	} catch {
		files = [];
	}
	for (const file of files) {
		try {
			await installModulePackage(readFileSync(join(builtinDir, file)), { overwrite: false, source: 'builtin' });
		} catch (err) {
			console.error(`[bootstrap] Builtin-Modul "${file}" konnte nicht installiert werden: ${err instanceof Error ? err.message : String(err)}`);
		}
	}

	await db
		.update(appSettings)
		.set({ builtinModulesSeededAt: Date.now() })
		.where(eq(appSettings.id, 1))
		.run();
}

let bootstrapPromise: Promise<void> | null = null;
function bootstrapOnce(): Promise<void> {
	if (!bootstrapPromise) {
		bootstrapPromise = (async () => {
			ensureSchema();
			await bootstrapSettings();
			clearStagingDir();
			await seedBuiltinModulesOnce();
			await scanAndLoadModules();
			for (const meta of listMetas()) {
				await db.insert(storeModules).values({ id: meta.id }).onConflictDoNothing().run();
			}
			startSyncScheduler();
		})();
	}
	return bootstrapPromise;
}

const PUBLIC_PATHS = ['/login'];

export const handle: Handle = async ({ event, resolve }) => {
	await bootstrapOnce();

	const token = event.cookies.get(SESSION_COOKIE);
	const authenticated = await isValidSession(token);
	event.locals.authenticated = authenticated;

	const isPublic = PUBLIC_PATHS.some((p) => event.url.pathname.startsWith(p));
	if (!authenticated && !isPublic) {
		throw redirect(303, '/login');
	}
	if (authenticated && event.url.pathname === '/login') {
		throw redirect(303, '/dashboard');
	}

	return resolve(event);
};
