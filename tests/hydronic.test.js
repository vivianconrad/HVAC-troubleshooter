import { describe, it, expect } from 'vitest';
import { deltaT, heatOutputBtuh, flowGpm, assessDeltaT } from '../src/lib/hydronic.js';
import { parseNumber, requireNumber } from '../src/lib/num.js';

describe('num helpers', () => {
  it('parseNumber treats blank as undefined', () => {
    expect(parseNumber('', 'x')).toBeUndefined();
    expect(parseNumber('  ', 'x')).toBeUndefined();
    expect(parseNumber(null, 'x')).toBeUndefined();
    expect(parseNumber(undefined, 'x')).toBeUndefined();
  });
  it('parseNumber parses numbers and rejects junk, including comma decimals', () => {
    expect(parseNumber(' 12.5 ', 'x')).toBe(12.5);
    expect(parseNumber('-4', 'x')).toBe(-4);
    expect(() => parseNumber('abc', 'Flow')).toThrow('Flow must be a number (use a dot for decimals)');
    expect(() => parseNumber('12,5', 'Flow')).toThrow(RangeError);
    expect(() => parseNumber('Infinity', 'Flow')).toThrow(RangeError);
  });
  it('requireNumber rejects blank', () => {
    expect(() => requireNumber('', 'Supply')).toThrow('Supply is required');
    expect(requireNumber('7', 'Supply')).toBe(7);
  });
});

describe('deltaT', () => {
  it('returns supply minus return', () => expect(deltaT(180, 160)).toBe(20));
  it('is positive for chilled water too', () => expect(deltaT(44, 54)).toBe(10));
  it('rounds float noise to one decimal', () => expect(deltaT(180.5, 160.2)).toBe(20.3));
  it('rejects non-numbers', () => {
    expect(() => deltaT(NaN, 160)).toThrow(RangeError);
    expect(() => deltaT('180', 160)).toThrow(RangeError);
  });
});

describe('heatOutputBtuh', () => {
  it('uses 500 x gpm x deltaT for water', () => expect(heatOutputBtuh(10, 20)).toBe(100000));
  it('handles fractional inputs', () => expect(heatOutputBtuh(12.5, 18.5)).toBe(115625));
  it('accepts a custom fluid factor', () => expect(heatOutputBtuh(10, 20, 450)).toBe(90000));
  it('rejects negative flow and non-positive factor', () => {
    expect(() => heatOutputBtuh(-1, 20)).toThrow(RangeError);
    expect(() => heatOutputBtuh(10, 20, 0)).toThrow(RangeError);
  });
});

describe('flowGpm', () => {
  it('inverts heatOutputBtuh', () => {
    expect(flowGpm(100000, 20)).toBe(10);
    expect(flowGpm(75000, 15)).toBe(10);
  });
  it('rejects zero delta-T', () => expect(() => flowGpm(100000, 0)).toThrow('deltaT must not be zero'));
});

describe('assessDeltaT', () => {
  const target = { min: 15, max: 25 };
  it('flags low', () => {
    const r = assessDeltaT(10, target);
    expect(r.status).toBe('low');
    expect(r.hints.length).toBeGreaterThan(0);
  });
  it('flags high', () => expect(assessDeltaT(30, target).status).toBe('high'));
  it('passes inside the range, inclusive', () => {
    expect(assessDeltaT(20, target).status).toBe('ok');
    expect(assessDeltaT(15, target).status).toBe('ok');
    expect(assessDeltaT(25, target).status).toBe('ok');
  });
  it('asks for a target when none given', () => {
    expect(assessDeltaT(20).status).toBe('no-target');
    expect(assessDeltaT(20, {}).status).toBe('no-target');
  });
  it('works with only a min or only a max', () => {
    expect(assessDeltaT(10, { min: 15 }).status).toBe('low');
    expect(assessDeltaT(30, { max: 25 }).status).toBe('high');
  });
  it('rejects min greater than max', () => {
    expect(() => assessDeltaT(20, { min: 30, max: 10 })).toThrow(RangeError);
  });
});
