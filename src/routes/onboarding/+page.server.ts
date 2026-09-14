import { fail, redirect } from '@sveltejs/kit';
import { checkPassword, setPassword, completeOnboarding, SESSION_COOKIE } from '$lib/server/auth';
import { fetchStoreCatalog, installFromCatalogEntry } from '$lib/server/modules/storeCatalog';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = async () => {
	const catalog = await fetchStoreCatalog();
	if ('error' in catalog) {
		return { catalogError: catalog.error, modules: [] };
	}
	return { catalogError: null, modules: catalog.modules };
};

export const actions: Actions = {
	/** Schritt 1 -- gleiche Validierung wie settings/+page.server.ts#changePassword (bewusst
	 * dupliziert statt geteilt: nur 2 Aufrufstellen, die Logik ist winzig). "Überspringen" im
	 * Client löst keinen Server-Call aus, sondern schaltet nur lokal auf Schritt 2 um. */
	changePassword: async ({ request, cookies }) => {
		const data = await request.formData();
		const current = String(data.get('currentPassword') ?? '');
		const next = String(data.get('newPassword') ?? '');
		const confirm = String(data.get('confirmPassword') ?? '');

		if (!(await checkPassword(current))) return fail(400, { passwordError: 'Aktuelles Passwort ist falsch.' });
		if (next.length < 8) return fail(400, { passwordError: 'Neues Passwort muss mind. 8 Zeichen haben.' });
		if (next !== confirm) return fail(400, { passwordError: 'Neue Passwörter stimmen nicht überein.' });

		await setPassword(next, cookies.get(SESSION_COOKIE));
		return { passwordChanged: true };
	},

	/** Schritt 2 -- installiert alle angehakten Katalog-Module. Bricht bei einem Fehler nicht ab,
	 * sondern sammelt Fehler pro Modul (eine kaputte REWE-Zip soll nicht verhindern, dass LIDL
	 * trotzdem installiert wird). */
	installSelected: async ({ request }) => {
		const data = await request.formData();
		const ids = data.getAll('moduleIds').map(String);
		if (ids.length === 0) return { installResults: [] };

		const catalog = await fetchStoreCatalog();
		if ('error' in catalog) return fail(400, { installSelectedError: catalog.error });

		const results: { id: string; error?: string }[] = [];
		for (const id of ids) {
			const entry = catalog.modules.find((m) => m.id === id);
			if (!entry) {
				results.push({ id, error: 'Nicht im Store-Katalog gefunden.' });
				continue;
			}
			const result = await installFromCatalogEntry(entry, { overwrite: false });
			results.push('error' in result ? { id, error: result.error } : { id });
		}
		return { installResults: results };
	},

	/** Schließt das Onboarding ab -- auch ohne installierte Module zulässig (kann jederzeit
	 * später über den Modul-Store nachgeholt werden). */
	finish: async () => {
		await completeOnboarding();
		throw redirect(303, '/dashboard');
	}
};
