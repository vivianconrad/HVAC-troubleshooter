// build/import-pt-csv.js
// Usage: node build/import-pt-csv.js <name> "<source description>"
// Reads data/pt-sources/<name>.csv and writes data/pt/<name>.json
import fs from 'node:fs';
import path from 'node:path';
import { tableFromCsv } from '../src/lib/pt.js';

const [name, source] = process.argv.slice(2);
if (!name || !source) {
  console.error('Usage: node build/import-pt-csv.js <name> "<source description>"');
  process.exit(1);
}
const csv = fs.readFileSync(path.resolve('data/pt-sources', `${name}.csv`), 'utf8');
const table = tableFromCsv(csv, { refrigerant: name, source });
fs.mkdirSync(path.resolve('data/pt'), { recursive: true });
fs.writeFileSync(path.resolve('data/pt', `${name}.json`), JSON.stringify(table, null, 1));
console.log(`wrote ${name}: ${table.points.length} points`);
