import MiniSearch from 'minisearch';

export const SEARCH_OPTIONS = {
  idField: 'id',
  fields: ['text'],
  storeFields: ['manufacturer', 'doc', 'page', 'text'],
  searchOptions: { prefix: true, fuzzy: 0.2, combineWith: 'AND' },
};

export function createIndex(pages) {
  const index = new MiniSearch(SEARCH_OPTIONS);
  index.addAll(pages.map((p) => ({ id: `${p.manufacturer}/${p.doc}#${p.page}`, ...p })));
  return index;
}

export function loadIndex(obj) {
  return MiniSearch.loadJS(obj, SEARCH_OPTIONS);
}

export function makeSnippet(text, query, radius = 120) {
  const terms = String(query).toLowerCase().split(/\s+/).filter(Boolean);
  const lower = text.toLowerCase();
  let at = -1;
  for (const t of terms) {
    const i = lower.indexOf(t);
    if (i !== -1 && (at === -1 || i < at)) at = i;
  }
  if (at === -1) at = 0;
  const start = Math.max(0, at - radius);
  const end = Math.min(text.length, at + radius);
  const body = text.slice(start, end).replace(/\s+/g, ' ').trim();
  return `${start > 0 ? '...' : ''}${body}${end < text.length ? '...' : ''}`;
}

export function searchManuals(index, query, { manufacturer, limit = 50 } = {}) {
  const q = String(query || '').trim();
  if (!q) return [];
  const hits = index.search(q, { filter: (r) => !manufacturer || r.manufacturer === manufacturer });
  return hits.slice(0, limit).map((h) => ({
    manufacturer: h.manufacturer,
    doc: h.doc,
    page: h.page,
    score: h.score,
    snippet: makeSnippet(h.text, q),
  }));
}

export function pdfHref({ manufacturer, doc, page }) {
  if (!Number.isInteger(page) || page < 1) throw new RangeError('page must be an integer >= 1');
  const enc = (path) => path.split('/').map(encodeURIComponent).join('/');
  return `../pdfs/${encodeURIComponent(manufacturer)}/${enc(doc)}#page=${page}`;
}
