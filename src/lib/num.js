export function parseNumber(value, name) {
  if (value === null || value === undefined) return undefined;
  const s = String(value).trim();
  if (s === '') return undefined;
  const n = Number(s);
  if (!Number.isFinite(n)) throw new RangeError(`${name} must be a number (use a dot for decimals)`);
  return n;
}

export function requireNumber(value, name) {
  const n = parseNumber(value, name);
  if (n === undefined) throw new RangeError(`${name} is required`);
  return n;
}

export const round1 = (x) => Math.round(x * 10) / 10;
