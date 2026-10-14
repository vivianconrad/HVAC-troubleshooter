// app/src/tabs/manuals.js
import { h, clear } from '../dom.js';
import { searchManuals, pdfHref } from '../../../src/lib/search.js';

export function renderManuals(root, ctx) {
  const manifest = ctx.data.manifest;
  if (manifest.length === 0) {
    root.append(
      h('div', { class: 'card' },
        h('h2', {}, 'Manuals'),
        h('p', { class: 'empty' }, 'No manuals are indexed yet. Put PDFs in pdfs/<manufacturer>/ (for example pdfs/tekmar/), run npm run build, and reload this page.'),
      ),
    );
    return;
  }

  const manufacturers = [...new Set(manifest.map((m) => m.manufacturer))].sort();
  const results = h('div', { role: 'status', 'aria-live': 'polite' });
  const input = h('input', { type: 'search', id: 'manual-q', placeholder: 'Search all manuals, e.g. lockout, pump delay, sensor', autocomplete: 'off' });
  const select = h('select', { id: 'manual-mfr', 'aria-label': 'Manufacturer' },
    h('option', { value: '' }, 'All manufacturers'),
    manufacturers.map((m) => h('option', { value: m }, m)),
  );

  let timer = null;
  const run = () => {
    clear(results);
    const q = input.value.trim();
    if (!q) return;
    const hits = searchManuals(ctx.searchIndex, q, { manufacturer: select.value || undefined });
    if (hits.length === 0) {
      results.append(h('p', { class: 'empty' }, 'No matches. Try fewer or different words.'));
      return;
    }
    results.append(h('p', { class: 'empty' }, `${hits.length} result${hits.length === 1 ? '' : 's'}`));
    for (const hit of hits) {
      results.append(
        h('div', { class: 'hit' },
          h('a', { href: pdfHref(hit), target: '_blank', rel: 'noopener' }, `${hit.manufacturer} / ${hit.doc}, page ${hit.page}`),
          h('p', { class: 'snippet' }, hit.snippet),
        ),
      );
    }
  };
  const schedule = () => {
    clearTimeout(timer);
    timer = setTimeout(run, 200);
  };
  input.addEventListener('input', schedule);
  select.addEventListener('change', run);

  root.append(
    h('div', { class: 'card' },
      h('h2', {}, 'Manuals'),
      h('div', { class: 'row' }, h('label', { class: 'field' }, h('span', {}, 'Search'), input), h('label', { class: 'field' }, h('span', {}, 'Manufacturer'), select)),
      h('p', { class: 'empty' }, `${manifest.length} document${manifest.length === 1 ? '' : 's'} indexed. Links open the PDF at the matching page.`),
    ),
    results,
  );
  input.focus();
}
