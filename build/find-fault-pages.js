// build/find-fault-pages.js
// Ranks pages likely to hold fault-code tables or troubleshooting flows, to speed up transcription.
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const STRONG = /\b(error|fault|lockout|alarm|trouble\w*|diagnos\w*)\b/gi;
const WEAK = /\b(code|display|led|flash\w*|blink\w*|reset)\b/gi;
const MIN_SCORE = 6;

const count = (re, s) => (s.match(re) || []).length;

export function scoreFaultPages(pages, topPerDoc = 15) {
  const byDoc = new Map();
  for (const p of pages) {
    const score = count(STRONG, p.text) * 3 + count(WEAK, p.text);
    if (score < MIN_SCORE) continue;
    const key = `${p.manufacturer}/${p.doc}`;
    if (!byDoc.has(key)) byDoc.set(key, []);
    byDoc.get(key).push({ manufacturer: p.manufacturer, doc: p.doc, page: p.page, score });
  }
  const out = [];
  for (const list of byDoc.values()) {
    list.sort((a, b) => b.score - a.score || a.page - b.page);
    out.push(...list.slice(0, topPerDoc));
  }
  return out;
}

const isMain = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
if (isMain) {
  const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
  let raw;
  try {
    raw = await fs.readFile(path.join(root, 'build', '.cache', 'pages.json'), 'utf8');
  } catch (err) {
    if (err && err.code === 'ENOENT') {
      console.error('No page cache found. Run "npm run build" first (put manuals in pdfs/<manufacturer>/).');
      process.exit(1);
    }
    throw err;
  }
  const pages = JSON.parse(raw);
  for (const r of scoreFaultPages(pages)) console.log(`${r.manufacturer}/${r.doc}  page ${r.page}  score ${r.score}`);
}
