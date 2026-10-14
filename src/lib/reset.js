// src/lib/reset.js
import { round1 } from './num.js';

function finite(name, v) {
  if (typeof v !== 'number' || !Number.isFinite(v)) throw new RangeError(`${name} must be a finite number`);
}

export function resetTarget({ outdoorF, outdoorDesignF, supplyDesignF, roomF = 70, supplyMinF, supplyMaxF }) {
  finite('outdoorF', outdoorF);
  finite('outdoorDesignF', outdoorDesignF);
  finite('supplyDesignF', supplyDesignF);
  finite('roomF', roomF);
  if (outdoorDesignF >= roomF) throw new RangeError('Design outdoor temperature must be below the room temperature');
  if (supplyDesignF <= roomF) throw new RangeError('Design supply temperature must be above the room temperature');
  if (Number.isFinite(supplyMinF) && Number.isFinite(supplyMaxF) && supplyMinF > supplyMaxF) {
    throw new RangeError('Minimum supply must not exceed maximum supply');
  }
  const ratio = Math.max(0, (roomF - outdoorF) / (roomF - outdoorDesignF));
  let target = roomF + (supplyDesignF - roomF) * ratio;
  if (Number.isFinite(supplyMinF)) target = Math.max(target, supplyMinF);
  if (Number.isFinite(supplyMaxF)) target = Math.min(target, supplyMaxF);
  return round1(target);
}

export function assessSupply(measuredF, targetF, toleranceF = 5) {
  finite('measuredF', measuredF);
  finite('targetF', targetF);
  finite('toleranceF', toleranceF);
  if (toleranceF < 0) throw new RangeError('Tolerance must not be negative');
  const difference = round1(measuredF - targetF);
  if (difference > toleranceF) return { status: 'high', difference };
  if (difference < -toleranceF) return { status: 'low', difference };
  return { status: 'ok', difference };
}
