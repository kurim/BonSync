/** Extrahiert reinen Text pro Seite aus einem PDF-Buffer (pdfjs-dist, headless, kein Rendering/
 * Canvas nötig). Zentral in der App (nicht Teil eines Modul-Pakets), weil pdfjs-dist eine
 * schwere Abhängigkeit ist, die nicht pro installiertem Modul mitgebündelt werden soll -- Module
 * bekommen diese Funktion stattdessen über sdk.pdf.extractLines() (siehe modules/sdk.ts). */
export async function extractPdfText(pdf: Buffer): Promise<string[]> {
	const pdfjsLib = await import('pdfjs-dist/legacy/build/pdf.mjs');
	const doc = await pdfjsLib.getDocument({
		data: new Uint8Array(pdf),
		disableFontFace: true
	}).promise;

	const lines: string[] = [];
	for (let pageNum = 1; pageNum <= doc.numPages; pageNum++) {
		const page = await doc.getPage(pageNum);
		const textContent = await page.getTextContent();
		let current = '';
		for (const item of textContent.items) {
			if (!('str' in item)) continue;
			current += item.str;
			if (item.hasEOL) {
				lines.push(current);
				current = '';
			}
		}
		if (current) lines.push(current);
	}
	return lines;
}
