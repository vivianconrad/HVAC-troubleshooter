// tests/readings.test.js
import { describe, it, expect } from 'vitest';
import { loadTable } from '../src/lib/pt.js';
import { computeHydronic, computeReset, computeRefrigerant } from '../src/lib/readings.js';

const table = loadTable({
  refrigerant: 'TEST',
  source: 'synthetic',
  points: Array.from({ length: 11 }, (_, i) => ({ tF: i * 10, bubblePsig: i * 20, dewPsig: i * 20 })),
});
const tables = { TEST: table };

describe('computeHydronic', () => {
  it('computes delta-T and BTU/h from string inputs', () => {
    const r = computeHydronic({ supplyF: '180', returnF: '160', gpm: '10', targetMin: '15', targetMax: '25' });
    expect(r.deltaT).toBe(20);
    expect(r.btuh).toBe(100000);
    expect(r.assessment.status).toBe('ok');
  });
  it('omits BTU/h when flow is blank and notes no target when none given', () => {
    const r = computeHydronic({ supplyF: '180', returnF: '160', gpm: '' });
    expect(r.btuh).toBeUndefined();
    expect(r.assessment.status).toBe('no-target');
  });
  it('uses a custom fluid factor', () => {
    expect(computeHydronic({ supplyF: '180', returnF: '160', gpm: '10', factor: '450' }).btuh).toBe(90000);
  });
  it('computes flow from a known heat output when flow is blank', () => {
    const r = computeHydronic({ supplyF: '180', returnF: '160', gpm: '', btuh: '100000' });
    expect(r.deltaT).toBe(20);
    expect(r.gpm).toBe(10);
    expect(r.btuh).toBe(100000);
  });
  it('uses a custom fluid factor for flow from heat output', () => {
    expect(computeHydronic({ supplyF: '180', returnF: '160', btuh: '90000', factor: '450' }).gpm).toBe(10);
  });
  it('uses flow and ignores heat output when both are given', () => {
    const r = computeHydronic({ supplyF: '180', returnF: '160', gpm: '10', btuh: '1' });
    expect(r.gpm).toBe(10);
    expect(r.btuh).toBe(100000);
  });
  it('reports flow as undefined when only temperatures are given', () => {
    const r = computeHydronic({ supplyF: '180', returnF: '160' });
    expect(r.gpm).toBeUndefined();
    expect(r.btuh).toBeUndefined();
  });
  it('surfaces a clear error for heat output with zero delta-T, and for junk heat output', () => {
    expect(() => computeHydronic({ supplyF: '160', returnF: '160', btuh: '100000' })).toThrow('deltaT must not be zero');
    expect(() => computeHydronic({ supplyF: '180', returnF: '160', btuh: 'x' })).toThrow('Heat output (BTU/h) must be a number');
  });
  it('gives clear errors for blank, junk and comma-decimal input', () => {
    expect(() => computeHydronic({ supplyF: '', returnF: '160' })).toThrow('Supply temperature is required');
    expect(() => computeHydronic({ supplyF: 'abc', returnF: '160' })).toThrow('Supply temperature must be a number (use a dot for decimals)');
    expect(() => computeHydronic({ supplyF: '180', returnF: '160', gpm: '12,5' })).toThrow('Flow (GPM) must be a number (use a dot for decimals)');
  });
});

describe('computeReset', () => {
  const inputs = { outdoorF: '35', outdoorDesignF: '0', supplyDesignF: '180' };
  it('computes the target with defaults', () => {
    expect(computeReset(inputs).targetF).toBe(125);
  });
  it('compares a measured supply to the target', () => {
    const r = computeReset({ ...inputs, measuredF: '150' });
    expect(r.check.status).toBe('high');
  });
  it('requires the design values', () => {
    expect(() => computeReset({ outdoorF: '35', supplyDesignF: '180' })).toThrow('Design outdoor temperature is required');
  });
});

describe('computeRefrigerant', () => {
  const base = { refrigerant: 'TEST', suctionPsig: '100', suctionLineF: '60', liquidPsig: '160', liquidLineF: '70' };
  it('computes superheat and subcooling', () => {
    const r = computeRefrigerant(tables, base);
    expect(r.superheat).toBe(10);
    expect(r.subcooling).toBe(10);
    expect(r.interpretation.superheat).toBe('unknown');
  });
  it('interprets when targets are given', () => {
    const r = computeRefrigerant(tables, { ...base, shMin: '8', shMax: '12', scMin: '8', scMax: '12' });
    expect(r.interpretation.findings.join(' ')).toMatch(/within/i);
  });
  it('works with only the suction side', () => {
    const r = computeRefrigerant(tables, { refrigerant: 'TEST', suctionPsig: '100', suctionLineF: '60' });
    expect(r.superheat).toBe(10);
    expect(r.subcooling).toBeUndefined();
  });
  it('requires at least one complete pair', () => {
    expect(() => computeRefrigerant(tables, { refrigerant: 'TEST' })).toThrow(/suction.*liquid/i);
    expect(() => computeRefrigerant(tables, { refrigerant: 'TEST', suctionPsig: '100' })).toThrow(/line temperature/i);
  });
  it('rejects an unknown refrigerant and out-of-range pressure with a clear message', () => {
    expect(() => computeRefrigerant(tables, { ...base, refrigerant: 'R-NOPE' })).toThrow(/Unknown refrigerant/);
    expect(() => computeRefrigerant(tables, { ...base, suctionPsig: '9999' })).toThrow(/outside the table range/);
  });
});
