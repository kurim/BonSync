import mqtt from 'mqtt';
import { eq } from 'drizzle-orm';
import { db } from './db';
import { appSettings, receipts } from './db/schema';
import { decryptJson } from './crypto';
import { getMeta } from './modules/registry';
import type { ReceiptSummary, StoreId } from './modules/types';

interface MqttConfig {
	host: string;
	port: number;
	username: string;
	password: string | null;
	/** TLS (mqtts://) statt Klartext -- Zertifikat wird gegen die System-CAs geprüft. */
	tls: boolean;
	baseTopic: string;
	publishNew: boolean;
	publishSummary: boolean;
}

async function getMqttConfig(): Promise<MqttConfig | null> {
	const settings = await db.select().from(appSettings).where(eq(appSettings.id, 1)).get();
	if (!settings?.mqttHost) return null;
	return {
		host: settings.mqttHost,
		port: settings.mqttPort ?? (settings.mqttTls ? 8883 : 1883),
		username: settings.mqttUsername ?? '',
		password: settings.mqttPasswordEnc ? decryptJson<string>(settings.mqttPasswordEnc) : null,
		tls: settings.mqttTls,
		baseTopic: settings.mqttBaseTopic || 'bonsync/',
		publishNew: settings.mqttPublishNew,
		publishSummary: settings.mqttPublishSummary
	};
}

/** Lesbare Fehlerbeschreibung -- Node verpackt fehlgeschlagene Verbindungsversuche (IPv6 + IPv4
 * getrennt, "Happy Eyeballs") in einen AggregateError mit LEERER message; nur `code` bzw. die
 * inneren Fehler tragen den eigentlichen Grund (z.B. "connect ECONNREFUSED 127.0.0.1:8883"). */
function describeError(err: unknown): string {
	if (err instanceof Error) {
		if (err.message) return err.message;
		const agg = err as Error & { code?: string; errors?: unknown[] };
		const inner = agg.errors?.find((e): e is Error => e instanceof Error && Boolean(e.message));
		return inner?.message ?? agg.code ?? err.name;
	}
	return String(err);
}

function connect(config: Pick<MqttConfig, 'host' | 'port' | 'username' | 'password' | 'tls'>): mqtt.MqttClient {
	// Host/Port als Optionen statt in einer zusammengebauten URL -- ein Host-String mit "/" oder
	// "?" kann so nicht den Pfad/Query der Broker-URL verändern.
	return mqtt.connect({
		protocol: config.tls ? 'mqtts' : 'mqtt',
		host: config.host,
		port: config.port,
		username: config.username || undefined,
		password: config.password || undefined,
		rejectUnauthorized: true,
		connectTimeout: 8000,
		reconnectPeriod: 0
	});
}

/** Öffnet eine kurzlebige Verbindung für einen einzelnen Publish-Durchlauf (statt eines
 * dauerhaft gehaltenen Clients) -- Sync läuft nur gelegentlich (manueller Klick), ein
 * Reconnect-Handling für eine Dauerverbindung wäre hier reiner Overhead. */
async function withClient(config: MqttConfig, fn: (client: mqtt.MqttClient) => Promise<void>): Promise<void> {
	const client = connect(config);
	try {
		await new Promise<void>((resolve, reject) => {
			client.once('connect', () => resolve());
			// Dauerhafter error-Listener statt `once`: der Client kann nach dem ersten Fehler weitere
			// 'error'-Events feuern (IPv6-/IPv4-Versuch getrennt, TLS-Handshake, end()). Ohne
			// Listener wäre das ein unbehandeltes 'error'-Event, das den gesamten Node-Prozess
			// beendet -- ein nicht erreichbarer Broker darf den Server nicht abschießen. Ein
			// erneutes reject() nach dem ersten ist für die Promise ein No-op.
			client.on('error', (err) => reject(err));
		});
		await fn(client);
	} finally {
		client.end(true);
	}
}

function publish(client: mqtt.MqttClient, topic: string, payload: string, opts: mqtt.IClientPublishOptions): Promise<void> {
	return new Promise((resolve, reject) => {
		client.publish(topic, payload, opts, (err) => (err ? reject(err) : resolve()));
	});
}

function startOfMonth(): number {
	const d = new Date();
	d.setDate(1);
	d.setHours(0, 0, 0, 0);
	return d.getTime();
}

/** Home-Assistant-MQTT-Discovery-Config für den Monats-Ausgaben-Sensor eines Marktes --
 * https://www.home-assistant.io/integrations/sensor.mqtt/#discovery. Wird bei jedem Sync mit
 * `retain:true` neu veröffentlicht, damit HA den Sensor auch nach einem Neustart des Brokers
 * ohne weiteres Zutun wieder anlegt. */
