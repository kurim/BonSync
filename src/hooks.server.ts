import type { Handle } from '@sveltejs/kit';
import { redirect } from '@sveltejs/kit';
import { bootstrapSettings, isValidSession, needsOnboarding, SESSION_COOKIE } from '$lib/server/auth';
import { ensureSchema, db } from '$lib/server/db';
import { storeModules } from '$lib/server/db/schema';
import { listMetas, scanAndLoadModules } from '$lib/server/modules/registry';
import { clearStagingDir } from '$lib/server/modules/packageInstaller';
import { startSyncScheduler } from '$lib/server/scheduler';

let bootstrapPromise: Promise<void> | null = null;
function bootstrapOnce(): Promise<void> {
	if (!bootstrapPromise) {
		bootstrapPromise = (async () => {
			ensureSchema();
			await bootstrapSettings();
			clearStagingDir();
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
// Läuft ohne die normale Sidebar/Navigation (siehe +layout.svelte) und darf auch während eines
// ausstehenden Onboardings erreichbar sein -- ein Logout muss immer möglich sein, auch mitten im
// Einrichtungsassistenten.
const ONBOARDING_EXEMPT_PATHS = ['/onboarding', '/logout'];

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

	if (authenticated) {
		const pendingOnboarding = await needsOnboarding();
		const isOnboardingExempt = ONBOARDING_EXEMPT_PATHS.some((p) => event.url.pathname.startsWith(p));
		if (pendingOnboarding && !isOnboardingExempt) {
			throw redirect(303, '/onboarding');
		}
		if (!pendingOnboarding && event.url.pathname === '/onboarding') {
			throw redirect(303, '/dashboard');
		}
	}

	return resolve(event);
};
