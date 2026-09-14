/** Rendert beliebiges HTML (LIDL: `htmlPrintedReceipt`, das einzige verfügbare Beleg-Format —
 * es gibt bei LIDL kein natives PDF, siehe docs/api-lidlplus.md Abschnitt 4.4) headless zu PDF.
 * Der Browser wird lazy und einmalig gestartet (Kaltstart ~1s), nicht dauerhaft offen gehalten. */

import type { Browser } from 'playwright';

let browserPromise: Promise<Browser> | null = null;

async function getBrowser(): Promise<Browser> {
	if (!browserPromise) {
		// CHROMIUM_PATH nur nötig, wenn kein von `playwright install` verwalteter Browser
		// gefunden wird (z.B. System-Chromium statt des gebündelten) — im Normalfall leer lassen.
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
	const page = await browser.newPage();
	try {
		await page.setContent(html, { waitUntil: 'load' });
		return await page.pdf({ printBackground: true, format: 'A4' });
	} finally {
		await page.close();
	}
}
