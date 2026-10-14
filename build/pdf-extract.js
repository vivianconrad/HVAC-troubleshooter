// build/pdf-extract.js
import fs from 'node:fs/promises';
import path from 'node:path';
import * as pdfjs from 'pdfjs-dist/legacy/build/pdf.mjs';

export async function extractPdf(filePath) {
  const data = new Uint8Array(await fs.readFile(filePath));
  const pdf = await pdfjs.getDocument({ data, useSystemFonts: true, verbosity: 0 }).promise;
  const pages = [];
  try {
    for (let n = 1; n <= pdf.numPages; n++) {
      const page = await pdf.getPage(n);
      const content = await page.getTextContent();
      let text = '';
      for (const item of content.items) {
        text += item.str;
        text += item.hasEOL ? '\n' : ' ';
      }
      pages.push({ page: n, text: text.replace(/[ \t]+/g, ' ').trim() });
      page.cleanup();
    }
  } finally {
    await pdf.destroy();
  }
  return pages;
}

export async function findPdfs(root) {
  const pdfs = [];
  const skipped = [];
  let entries;
  try {
    entries = await fs.readdir(root, { withFileTypes: true });
  } catch (err) {
    if (err.code === 'ENOENT') return { pdfs, skipped };
    throw err;
  }
  const isPdf = (name) => name.toLowerCase().endsWith('.pdf');
  const byName = (a, b) => a.name.localeCompare(b.name);

  const walk = async (dir, manufacturer, rel) => {
    const items = (await fs.readdir(dir, { withFileTypes: true })).sort(byName);
    for (const it of items) {
      const full = path.join(dir, it.name);
      const relPath = rel ? `${rel}/${it.name}` : it.name;
      if (it.isDirectory()) await walk(full, manufacturer, relPath);
      else if (it.isFile() && isPdf(it.name)) pdfs.push({ manufacturer, doc: relPath, filePath: full });
    }
  };

  for (const e of entries.sort(byName)) {
    if (e.isDirectory()) await walk(path.join(root, e.name), e.name, '');
    else if (e.isFile() && isPdf(e.name)) skipped.push(e.name);
  }
  return { pdfs, skipped };
}
