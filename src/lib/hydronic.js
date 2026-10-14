import { round1 } from './num.js';

export const WATER_FACTOR = 500;

function finite(name, v) {
  if (typeof v !== 'number' || !Number.isFinite(v)) throw new RangeError(`${name} must be a finite number`);
}

export function deltaT(supplyF, returnF) {
  finite('supplyF', supplyF);
  finite('returnF', returnF);
  return round1(Math.abs(supplyF - returnF));
}

export function heatOutputBtuh(gpm, deltaTF, factor = WATER_FACTOR) {
  finite('gpm', gpm);
  finite('deltaTF', deltaTF);
  finite('factor', factor);
  if (gpm < 0) throw new RangeError('gpm must not be negative');
  if (factor <= 0) throw new RangeError('factor must be positive');
  return Math.round(gpm * deltaTF * factor);
}

export function flowGpm(btuh, deltaTF, factor = WATER_FACTOR) {
  finite('btuh', btuh);
  finite('deltaTF', deltaTF);
  finite('factor', factor);
  if (deltaTF === 0) throw new RangeError('deltaT must not be zero');
  if (factor <= 0) throw new RangeError('factor must be positive');
  return round1(btuh / (deltaTF * factor));
}

export function assessDeltaT(measuredF, target = {}) {
  finite('measuredF', measuredF);
  const { min, max } = target;
  const hasMin = Number.isFinite(min);
  const hasMax = Number.isFinite(max);
  if (!hasMin && !hasMax) {
    return { status: 'no-target', hints: ['Enter the target delta-T range from the design documents or the manufacturer.'] };
  }
  if (hasMin && hasMax && min > max) throw new RangeError('Target min must not exceed target max');
  if (hasMin && measuredF < min) {
    return {
      status: 'low',
      hints: [
        'Excess flow, an open bypass, or a three-way valve stuck in bypass.',
        'A very light load (few terminal units calling).',
        'Terminal units not transferring heat: airflow, fouling, control valve not opening.',
      ],
    };
  }
  if (hasMax && measuredF > max) {
    return {
      status: 'high',
      hints: [
        'Low flow: pump speed, closed or partly closed valves, clogged strainer, air lock.',
        'A restricted circuit or a check valve stuck closed.',
      ],
    };
  }
  return { status: 'ok', hints: ['Delta-T is within the target range.'] };
}
