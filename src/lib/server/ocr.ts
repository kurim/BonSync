import { spawn } from 'node:child_process';

/** Lokale Texterkennung für Bon-Fotos über das Kommandozeilenprogramm Tesseract (im Docker-Image
 * installiert, siehe Dockerfile). Bewusst ein externer Prozess statt einer npm-Abhängigkeit: kein
 * Cloud-Dienst, kein Schlüssel, und die Bilddaten verlassen den Server nie. Das Bild geht über
 * stdin hinein, nichts wird auf die Platte geschrieben. */

export const MAX_IMAGE_BYTES = 10 * 1024 * 1024;
const OCR_TIMEOUT_MS = 60_000;

/** Erkennt das Bildformat an den Magic Bytes -- der vom Browser gemeldete Content-Type ist
 * Nutzereingabe und wird deshalb nicht vertraut. */
export function isSupportedImage(buf: Buffer): boolean {
	const jpeg = buf.length > 3 && buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff;
	const png = buf.length > 8 && buf.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]));
	const webp = buf.length > 12 && buf.toString('ascii', 0, 4) === 'RIFF' && buf.toString('ascii', 8, 12) === 'WEBP';
	return jpeg || png || webp;
}

export class OcrUnavailableError extends Error {}

export function recognizeText(image: Buffer): Promise<string> {
	return new Promise((resolve, reject) => {
		// --psm 6: ein einheitlicher Textblock; liefert bei Bons mit spaltenartigem Layout (Name links,
		// Preis rechts) zeilenweise bessere Ergebnisse als die automatische Seitenanalyse.
		const proc = spawn('tesseract', ['stdin', 'stdout', '-l', 'deu', '--psm', '6'], {
			stdio: ['pipe', 'pipe', 'pipe']
		});
		let out = '';
		let err = '';
		const timer = setTimeout(() => {
			proc.kill('SIGKILL');
			reject(new Error('Die Texterkennung hat zu lange gedauert.'));
		}, OCR_TIMEOUT_MS);

		proc.stdout.on('data', (d) => (out += d));
		proc.stderr.on('data', (d) => (err += d));
		proc.on('error', (e: NodeJS.ErrnoException) => {
			clearTimeout(timer);
			reject(
				e.code === 'ENOENT'
					? new OcrUnavailableError('Tesseract ist auf dem Server nicht installiert (Paket tesseract-ocr und tesseract-ocr-deu).')
					: e
			);
		});
		proc.on('close', (code) => {
			clearTimeout(timer);
			if (code === 0) resolve(out);
			else reject(new Error(`Texterkennung fehlgeschlagen: ${err.trim().split('\n').pop() || `Exit-Code ${code}`}`));
		});
		proc.stdin.on('error', () => {}); // EPIPE, falls der Prozess früh endet -- 'close' meldet den Fehler
		proc.stdin.end(image);
	});
}
