/** In-Memory-Brute-Force-Schutz für den App-Login (siehe routes/login/+page.server.ts).
 *
 * Pro Client-IP werden Fehlversuche gezählt; ab MAX_FAILURES greift eine exponentiell wachsende
 * Sperre (30 s, 60 s, 120 s, ... bis max. WINDOW_MS). Nach WINDOW_MS ohne neuen Fehlversuch wird
 * der Zähler verworfen. Bewusst prozesslokal ohne DB: die App läuft als einzelner Node-Prozess,
 * ein Neustart setzt die Sperren zurück -- das ist für einen Single-User-Login ausreichend und
 * hält den Login-Pfad frei von zusätzlichen Schreibzugriffen.
 *
 * Hinter einem Reverse-Proxy muss adapter-node die echte Client-IP kennen, sonst teilen sich alle
 * Aufrufer die Proxy-IP: ADDRESS_HEADER=X-Forwarded-For und XFF_DEPTH=1 setzen (siehe .env.example). */

const WINDOW_MS = 15 * 60_000;
const MAX_FAILURES = 5;
const BASE_BLOCK_MS = 30_000;

interface Attempts {
	count: number;
	firstAt: number;
	blockedUntil: number;
}

const attempts = new Map<string, Attempts>();

/** Verbleibende Sperrzeit in ms für diese IP (0 = Login-Versuch erlaubt). */
export function loginBlockedMs(ip: string): number {
	const a = attempts.get(ip);
	if (!a) return 0;
	if (Date.now() - a.firstAt > WINDOW_MS) {
		attempts.delete(ip);
		return 0;
	}
	return Math.max(0, a.blockedUntil - Date.now());
}

export function recordLoginFailure(ip: string): void {
	const now = Date.now();
	const a = attempts.get(ip) ?? { count: 0, firstAt: now, blockedUntil: 0 };
	if (now - a.firstAt > WINDOW_MS) {
		a.count = 0;
		a.firstAt = now;
	}
	a.count++;
	if (a.count >= MAX_FAILURES) {
		a.blockedUntil = now + Math.min(WINDOW_MS, BASE_BLOCK_MS * 2 ** (a.count - MAX_FAILURES));
	}
	attempts.set(ip, a);
}

export function clearLoginFailures(ip: string): void {
	attempts.delete(ip);
}
