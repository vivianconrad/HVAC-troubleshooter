// tests/build-index.test.js
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import vm from 'node:vm';
import { buildIndex } from '../build/build-index.js';
import { loadIndex, searchManuals } from '../src/lib/search.js';
import { makePdf } from './helpers/make-pdf.js';

let tmp;
const quiet = { warn: () => {}, log: () => {} };
beforeEach(async () => {
  tmp = await fs.mkdtemp(path.join(os.tmpdir(), 'hvac-idx-'));
});
afterEach(async () => {
  await fs.rm(tmp, { recursive: true, force: true });
});

const readIndex = async (outDir) => {
  const code = await fs.readFile(path.join(outDir, 'index-data.js'), 'utf8');
  const sandbox = { window: {} };
  vm.runInNewContext(code, sandbox);
  return sandbox.window.HVAC_INDEX;
};

describe('buildIndex', () => {
  it('succeeds with an empty pdfs folder and writes an empty, loadable index', async () => {
    const pdfRoot = path.join(tmp, 'pdfs');
    await fs.mkdir(pdfRoot);
    const outDir = path.join(tmp, 'dist');
    const { manifest, stats } = await buildIndex({ pdfRoot, outDir, log: quiet });
    expect(manifest).toEqual([]);
    expect(stats.docs).toBe(0);
    const index = loadIndex(await readIndex(outDir));
    expect(searchManuals(index, 'anything')).toEqual([]);
  });

  it('succeeds when the pdfs folder does not exist', async () => {
    const outDir = path.join(tmp, 'dist');
    const { manifest } = await buildIndex({ pdfRoot: path.join(tmp, 'missing'), outDir, log: quiet });
    expect(manifest).toEqual([]);
    expect(JSON.parse(await fs.readFile(path.join(outDir, 'manifest.json'), 'utf8'))).toEqual([]);
  });

  it('indexes good PDFs, and skips a corrupt one with a recorded failure', async () => {
    const pdfRoot = path.join(tmp, 'pdfs');
    await fs.mkdir(path.join(pdfRoot, 'tekmar'), { recursive: true });
    await fs.writeFile(path.join(pdfRoot, 'tekmar', 'good file.pdf'), makePdf(['Boiler lockout code', 'Pump delay setting']));
    await fs.writeFile(path.join(pdfRoot, 'tekmar', 'broken.pdf'), 'not a pdf at all');
    const outDir = path.join(tmp, 'dist');
    const cacheDir = path.join(tmp, 'cache');
    const warnings = [];
    const { manifest, stats } = await buildIndex({ pdfRoot, outDir, cacheDir, log: { warn: (m) => warnings.push(m), log: () => {} } });

    expect(manifest).toEqual([{ manufacturer: 'tekmar', doc: 'good file.pdf', pages: 2 }]);
    expect(stats.failures).toHaveLength(1);
    expect(stats.failures[0].file).toContain('broken.pdf');
    expect(warnings.join(' ')).toContain('broken.pdf');

    const index = loadIndex(await readIndex(outDir));
    const hits = searchManuals(index, 'pump delay');
    expect(hits).toHaveLength(1);
    expect(hits[0]).toMatchObject({ manufacturer: 'tekmar', doc: 'good file.pdf', page: 2 });

    const cached = JSON.parse(await fs.readFile(path.join(cacheDir, 'pages.json'), 'utf8'));
    expect(cached).toHaveLength(2);
  });

  it('does not index pages that have no text and counts them', async () => {
    const pdfRoot = path.join(tmp, 'pdfs');
    await fs.mkdir(path.join(pdfRoot, 'acme'), { recursive: true });
    await fs.writeFile(path.join(pdfRoot, 'acme', 'blank.pdf'), makePdf(['', 'has text']));
    const { manifest, stats } = await buildIndex({ pdfRoot, outDir: path.join(tmp, 'dist'), log: quiet });
    expect(manifest[0].pages).toBe(2);
    expect(stats.emptyPages).toBe(1);
    expect(stats.pages).toBe(1);
    expect(stats.noTextDocs).toEqual([]);
  });

  it('warns about a PDF with no extractable text on any page but keeps it in the manifest', async () => {
    const pdfRoot = path.join(tmp, 'pdfs');
    await fs.mkdir(path.join(pdfRoot, 'acme'), { recursive: true });
    await fs.writeFile(path.join(pdfRoot, 'acme', 'scan.pdf'), makePdf(['', '']));
    const warnings = [];
    const { manifest, stats } = await buildIndex({ pdfRoot, outDir: path.join(tmp, 'dist'), log: { warn: (m) => warnings.push(m), log: () => {} } });
    expect(manifest).toEqual([{ manufacturer: 'acme', doc: 'scan.pdf', pages: 2 }]);
    expect(stats.noTextDocs).toEqual(['acme/scan.pdf']);
    expect(warnings.join(' ')).toMatch(/acme\/scan\.pdf.*no extractable text.*not be searchable/);
  });
});
