/** War früher eine feste Union fest eingebauter Module — seit dem dynamischen Modul-System
 * (siehe registry.ts) ist jede über ein Manifest installierte `id` gültig, daher ein reiner
 * String. Es gibt keine fest installierten Module mehr, auch 'rewe'/'penny'/'lidl'/'rossmann'
 * sind ganz normal per Zip installierte Pakete wie jedes andere. */
export type StoreId = string;

export interface ReceiptSummary {
	storeId: StoreId;
	externalId: string; // opake, store-eigene ID
	timestamp: number; // epoch ms, UTC wo möglich
	totalCents: number; // immer Cent als Integer
	market: {
		name?: string;
		street?: string;
		zipCode?: string;
		city?: string;
	} | null;
	cancelled: boolean;
	hasStructuredItems: boolean; // true bei LIDL/ROSSMANN, false bei REWE/PENNY (nur via PDF-Text)
}

export interface ReceiptItem {
	name: string;
	priceCents: number;
	quantity?: number;
	unitPriceCents?: number;
	taxCode?: string;
	discountExcluded?: boolean;
}

export interface ReceiptSavings {
	totalSavingsCents: number | null;
	coupons: { label: string; amountCents: number }[];
}

/** Zusätzliche, rein informative Metadaten aus dem PDF-Text (TSE-Signatur, Zahlungsart,
 * MwSt.-Aufschlüsselung etc.) — je nach Store/Bon-Format unterschiedlich vollständig, daher
 * jedes Feld optional. Keine Erfindung: nur was tatsächlich auf dem jeweiligen Bon steht. */
export interface ReceiptMeta {
	ustId?: string;
	paymentMethod?: string;
	paymentAmountCents?: number;
	marktNr?: string;
	kasse?: string;
	bediener?: string;
	bonNr?: string;
	taxBreakdown: { code: string; percent: number; netCents: number; taxCents: number; grossCents: number }[];
	tseSignaturzaehler?: string;
	tseTransaktion?: string;
	tseStart?: string;
	tseStop?: string;
	loyaltyNote?: string;
}

/** Store-spezifischer, aber einheitlich verschlüsselt abgelegter Credential-Blob. */
export type StoredCredentials = Record<string, unknown>;

export type LoginStrategy =
	| { kind: 'oauth-pkce-manual' } // Redirect ist Custom-URI-Scheme oder reCAPTCHA-Login -> Code manuell einfügen
	| { kind: 'oauth-pkce-redirect' } // Redirect ist eine normale https-URL (PENNY)
	| { kind: 'credentials' }; // E-Mail + Passwort (ROSSMANN)

export interface AuthorizeStart {
	url: string;
	state: string;
}

export interface StoreModuleMeta {
	id: StoreId;
	displayName: string;
	loginStrategy: LoginStrategy;
	implemented: boolean; // immer true seit dem dynamischen Modul-System -- installiert = implementiert
}

/** Der Laufzeit-Vertrag, den ein Modul-Paket erfüllen muss (siehe docs/module-format.md).
 * Bewusst OHNE id/displayName/loginStrategy -- die kommen aus dem Manifest, nicht aus dem
 * geladenen Objekt (das die Registry zur Laufzeit dynamisch importiert, siehe registry.ts). */
export interface StoreModule {
	/** Baut die Authorize-URL + persistiert den PKCE-Verifier serverseitig unter `state`. */
	beginLogin?(): Promise<AuthorizeStart>;
	/** Nimmt den vom User eingefügten Code (+ ggf. matching state) entgegen und tauscht ihn gegen Tokens. */
	completeLogin?(input: Record<string, string>): Promise<StoredCredentials>;
	/** Für `credentials`-Strategie: direkter Login mit Feldern (z.B. email/password). */
	loginWithCredentials?(fields: Record<string, string>): Promise<StoredCredentials>;

	/** Refresht Tokens falls nötig; gibt ggf. aktualisierte Credentials zurück (sonst unverändert). */
	ensureFreshCredentials(creds: StoredCredentials): Promise<StoredCredentials>;

	fetchReceipts(creds: StoredCredentials, knownIds: Set<string>): Promise<ReceiptSummary[]>;
	fetchReceiptPdf(creds: StoredCredentials, externalId: string): Promise<Buffer | null>;
	fetchReceiptItems?(
		creds: StoredCredentials,
		externalId: string,
		pdf?: Buffer
	): Promise<ReceiptItem[]>;
	/** Coupon-/Rabatt-Ersparnis des Belegs, sofern die Quelle das hergibt (optional, rein informativ). */
	fetchReceiptSavings?(
		creds: StoredCredentials,
		externalId: string,
		pdf?: Buffer
	): Promise<ReceiptSavings | null>;
	/** Versucht Marktdaten nachträglich aufzulösen, z.B. wenn die Liste-API dafür `null`
	 * geliefert hatte (beobachtet bei PENNY: inkonsistent) — bei "Neu einlesen" erneut probiert,
	 * ohne bereits vorhandene, gute Marktdaten zu überschreiben (nur bei Treffer angewendet). */
	refreshMarketInfo?(
		creds: StoredCredentials,
		externalId: string,
		pdf?: Buffer
	): Promise<ReceiptSummary['market']>;
}
