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

	const response = await resolve(event);

	// Basis-Security-Header für jede Antwort (die Content-Security-Policy selbst kommt aus
	// svelte.config.js#kit.csp, damit SvelteKit sein Init-Skript passend mit Nonce versieht).
	response.headers.set('X-Content-Type-Options', 'nosniff');
	response.headers.set('X-Frame-Options', 'DENY');
	response.headers.set('Referrer-Policy', 'same-origin');
	response.headers.set('Permissions-Policy', 'camera=(), microphone=(), geolocation=(), payment=()');
	if (process.env.COOKIE_SECURE === 'true') {
		// Nur sinnvoll, wenn die Instanz tatsächlich per HTTPS erreichbar ist (gleiche Bedingung wie
		// das Secure-Flag des Session-Cookies) -- sonst würde HSTS eine http://-Heimnetz-Instanz
		// für den Browser dauerhaft unerreichbar machen.
		response.headers.set('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
	}
	return response;
};
