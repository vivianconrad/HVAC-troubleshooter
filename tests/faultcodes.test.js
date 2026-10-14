// tests/faultcodes.test.js
import { describe, it, expect } from 'vitest';
import { searchFaultCodes, listManufacturers, listModels, validateFaultCodes } from '../src/lib/faultcodes.js';
import { checkSource } from '../src/lib/manifest.js';

// Test-only fixture data. Not real manufacturer codes.
const src = (page) => ({ manufacturer: 'acme', doc: 'ctl.pdf', page });
const entries = [
  { manufacturer: 'acme', model: 'X1', code: 'E-01', meaning: 'Supply sensor open', causes: ['Wire broken'], checks: ['Measure sensor resistance'], source: src(5) },
  { manufacturer: 'acme', model: 'X1', code: 'E-02', meaning: 'Return sensor shorted', causes: ['Pinched wire'], checks: ['Inspect wiring'], source: src(5) },
  { manufacturer: 'acme', model: 'X2', code: 'E-01', meaning: 'Outdoor sensor open', causes: [], checks: [], source: src(6) },
  { manufacturer: 'zeta', model: 'Z9', code: '12', meaning: 'Ignition failure', causes: ['No spark'], checks: ['Check igniter'], source: { manufacturer: 'zeta', doc: 'z.pdf', page: 2 } },
];
const manifest = [{ manufacturer: 'acme', doc: 'ctl.pdf', pages: 10 }, { manufacturer: 'zeta', doc: 'z.pdf', pages: 4 }];

describe('searchFaultCodes', () => {
  it('returns everything sorted when the query is blank', () => {
    expect(searchFaultCodes(entries, '')).toHaveLength(4);
    expect(searchFaultCodes(entries, '   ')).toHaveLength(4);
  });
  it('matches codes regardless of case, dashes and spaces', () => {
    for (const q of ['E-01', 'e01', 'e 01', 'E_01']) {
      const r = searchFaultCodes(entries, q);
      expect(r.map((e) => `${e.model}:${e.code}`)).toEqual(['X1:E-01', 'X2:E-01']);
    }
  });
  it('finds by words in the meaning, causes or checks', () => {
    expect(searchFaultCodes(entries, 'ignition')[0].manufacturer).toBe('zeta');
    expect(searchFaultCodes(entries, 'pinched')[0].code).toBe('E-02');
    expect(searchFaultCodes(entries, 'igniter')[0].code).toBe('12');
  });
  it('requires every word to match', () => {
    expect(searchFaultCodes(entries, 'sensor open')).toHaveLength(2);
    expect(searchFaultCodes(entries, 'sensor banana')).toEqual([]);
  });
  it('filters by manufacturer and model', () => {
    expect(searchFaultCodes(entries, '', { manufacturer: 'zeta' })).toHaveLength(1);
    expect(searchFaultCodes(entries, 'e-01', { manufacturer: 'acme', model: 'X2' })).toHaveLength(1);
  });
  it('never throws on regex characters or symbols', () => {
    for (const q of ['(', '.*[', '\\', '+++', '$^']) expect(() => searchFaultCodes(entries, q)).not.toThrow();
  });
  it('returns empty array for symbol-only queries', () => {
    expect(searchFaultCodes(entries, '$^')).toEqual([]);
    expect(searchFaultCodes(entries, '(')).toEqual([]);
  });
  it('ranks an exact code above a partial one', () => {
    // E-010 is placed BEFORE E-01 so pool order alone would give the wrong answer.
    const more = [{ manufacturer: 'acme', model: 'X1', code: 'E-010', meaning: 'Other', causes: [], checks: [], source: src(7) }, ...entries];
    expect(searchFaultCodes(more, 'E-01', { model: 'X1' })[0].code).toBe('E-01');
  });
});

describe('listing helpers', () => {
  it('lists unique sorted manufacturers and models', () => {
    expect(listManufacturers(entries)).toEqual(['acme', 'zeta']);
    expect(listModels(entries, 'acme')).toEqual(['X1', 'X2']);
    expect(listModels(entries)).toEqual(['X1', 'X2', 'Z9']);
  });
});

describe('validateFaultCodes', () => {
  it('accepts good data', () => expect(validateFaultCodes(entries, manifest)).toEqual([]));
  it('requires the core fields', () => {
    const bad = [{ manufacturer: 'acme', model: '', code: 'E1', meaning: '', causes: 'x', checks: [], source: src(1) }];
    const msg = validateFaultCodes(bad, manifest).join(' ');
    expect(msg).toMatch(/model/);
    expect(msg).toMatch(/meaning/);
    expect(msg).toMatch(/causes/);
  });
  it('rejects a source that is not in the manifest or is out of range', () => {
    const e1 = [{ ...entries[0], source: { manufacturer: 'acme', doc: 'missing.pdf', page: 1 } }];
    expect(validateFaultCodes(e1, manifest).join(' ')).toMatch(/not in the manual index/);
    const e2 = [{ ...entries[0], source: src(11) }];
    expect(validateFaultCodes(e2, manifest).join(' ')).toMatch(/beyond the 10-page/);
  });
  it('rejects duplicates of manufacturer + model + code', () => {
    expect(validateFaultCodes([entries[0], entries[0]], manifest).join(' ')).toMatch(/duplicate/i);
  });
  it('reports errors for non-object entries instead of throwing', () => {
    const result = validateFaultCodes([null, 'x', [], entries[0]], manifest);
    const badEntryErrors = result.filter(msg => msg.match(/fault code #[123].*must be an object/));
    expect(badEntryErrors).toHaveLength(3);
    const validEntryErrors = result.filter(msg => msg.includes('fault code #4'));
    expect(validEntryErrors).toHaveLength(0);
  });
});

describe('checkSource', () => {
  it('requires a well-formed source', () => {
    expect(checkSource('x', undefined, manifest)[0]).toMatch(/source/);
    expect(checkSource('x', { manufacturer: 'acme', doc: 'ctl.pdf', page: 1.5 }, manifest)[0]).toMatch(/integer/);
  });
  it('passes a valid source', () => expect(checkSource('x', src(10), manifest)).toEqual([]));
});
