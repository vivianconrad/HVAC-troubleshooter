// build/build-index.js
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { extractPdf, findPdfs } from './pdf-extract.js';
import { createIndex } from '../src/lib/search.js';

export async function buildIndex({ pdfRoot, outDir, cacheDir, log = console }) {
  await fs.mkdir(outDir, { recursive: true });
  const { pdfs, skipped } = await findPdfs(pdfRoot);
  for (const name of skipped) log.warn(`Skipped (not inside a manufacturer folder): ${name}`);

  const pages = [];
  const manifest = [];
  const failures = [];
  const noTextDocs = [];
  let emptyPages = 0;

  for (const pdf of pdfs) {
    try {
      const extracted = await extractPdf(pdf.filePath);
      for (const p of extracted) {
        if (!p.text) {
          emptyPages++;
          continue;
        }
        pages.push({ manufacturer: pdf.manufacturer, doc: pdf.doc, page: p.page, text: p.text });
      }
      if (extracted.length > 0 && extracted.every((p) => !p.text)) {
        noTextDocs.push(`${pdf.manufacturer}/${pdf.doc}`);
        log.warn(`${pdf.manufacturer}/${pdf.doc} has no extractable text (probably scanned images) and will not be searchable`);
      }
      manifest.push({ manufacturer: pdf.manufacturer, doc: pdf.doc, pages: extracted.length });
      log.log(`Indexed ${pdf.manufacturer}/${pdf.doc} (${extracted.length} pages)`);
    } catch (err) {
      const reason = String((err && err.message) || err);
      failures.push({ file: `${pdf.manufacturer}/${pdf.doc}`, reason });
      log.warn(`FAILED ${pdf.manufacturer}/${pdf.doc}: ${reason}`);
    }
  }

  const json = JSON.stringify(createIndex(pages).toJSON());
  await fs.writeFile(path.join(outDir, 'index-data.js'), `window.HVAC_INDEX=${json};\n`);
  await fs.writeFile(path.join(outDir, 'manifest.json'), JSON.stringify(manifest, null, 2));
  if (cacheDir) {
    await fs.mkdir(cacheDir, { recursive: true });
    await fs.writeFile(path.join(cacheDir, 'pages.json'), JSON.stringify(pages));
  }

  return {
    manifest,
    stats: { docs: manifest.length, pages: pages.length, emptyPages, noTextDocs, failures, indexBytes: Buffer.byteLength(json) },
  };
}

const isMain = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
if (isMain) {
  const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
  const { stats } = await buildIndex({
    pdfRoot: path.join(root, 'pdfs'),
    outDir: path.join(root, 'app', 'dist'),
    cacheDir: path.join(root, 'build', '.cache'),
  });
  console.log(`Done: ${stats.docs} documents, ${stats.pages} pages, ${stats.emptyPages} empty pages, ${stats.failures.length} failures, index ${(stats.indexBytes / 1048576).toFixed(1)} MB`);
}
