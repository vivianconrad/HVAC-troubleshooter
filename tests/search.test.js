import { describe, it, expect } from 'vitest';
import { createIndex, loadIndex, searchManuals, makeSnippet, pdfHref } from '../src/lib/search.js';

const pages = [
  { manufacturer: 'tekmar', doc: 'tN2 manual.pdf', page: 3, text: 'The boiler enters lockout when the sensor is open.' },
  { manufacturer: 'tekmar', doc: 'tN2 manual.pdf', page: 4, text: 'Pump delay is set in the settings menu.' },
  { manufacturer: 'aerco', doc: 'bmk.pdf', page: 1, text: 'Lockout reset procedure for the boiler.' },
];

describe('searchManuals', () => {
  const index = createIndex(pages);

  it('finds pages by word across manufacturers', () => {
    expect(searchManuals(index, 'lockout')).toHaveLength(2);
  });
  it('filters by manufacturer', () => {
    const r = searchManuals(index, 'lockout', { manufacturer: 'tekmar' });
    expect(r).toHaveLength(1);
    expect(r[0]).toMatchObject({ manufacturer: 'tekmar', doc: 'tN2 manual.pdf', page: 3 });
  });
  it('requires all words (AND)', () => {
    const r = searchManuals(index, 'pump delay');
    expect(r).toHaveLength(1);
    expect(r[0].page).toBe(4);
    expect(searchManuals(index, 'lockout reset').map((x) => x.manufacturer)).toEqual(['aerco']);
  });
  it('tolerates a typo and a prefix', () => {
    expect(searchManuals(index, 'lokout').length).toBeGreaterThan(0);
    expect(searchManuals(index, 'proced').length).toBe(1);
  });
  it('returns nothing for blank or symbol-only queries without throwing', () => {
    expect(searchManuals(index, '')).toEqual([]);
    expect(searchManuals(index, '   ')).toEqual([]);
    expect(searchManuals(index, '(')).toEqual([]);
    expect(searchManuals(index, '.*[')).toEqual([]);
  });
  it('includes a snippet around the match', () => {
    expect(searchManuals(index, 'lockout')[0].snippet.toLowerCase()).toContain('lockout');
  });
  it('honours the limit', () => {
    expect(searchManuals(index, 'lockout', { limit: 1 })).toHaveLength(1);
  });
  it('survives a JSON round trip, as shipped to the browser', () => {
    const restored = loadIndex(JSON.parse(JSON.stringify(index.toJSON())));
    expect(searchManuals(restored, 'pump delay')[0].page).toBe(4);
  });
  it('works with an empty index', () => {
    expect(searchManuals(createIndex([]), 'anything')).toEqual([]);
  });
});

describe('makeSnippet', () => {
  it('centres on the first match and collapses whitespace', () => {
    const text = `${'a '.repeat(200)}\n\n  TARGET word  ${'b '.repeat(200)}`;
    const s = makeSnippet(text, 'target', 20);
    expect(s).toContain('TARGET word');
    expect(s).not.toMatch(/\s{2}/);
    expect(s.startsWith('...')).toBe(true);
    expect(s.endsWith('...')).toBe(true);
  });
  it('falls back to the start of the page when no term is found', () => {
    expect(makeSnippet('hello world', 'zzz')).toBe('hello world');
  });
});

describe('pdfHref', () => {
  it('encodes spaces', () => {
    expect(pdfHref({ manufacturer: 'tekmar', doc: 'tN2 manual.pdf', page: 3 })).toBe('../pdfs/tekmar/tN2%20manual.pdf#page=3');
  });
  it('encodes # and % in names and keeps subfolders', () => {
    expect(pdfHref({ manufacturer: 'tekmar', doc: 'sub/My #2 100%.pdf', page: 12 })).toBe('../pdfs/tekmar/sub/My%20%232%20100%25.pdf#page=12');
  });
  it('encodes non-ASCII and encodes the manufacturer too', () => {
    expect(pdfHref({ manufacturer: 'Aerco Intl', doc: 'café.pdf', page: 1 })).toBe('../pdfs/Aerco%20Intl/caf%C3%A9.pdf#page=1');
  });
  it('rejects invalid page numbers', () => {
    expect(() => pdfHref({ manufacturer: 'a', doc: 'b.pdf', page: 0 })).toThrow(RangeError);
    expect(() => pdfHref({ manufacturer: 'a', doc: 'b.pdf', page: 1.5 })).toThrow(RangeError);
  });
});
