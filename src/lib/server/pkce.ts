import { randomBytes, createHash } from 'node:crypto';

export function generateCodeVerifier(): string {
	return randomBytes(48).toString('base64url'); // 64 Zeichen, RFC-7636-konform
}

export function generateCodeChallenge(verifier: string): string {
	return createHash('sha256').update(verifier).digest('base64url');
}

export function generateState(): string {
	return randomBytes(16).toString('base64url');
}
