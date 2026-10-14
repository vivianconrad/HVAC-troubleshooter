// src/lib/pt.js
const KEYS = { bubble: 'bubblePsig', dew: 'dewPsig' };

export function loadTable(raw) {
  const name = raw && raw.refrigerant;
  if (!raw || !Array.isArray(raw.points) || raw.points.length < 2) {
    throw new Error(`PT table ${name || '(unnamed)'}: needs at least two points`);
  }
  const points = raw.points;
  points.forEach((p, i) => {
    for (const k of ['tF', 'bubblePsig', 'dewPsig']) {
      if (typeof p[k] !== 'number' || !Number.isFinite(p[k])) {
        throw new Error(`PT table ${name}: point ${i} has invalid ${k}`);
      }
    }
    if (i > 0) {
      const q = points[i - 1];
      if (p.tF <= q.tF || p.bubblePsig <= q.bubblePsig || p.dewPsig <= q.dewPsig) {
        throw new Error(`PT table ${name}: values must be strictly increasing (point ${i})`);
      }
    }
    if (p.dewPsig > p.bubblePsig + 0.05) {
      throw new Error(`PT table ${name}: point ${i} has dew pressure above bubble pressure`);
    }
  });
  return { refrigerant: raw.refrigerant, source: raw.source, points };
}

function lookup(points, xKey, yKey, x, label) {
  if (typeof x !== 'number' || !Number.isFinite(x)) throw new RangeError(`${label} must be a number`);
  const first = points[0][xKey];
  const last = points[points.length - 1][xKey];
  if (x < first || x > last) {
    throw new RangeError(`${label} ${x} is outside the table range ${first} to ${last}`);
  }
  for (let i = 0; i < points.length - 1; i++) {
    const a = points[i];
    const b = points[i + 1];
    if (x >= a[xKey] && x <= b[xKey]) {
      const f = (x - a[xKey]) / (b[xKey] - a[xKey]);
      return a[yKey] + f * (b[yKey] - a[yKey]);
    }
  }
  throw new RangeError(`${label} ${x} could not be interpolated`);
}

function key(phase) {
  const k = KEYS[phase];
  if (!k) throw new Error(`phase must be "bubble" or "dew", got "${phase}"`);
  return k;
}

export function satPressure(table, tF, phase) {
  return lookup(table.points, 'tF', key(phase), tF, 'Temperature (F)');
}

export function satTemp(table, psig, phase) {
  const k = key(phase);
  return lookup(table.points, k, 'tF', psig, 'Pressure (psig)');
}

export function tableFromCsv(text, meta) {
  const points = [];
  let firstRow = true;
  text.split(/\r?\n/).forEach((line, idx) => {
    const s = line.trim();
    if (!s || s.startsWith('#')) return;
    const cells = s.split(',').map((c) => c.trim());
    const nums = cells.map(Number);
    const isHeader = firstRow && /^[a-z]/i.test(cells[0]);
    firstRow = false;
    if (isHeader) return; // optional header row, e.g. "tF,psig"
    if ((cells.length !== 2 && cells.length !== 3) || cells.some((c) => c === '') || nums.some((n) => !Number.isFinite(n))) {
      throw new Error(`PT CSV line ${idx + 1}: expected "tF,psig" or "tF,bubblePsig,dewPsig" numbers, got "${s}"`);
    }
    if (cells.length === 2) points.push({ tF: nums[0], bubblePsig: nums[1], dewPsig: nums[1] });
    else points.push({ tF: nums[0], bubblePsig: nums[1], dewPsig: nums[2] });
  });
  return loadTable({ ...meta, points });
}

export function buildTables(rawList) {
  const tables = {};
  for (const raw of rawList) {
    const t = loadTable(raw);
    tables[t.refrigerant] = t;
  }
  return tables;
}
