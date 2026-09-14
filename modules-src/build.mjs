// Baut aus den TS-Autorenquellen unter modules-src/<id>/ die fertigen, im Repo mitgelieferten
// Modul-Pakete unter modules-builtin/<id>-<version>.zip -- dieselbe Zip-Form, die auch ein
// Nutzer-Upload hätte (siehe packageInstaller.ts). Kein Teil der Laufzeit-App; nur ein
// Entwickler-Werkzeug, ausgeführt via `npm run build:modules`.
import { build } from 'esbuild';
import { copyFileSync, createWriteStream, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parse as parseYaml } from 'yaml';
import { ZipFile } from 'yazl';

const __dirname = dirname(fileURLToPath(import.meta.url));
const rootDir = join(__dirname, '..');
const outDir = join(rootDir, 'modules-builtin');
const tmpDir = join(rootDir, '.modules-build-tmp');

const MODULE_IDS = ['rewe', 'penny', 'lidl', 'rossmann'];

function writeZip(baseDir, files, zipPath) {
	return new Promise((resolvePromise, reject) => {
		const zipfile = new ZipFile();
		for (const file of files) {
			zipfile.addFile(join(baseDir, file), file);
		}
		zipfile.end();
		const output = createWriteStream(zipPath);
		zipfile.outputStream.pipe(output);
		output.on('close', resolvePromise);
		output.on('error', reject);
		zipfile.outputStream.on('error', reject);
	});
}

async function buildModule(id) {
	const srcDir = join(__dirname, id);
	const manifestText = readFileSync(join(srcDir, 'manifest.yaml'), 'utf8');
	const manifest = parseYaml(manifestText);

	const moduleTmpDir = join(tmpDir, id);
	rmSync(moduleTmpDir, { recursive: true, force: true });
	mkdirSync(moduleTmpDir, { recursive: true });

	await build({
		entryPoints: [join(srcDir, 'index.ts')],
		bundle: true,
		platform: 'node',
		format: 'esm',
		target: 'node22',
		outfile: join(moduleTmpDir, 'index.js')
	});
	writeFileSync(join(moduleTmpDir, 'manifest.yaml'), manifestText);

	// Alles außer .ts-Quellen (die esbuild oben schon zu index.js gebündelt hat) und der
	// manifest.yaml (schon kopiert) wird unverändert mit ins Paket übernommen -- Logos,
	// Zertifikate oder sonstige Assets, die das Modul zur Laufzeit aus seinem eigenen
	// Verzeichnis liest (siehe modules-src/rewe/index.ts für ein Beispiel mit Zertifikaten).
	const zipFiles = ['manifest.yaml', 'index.js'];
	for (const entry of readdirSync(srcDir)) {
		if (entry.endsWith('.ts') || entry === 'manifest.yaml') continue;
		copyFileSync(join(srcDir, entry), join(moduleTmpDir, entry));
		zipFiles.push(entry);
	}

	mkdirSync(outDir, { recursive: true });
	const zipPath = join(outDir, `${manifest.id}-${manifest.version}.zip`);
	await writeZip(moduleTmpDir, zipFiles, zipPath);
	console.log(`[build:modules] ${id} -> ${zipPath}`);
}

for (const id of MODULE_IDS) {
	await buildModule(id);
}
rmSync(tmpDir, { recursive: true, force: true });
