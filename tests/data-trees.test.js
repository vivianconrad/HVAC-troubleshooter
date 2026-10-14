// tests/data-trees.test.js
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { validateTree } from '../src/lib/tree.js';

const dir = path.resolve('data/trees');
const files = fs.existsSync(dir) ? fs.readdirSync(dir).filter((f) => f.endsWith('.json')) : [];

describe('shipped trees', () => {
  it('includes the five generic hydronic trees named in the spec', () => {
    for (const f of ['generic-no-heat', 'generic-short-cycling', 'generic-poor-delta-t', 'generic-pump-not-running', 'generic-boiler-lockout']) {
      expect(files).toContain(`${f}.json`);
    }
  });
  for (const file of files) {
    const tree = JSON.parse(fs.readFileSync(path.join(dir, file), 'utf8'));
    it(`${file} is structurally valid`, () => expect(validateTree(tree)).toEqual([]));
    it(`${file} has a unique id matching its filename`, () => expect(`${tree.id}.json`).toBe(file));
    if (tree.generic) {
      it(`${file} generic trees carry no manual source (they are not manufacturer content)`, () => {
        for (const n of Object.values(tree.nodes)) expect(n.source).toBeUndefined();
      });
    }
  }
});
