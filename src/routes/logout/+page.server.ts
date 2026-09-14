import { redirect } from '@sveltejs/kit';
import { destroySession, SESSION_COOKIE } from '$lib/server/auth';
import type { Actions } from './$types';

export const actions: Actions = {
	default: async ({ cookies }) => {
		const token = cookies.get(SESSION_COOKIE);
		if (token) await destroySession(token);
		cookies.delete(SESSION_COOKIE, { path: '/' });
		throw redirect(303, '/login');
	}
};
