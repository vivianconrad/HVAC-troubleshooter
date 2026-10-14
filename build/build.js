import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { build as esbuild } from 'esbuild';
import { buildIndex } from './build-index.js';
import { loadData } from './load-data.js';
import { validateAll } from './validate-data.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const dist = path.join(root, 'app', 'dist');

const { manifest, stats } = await buildIndex({
  pdfRoot: path.join(root, 'pdfs'),
  outDir: dist,
  cacheDir: path.join(root, 'build', '.cache'),
});

const data = await loadData(path.join(root, 'data'));
const errors = validateAll({ ...data, manifest });
if (errors.length) {
  console.error(`Data validation failed with ${errors.length} problem(s):\n- ${errors.join('\n- ')}`);
  process.exit(1);
}

const payload = { faultCodes: data.faultCodes, trees: data.trees, pt: data.ptRaw, manifest };
await fs.writeFile(path.join(dist, 'data.js'), `window.HVAC_DATA=${JSON.stringify(payload)};\n`);

await esbuild({
  entryPoints: [path.join(root, 'app', 'src', 'main.js')],
  bundle: true,
  format: 'iife',
  target: 'es2020',
  outfile: path.join(dist, 'app.js'),
  logLevel: 'warning',
});

const mb = stats.indexBytes / 1048576;
console.log(`Build complete: ${stats.docs} documents, ${stats.pages} pages, index ${mb.toFixed(1)} MB, ${data.faultCodes.length} fault codes, ${data.trees.length} trees, ${data.ptRaw.length} PT tables.`);
if (stats.failures.length) console.warn(`${stats.failures.length} PDF(s) could not be read:\n- ${stats.failures.map((f) => `${f.file}: ${f.reason}`).join('\n- ')}`);
if (stats.emptyPages) console.warn(`${stats.emptyPages} page(s) had no extractable text (image-only pages are not searchable).`);
if (stats.noTextDocs.length) console.warn(`${stats.noTextDocs.length} PDF(s) have no extractable text and will not be searchable (probably scanned images): ${stats.noTextDocs.join(', ')}`);
if (mb > 80) console.warn('The search index is over 80 MB and the app may load slowly. Tell the maintainer; the index should be split per manufacturer.');
