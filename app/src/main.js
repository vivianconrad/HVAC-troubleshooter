// app/src/main.js
import { loadIndex } from '../../src/lib/search.js';
import { buildTables } from '../../src/lib/pt.js';
import { h, clear } from './dom.js';
import { renderDiagnose } from './tabs/diagnose.js';
import { renderManuals } from './tabs/manuals.js';
import { renderReadings } from './tabs/readings.js';
import { renderFaultCodes } from './tabs/faultcodes.js';

const TABS = [
  { id: 'diagnose', label: 'Diagnose', render: renderDiagnose },
  { id: 'readings', label: 'Readings', render: renderReadings },
  { id: 'faultcodes', label: 'Fault codes', render: renderFaultCodes },
  { id: 'manuals', label: 'Manuals', render: renderManuals },
];

function boot() {
  const root = document.getElementById('app');
  const nav = document.getElementById('tabs');
  const data = window.HVAC_DATA;
  if (!data || !window.HVAC_INDEX) {
    clear(root);
    root.append(h('p', { class: 'error', role: 'alert' }, 'App data not found. Run "npm run build" in the project folder, then reload this page.'));
    return;
  }
  let ctx;
  try {
    ctx = { data, searchIndex: loadIndex(window.HVAC_INDEX), tables: buildTables(data.pt) };
  } catch (err) {
    clear(root);
    root.append(h('p', { class: 'error', role: 'alert' }, `Could not load app data: ${err.message}. Run "npm run build" again and reload this page.`));
    return;
  }

  const current = () => TABS.find((t) => `#${t.id}` === location.hash) || TABS[0];
  const show = () => {
    const tab = current();
    // Rebuilding the nav destroys the focused button; remember so focus can be restored.
    const navHadFocus = nav.contains(document.activeElement);
    let activeButton = null;
    clear(nav);
    for (const t of TABS) {
      const button = h('button', { type: 'button', 'aria-current': t.id === tab.id ? 'page' : null, onclick: () => { location.hash = t.id; } }, t.label);
      if (t.id === tab.id) activeButton = button;
      nav.append(button);
    }
    clear(root);
    try {
      tab.render(root, ctx);
    } catch (err) {
      root.append(h('p', { class: 'error', role: 'alert' }, `This tab failed to load: ${err.message}`));
    }
    if (navHadFocus && activeButton) activeButton.focus();
  };
  window.addEventListener('hashchange', show);
  show();
}

boot();
