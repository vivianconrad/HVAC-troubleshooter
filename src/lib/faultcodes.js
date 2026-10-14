// src/lib/faultcodes.js
import { checkSource } from './manifest.js';

const compact = (s) => String(s).toLowerCase().replace(/[^a-z0-9]/g, '');
const same = (a, b) => String(a).toLowerCase() === String(b).toLowerCase();

export function searchFaultCodes(entries, query, { manufacturer, model } = {}) {
  const pool = entries.filter(
    (e) => (!manufacturer || same(e.manufacturer, manufacturer)) && (!model || same(e.model, model)),
  );
  const q = String(query || '').trim();
  const byOrder = (a, b) =>
    a.manufacturer.localeCompare(b.manufacturer) || a.model.localeCompare(b.model) || a.code.localeCompare(b.code, undefined, { numeric: true });
  if (!q) return [...pool].sort(byOrder);

  const qCode = compact(q);
  const words = q.toLowerCase().split(/\s+/).filter(Boolean);
  const scored = [];
  for (const e of pool) {
    const code = compact(e.code);
    let score = 0;
    if (qCode && code === qCode) score = 100;
    else if (qCode && code.startsWith(qCode)) score = 50;
    else if (qCode && code.includes(qCode)) score = 30;
    if (score === 0) {
      const hay = [e.meaning, ...(e.causes || []), ...(e.checks || [])].join(' ').toLowerCase();
      if (words.every((w) => hay.includes(w))) score = 10;
    }
    if (score > 0) scored.push({ e, score });
  }
  scored.sort((a, b) => b.score - a.score || byOrder(a.e, b.e));
  return scored.map((s) => s.e);
}

export function listManufacturers(entries) {
  return [...new Set(entries.map((e) => e.manufacturer))].sort();
}

export function listModels(entries, manufacturer) {
  const pool = manufacturer ? entries.filter((e) => same(e.manufacturer, manufacturer)) : entries;
  return [...new Set(pool.map((e) => e.model))].sort();
}

export function validateFaultCodes(entries, manifest) {
  const errors = [];
  const seen = new Set();
  entries.forEach((e, i) => {
    if (e === null || e === undefined || typeof e !== 'object' || Array.isArray(e)) {
      errors.push(`fault code #${i + 1}: entry must be an object`);
      return;
    }
    const label = `fault code #${i + 1} (${e && e.manufacturer}/${e && e.model}/${e && e.code})`;
    for (const k of ['manufacturer', 'model', 'code', 'meaning']) {
      if (typeof e[k] !== 'string' || !e[k].trim()) errors.push(`${label}: ${k} is required`);
    }
    for (const k of ['causes', 'checks']) {
      if (!Array.isArray(e[k]) || e[k].some((x) => typeof x !== 'string')) errors.push(`${label}: ${k} must be an array of strings`);
    }
    errors.push(...checkSource(label, e.source, manifest));
    const key = `${e.manufacturer}|${e.model}|${e.code}`.toLowerCase();
    if (seen.has(key)) errors.push(`${label}: duplicate of an earlier entry`);
    seen.add(key);
  });
  return errors;
}
