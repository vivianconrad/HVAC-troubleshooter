// tests/refrigerant.test.js
import { describe, it, expect } from 'vitest';
import { loadTable } from '../src/lib/pt.js';
import { superheat, subcooling, rangeStatus, interpretCharge } from '../src/lib/refrigerant.js';

// Zeotropic synthetic table: bubble = 2 x tF + 2, dew = 2 x tF (bubble pressure is higher at the same temperature).
const glide = loadTable({
  refrigerant: 'GLIDE',
  source: 'synthetic',
  points: Array.from({ length: 11 }, (_, i) => ({ tF: i * 10, bubblePsig: i * 20 + 2, dewPsig: i * 20 })),
});

describe('superheat', () => {
  it('uses the dew point at suction pressure', () => {
    // 100 psig dew -> 50 F saturated; line at 60 F -> 10 F superheat
    expect(superheat(glide, { suctionPsig: 100, suctionLineF: 60 })).toBe(10);
  });
  it('can be negative (flooding)', () => {
    expect(superheat(glide, { suctionPsig: 100, suctionLineF: 45 })).toBe(-5);
  });
  it('throws for pressure outside the table', () => {
    expect(() => superheat(glide, { suctionPsig: 500, suctionLineF: 60 })).toThrow(RangeError);
  });
});

describe('subcooling', () => {
  it('uses the bubble point at liquid pressure', () => {
    // 162 psig bubble -> 80 F saturated; line at 70 F -> 10 F subcooling
    expect(subcooling(glide, { liquidPsig: 162, liquidLineF: 70 })).toBe(10);
  });
});

describe('rangeStatus', () => {
  it('classifies against min and max', () => {
    expect(rangeStatus(5, { min: 8, max: 12 })).toBe('low');
    expect(rangeStatus(10, { min: 8, max: 12 })).toBe('ok');
    expect(rangeStatus(15, { min: 8, max: 12 })).toBe('high');
  });
  it('is unknown without a usable range', () => {
    expect(rangeStatus(10)).toBe('unknown');
    expect(rangeStatus(10, {})).toBe('unknown');
    expect(rangeStatus(undefined, { min: 1, max: 2 })).toBe('unknown');
  });
});

describe('interpretCharge', () => {
  const targets = { superheat: { min: 8, max: 12 }, subcooling: { min: 8, max: 12 } };
  const text = (r) => r.findings.join(' ');
  it('high superheat with low subcooling points at low charge', () => {
    const r = interpretCharge({ superheat: 20, subcooling: 3 }, targets);
    expect(r.superheat).toBe('high');
    expect(r.subcooling).toBe('low');
    expect(text(r)).toMatch(/low refrigerant charge/i);
  });
  it('low superheat with high subcooling points at overcharge', () => {
    expect(text(interpretCharge({ superheat: 3, subcooling: 20 }, targets))).toMatch(/overcharge/i);
  });
  it('high superheat with high subcooling points at a restriction', () => {
    expect(text(interpretCharge({ superheat: 20, subcooling: 20 }, targets))).toMatch(/restriction/i);
  });
  it('low superheat with low subcooling points at compressor or airflow', () => {
    expect(text(interpretCharge({ superheat: 3, subcooling: 3 }, targets))).toMatch(/compressor/i);
  });
  it('reports within-target when both are ok', () => {
    expect(text(interpretCharge({ superheat: 10, subcooling: 10 }, targets))).toMatch(/within/i);
  });
  it('asks for targets instead of guessing', () => {
    const r = interpretCharge({ superheat: 10, subcooling: 10 }, {});
    expect(r.superheat).toBe('unknown');
    expect(text(r)).toMatch(/target/i);
  });
  it('handles only one measurement', () => {
    const r = interpretCharge({ superheat: 20 }, targets);
    expect(r.subcooling).toBe('unknown');
    expect(r.findings.length).toBeGreaterThan(0);
  });
  it('asks for both readings, not targets, when a measurement is missing but targets exist', () => {
    const t = text(interpretCharge({ superheat: 20 }, targets));
    expect(t).toMatch(/Enter both suction and liquid readings/);
    expect(t).not.toMatch(/target/i);
  });
  it('still asks for targets when measurements are present and targets are missing', () => {
    expect(text(interpretCharge({ superheat: 10, subcooling: 10 }, { superheat: { min: 8, max: 12 } }))).toMatch(/Enter target ranges/);
  });
});
