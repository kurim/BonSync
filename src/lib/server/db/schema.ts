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
	// Modul hat bei einem PDF-Abrufversuch `null` zurückgegeben (Beleg hat schlicht keins, z.B.
	// ältere OBI-Einkäufe ohne `receipts[]`-Link) -- getrennt von `pdfFetched: false`, damit die
	// Detailseite das nicht auf jedem Aufruf erneut (erfolglos) nachzuladen versucht, siehe
	// receipts/[id]/+page.server.ts.
	pdfUnavailable: integer('pdf_unavailable', { mode: 'boolean' }).notNull().default(false),
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
	mqttTls: integer('mqtt_tls', { mode: 'boolean' }).notNull().default(false),
	mqttBaseTopic: text('mqtt_base_topic').default('bonsync/'),
	mqttPublishNew: integer('mqtt_publish_new', { mode: 'boolean' }).notNull().default(true),
	mqttPublishSummary: integer('mqtt_publish_summary', { mode: 'boolean' }).notNull().default(true),
	// Historisch: Zeitpunkt des automatischen Erstinstallierens der eingebauten Module (Feature
	// entfernt, Module kommen jetzt ausschließlich über den Store, siehe modules/storeCatalog.ts).
	// Bleibt als Feld erhalten, weil es jetzt als Migrationsmarker dient: eine Instanz, die dieses
	// Feld schon gesetzt hat, lief vor Einführung des Onboardings (siehe onboardingCompletedAt) und
	// wird deshalb beim Umstieg NICHT nachträglich ins Onboarding geschickt.
	builtinModulesSeededAt: integer('builtin_modules_seeded_at'),
	// Zeitpunkt, zu dem der Einrichtungsassistent (Passwort ändern + Händler auswählen, siehe
	// routes/onboarding) abgeschlossen (oder für eine Bestandsinstallation rückwirkend als
	// abgeschlossen markiert) wurde. NULL heißt: hooks.server.ts leitet auf /onboarding um.
	onboardingCompletedAt: integer('onboarding_completed_at')
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
