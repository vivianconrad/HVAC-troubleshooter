export function validateTree(tree) {
  if (!tree || typeof tree !== 'object') return ['tree must be an object'];
  const errors = [];
  const id = typeof tree.id === 'string' && tree.id ? tree.id : '(no id)';
  if (id === '(no id)') errors.push('tree.id is required');
  if (typeof tree.title !== 'string' || !tree.title) errors.push(`${id}: title is required`);
  const nodes = tree.nodes && typeof tree.nodes === 'object' ? tree.nodes : null;
  if (!nodes) {
    errors.push(`${id}: nodes is required`);
    return errors;
  }
  if (!nodes[tree.start]) errors.push(`${id}: start node "${tree.start}" does not exist`);

  for (const [nid, node] of Object.entries(nodes)) {
    const at = `${id}.${nid}`;
    if (!node || typeof node !== 'object') {
      errors.push(`${at}: node must be an object`);
    } else if (node.type === 'question') {
      if (!node.text) errors.push(`${at}: question text is required`);
      if (!Array.isArray(node.options) || node.options.length < 2) {
        errors.push(`${at}: question needs at least two options`);
      } else {
        node.options.forEach((o, i) => {
          if (!o || !o.label) errors.push(`${at}: option ${i} needs a label`);
          else if (!nodes[o.next]) errors.push(`${at}: option ${i} points to missing node "${o.next}"`);
        });
      }
    } else if (node.type === 'result') {
      if (!node.cause) errors.push(`${at}: result needs a cause`);
      if (!Array.isArray(node.fix) || node.fix.length === 0) errors.push(`${at}: result needs at least one fix step`);
      if (node.source !== undefined) {
        const s = node.source;
        if (!s || !s.manufacturer || !s.doc || !Number.isInteger(s.page) || s.page < 1) {
          errors.push(`${at}: source needs manufacturer, doc and an integer page >= 1`);
        }
      }
    } else {
      errors.push(`${at}: unknown type "${node.type}"`);
    }
  }
  if (errors.length) return errors;

  const state = {};
  const visit = (nid) => {
    if (state[nid] === 1) {
      errors.push(`${id}: cycle through "${nid}"`);
      return;
    }
    if (state[nid] === 2) return;
    state[nid] = 1;
    const n = nodes[nid];
    if (n.type === 'question') for (const o of n.options) visit(o.next);
    state[nid] = 2;
  };
  visit(tree.start);
  for (const nid of Object.keys(nodes)) {
    if (!state[nid]) errors.push(`${id}: node "${nid}" is unreachable`);
  }
  return errors;
}

export function createSession(tree) {
  const errors = validateTree(tree);
  if (errors.length) throw new Error(`Invalid tree: ${errors.join('; ')}`);
  const history = [];
  let currentId = tree.start;
  return {
    current() {
      return { id: currentId, ...tree.nodes[currentId] };
    },
    choose(index) {
      const node = tree.nodes[currentId];
      if (node.type !== 'question') throw new Error('Current node is a result; there is nothing to choose');
      const option = Number.isInteger(index) ? node.options[index] : undefined;
      if (!option) throw new RangeError(`No option ${index}`);
      history.push({ from: currentId, choice: index });
      currentId = option.next;
    },
    back() {
      const last = history.pop();
      if (!last) return false;
      currentId = last.from;
      return true;
    },
    restart() {
      history.length = 0;
      currentId = tree.start;
    },
    path() {
      return history.map((h) => ({
        question: tree.nodes[h.from].text,
        answer: tree.nodes[h.from].options[h.choice].label,
      }));
    },
    isDone() {
      return tree.nodes[currentId].type === 'result';
    },
  };
}

const treeHead = (t) => [t.title, t.manufacturer, t.equipment].filter(Boolean).join(' ').toLowerCase();
const treeBody = (t) =>
  Object.values(t.nodes || {})
    .flatMap((n) => [n.text, n.cause, ...(n.options || []).map((o) => o.label), ...(n.fix || [])])
    .filter(Boolean)
    .join(' ')
    .toLowerCase();

// Trees containing every word of the query, in the title, brand or equipment first, then in the steps.
export function searchTrees(trees, query) {
  const words = String(query || '').toLowerCase().split(/\s+/).filter(Boolean);
  if (words.length === 0) return [...trees];
  const hits = [];
  trees.forEach((t, i) => {
    const head = treeHead(t);
    const inHead = words.every((w) => head.includes(w));
    if (inHead || words.every((w) => (head + ' ' + treeBody(t)).includes(w))) hits.push({ t, inHead, i });
  });
  hits.sort((a, b) => Number(b.inHead) - Number(a.inHead) || a.i - b.i);
  return hits.map((h) => h.t);
}
