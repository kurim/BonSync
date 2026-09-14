import { DatabaseSync, type StatementSync } from 'node:sqlite';
import { drizzle } from 'drizzle-orm/sqlite-proxy';
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import * as schema from './schema';

const DATABASE_PATH = process.env.DATABASE_PATH ?? './data/bonsync.db';
mkdirSync(dirname(DATABASE_PATH), { recursive: true });

const sqlite = new DatabaseSync(DATABASE_PATH);
sqlite.exec('PRAGMA journal_mode = WAL;');
sqlite.exec('PRAGMA foreign_keys = ON;');

const statementCache = new Map<string, StatementSync>();
function getStatement(sql: string): StatementSync {
	let stmt = statementCache.get(sql);
	if (!stmt) {
		stmt = sqlite.prepare(sql);
		statementCache.set(sql, stmt);
	}
	return stmt;
}

/** node:sqlite ist synchron; wir kapseln es hinter drizzle's async sqlite-proxy-Treiber,
 * damit kein natives Addon (better-sqlite3) kompiliert werden muss — läuft identisch
 * lokal wie im Alpine-Docker-Image, ab Node 22.5. */
export const db = drizzle(async (sql, params, method) => {
	const stmt = getStatement(sql);
	if (method === 'run') {
		stmt.run(...params);
		return { rows: [] };
	}
	stmt.setReturnArrays(true);
	if (method === 'get') {
		const row = stmt.get(...params) as unknown[] | undefined;
		return { rows: (row ?? undefined) as unknown as any[] };
	}
	const rows = stmt.all(...params);
	return { rows: rows as unknown[] as any[] };
}, { schema });

export function ensureSchema() {
	sqlite.exec(`
		CREATE TABLE IF NOT EXISTS store_modules (
			id TEXT PRIMARY KEY,
			enabled INTEGER NOT NULL DEFAULT 1,
			status TEXT NOT NULL DEFAULT 'disconnected',
			last_error TEXT,
			last_sync_at INTEGER,
			receipt_count INTEGER NOT NULL DEFAULT 0
		);
		CREATE TABLE IF NOT EXISTS credentials (
			store_id TEXT PRIMARY KEY,
			encrypted_blob TEXT NOT NULL,
			updated_at INTEGER NOT NULL
		);
		CREATE TABLE IF NOT EXISTS pkce_states (
			state TEXT PRIMARY KEY,
			store_id TEXT NOT NULL,
			code_verifier TEXT NOT NULL,
			created_at INTEGER NOT NULL
		);
		CREATE TABLE IF NOT EXISTS receipts (
			id TEXT PRIMARY KEY,
			store_id TEXT NOT NULL,
			external_id TEXT NOT NULL,
			timestamp INTEGER NOT NULL,
			total_cents INTEGER NOT NULL,
			market_name TEXT,
			market_street TEXT,
			market_zip TEXT,
			market_city TEXT,
			cancelled INTEGER NOT NULL DEFAULT 0,
			has_structured_items INTEGER NOT NULL DEFAULT 0,
			items_fetched INTEGER NOT NULL DEFAULT 0,
			pdf_fetched INTEGER NOT NULL DEFAULT 0
		);
		CREATE INDEX IF NOT EXISTS idx_receipts_store ON receipts(store_id);
		CREATE INDEX IF NOT EXISTS idx_receipts_timestamp ON receipts(timestamp);
		CREATE TABLE IF NOT EXISTS receipt_items (
			id INTEGER PRIMARY KEY AUTOINCREMENT,
			receipt_id TEXT NOT NULL,
			name TEXT NOT NULL,
			price_cents INTEGER NOT NULL,
			quantity INTEGER,
			unit_price_cents INTEGER,
			tax_code TEXT,
			discount_excluded INTEGER
		);
		CREATE INDEX IF NOT EXISTS idx_items_receipt ON receipt_items(receipt_id);
		CREATE TABLE IF NOT EXISTS app_settings (
			id INTEGER PRIMARY KEY,
			password_hash TEXT NOT NULL,
			eager_pdf_limit INTEGER NOT NULL DEFAULT 25,
			sync_interval_minutes INTEGER NOT NULL DEFAULT 60,
			mqtt_host TEXT,
			mqtt_port INTEGER,
			mqtt_username TEXT,
			mqtt_password_enc TEXT,
			mqtt_base_topic TEXT DEFAULT 'bonsync/',
			mqtt_publish_new INTEGER NOT NULL DEFAULT 1,
			mqtt_publish_summary INTEGER NOT NULL DEFAULT 1
		);
		CREATE TABLE IF NOT EXISTS sessions (
			token TEXT PRIMARY KEY,
			created_at INTEGER NOT NULL,
			expires_at INTEGER NOT NULL
		);
		CREATE TABLE IF NOT EXISTS market_geocodes (
			address TEXT PRIMARY KEY,
			lat REAL,
			lon REAL,
			fetched_at INTEGER NOT NULL
		);
		CREATE TABLE IF NOT EXISTS installed_modules (
			id TEXT PRIMARY KEY,
			version TEXT NOT NULL,
			display_name TEXT NOT NULL,
			source TEXT NOT NULL,
			manifest_json TEXT NOT NULL,
			installed_at INTEGER NOT NULL,
			updated_at INTEGER NOT NULL
		);
	`);

	// Leichtgewichtige Migration für Spalten, die nach dem initialen CREATE TABLE dazukamen —
	// SQLite kennt kein "ADD COLUMN IF NOT EXISTS", daher versuchen + Fehler bei bereits
	// vorhandener Spalte ignorieren.
	for (const ddl of [
		'ALTER TABLE receipts ADD COLUMN savings_cents INTEGER',
		'ALTER TABLE receipts ADD COLUMN coupons_json TEXT',
		'ALTER TABLE receipts ADD COLUMN meta_json TEXT',
		'ALTER TABLE app_settings ADD COLUMN sync_interval_minutes INTEGER NOT NULL DEFAULT 60',
		'ALTER TABLE app_settings ADD COLUMN builtin_modules_seeded_at INTEGER'
	]) {
		try {
			sqlite.exec(ddl);
		} catch {
			// Spalte existiert bereits
		}
	}
}
