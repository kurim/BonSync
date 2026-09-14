import { fail, redirect } from '@sveltejs/kit';
import { checkPassword, createSession, SESSION_COOKIE } from '$lib/server/auth';
import { clearLoginFailures, loginBlockedMs, recordLoginFailure } from '$lib/server/rateLimit';
import type { Actions } from './$types';

function clientIp(getClientAddress: () => string): string {
	try {
		return getClientAddress();
	} catch {
		return 'unknown';
	}
}

export const actions: Actions = {
	default: async ({ request, cookies, getClientAddress }) => {
		const ip = clientIp(getClientAddress);

		// Brute-Force-Schutz (siehe rateLimit.ts): gesperrte IPs bekommen gar keinen Passwort-
		// Vergleich mehr, damit auch der scrypt-Aufwand nicht für Rateversuche zur Verfügung steht.
		const wait = loginBlockedMs(ip);
		if (wait > 0) {
			return fail(429, { error: `Zu viele Fehlversuche -- bitte ${Math.ceil(wait / 1000)} Sekunden warten.` });
		}

		const data = await request.formData();
		const password = String(data.get('password') ?? '');

		if (!password || !(await checkPassword(password))) {
			recordLoginFailure(ip);
			console.warn(`[auth] Login fehlgeschlagen von ${ip}`);
			return fail(400, { error: 'Falsches Passwort.' });
		}

		clearLoginFailures(ip);
		console.info(`[auth] Login erfolgreich von ${ip}`);

		const { token, expiresAt } = await createSession();
		cookies.set(SESSION_COOKIE, token, {
			path: '/',
			httpOnly: true,
			sameSite: 'lax',
			secure: process.env.COOKIE_SECURE === 'true',
			expires: new Date(expiresAt)
		});

		throw redirect(303, '/dashboard');
	}
};
