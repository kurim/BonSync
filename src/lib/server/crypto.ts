import { randomBytes, scryptSync, createCipheriv, createDecipheriv, timingSafeEqual } from 'node:crypto';

function appSecret(): string {
	const secret = process.env.APP_SECRET;
	if (!secret || secret.length < 16) {
		throw new Error('APP_SECRET fehlt oder ist zu kurz (min. 16 Zeichen) — siehe .env.example');
	}
	return secret;
}

/** Verschlüsselt ein beliebiges JSON-Objekt at-rest (AES-256-GCM, Key via scrypt aus APP_SECRET + Salt). */
export function encryptJson(value: unknown): string {
	const salt = randomBytes(16);
	const key = scryptSync(appSecret(), salt, 32);
	const iv = randomBytes(12);
	const cipher = createCipheriv('aes-256-gcm', key, iv);
	const plaintext = Buffer.from(JSON.stringify(value), 'utf8');
	const ciphertext = Buffer.concat([cipher.update(plaintext), cipher.final()]);
	const tag = cipher.getAuthTag();
	return Buffer.concat([salt, iv, tag, ciphertext]).toString('base64');
}

export function decryptJson<T = unknown>(blob: string): T {
	const raw = Buffer.from(blob, 'base64');
	const salt = raw.subarray(0, 16);
	const iv = raw.subarray(16, 28);
	const tag = raw.subarray(28, 44);
	const ciphertext = raw.subarray(44);
	const key = scryptSync(appSecret(), salt, 32);
	const decipher = createDecipheriv('aes-256-gcm', key, iv);
	decipher.setAuthTag(tag);
	const plaintext = Buffer.concat([decipher.update(ciphertext), decipher.final()]);
	return JSON.parse(plaintext.toString('utf8'));
}

/** Passwort-Hashing für den App-Login (scrypt, kein natives Addon nötig — läuft in jedem Docker-Base-Image). */
export function hashPassword(password: string): string {
	const salt = randomBytes(16);
	const hash = scryptSync(password, salt, 64);
	return `${salt.toString('hex')}:${hash.toString('hex')}`;
}

export function verifyPassword(password: string, stored: string): boolean {
	const [saltHex, hashHex] = stored.split(':');
	if (!saltHex || !hashHex) return false;
	const salt = Buffer.from(saltHex, 'hex');
	const expected = Buffer.from(hashHex, 'hex');
	const actual = scryptSync(password, salt, expected.length);
	return actual.length === expected.length && timingSafeEqual(actual, expected);
}

export function randomToken(bytes = 32): string {
	return randomBytes(bytes).toString('base64url');
}
