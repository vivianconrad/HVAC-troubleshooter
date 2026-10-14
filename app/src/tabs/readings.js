// app/src/tabs/readings.js
import { h, clear } from '../dom.js';
import { computeHydronic, computeReset, computeRefrigerant } from '../../../src/lib/readings.js';

function field(name, label, hint) {
  return h('label', { class: 'field' },
    h('span', {}, label),
    h('input', { type: 'text', inputmode: 'decimal', name, autocomplete: 'off' }),
    hint ? h('small', {}, hint) : null,
  );
}

function card(title, note, rows, compute, show) {
  const out = h('div', { class: 'result', role: 'status', 'aria-live': 'polite' });
  const form = h('form', {
    class: 'card',
    onsubmit: (e) => {
      e.preventDefault();
      const values = Object.fromEntries(new FormData(form));
      clear(out);
      out.className = 'result';
      try {
        show(out, compute(values));
      } catch (err) {
        out.className = 'result error';
        out.append(err.message);
      }
    },
  },
    h('h2', {}, title),
    note ? h('p', { class: 'empty' }, note) : null,
    ...rows.map((r) => h('div', { class: 'row' }, r)),
    h('button', { type: 'submit' }, 'Calculate'),
    out,
  );
  return form;
}

const line = (out, text) => out.append(h('div', {}, text));
const list = (out, items) => out.append(h('ul', { class: 'tight' }, items.map((t) => h('li', {}, t))));

function hydronicCard() {
  return card('Hydronic delta-T and heat output', 'Temperatures in F. Flow is optional. For glycol, enter the fluid factor (500 is for water).', [
    [field('supplyF', 'Supply temperature (F)'), field('returnF', 'Return temperature (F)'), field('gpm', 'Flow (GPM)', 'Optional')],
    [field('btuh', 'Known heat output (BTU/h)', 'Optional. Gives flow when Flow is blank'), field('factor', 'Fluid factor', 'Blank = 500 (water)')],
    [field('targetMin', 'Target delta-T min (F)'), field('targetMax', 'Target delta-T max (F)')],
  ], computeHydronic, (out, r) => {
    line(out, `Delta-T: ${r.deltaT} F`);
    if (r.btuh !== undefined) line(out, `Heat output: ${r.btuh.toLocaleString()} BTU/h`);
    if (r.gpm !== undefined) line(out, `Flow: ${r.gpm} GPM`);
    line(out, `Assessment: ${r.assessment.status}`);
    list(out, r.assessment.hints);
  });
}

function resetCard() {
  return card('Outdoor reset check', 'Linear approximation only. Tekmar and other controls use their own curves: confirm against the curve table in the control manual.', [
    [field('outdoorF', 'Outdoor temperature (F)'), field('roomF', 'Room temperature (F)', 'Blank = 70'), field('measuredF', 'Measured supply (F)', 'Optional')],
    [field('outdoorDesignF', 'Design outdoor temperature (F)'), field('supplyDesignF', 'Design supply temperature (F)'), field('supplyMinF', 'Minimum supply (F)'), field('supplyMaxF', 'Maximum supply (F)')],
    [field('toleranceF', 'Tolerance (F)', 'Blank = 5')],
  ], computeReset, (out, r) => {
    line(out, `Target supply: ${r.targetF} F`);
    if (r.check) line(out, `Measured is ${r.check.status} (${r.check.difference > 0 ? '+' : ''}${r.check.difference} F from target)`);
  });
}

function refrigerantCard(ctx) {
  const names = Object.keys(ctx.tables).sort();
  if (names.length === 0) {
    return h('div', { class: 'card' },
      h('h2', {}, 'Superheat and subcooling'),
      h('p', { class: 'empty' }, 'No refrigerant pressure-temperature tables are installed, so superheat and subcooling cannot be calculated. Generate them with "python build/gen-pt-tables.py" (needs CoolProp; see the README), then rebuild with "npm run build".'),
    );
  }
  const select = h('select', { name: 'refrigerant' }, names.map((n) => h('option', { value: n }, n)));
  return card('Superheat and subcooling', 'Pressures in psig. Target ranges come from the unit data plate or manual; none are assumed. Refrigerant handling must follow the manufacturer procedure.', [
    [h('label', { class: 'field' }, h('span', {}, 'Refrigerant'), select)],
    [field('suctionPsig', 'Suction pressure (psig)'), field('suctionLineF', 'Suction line temperature (F)')],
    [field('liquidPsig', 'Liquid pressure (psig)'), field('liquidLineF', 'Liquid line temperature (F)')],
    [field('shMin', 'Superheat target min (F)'), field('shMax', 'Superheat target max (F)'), field('scMin', 'Subcooling target min (F)'), field('scMax', 'Subcooling target max (F)')],
  ], (v) => ({ result: computeRefrigerant(ctx.tables, v), refrigerant: v.refrigerant }), (out, { result: r, refrigerant }) => {
    if (r.superheat !== undefined) line(out, `Superheat: ${r.superheat} F (${r.interpretation.superheat})`);
    if (r.subcooling !== undefined) line(out, `Subcooling: ${r.subcooling} F (${r.interpretation.subcooling})`);
    list(out, r.interpretation.findings);
    // The table source carries caveats (e.g. R-454B is computed, not a manufacturer chart).
    const source = ctx.tables[refrigerant] && ctx.tables[refrigerant].source;
    if (source) line(out, `PT table source: ${source}`);
  });
}

export function renderReadings(root, ctx) {
  root.append(hydronicCard(), resetCard(), refrigerantCard(ctx));
}
