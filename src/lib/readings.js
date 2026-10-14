// src/lib/readings.js
import { parseNumber, requireNumber } from './num.js';
import { WATER_FACTOR, deltaT, heatOutputBtuh, flowGpm, assessDeltaT } from './hydronic.js';
import { resetTarget, assessSupply } from './reset.js';
import { superheat, subcooling, interpretCharge } from './refrigerant.js';

export function computeHydronic(i) {
  const supply = requireNumber(i.supplyF, 'Supply temperature');
  const ret = requireNumber(i.returnF, 'Return temperature');
  const gpmIn = parseNumber(i.gpm, 'Flow (GPM)');
  const btuhIn = parseNumber(i.btuh, 'Heat output (BTU/h)');
  const factor = parseNumber(i.factor, 'Fluid factor') ?? WATER_FACTOR;
  const dt = deltaT(supply, ret);
  const target = { min: parseNumber(i.targetMin, 'Target min'), max: parseNumber(i.targetMax, 'Target max') };
  // Flow wins when both are given; heat output alone yields the flow.
  let gpm = gpmIn;
  let btuh;
  if (gpmIn !== undefined) btuh = heatOutputBtuh(gpmIn, dt, factor);
  else if (btuhIn !== undefined) {
    btuh = btuhIn;
    gpm = flowGpm(btuhIn, dt, factor);
  }
  return { deltaT: dt, gpm, btuh, assessment: assessDeltaT(dt, target) };
}

export function computeReset(i) {
  const targetF = resetTarget({
    outdoorF: requireNumber(i.outdoorF, 'Outdoor temperature'),
    outdoorDesignF: requireNumber(i.outdoorDesignF, 'Design outdoor temperature'),
    supplyDesignF: requireNumber(i.supplyDesignF, 'Design supply temperature'),
    roomF: parseNumber(i.roomF, 'Room temperature') ?? 70,
    supplyMinF: parseNumber(i.supplyMinF, 'Minimum supply'),
    supplyMaxF: parseNumber(i.supplyMaxF, 'Maximum supply'),
  });
  const measured = parseNumber(i.measuredF, 'Measured supply');
  const tolerance = parseNumber(i.toleranceF, 'Tolerance') ?? 5;
  return { targetF, check: measured === undefined ? undefined : assessSupply(measured, targetF, tolerance) };
}

export function computeRefrigerant(tables, i) {
  const table = tables[i.refrigerant];
  if (!table) throw new RangeError(`Unknown refrigerant "${i.refrigerant}"`);

  const suctionPsig = parseNumber(i.suctionPsig, 'Suction pressure');
  const suctionLineF = parseNumber(i.suctionLineF, 'Suction line temperature');
  const liquidPsig = parseNumber(i.liquidPsig, 'Liquid pressure');
  const liquidLineF = parseNumber(i.liquidLineF, 'Liquid line temperature');

  const haveSuction = suctionPsig !== undefined || suctionLineF !== undefined;
  const haveLiquid = liquidPsig !== undefined || liquidLineF !== undefined;
  if (!haveSuction && !haveLiquid) throw new RangeError('Enter suction readings, liquid readings, or both');
  if (haveSuction && (suctionPsig === undefined || suctionLineF === undefined)) {
    throw new RangeError('Enter both suction pressure and suction line temperature');
  }
  if (haveLiquid && (liquidPsig === undefined || liquidLineF === undefined)) {
    throw new RangeError('Enter both liquid pressure and liquid line temperature');
  }

  const sh = haveSuction ? superheat(table, { suctionPsig, suctionLineF }) : undefined;
  const sc = haveLiquid ? subcooling(table, { liquidPsig, liquidLineF }) : undefined;
  const targets = {
    superheat: { min: parseNumber(i.shMin, 'Superheat target min'), max: parseNumber(i.shMax, 'Superheat target max') },
    subcooling: { min: parseNumber(i.scMin, 'Subcooling target min'), max: parseNumber(i.scMax, 'Subcooling target max') },
  };
  return { superheat: sh, subcooling: sc, interpretation: interpretCharge({ superheat: sh, subcooling: sc }, targets) };
}
