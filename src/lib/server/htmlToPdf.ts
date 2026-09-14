/** Rendert beliebiges HTML (LIDL: `htmlPrintedReceipt`, das einzige verfügbare Beleg-Format —
 * es gibt bei LIDL kein natives PDF, siehe docs/api-lidlplus.md Abschnitt 4.4) headless zu PDF.
 * Der Browser wird lazy und einmalig gestartet (Kaltstart ~1s), nicht dauerhaft offen gehalten.
 *
 * Das HTML ist Fremdinhalt vom Händler -- der Renderer läuft deshalb so eingeschränkt wie möglich:
 * kein JavaScript, kein Netzwerk (jede Subresource-Anfrage wird abgebrochen, damit die Seite den
 * Server nicht als SSRF-Sprungbrett ins Heimnetz/zu Cloud-Metadaten-Endpunkten nutzen kann),
 * ein frischer, isolierter Browser-Context pro Dokument und ein hartes Timeout. Inline-Styles und
 * data:-URI-Bilder funktionieren weiterhin. */

import type { Browser } from 'playwright';

const RENDER_TIMEOUT_MS = 15_000;

let browserPromise: Promise<Browser> | null = null;

async function getBrowser(): Promise<Browser> {
	if (!browserPromise) {
		// CHROMIUM_PATH nur nötig, wenn kein von `playwright install` verwalteter Browser
		// gefunden wird (z.B. System-Chromium statt des gebündelten) — im Normalfall leer lassen.
		// --no-sandbox: Chromiums eigener Prozess-Sandbox braucht User-Namespaces, die im Standard-
		// Docker-Seccomp-Profil fehlen; die Härtung liegt daher im Context (JS/Netz aus) und im
		// unprivilegierten Container-User (siehe docker-entrypoint.sh).
		browserPromise = import('playwright').then(({ chromium }) =>
			chromium.launch({
				headless: true,
				executablePath: process.env.CHROMIUM_PATH || undefined,
				args: ['--no-sandbox']
			})
		);
	}
	return browserPromise;
}

export async function renderHtmlToPdf(html: string): Promise<Buffer> {
	const browser = await getBrowser();
	const context = await browser.newContext({ javaScriptEnabled: false, offline: true });
	try {
		const page = await context.newPage();
		await page.route('**/*', (route) => route.abort());
		await page.setContent(html, { waitUntil: 'load', timeout: RENDER_TIMEOUT_MS });
		return await page.pdf({ printBackground: true, format: 'A4' });
	} finally {
		await context.close();
	}
}
