// src/lib/manifest.js
export function checkSource(label, source, manifest) {
  if (!source || typeof source !== 'object') return [`${label}: source {manufacturer, doc, page} is required`];
  const { manufacturer, doc, page } = source;
  if (!manufacturer || !doc || !Number.isInteger(page) || page < 1) {
    return [`${label}: source needs manufacturer, doc and an integer page >= 1`];
  }
  const entry = manifest.find((m) => m.manufacturer === manufacturer && m.doc === doc);
  if (!entry) return [`${label}: "${manufacturer}/${doc}" is not in the manual index (check spelling, or run npm run build)`];
  if (page > entry.pages) return [`${label}: page ${page} is beyond the ${entry.pages}-page document "${doc}"`];
  return [];
}
