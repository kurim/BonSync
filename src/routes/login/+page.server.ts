import { fail, redirect } from '@sveltejs/kit';
import { checkPassword, createSession, SESSION_COOKIE } from '$lib/server/auth';
import type { Actions } from './$types';

export const actions: Actions = {
	default: async ({ request, cookies }) => {
		const data = await request.formData();
		const password = String(data.get('password') ?? '');

		if (!password || !(await checkPassword(password))) {
			return fail(400, { error: 'Falsches Passwort.' });
		}

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
