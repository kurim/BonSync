import { eq } from 'drizzle-orm';
import { db } from '../db';
import { pkceStates } from '../db/schema';
import { generateCodeVerifier, generateCodeChallenge, generateState } from '../pkce';
import { rawRequest, requestJson, formBody, type TlsClientOptions, type HttpResponse } from '../http';
import { extractPdfText } from '../receiptPdfParser';
import { renderHtmlToPdf } from '../htmlToPdf';

export interface HttpRequestOptions {
	method?: string;
	headers?: Record<string, string>;
	body?: Buffer | string;
	tls?: TlsClientOptions;
}

/** Fähigkeiten, die ein Modul-Paket zur Laufzeit von der App bekommt, statt App-interne Dateien
 * direkt zu importieren (siehe docs/module-format.md) -- nötig, weil ein installiertes Modul als
 * eigenständige .js-Datei außerhalb von src/ liegt und z.B. keine zweite node:sqlite-Verbindung
 * auf dieselbe DB-Datei aufmachen darf, und weil schwere npm-Abhängigkeiten (pdfjs-dist,
 * playwright) nicht pro Modul mitgebündelt werden sollen. */
export interface ModuleSdk {
	http: {
		rawRequest(url: string, options?: HttpRequestOptions): Promise<HttpResponse>;
		requestJson<T = unknown>(url: string, options?: HttpRequestOptions): Promise<{ status: number; json: T }>;
		formBody(fields: Record<string, string>): string;
	};
	pkce: {
		generateCodeVerifier(): string;
		generateCodeChallenge(verifier: string): string;
		generateState(): string;
		/** Persistiert einen laufenden PKCE-Versuch, isoliert pro Modul-`id`. */
		saveState(state: string, codeVerifier: string): Promise<void>;
		/** Liest + löscht (einmalig) einen laufenden Versuch; `null` falls unbekannt/fremd/abgelaufen. */
		consumeState(state: string): Promise<{ codeVerifier: string } | null>;
	};
	pdf: {
		/** Extrahiert reinen Text pro Seite aus einem PDF-Buffer (kapselt pdfjs-dist). */
		extractLines(pdf: Buffer): Promise<string[]>;
	};
	html: {
		/** Rendert HTML headless zu PDF (kapselt playwright) -- z.B. für Module ohne natives PDF. */
		toPdf(html: string): Promise<Buffer>;
	};
}

export function createSdkForModule(moduleId: string): ModuleSdk {
	return {
		http: { rawRequest, requestJson, formBody },
		pkce: {
			generateCodeVerifier,
			generateCodeChallenge,
			generateState,
			async saveState(state, codeVerifier) {
				await db.insert(pkceStates).values({ state, storeId: moduleId, codeVerifier, createdAt: Date.now() }).run();
			},
			async consumeState(state) {
				const pending = await db.select().from(pkceStates).where(eq(pkceStates.state, state)).get();
				if (!pending || pending.storeId !== moduleId) return null;
				await db.delete(pkceStates).where(eq(pkceStates.state, state)).run();
				return { codeVerifier: pending.codeVerifier };
			}
		},
		pdf: { extractLines: extractPdfText },
		html: { toPdf: renderHtmlToPdf }
	};
}
