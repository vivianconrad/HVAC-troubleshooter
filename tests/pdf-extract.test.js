// tests/pdf-extract.test.js
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { extractPdf, findPdfs } from '../build/pdf-extract.js';
import { makePdf } from './helpers/make-pdf.js';

let tmp;
beforeAll(async () => {
  tmp = await fs.mkdtemp(path.join(os.tmpdir(), 'hvac-pdf-'));
});
afterAll(async () => {
  await fs.rm(tmp, { recursive: true, force: true });
});

describe('extractPdf', () => {
  it('returns text per page, numbered from 1', async () => {
    const file = path.join(tmp, 'two.pdf');
    await fs.writeFile(file, makePdf(['Boiler lockout code 12', 'Second page pump']));
    const pages = await extractPdf(file);
    expect(pages).toHaveLength(2);
    expect(pages[0].page).toBe(1);
    expect(pages[0].text).toContain('lockout');
    expect(pages[1].text).toContain('pump');
  });
  it('rejects a file that is not a PDF', async () => {
    const file = path.join(tmp, 'bad.pdf');
    await fs.writeFile(file, 'this is not a pdf');
    await expect(extractPdf(file)).rejects.toThrow();
  });
});

describe('findPdfs', () => {
  it('maps the first folder to the manufacturer and keeps subfolders in doc', async () => {
    const root = path.join(tmp, 'pdfs');
    await fs.mkdir(path.join(root, 'tekmar', 'sub'), { recursive: true });
    await fs.mkdir(path.join(root, 'aerco'), { recursive: true });
    await fs.writeFile(path.join(root, 'tekmar', 'a.pdf'), makePdf(['x']));
    await fs.writeFile(path.join(root, 'tekmar', 'sub', 'B.PDF'), makePdf(['x']));
    await fs.writeFile(path.join(root, 'tekmar', 'notes.txt'), 'ignore me');
    await fs.writeFile(path.join(root, 'aerco', 'c.pdf'), makePdf(['x']));
    await fs.writeFile(path.join(root, 'loose.pdf'), makePdf(['x']));
    const { pdfs, skipped } = await findPdfs(root);
    expect(pdfs.map((p) => `${p.manufacturer}/${p.doc}`)).toEqual(['aerco/c.pdf', 'tekmar/a.pdf', 'tekmar/sub/B.PDF']);
    expect(skipped).toEqual(['loose.pdf']);
  });
  it('returns empty lists when the folder does not exist', async () => {
    expect(await findPdfs(path.join(tmp, 'nope'))).toEqual({ pdfs: [], skipped: [] });
  });
});
