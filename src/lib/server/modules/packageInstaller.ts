import { randomUUID } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join, normalize, sep } from 'node:path';
import yauzl from 'yauzl';
import { db } from '../db';
import { installedModules } from '../db/schema';
import { parseManifest, type ModuleManifest } from './manifest';
import { loadModuleFromDirectory, validateModuleDirectory, modulesDir, unregisterModule } from './registry';

export type ModuleSource = 'uploaded' | 'store';

// Module-.js-Dateien + ein optionales Logo sind klein -- diese Grenzen sind bewusst großzügig
// genug für legitime Pakete, aber eng genug, um einen Zip-Bomb-artigen Upload früh abzubrechen.
const MAX_ENTRIES = 200;
const MAX_FILE_BYTES = 10 * 1024 * 1024;
const MAX_TOTAL_BYTES = 25 * 1024 * 1024;

function dataDir(): string {
	return process.env.DATA_DIR ?? './data';
}

function stagingRoot(): string {
	return join(dataDir(), 'tmp', 'module-staging');
}

/** `stagingDir` reist als verstecktes Formularfeld zum Client und zurück (Vorschau -> Bestätigen,
 * siehe dealer-interfaces/+page.server.ts) -- vor jeder Nutzung server-seitig prüfen, dass der
 * Pfad wirklich innerhalb des Staging-Verzeichnisses liegt, sonst könnte ein manipulierter
 * Request `commitStagedInstall()` dazu bringen, einen beliebigen Pfad nach
 * `${DATA_DIR}/modules/<id>/` zu verschieben. */
export function isValidStagingDir(dir: string): boolean {
	const root = normalize(stagingRoot() + sep);
	return normalize(dir).startsWith(root);
}

/** Räumt beim Boot alle Staging-Verzeichnisse einer evtl. abgebrochenen/abgestürzten
 * Installationssitzung weg -- ein laufender Server hinterlässt hier nie etwas dauerhaft
 * (siehe stageZip/commitStagedInstall), also ist alles, was hier beim Start noch liegt, Müll. */
export function clearStagingDir(): void {
	rmSync(stagingRoot(), { recursive: true, force: true });
}

/** Zip-Slip-Schutz: löst den Ziel-Pfad auf und verweigert alles, was das Staging-Verzeichnis
 * verlässt (".."-Segmente, absolute Pfade in der Zip-Eintragsangabe etc.). */
function safeEntryPath(root: string, entryName: string): string {
	const normalizedRoot = normalize(root + sep);
	const target = normalize(join(root, entryName));
	if (!target.startsWith(normalizedRoot)) {
		throw new Error(`Unsichere Pfadangabe im Zip: "${entryName}" verlässt das Paketverzeichnis.`);
	}
	return target;
}

/** Extrahiert ein Modul-Zip in ein frisches Staging-Verzeichnis (Zip-Slip-Schutz, Symlinks
 * verboten, Größen-/Anzahl-Limits) und lädt es dort testweise (inkl. Formvalidierung des
 * StoreModule-Exports), BEVOR irgendetwas an der echten Installation verändert wird. Ein
 * fehlerhaftes Zip hinterlässt dadurch keine Spuren außerhalb seines eigenen Staging-Ordners. */
export async function stageZip(zipBuffer: Buffer): Promise<{ stagingDir: string; manifest: ModuleManifest }> {
	const stagingDir = join(stagingRoot(), randomUUID());
	mkdirSync(stagingDir, { recursive: true });

	try {
		await extractZipSafely(zipBuffer, stagingDir);

		const manifestPath = join(stagingDir, 'manifest.yaml');
		if (!existsSync(manifestPath)) {
			throw new Error('Zip enthält keine manifest.yaml im Wurzelverzeichnis.');
		}
		const manifest = parseManifest(readFileSync(manifestPath, 'utf8'));

		// Vollständige Probe inkl. dynamischem import() + Laufzeit-Formvalidierung, bevor
		// irgendetwas committet wird -- bewusst OHNE die Registry anzufassen (siehe
		// validateModuleDirectory), sonst würde allein das Hochladen einer Vorschau ein bereits
		// installiertes Modul mit derselben id aus der laufenden Registry verdrängen.
		await validateModuleDirectory(stagingDir);

		return { stagingDir, manifest };
	} catch (err) {
		rmSync(stagingDir, { recursive: true, force: true });
		throw err;
	}
}

