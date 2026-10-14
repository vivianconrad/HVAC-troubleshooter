// app/src/tabs/faultcodes.js
import { h, clear } from '../dom.js';
import { searchFaultCodes, listManufacturers, listModels } from '../../../src/lib/faultcodes.js';
import { pdfHref } from '../../../src/lib/search.js';

export function renderFaultCodes(root, ctx) {
  const entries = ctx.data.faultCodes;
  if (entries.length === 0) {
    root.append(
      h('div', { class: 'card' },
        h('h2', {}, 'Fault codes'),
        h('p', { class: 'empty' }, 'No fault codes have been added yet. Add entries to data/fault-codes/<manufacturer>.json (see the README), run npm run build, and reload.'),
      ),
    );
    return;
  }

  const results = h('div', { role: 'status', 'aria-live': 'polite' });
  const input = h('input', { type: 'search', placeholder: 'Code or words, e.g. E-01 or sensor open', autocomplete: 'off' });
  const mfr = h('select', { 'aria-label': 'Manufacturer' }, h('option', { value: '' }, 'All manufacturers'), listManufacturers(entries).map((m) => h('option', { value: m }, m)));
  const model = h('select', { 'aria-label': 'Model' });

  const fillModels = () => {
    clear(model);
    model.append(h('option', { value: '' }, 'All models'), ...listModels(entries, mfr.value || undefined).map((m) => h('option', { value: m }, m)));
  };

  const card = (e) => h('div', { class: 'card' },
    h('h2', {}, `${e.code}`, h('span', { class: 'badge' }, `${e.manufacturer} ${e.model}`)),
    h('p', {}, e.meaning),
    e.causes.length ? h('div', {}, h('strong', {}, 'Common causes'), h('ul', { class: 'tight' }, e.causes.map((c) => h('li', {}, c)))) : null,
    e.checks.length ? h('div', {}, h('strong', {}, 'Checks'), h('ul', { class: 'tight' }, e.checks.map((c) => h('li', {}, c)))) : null,
    h('a', { href: pdfHref(e.source), target: '_blank', rel: 'noopener' }, `Manual: ${e.source.doc}, page ${e.source.page}`),
  );

  const run = () => {
    clear(results);
    const hits = searchFaultCodes(entries, input.value, { manufacturer: mfr.value || undefined, model: model.value || undefined });
    if (hits.length === 0) {
      results.append(h('p', { class: 'empty' }, 'No matching fault codes. Try the Manuals tab to search the full text.'));
      return;
    }
    results.append(h('p', { class: 'empty' }, `${hits.length} fault code${hits.length === 1 ? '' : 's'}`), ...hits.map(card));
  };

  mfr.addEventListener('change', () => { fillModels(); run(); });
  model.addEventListener('change', run);
  input.addEventListener('input', run);
  fillModels();

  root.append(
    h('div', { class: 'card' },
      h('h2', {}, 'Fault codes'),
      h('div', { class: 'row' }, h('label', { class: 'field' }, h('span', {}, 'Code or keywords'), input), h('label', { class: 'field' }, h('span', {}, 'Manufacturer'), mfr), h('label', { class: 'field' }, h('span', {}, 'Model'), model)),
    ),
    results,
  );
  run();
  input.focus();
}
