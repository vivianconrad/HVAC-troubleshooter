import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { validateFaultCodes } from '../src/lib/faultcodes.js';
import { validateTree } from '../src/lib/tree.js';
import { checkSource } from '../src/lib/manifest.js';
import { loadTable } from '../src/lib/pt.js';
import { loadData } from './load-data.js';

export function validateAll({ faultCodes, trees, ptRaw, manifest }) {
  const errors = [...validateFaultCodes(faultCodes, manifest)];
  const ids = new Set();
  for (const tree of trees) {
    errors.push(...validateTree(tree));
    if (ids.has(tree.id)) errors.push(`duplicate tree id "${tree.id}"`);
    ids.add(tree.id);
    for (const [nid, node] of Object.entries(tree.nodes || {})) {
      if (node && node.type === 'result' && node.source && node.source.page >= 1) {
        errors.push(...checkSource(`${tree.id}.${nid}`, node.source, manifest));
      }
    }
  }
  for (const raw of ptRaw) {
    try {
      loadTable(raw);
    } catch (err) {
      errors.push(err.message);
    }
  }
  return errors;
}

const isMain = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
if (isMain) {
  const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
  let manifest = [];
  try {
    manifest = JSON.parse(await fs.readFile(path.join(root, 'app', 'dist', 'manifest.json'), 'utf8'));
  } catch {
    console.warn('No app/dist/manifest.json found; run "npm run build:index" first. Source citations will fail validation.');
  }
  const errors = validateAll({ ...(await loadData(path.join(root, 'data'))), manifest });
  if (errors.length) {
    console.error(`${errors.length} problem(s):\n- ${errors.join('\n- ')}`);
    process.exit(1);
  }
  console.log('Data files are valid.');
}
