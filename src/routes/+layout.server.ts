import type { LayoutServerLoad } from './$types';

export const load: LayoutServerLoad = async ({ locals }) => {
	return { authenticated: locals.authenticated, appVersion: process.env.APP_VERSION ?? 'dev' };
};
