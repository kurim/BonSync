import { eq } from 'drizzle-orm';
import { db } from './db';
import { appSettings, storeModules } from './db/schema';
import { listMetas } from './modules/registry';
import { syncStore } from './sync';

// Untergrenze, damit ein versehentlich sehr kleiner Wert nicht die Login-/Rate-Limits der
// Store-APIs strapaziert (LIDL reCAPTCHA, REWE mTLS-Endpoint etc.).
const MIN_INTERVAL_MINUTES = 5;
// Wie oft nachgeschaut wird, ob der Sync inzwischen (wieder) aktiviert wurde, solange er
// deaktiviert ist (Intervall = 0).
const DISABLED_POLL_MINUTES = 5;

let started = false;
let running = false;

async function currentIntervalMinutes(): Promise<number> {
	const settings = await db.select().from(appSettings).where(eq(appSettings.id, 1)).get();
	return settings?.syncIntervalMinutes ?? 0;
}

async function runCycle(): Promise<void> {
	if (running) return;
	running = true;
	try {
		const results: string[] = [];
		for (const meta of listMetas()) {
			if (!meta.implemented) continue;
			const row = await db.select().from(storeModules).where(eq(storeModules.id, meta.id)).get();
			if (row && !row.enabled) continue;
			const result = await syncStore(meta.id);
			results.push(result.error ? `${meta.id}: ${result.error}` : `${meta.id}: ${result.newReceipts} neu`);
		}
		console.log(`[scheduler] Automatischer Sync abgeschlossen (${results.join(', ') || 'keine aktiven Module'})`);
	} catch (err) {
		console.error(`[scheduler] Automatischer Sync fehlgeschlagen: ${err instanceof Error ? err.message : String(err)}`);
	} finally {
		running = false;
	}
}

async function tick(): Promise<void> {
	const minutes = await currentIntervalMinutes();
	if (minutes > 0) {
		await runCycle();
	} else {
		console.log(`[scheduler] Automatischer Sync deaktiviert (Intervall 0) -- nächste Prüfung in ${DISABLED_POLL_MINUTES} Min.`);
	}
	const delayMinutes = minutes > 0 ? Math.max(minutes, MIN_INTERVAL_MINUTES) : DISABLED_POLL_MINUTES;
	setTimeout(tick, delayMinutes * 60_000);
}

/** Startet den periodischen Hintergrund-Sync -- ruft alle aktivierten, verbundenen Module in
 * dem unter /settings konfigurierten Intervall ab (0 = nur noch manuell per Klick), statt nur
 * auf einen Button-Klick zu warten. Läuft als selbst-planende setTimeout-Kette statt
 * setInterval, damit eine geänderte Einstellung beim nächsten Tick greift, ohne den Server neu
 * starten zu müssen. `syncStore` kümmert sich pro Modul bereits um Fehlerbehandlung und (falls
 * konfiguriert) MQTT-Publishing -- der automatische Lauf nutzt exakt denselben Pfad wie der
 * manuelle "Jetzt synchronisieren"-Button. */
export function startSyncScheduler(): void {
	if (started) return;
	started = true;
	tick();
}
