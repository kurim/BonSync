import { eq } from 'drizzle-orm';
import { fail } from '@sveltejs/kit';
import { db } from '$lib/server/db';
import { appSettings } from '$lib/server/db/schema';
import { checkPassword, setPassword, getSettings, SESSION_COOKIE } from '$lib/server/auth';
import { encryptJson, decryptJson } from '$lib/server/crypto';
import { testMqttConnection } from '$lib/server/mqtt';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = async () => {
	const settings = await getSettings();
	return {
		settings: {
			eagerPdfLimit: settings.eagerPdfLimit,
			mqttHost: settings.mqttHost ?? '',
			mqttPort: settings.mqttPort ?? 1883,
			mqttUsername: settings.mqttUsername ?? '',
			mqttTls: settings.mqttTls,
			// Das Passwort selbst wird nie ans Frontend zurückgegeben (auch nicht verschlüsselt) —
			// nur ob eines hinterlegt ist, fürs Platzhalter-Verhalten im Formular.
			mqttPasswordSet: Boolean(settings.mqttPasswordEnc),
			mqttBaseTopic: settings.mqttBaseTopic ?? 'bonsync/',
			mqttPublishNew: settings.mqttPublishNew,
			mqttPublishSummary: settings.mqttPublishSummary,
			syncIntervalMinutes: settings.syncIntervalMinutes
		}
	};
};

export const actions: Actions = {
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

	saveMqtt: async ({ request }) => {
		const data = await request.formData();
		const password = String(data.get('mqttPassword') ?? '');
		const clearPassword = data.get('mqttPasswordClear') === 'on';

		const set: Partial<typeof appSettings.$inferInsert> = {
			mqttHost: String(data.get('mqttHost') ?? ''),
			mqttPort: Number(data.get('mqttPort') ?? 1883),
			mqttUsername: String(data.get('mqttUsername') ?? ''),
			mqttTls: data.get('mqttTls') === 'on',
			mqttBaseTopic: String(data.get('mqttBaseTopic') ?? 'bonsync/'),
			mqttPublishNew: data.get('mqttPublishNew') === 'on',
			mqttPublishSummary: data.get('mqttPublishSummary') === 'on'
		};
		// Leeres Feld -> bestehendes Passwort unangetastet lassen (nie im Klartext ans Formular
		// zurückgegeben, ein leeres Feld heißt hier "keine Änderung", nicht "löschen").
		if (clearPassword) set.mqttPasswordEnc = null;
		else if (password) set.mqttPasswordEnc = encryptJson(password);

		await db.update(appSettings).set(set).where(eq(appSettings.id, 1)).run();
		return { mqttSaved: true };
	},

	/** Sync-Intervall + Eager-PDF-Grenze betreffen den Sync-Scheduler generell, nicht nur MQTT --
	 * eigene Action, damit sie unabhängig von den MQTT-Einstellungen gespeichert werden. */
	saveSync: async ({ request }) => {
		const data = await request.formData();
		const set: Partial<typeof appSettings.$inferInsert> = {
			eagerPdfLimit: Number(data.get('eagerPdfLimit') ?? 25),
			syncIntervalMinutes: Math.max(0, Number(data.get('syncIntervalMinutes') ?? 60))
		};

		await db.update(appSettings).set(set).where(eq(appSettings.id, 1)).run();
		return { syncSaved: true };
	},

	/** Testet die aktuell im Formular eingetragenen Werte (nicht erst nach dem Speichern) --
	 * bleibt das Passwortfeld leer und ist bereits eines hinterlegt, wird das gespeicherte
	 * Passwort für den Test verwendet (gleiche "leer = keine Änderung"-Semantik wie beim
	 * Speichern). Baut nur eine Verbindung auf, veröffentlicht nichts. */
	testMqtt: async ({ request }) => {
		const data = await request.formData();
		const host = String(data.get('mqttHost') ?? '').trim();
		if (!host) return fail(400, { mqttTestError: 'Host fehlt.' });

		const port = Number(data.get('mqttPort') ?? 1883);
		const username = String(data.get('mqttUsername') ?? '');
		const tls = data.get('mqttTls') === 'on';
		const passwordField = String(data.get('mqttPassword') ?? '');

		let password: string | null = null;
		if (passwordField) {
			password = passwordField;
		} else {
			const settings = await getSettings();
			password = settings.mqttPasswordEnc ? decryptJson<string>(settings.mqttPasswordEnc) : null;
		}

		const result = await testMqttConnection({ host, port, username, password, tls });
		return result.ok ? { mqttTestOk: true } : fail(400, { mqttTestError: result.error });
	}
};
