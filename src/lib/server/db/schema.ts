import { sqliteTable, text, integer, real } from 'drizzle-orm/sqlite-core';

/** Ein Store-Modul (rewe/penny/lidl/rossmann) und sein An/Aus- + Verbindungsstatus. */
export const storeModules = sqliteTable('store_modules', {
	id: text('id').primaryKey(), // 'rewe' | 'penny' | 'lidl' | 'rossmann'
	enabled: integer('enabled', { mode: 'boolean' }).notNull().default(true),
	status: text('status').notNull().default('disconnected'), // disconnected | connected | expiring | error
	lastError: text('last_error'),
	lastSyncAt: integer('last_sync_at'), // epoch ms
	receiptCount: integer('receipt_count').notNull().default(0)
});

/** Verschlüsselter, store-eigener Credential-Blob (Access-/Refresh-Token o.ä.). */
export const credentials = sqliteTable('credentials', {
	storeId: text('store_id').primaryKey(),
	encryptedBlob: text('encrypted_blob').notNull(), // base64(salt|iv|tag|ciphertext)
	updatedAt: integer('updated_at').notNull()
});

/** Paket-Metadaten eines installierten Modul-Pakets (eingebaut oder hochgeladen) -- getrennt von
 * `store_modules` (Sync-/Verbindungsstatus), da beide unterschiedliche Lebenszyklen haben:
 * Deinstallieren mit "Daten behalten" löscht nur diese Zeile, `store_modules`/`receipts`/
 * `credentials` bleiben unangetastet. */
export const installedModules = sqliteTable('installed_modules', {
	id: text('id').primaryKey(),
	version: text('version').notNull(),
	displayName: text('display_name').notNull(),
	source: text('source').notNull(), // 'builtin' | 'uploaded'
	manifestJson: text('manifest_json').notNull(),
	installedAt: integer('installed_at').notNull(),
	updatedAt: integer('updated_at').notNull()
});

/** Laufende PKCE-Login-Versuche (state -> code_verifier), kurzlebig. */
export const pkceStates = sqliteTable('pkce_states', {
	state: text('state').primaryKey(),
	storeId: text('store_id').notNull(),
	codeVerifier: text('code_verifier').notNull(),
	createdAt: integer('created_at').notNull()
});

/** Gemeinsames Bon-Datenmodell (siehe Fahrplan Abschnitt 3), store-übergreifend. */
export const receipts = sqliteTable('receipts', {
	id: text('id').primaryKey(), // `${storeId}:${externalId}`
	storeId: text('store_id').notNull(),
	externalId: text('external_id').notNull(),
	timestamp: integer('timestamp').notNull(), // epoch ms
	totalCents: integer('total_cents').notNull(),
	marketName: text('market_name'),
	marketStreet: text('market_street'),
	marketZip: text('market_zip'),
	marketCity: text('market_city'),
	cancelled: integer('cancelled', { mode: 'boolean' }).notNull().default(false),
	hasStructuredItems: integer('has_structured_items', { mode: 'boolean' }).notNull().default(false),
	itemsFetched: integer('items_fetched', { mode: 'boolean' }).notNull().default(false),
	pdfFetched: integer('pdf_fetched', { mode: 'boolean' }).notNull().default(false),
	savingsCents: integer('savings_cents'), // Coupon-/Rabatt-Ersparnis laut Bon, rein informativ
	couponsJson: text('coupons_json'), // JSON-Array [{label, amountCents}], rein informativ
	metaJson: text('meta_json') // JSON eines ReceiptMeta-Objekts (TSE/Zahlungsart/MwSt.-Aufschlüsselung), rein informativ
});

export const receiptItems = sqliteTable('receipt_items', {
	id: integer('id').primaryKey({ autoIncrement: true }),
	receiptId: text('receipt_id').notNull(),
	name: text('name').notNull(),
	priceCents: integer('price_cents').notNull(),
	quantity: integer('quantity'),
	unitPriceCents: integer('unit_price_cents'),
	taxCode: text('tax_code'),
	discountExcluded: integer('discount_excluded', { mode: 'boolean' })
});

/** Singleton-Zeile (id=1) für App-weite Einstellungen. */
export const appSettings = sqliteTable('app_settings', {
	id: integer('id').primaryKey(),
	passwordHash: text('password_hash').notNull(),
	eagerPdfLimit: integer('eager_pdf_limit').notNull().default(25),
	syncIntervalMinutes: integer('sync_interval_minutes').notNull().default(60),
	mqttHost: text('mqtt_host'),
	mqttPort: integer('mqtt_port'),
	mqttUsername: text('mqtt_username'),
	mqttPasswordEnc: text('mqtt_password_enc'),
	mqttBaseTopic: text('mqtt_base_topic').default('bonsync/'),
	mqttPublishNew: integer('mqtt_publish_new', { mode: 'boolean' }).notNull().default(true),
	mqttPublishSummary: integer('mqtt_publish_summary', { mode: 'boolean' }).notNull().default(true),
	// Zeitpunkt, zu dem die im Repo mitgelieferten Builtin-Module (modules-builtin/*.zip) zuletzt
	// automatisch installiert wurden -- nur beim allerersten Boot (Feld ist NULL) gesetzt, damit
	// ein bewusst deinstalliertes Builtin nicht beim nächsten Neustart ungefragt wiederkehrt.
	builtinModulesSeededAt: integer('builtin_modules_seeded_at')
});

/** Persistenter Geocoding-Cache (Adresse -> Koordinaten), siehe geocoding.ts — Adressen ändern
 * sich nicht, ein Re-Geocode bei jedem Seitenaufruf wäre reine API-Kontingent-Verschwendung. */
export const marketGeocodes = sqliteTable('market_geocodes', {
	address: text('address').primaryKey(),
	lat: real('lat'),
	lon: real('lon'),
	fetchedAt: integer('fetched_at').notNull()
});

export const sessions = sqliteTable('sessions', {
	token: text('token').primaryKey(),
	createdAt: integer('created_at').notNull(),
	expiresAt: integer('expires_at').notNull()
});
