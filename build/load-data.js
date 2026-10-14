import fs from 'node:fs/promises';
import path from 'node:path';

async function readJsonDir(dataDir, sub) {
  const dir = path.join(dataDir, sub);
  let names;
  try {
    names = (await fs.readdir(dir)).filter((n) => n.endsWith('.json')).sort();
  } catch (err) {
    if (err.code === 'ENOENT') return [];
    throw err;
  }
  const out = [];
  for (const name of names) {
    try {
      out.push({ file: `${sub}/${name}`, value: JSON.parse(await fs.readFile(path.join(dir, name), 'utf8')) });
    } catch (err) {
      throw new Error(`${sub}/${name}: invalid JSON (${err.message})`);
    }
  }
  return out;
}

export async function loadData(dataDir) {
  const faultFiles = await readJsonDir(dataDir, 'fault-codes');
  const treeFiles = await readJsonDir(dataDir, 'trees');
  const ptFiles = await readJsonDir(dataDir, 'pt');
  const faultCodes = faultFiles.flatMap((f) => {
    if (!Array.isArray(f.value)) throw new Error(`${f.file}: must be a JSON array of fault code entries`);
    return f.value;
  });
  return { faultCodes, trees: treeFiles.map((f) => f.value), ptRaw: ptFiles.map((f) => f.value) };
}
