import { eq, lt } from 'drizzle-orm';
import { db, ensureSchema } from './db';
import { appSettings, sessions } from './db/schema';
import { hashPassword, verifyPassword, randomToken } from './crypto';

export const SESSION_COOKIE = 'bonsync_session';
const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000; // 30 Tage

/** Einmalig beim Start: legt die Settings-Zeile an, falls sie fehlt (Passwort aus APP_PASSWORD env). */
export async function bootstrapSettings() {
	ensureSchema();
	const existing = await db.select().from(appSettings).where(eq(appSettings.id, 1)).get();
	if (existing) return;

	const initialPassword = process.env.APP_PASSWORD;
	if (!initialPassword) {
		throw new Error(
			'Keine app_settings-Zeile vorhanden und APP_PASSWORD nicht gesetzt — bitte in .env setzen (einmaliges Bootstrap-Passwort, danach in den Einstellungen änderbar).'
		);
	}
	await db.insert(appSettings).values({ id: 1, passwordHash: hashPassword(initialPassword) }).run();
}

export async function getSettings() {
	const row = await db.select().from(appSettings).where(eq(appSettings.id, 1)).get();
	if (!row) throw new Error('app_settings fehlt — bootstrapSettings() wurde nicht aufgerufen.');
	return row;
}

export async function checkPassword(password: string): Promise<boolean> {
	const settings = await getSettings();
	return verifyPassword(password, settings.passwordHash);
}

export async function setPassword(newPassword: string) {
	await db.update(appSettings).set({ passwordHash: hashPassword(newPassword) }).where(eq(appSettings.id, 1)).run();
}

export async function createSession(): Promise<{ token: string; expiresAt: number }> {
	const token = randomToken();
	const now = Date.now();
	const expiresAt = now + SESSION_TTL_MS;
	await db.insert(sessions).values({ token, createdAt: now, expiresAt }).run();
	await pruneExpiredSessions();
	return { token, expiresAt };
}

export async function isValidSession(token: string | undefined): Promise<boolean> {
	if (!token) return false;
	const row = await db.select().from(sessions).where(eq(sessions.token, token)).get();
	if (!row) return false;
	if (row.expiresAt < Date.now()) {
		await db.delete(sessions).where(eq(sessions.token, token)).run();
		return false;
	}
	return true;
}

export async function destroySession(token: string) {
	await db.delete(sessions).where(eq(sessions.token, token)).run();
}

async function pruneExpiredSessions() {
	await db.delete(sessions).where(lt(sessions.expiresAt, Date.now())).run();
}