function summaryDiscoveryPayload(storeId: StoreId, objectId: string, stateTopic: string): string {
	const storeName = getMeta(storeId)?.displayName ?? storeId.toUpperCase();
	return JSON.stringify({
		name: `BonSync ${storeName} Ausgaben diesen Monat`,
		unique_id: objectId,
		object_id: objectId,
		state_topic: stateTopic,
		// HA validiert bei device_class "monetary" den unit_of_measurement strikt gegen einen
		// ISO-4217-Code (nicht das Symbol) -- "€" statt "EUR" lässt HA die Entität sonst
		// stillschweigend ablehnen (Verbindung/Publish sehen dann trotzdem unauffällig aus).
		unit_of_measurement: 'EUR',
		device_class: 'monetary',
		state_class: 'total',
		icon: 'mdi:receipt-text-outline',
		device: { identifiers: ['bonsync'], name: 'BonSync', manufacturer: 'BonSync' }
	});
}

/** Wird am Ende jedes Sync-Durchlaufs für ein Modul aufgerufen. Veröffentlicht (je nach
 * Einstellungen) die neu eingelesenen Belege als Event und/oder den aktuellen Monatsumsatz
 * des Marktes als Home-Assistant-Sensor. Rein informativ -- ein Fehler hier (Broker nicht
 * erreichbar, falsche Zugangsdaten) darf den eigentlichen Sync nicht scheitern lassen. */
export async function publishSyncUpdate(storeId: StoreId, newReceipts: ReceiptSummary[]): Promise<void> {
	const config = await getMqttConfig();
	if (!config || (!config.publishNew && !config.publishSummary)) return;

	try {
		await withClient(config, async (client) => {
			if (config.publishNew) {
				for (const r of newReceipts) {
					const payload = JSON.stringify({
						store: storeId,
						externalId: r.externalId,
						timestamp: r.timestamp,
						totalEuro: Math.round(r.totalCents) / 100,
						market: r.market?.name ?? null,
						city: r.market?.city ?? null,
						cancelled: r.cancelled
					});
					await publish(client, `${config.baseTopic}receipt/new`, payload, { qos: 1 });
				}
			}

			if (config.publishSummary) {
				const monthStart = startOfMonth();
				const rows = await db.select().from(receipts).where(eq(receipts.storeId, storeId)).all();
				const cents = rows.filter((r) => r.timestamp >= monthStart).reduce((sum, r) => sum + r.totalCents, 0);
				const objectId = `bonsync_${storeId}_ausgaben_monat`;
				const stateTopic = `${config.baseTopic}sensor/${storeId}/ausgaben_monat`;
				await publish(client, `homeassistant/sensor/${objectId}/config`, summaryDiscoveryPayload(storeId, objectId, stateTopic), {
					qos: 1,
					retain: true
				});
				await publish(client, stateTopic, (Math.round(cents) / 100).toFixed(2), { qos: 1, retain: true });
			}
		});
	} catch (err) {
		console.error(`[mqtt] Veröffentlichen für "${storeId}" fehlgeschlagen: ${describeError(err)}`);
	}
}

/** Für den "Verbindung testen"-Button auf der Settings-Seite -- baut nur eine Verbindung auf
 * (kein Publish) und meldet Erfolg oder den echten Fehlergrund vom Broker (z.B. falsche
 * Zugangsdaten) zurück, statt nur "hat geklappt/nicht geklappt". */
export async function testMqttConnection(config: {
	host: string;
	port: number;
	username: string;
	password: string | null;
	tls: boolean;
}): Promise<{ ok: true } | { ok: false; error: string }> {
	return new Promise((resolve) => {
		let settled = false;
		const client = connect(config);
		const timer = setTimeout(() => finish({ ok: false, error: 'Zeitüberschreitung -- Broker antwortet nicht.' }), 9000);
		const finish = (result: { ok: true } | { ok: false; error: string }) => {
			if (settled) return;
			settled = true;
			clearTimeout(timer);
			client.end(true);
			resolve(result);
		};
		client.once('connect', () => finish({ ok: true }));
		// Listener bewusst NICHT entfernen (kein removeAllListeners): nach dem ersten Fehler können
		// weitere 'error'-Events folgen (getrennte IPv6-/IPv4-Versuche, TLS-Handshake, end()) --
		// ein 'error' ohne Listener wäre eine unbehandelte Exception und würde den ganzen
		// Server-Prozess beenden. `settled` sorgt dafür, dass nur der erste Fehler gemeldet wird.
		client.on('error', (err) => finish({ ok: false, error: describeError(err) }));
	});
}
