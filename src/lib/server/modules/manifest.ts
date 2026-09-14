import { parse as parseYamlDocument } from 'yaml';
import type { LoginStrategy } from './types';

/** Version des ModuleSdk-Vertrags, den diese App-Version implementiert (siehe sdk.ts) --
 * ein Modul, dessen manifest.yaml eine höhere sdkVersion verlangt, wird abgelehnt statt mit
 * potenziell fehlenden SDK-Fähigkeiten geladen zu werden. */
export const CURRENT_SDK_VERSION = 1;

const ID_PATTERN = /^[a-z0-9][a-z0-9-]{1,31}$/;
const LOGIN_STRATEGY_KINDS = ['oauth-pkce-manual', 'oauth-pkce-redirect', 'credentials'];

export interface ModuleManifest {
	manifestVersion: 1;
	id: string;
	displayName: string;
	version: string;
	entry: string;
	sdkVersion: number;
	loginStrategy: LoginStrategy;
	author?: string;
	description?: string;
	authDescription?: string;
	/** Ob der Händler überhaupt jemals ein Beleg-PDF liefert (Default: true). Für Module ohne PDF
	 * (z.B. wenn der Händler nur strukturierte
	 * Artikeldaten liefert) auf `false` setzen -- sonst wartet die App dauerhaft auf ein PDF, das
	 * nie kommt: die Beleg-Detailseite zeigt permanent "Noch nicht vollständig geladen" und lädt
	 * bei jedem Seitenaufruf erneut nach, siehe receipts/[id]/+page.server.ts. */
	providesPdf: boolean;
	ui?: { color?: string; logo?: string; chip?: string };
}

/** Parst + validiert eine manifest.yaml (siehe docs/module-format.md für die Feldreferenz).
 * Wirft mit einer konkreten, für den Modul-Autor verständlichen Fehlermeldung statt generischer
 * Typfehler -- diese Meldungen landen sowohl im Boot-Log als auch (künftig) direkt in der
 * Upload-Vorschau. */
export function parseManifest(yamlText: string): ModuleManifest {
	let raw: unknown;
	try {
		raw = parseYamlDocument(yamlText);
	} catch (err) {
		throw new Error(`manifest.yaml ist kein gültiges YAML: ${err instanceof Error ? err.message : String(err)}`);
	}
	if (typeof raw !== 'object' || raw === null) {
		throw new Error('manifest.yaml muss ein YAML-Objekt sein.');
	}
	const m = raw as Record<string, unknown>;

	if (m.manifestVersion !== 1) {
		throw new Error('manifest.yaml: "manifestVersion" muss 1 sein.');
	}
	if (typeof m.id !== 'string' || !ID_PATTERN.test(m.id)) {
		throw new Error(
			'manifest.yaml: "id" fehlt oder ungültig (erlaubt: Kleinbuchstaben, Ziffern, "-", 2-32 Zeichen, beginnt mit Buchstabe/Ziffer).'
		);
	}
	if (typeof m.displayName !== 'string' || !m.displayName.trim()) {
		throw new Error('manifest.yaml: "displayName" fehlt.');
	}
	if (typeof m.version !== 'string' || !m.version.trim()) {
		throw new Error('manifest.yaml: "version" fehlt.');
	}
	if (typeof m.entry !== 'string' || !m.entry.trim()) {
		throw new Error('manifest.yaml: "entry" fehlt.');
	}

	const sdkVersion = typeof m.sdkVersion === 'number' ? m.sdkVersion : 1;
	if (sdkVersion > CURRENT_SDK_VERSION) {
		throw new Error(
			`manifest.yaml: sdkVersion ${sdkVersion} wird von dieser App-Version nicht unterstützt (unterstützt bis ${CURRENT_SDK_VERSION}).`
		);
	}

	const loginStrategyRaw = m.loginStrategy as Record<string, unknown> | undefined;
	const kind = loginStrategyRaw?.kind;
	if (typeof kind !== 'string' || !LOGIN_STRATEGY_KINDS.includes(kind)) {
		throw new Error(`manifest.yaml: "loginStrategy.kind" muss eines von ${LOGIN_STRATEGY_KINDS.join(', ')} sein.`);
	}

	const uiRaw = m.ui as Record<string, unknown> | undefined;
	const ui =
		uiRaw && typeof uiRaw === 'object'
			? {
					color: typeof uiRaw.color === 'string' ? uiRaw.color : undefined,
					logo: typeof uiRaw.logo === 'string' ? uiRaw.logo : undefined,
					chip: typeof uiRaw.chip === 'string' ? uiRaw.chip : undefined
				}
			: undefined;

	return {
		manifestVersion: 1,
		id: m.id,
		displayName: m.displayName,
		version: m.version,
		entry: m.entry,
		sdkVersion,
		loginStrategy: { kind } as LoginStrategy,
		author: typeof m.author === 'string' ? m.author : undefined,
		description: typeof m.description === 'string' ? m.description : undefined,
		authDescription: typeof m.authDescription === 'string' ? m.authDescription : undefined,
		providesPdf: typeof m.providesPdf === 'boolean' ? m.providesPdf : true,
		ui
	};
}
