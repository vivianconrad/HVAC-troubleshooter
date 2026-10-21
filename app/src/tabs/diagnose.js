// app/src/tabs/diagnose.js
import { h, clear } from '../dom.js';
import { createSession } from '../../../src/lib/tree.js';
import { pdfHref } from '../../../src/lib/search.js';

export function renderDiagnose(root, ctx) {
  const trees = ctx.data.trees;
  if (trees.length === 0) {
    root.append(h('div', { class: 'card' }, h('h2', {}, 'Diagnose'), h('p', { class: 'empty' }, 'No decision trees are installed. Add files to data/trees/ and run npm run build.')));
    return;
  }

  const body = h('div');
  const pickerHeading = h('h2', { tabindex: '-1' }, 'Diagnose');
  const picker = h('div', { class: 'card' }, pickerHeading, h('p', { class: 'empty' }, 'Pick the problem, then answer each question.'));
  // Group by brand (alphabetical); trees with no manufacturer are general guidance and go last.
  const GENERAL = 'General guidance (not brand-specific)';
  const groups = new Map();
  for (const tree of trees) {
    const key = tree.manufacturer || GENERAL;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(tree);
  }
  const keys = [...groups.keys()].sort((a, b) => (a === GENERAL) - (b === GENERAL) || a.localeCompare(b));
  for (const key of keys) {
    picker.append(h('h3', {}, key));
    for (const tree of groups.get(key)) {
      // h() skips null badges; every value given to native append() below is a single Node.
      picker.append(
        h('button', { type: 'button', class: 'choice', onclick: () => start(tree) },
          tree.title,
          tree.generic ? h('span', { class: 'badge' }, 'generic') : null,
          tree.equipment ? h('span', { class: 'badge' }, tree.equipment) : null,
        ),
      );
    }
  }

  function start(tree) {
    const session = createSession(tree);
    const draw = () => {
      clear(body);
      const node = session.current();
      const trail = session.path();
      const heading = h('h2', { tabindex: '-1' }, tree.title, tree.generic ? h('span', { class: 'badge' }, 'generic guidance') : null);
      const card = h('div', { class: 'card' }, heading);
      if (trail.length) {
        card.append(h('div', { class: 'path' }, trail.map((t) => h('div', {}, `${t.question} - ${t.answer}`))));
      }
      if (node.type === 'question') {
        card.append(h('p', {}, h('strong', {}, node.text)));
        node.options.forEach((o, i) => card.append(h('button', { type: 'button', class: 'choice', onclick: () => { session.choose(i); draw(); } }, o.label)));
      } else {
        card.append(
          h('p', {}, h('strong', {}, 'Likely cause: '), node.cause),
          h('strong', {}, 'What to do'),
          h('ul', { class: 'tight' }, node.fix.map((f) => h('li', {}, f))),
        );
        // Native append() would render a null as the text "null", so append the source link conditionally.
        if (node.source) {
          card.append(h('p', {}, h('a', { href: pdfHref(node.source), target: '_blank', rel: 'noopener' }, `Manual: ${node.source.doc}, page ${node.source.page}`)));
        }
      }
      card.append(
        h('div', {},
          h('button', { type: 'button', class: 'secondary', onclick: () => { session.back(); draw(); } }, 'Back'),
          h('button', { type: 'button', class: 'secondary', onclick: () => { session.restart(); draw(); } }, 'Start over'),
          h('button', { type: 'button', class: 'secondary', onclick: () => { clear(body); body.append(picker); pickerHeading.focus(); } }, 'Choose another problem'),
        ),
      );
      body.append(card);
      // Moves focus to the new step; the activated button was just removed. Not called for the initial render
      // of the tab: draw() first runs from start(), which only a user click on a picker button triggers.
      heading.focus();
    };
    draw();
  }

  body.append(picker);
  root.append(body);
}
