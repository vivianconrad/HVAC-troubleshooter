import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { loadData } from '../build/load-data.js';
import { validateAll } from '../build/validate-data.js';

let tmp;
beforeEach(async () => {
  tmp = await fs.mkdtemp(path.join(os.tmpdir(), 'hvac-data-'));
});
afterEach(async () => {
  await fs.rm(tmp, { recursive: true, force: true });
});

const write = async (rel, value) => {
  const file = path.join(tmp, rel);
  await fs.mkdir(path.dirname(file), { recursive: true });
  await fs.writeFile(file, typeof value === 'string' ? value : JSON.stringify(value));
};

const manifest = [{ manufacturer: 'acme', doc: 'ctl.pdf', pages: 10 }];
const tree = {
  id: 't1',
  title: 'T',
  start: 'q',
  nodes: {
    q: { type: 'question', text: 'Q?', options: [{ label: 'a', next: 'r' }, { label: 'b', next: 'r2' }] },
    r: { type: 'result', cause: 'c', fix: ['f'], source: { manufacturer: 'acme', doc: 'ctl.pdf', page: 3 } },
    r2: { type: 'result', cause: 'c2', fix: ['f2'] },
  },
};
const pt = { refrigerant: 'T', source: 's', points: [{ tF: 0, bubblePsig: 0, dewPsig: 0 }, { tF: 10, bubblePsig: 20, dewPsig: 20 }] };

describe('loadData', () => {
  it('returns empty arrays when the data folders are missing', async () => {
    expect(await loadData(tmp)).toEqual({ faultCodes: [], trees: [], ptRaw: [] });
  });
  it('merges fault code files and reads trees and tables', async () => {
    await write('fault-codes/a.json', [{ code: '1' }]);
    await write('fault-codes/b.json', [{ code: '2' }]);
    await write('trees/t.json', tree);
    await write('pt/t.json', pt);
    const d = await loadData(tmp);
    expect(d.faultCodes.map((e) => e.code)).toEqual(['1', '2']);
    expect(d.trees[0].id).toBe('t1');
    expect(d.ptRaw[0].refrigerant).toBe('T');
  });
  it('names the file when JSON is invalid', async () => {
    await write('trees/broken.json', '{ not json');
    await expect(loadData(tmp)).rejects.toThrow(/trees\/broken\.json/);
  });
  it('rejects a fault code file that is not an array', async () => {
    await write('fault-codes/x.json', { code: '1' });
    await expect(loadData(tmp)).rejects.toThrow(/fault-codes\/x\.json.*array/);
  });
});

describe('validateAll', () => {
  it('passes good data', () => {
    expect(validateAll({ faultCodes: [], trees: [tree], ptRaw: [pt], manifest })).toEqual([]);
  });
  it('flags a tree source that is not in the manual index', () => {
    const t = structuredClone(tree);
    t.nodes.r.source.page = 99;
    expect(validateAll({ faultCodes: [], trees: [t], ptRaw: [], manifest }).join(' ')).toMatch(/beyond the 10-page/);
  });
  it('flags duplicate tree ids and bad PT tables', () => {
    const bad = { refrigerant: 'BAD', points: [] };
    const msg = validateAll({ faultCodes: [], trees: [tree, tree], ptRaw: [bad], manifest }).join(' ');
    expect(msg).toMatch(/duplicate tree id "t1"/);
    expect(msg).toMatch(/BAD/);
  });
});
