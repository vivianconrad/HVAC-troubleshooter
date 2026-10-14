// tests/pt.test.js
import { describe, it, expect } from 'vitest';
import { loadTable, satPressure, satTemp, tableFromCsv, buildTables } from '../src/lib/pt.js';

// Synthetic table: psig = 2 x tF, so expected values are easy to verify by hand.
const linear = loadTable({
  refrigerant: 'TEST',
  source: 'synthetic',
  points: Array.from({ length: 11 }, (_, i) => ({ tF: i * 10, bubblePsig: i * 20, dewPsig: i * 20 })),
});

describe('loadTable', () => {
  it('accepts a valid table', () => expect(linear.points).toHaveLength(11));
  it('rejects fewer than two points', () => {
    expect(() => loadTable({ refrigerant: 'X', points: [{ tF: 0, bubblePsig: 1, dewPsig: 1 }] })).toThrow();
  });
  it('rejects non-increasing temperatures or pressures', () => {
    const pts = [{ tF: 0, bubblePsig: 10, dewPsig: 10 }, { tF: 0, bubblePsig: 20, dewPsig: 20 }];
    expect(() => loadTable({ refrigerant: 'X', points: pts })).toThrow(/increasing/);
    const pts2 = [{ tF: 0, bubblePsig: 10, dewPsig: 10 }, { tF: 10, bubblePsig: 10, dewPsig: 20 }];
    expect(() => loadTable({ refrigerant: 'X', points: pts2 })).toThrow(/increasing/);
  });
  it('rejects non-numeric fields', () => {
    const pts = [{ tF: 0, bubblePsig: 10, dewPsig: 10 }, { tF: 10, bubblePsig: 'x', dewPsig: 20 }];
    expect(() => loadTable({ refrigerant: 'X', points: pts })).toThrow(/bubblePsig/);
  });
  it('rejects dew pressure above bubble pressure', () => {
    const pts = [{ tF: 0, bubblePsig: 10, dewPsig: 20 }, { tF: 10, bubblePsig: 30, dewPsig: 40 }];
    expect(() => loadTable({ refrigerant: 'X', points: pts })).toThrow(/dew/);
  });
});

describe('satPressure / satTemp', () => {
  it('interpolates linearly', () => {
    expect(satPressure(linear, 25, 'bubble')).toBe(50);
    expect(satTemp(linear, 50, 'dew')).toBe(25);
  });
  it('is exact at table points and at both ends', () => {
    expect(satPressure(linear, 0, 'dew')).toBe(0);
    expect(satPressure(linear, 100, 'dew')).toBe(200);
    expect(satTemp(linear, 200, 'bubble')).toBe(100);
  });
  it('throws RangeError outside the table instead of extrapolating', () => {
    expect(() => satPressure(linear, -1, 'bubble')).toThrow(RangeError);
    expect(() => satPressure(linear, 101, 'bubble')).toThrow(RangeError);
    expect(() => satTemp(linear, -0.5, 'dew')).toThrow(RangeError);
    expect(() => satTemp(linear, 201, 'dew')).toThrow(RangeError);
  });
  it('rejects non-numbers and unknown phases', () => {
    expect(() => satTemp(linear, NaN, 'dew')).toThrow(RangeError);
    expect(() => satTemp(linear, 50, 'vapor')).toThrow(/phase/);
  });
});

describe('tableFromCsv', () => {
  it('parses two columns as a pure fluid', () => {
    const t = tableFromCsv('tF,psig\n0,10\n10,20\n', { refrigerant: 'R-X', source: 's' });
    expect(t.points[0]).toEqual({ tF: 0, bubblePsig: 10, dewPsig: 10 });
  });
  it('parses three columns, skipping blanks and comments', () => {
    const t = tableFromCsv('# chart\ntF,bubblePsig,dewPsig\n\n0,12,10\n10,22,20\n', { refrigerant: 'R-Y', source: 's' });
    expect(t.points[1]).toEqual({ tF: 10, bubblePsig: 22, dewPsig: 20 });
  });
  it('reports the bad line number', () => {
    expect(() => tableFromCsv('tF,psig\n0,10\n10,abc\n', { refrigerant: 'R-X', source: 's' })).toThrow(/line 3/);
  });
  it('rejects a row with a trailing empty cell', () => {
    expect(() => tableFromCsv('tF,psig\n-40,\n10,20\n', { refrigerant: 'R-X', source: 's' })).toThrow(/line 2/);
  });
  it('rejects a row with an empty middle cell', () => {
    expect(() => tableFromCsv('tF,bubblePsig,dewPsig\n0,12,10\n10,,5\n', { refrigerant: 'R-X', source: 's' })).toThrow(/line 3/);
  });
});

describe('buildTables', () => {
  it('keys tables by refrigerant name', () => {
    const raw = { refrigerant: 'R-T', source: 's', points: linear.points };
    expect(Object.keys(buildTables([raw]))).toEqual(['R-T']);
  });
});
