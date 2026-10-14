// src/lib/refrigerant.js
import { satTemp } from './pt.js';
import { round1 } from './num.js';

function finite(name, v) {
  if (typeof v !== 'number' || !Number.isFinite(v)) throw new RangeError(`${name} must be a finite number`);
}

export function superheat(table, { suctionPsig, suctionLineF }) {
  finite('suctionPsig', suctionPsig);
  finite('suctionLineF', suctionLineF);
  return round1(suctionLineF - satTemp(table, suctionPsig, 'dew'));
}

export function subcooling(table, { liquidPsig, liquidLineF }) {
  finite('liquidPsig', liquidPsig);
  finite('liquidLineF', liquidLineF);
  return round1(satTemp(table, liquidPsig, 'bubble') - liquidLineF);
}

export function rangeStatus(value, range = {}) {
  if (!Number.isFinite(value)) return 'unknown';
  const hasMin = Number.isFinite(range.min);
  const hasMax = Number.isFinite(range.max);
  if (!hasMin && !hasMax) return 'unknown';
  if (hasMin && value < range.min) return 'low';
  if (hasMax && value > range.max) return 'high';
  return 'ok';
}

export function interpretCharge({ superheat: sh, subcooling: sc }, targets = {}) {
  const shStatus = rangeStatus(sh, targets.superheat);
  const scStatus = rangeStatus(sc, targets.subcooling);
  const findings = [];
  if (!Number.isFinite(sh) || !Number.isFinite(sc)) {
    findings.push('Enter both suction and liquid readings to get an interpretation.');
    return { superheat: shStatus, subcooling: scStatus, findings };
  }
  if (shStatus === 'unknown' || scStatus === 'unknown') {
    findings.push('Enter target ranges for both superheat and subcooling from the unit data plate or manual to get an interpretation.');
    return { superheat: shStatus, subcooling: scStatus, findings };
  }
  if (shStatus === 'ok' && scStatus === 'ok') {
    findings.push('Superheat and subcooling are both within target.');
  } else if (shStatus === 'high' && scStatus === 'low') {
    findings.push('Pattern is consistent with low refrigerant charge. Leak-check and repair per the manufacturer procedure before recharging.');
  } else if (shStatus === 'low' && scStatus === 'high') {
    findings.push('Pattern is consistent with overcharge. Also check for a metering device overfeeding.');
  } else if (shStatus === 'high' && scStatus === 'high') {
    findings.push('Pattern is consistent with a restriction in the liquid line, filter-drier or metering device.');
  } else if (shStatus === 'low' && scStatus === 'low') {
    findings.push('Pattern is consistent with reduced compressor capacity. Also check airflow and load.');
  } else {
    findings.push(`Superheat is ${shStatus} and subcooling is ${scStatus}; no single common cause matches. Check airflow, load and metering device.`);
  }
  return { superheat: shStatus, subcooling: scStatus, findings };
}
