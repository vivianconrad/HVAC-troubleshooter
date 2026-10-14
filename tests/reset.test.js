// tests/reset.test.js
import { describe, it, expect } from 'vitest';
import { resetTarget, assessSupply } from '../src/lib/reset.js';

const base = { outdoorDesignF: 0, supplyDesignF: 180, roomF: 70 };

describe('resetTarget', () => {
  it('returns the design supply at the design outdoor temperature', () => {
    expect(resetTarget({ ...base, outdoorF: 0 })).toBe(180);
  });
  it('is linear between room and design', () => {
    expect(resetTarget({ ...base, outdoorF: 35 })).toBe(125);
  });
  it('returns room temperature when outdoor equals room', () => {
    expect(resetTarget({ ...base, outdoorF: 70 })).toBe(70);
  });
  it('never goes below room temperature on warm days', () => {
    expect(resetTarget({ ...base, outdoorF: 90 })).toBe(70);
  });
  it('applies min and max limits', () => {
    expect(resetTarget({ ...base, outdoorF: 90, supplyMinF: 110 })).toBe(110);
    expect(resetTarget({ ...base, outdoorF: -10, supplyMaxF: 150 })).toBe(150);
  });
  it('rejects impossible design values', () => {
    expect(() => resetTarget({ ...base, outdoorF: 10, outdoorDesignF: 70 })).toThrow(RangeError);
    expect(() => resetTarget({ ...base, outdoorF: 10, supplyDesignF: 60 })).toThrow(RangeError);
  });
  it('rejects a minimum supply above the maximum supply', () => {
    expect(() => resetTarget({ ...base, outdoorF: 10, supplyMinF: 160, supplyMaxF: 120 })).toThrow('Minimum supply must not exceed maximum supply');
  });
  it('rejects non-numbers', () => {
    expect(() => resetTarget({ ...base, outdoorF: NaN })).toThrow(RangeError);
  });
});

describe('assessSupply', () => {
  it('is ok within tolerance', () => {
    expect(assessSupply(128, 125)).toEqual({ status: 'ok', difference: 3 });
  });
  it('flags high and low', () => {
    expect(assessSupply(140, 125).status).toBe('high');
    expect(assessSupply(110, 125).status).toBe('low');
  });
  it('honours a custom tolerance and rejects a negative one', () => {
    expect(assessSupply(133, 125, 10).status).toBe('ok');
    expect(() => assessSupply(133, 125, -1)).toThrow(RangeError);
  });
});