function extractZipSafely(zipBuffer: Buffer, targetDir: string): Promise<void> {
	return new Promise((resolvePromise, reject) => {
		yauzl.fromBuffer(zipBuffer, { lazyEntries: true }, (err, zipfile) => {
			if (err || !zipfile) return reject(err ?? new Error('Zip konnte nicht gelesen werden.'));

			let entryCount = 0;
			let totalBytes = 0;

			zipfile.on('error', reject);
			zipfile.on('end', () => resolvePromise());
			zipfile.readEntry();

			zipfile.on('entry', (entry) => {
				entryCount++;
				if (entryCount > MAX_ENTRIES) {
					return reject(new Error(`Zip enthält zu viele Dateien (max. ${MAX_ENTRIES}).`));
				}
				if (entry.uncompressedSize > MAX_FILE_BYTES) {
					return reject(new Error(`Datei "${entry.fileName}" ist zu groß (max. ${Math.round(MAX_FILE_BYTES / 1024 / 1024)} MB pro Datei).`));
				}
				totalBytes += entry.uncompressedSize;
				if (totalBytes > MAX_TOTAL_BYTES) {
					return reject(new Error(`Zip ist insgesamt zu groß (max. ${Math.round(MAX_TOTAL_BYTES / 1024 / 1024)} MB entpackt).`));
				}

				// Symlink-Bit im oberen Unix-Attribut-Wort (Dateityp-Nibble 0xA = Symlink) --
				// klassischer Zip-Slip-Vektor, den reine Pfad-Prüfung allein nicht abdeckt.
				const unixMode = entry.externalFileAttributes >>> 16;
				if ((unixMode & 0xf000) === 0xa000) {
					return reject(new Error(`Zip enthält einen Symlink ("${entry.fileName}") -- nicht erlaubt.`));
				}

				let targetPath: string;
				try {
					targetPath = safeEntryPath(targetDir, entry.fileName);
				} catch (pathErr) {
					return reject(pathErr);
				}

				const isDirEntry = /[/\\]$/.test(entry.fileName);
				if (isDirEntry) {
					mkdirSync(targetPath, { recursive: true });
					zipfile.readEntry();
					return;
				}

				mkdirSync(dirname(targetPath), { recursive: true });
				zipfile.openReadStream(entry, (streamErr, readStream) => {
					if (streamErr || !readStream) {
						return reject(streamErr ?? new Error(`Konnte "${entry.fileName}" nicht lesen.`));
					}
					const chunks: Buffer[] = [];
					readStream.on('data', (chunk: Buffer) => chunks.push(chunk));
					readStream.on('error', reject);
					readStream.on('end', () => {
						writeFileSync(targetPath, Buffer.concat(chunks));
						zipfile.readEntry();
					});
				});
			});
		});
	});
}

/** Verschiebt ein erfolgreich gestagtes Paket an seinen endgültigen Platz unter
 * `${DATA_DIR}/modules/<id>/` und lädt es final in die Registry. Bei `overwrite:false` und
 * bereits vorhandenem Modul wird abgebrochen (der Aufrufer kann dann gezielt mit
 * `overwrite:true` erneut committen) -- Belege/Zugangsdaten in der DB bleiben davon in jedem
 * Fall unberührt, hier wird ausschließlich Code+Manifest ersetzt. */
export async function commitStagedInstall(
	stagingDir: string,
	manifest: ModuleManifest,
	opts: { overwrite: boolean; source: ModuleSource }
): Promise<void> {
	const targetDir = join(modulesDir(), manifest.id);
	if (existsSync(targetDir)) {
		if (!opts.overwrite) {
			rmSync(stagingDir, { recursive: true, force: true });
			throw new Error(`Modul "${manifest.id}" ist bereits installiert.`);
		}
		unregisterModule(manifest.id);
		rmSync(targetDir, { recursive: true, force: true });
	}
	mkdirSync(modulesDir(), { recursive: true });
	renameSync(stagingDir, targetDir);
	await loadModuleFromDirectory(targetDir);

	const now = Date.now();
	await db
		.insert(installedModules)
		.values({
			id: manifest.id,
			version: manifest.version,
			displayName: manifest.displayName,
			source: opts.source,
			manifestJson: JSON.stringify(manifest),
			installedAt: now,
			updatedAt: now
		})
		.onConflictDoUpdate({
			target: installedModules.id,
			set: { version: manifest.version, displayName: manifest.displayName, source: opts.source, manifestJson: JSON.stringify(manifest), updatedAt: now }
		})
		.run();
}

/** Staging + Commit in einem Aufruf -- genutzt vom Store-Tab (siehe
 * modules/storeCatalog.ts#installFromCatalogEntry), wo der Katalog-Eintrag bereits alle nötigen
 * Metadaten liefert und keine separate Vorschau-UI wie beim manuellen Zip-Upload nötig ist. */
export async function installModulePackage(
	zipBuffer: Buffer,
	opts: { overwrite: boolean; source: ModuleSource }
): Promise<ModuleManifest> {
	const { stagingDir, manifest } = await stageZip(zipBuffer);
	await commitStagedInstall(stagingDir, manifest, opts);
	return manifest;
}
