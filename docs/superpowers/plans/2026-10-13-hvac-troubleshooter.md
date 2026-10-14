# HVAC Troubleshooter Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build an offline, no-AI browser tool for troubleshooting commercial hydronic HVAC equipment: manual search, fault code lookup, decision-tree diagnosis and field-reading calculators.

**Architecture:** A static app opened from disk in Chrome or Edge. Pure, unit-tested logic lives in `src/lib/`. A Node build script extracts text from `pdfs/<manufacturer>/*.pdf` into a MiniSearch index and bundles the data and UI into classic (non-module) script files, because browsers block module scripts and `fetch` on `file://` pages. UI modules in `app/src/` are thin wrappers over the tested logic.

**Tech Stack:** Node 20+, ES modules, Vitest, MiniSearch, pdfjs-dist 4.x (legacy build, Node text extraction), esbuild (IIFE bundle), vanilla JS/DOM. Python + CoolProp is used once, on a dev machine, to generate refrigerant PT tables.

**Spec:** `docs/superpowers/specs/2026-10-13-hvac-troubleshooter-design.md`

## Global Constraints

- Runtime is fully offline. No network calls, no AI or language-model features, anywhere.
- App must work when `app/index.html` is opened directly from disk (`file://`): classic `<script>` tags only, no `type="module"`, no `fetch`/XHR of local files.
- Manufacturer is the first folder under `pdfs/` (`pdfs/<manufacturer>/<file>.pdf`); subfolders are allowed and become part of `doc` with forward slashes.
- PDFs are git-ignored. Generated output (`app/dist/`, `build/.cache/`) is git-ignored.
- Fault code meanings and manufacturer procedures come only from the supplied manuals. Never write them from memory. Every fault code entry and every manual-sourced tree result must cite `{manufacturer, doc, page}` that exists in the manual index.
- Generic hydronic trees are marked `"generic": true`. Anything involving refrigerant handling or electrical work links to the manufacturer procedure and does not give steps of its own.
- Target ranges (delta-T, superheat, subcooling) are entered by the user from the unit data plate or manual. The tool never invents default target numbers.
- All data from JSON/PDFs is rendered with `textContent` / `createTextNode`, never `innerHTML`.
- Do not run `git init` and do not create a repo: the user will upload the folder to GitHub themselves. Every "Commit" step below runs only if the folder is already a git repository (`git rev-parse --is-inside-work-tree` succeeds); otherwise skip it.
- Windows 11, PowerShell. Use forward slashes in Node code.

## Review Focus

Inputs the spec implies but that are most likely to bite, most likely first. Each is pinned by a test in the owning task.

- Empty or missing `pdfs/` folder: build must succeed and the app must still run, saying no manuals are indexed (Task 8).
- A PDF that is corrupt, encrypted or image-only: skipped with a warning, the rest still indexed (Task 8).
- Blank, non-numeric or comma-decimal form values, and pressures outside the PT table: a clear message, never `NaN` and never silent extrapolation (Tasks 4 and 11).
- PDF filenames containing spaces, `#`, `%` or non-ASCII characters: the "open at page" link must still resolve (Task 6).
- Fault code searches with regex characters, odd case or different dashing (`E-01`, `e 01`, `E01`, `(`): never throw, match sensibly (Task 7).

## File Structure

```
package.json, vitest.config.js, .gitignore, README.md
src/lib/
  num.js            number parsing and rounding helpers
  hydronic.js       delta-T, heat output, flow, delta-T assessment
  reset.js          linear outdoor-reset target and comparison
  pt.js             PT table load/validate/interpolate, CSV import, buildTables
  refrigerant.js    superheat, subcooling, charge interpretation
  readings.js       form-string wrappers around the calculators (used by UI)
  tree.js           decision-tree validation and session engine
  search.js         MiniSearch options, index create/load, manual search, snippet, pdfHref
  faultcodes.js     fault code search and validation
  manifest.js       source-citation check against the manual manifest
build/
  pdf-extract.js    extractPdf, findPdfs
  build-index.js    PDFs -> app/dist/index-data.js, manifest.json, cache
  load-data.js      reads data/ JSON
  validate-data.js  validateAll
  build.js          full build (index, data.js, validation, esbuild bundle)
  find-fault-pages.js  helper that ranks pages likely to contain fault tables
  gen-pt-tables.py  one-time PT table generator (CoolProp)
  import-pt-csv.js  CSV -> PT table JSON
data/
  fault-codes/*.json   arrays of fault code entries
  trees/*.json         decision trees
  pt/*.json            PT tables
  pt-sources/*.csv     transcribed manufacturer PT charts (inputs to import-pt-csv)
app/
  index.html, styles.css
  src/main.js, dom.js, tabs/{manuals,faultcodes,readings,diagnose}.js
  dist/                generated
tests/                 vitest tests and helpers
pdfs/<manufacturer>/   manuals (git-ignored)
```

---

### Task 1: Project scaffold

**Files:**
- Create: `package.json`, `vitest.config.js`, `.gitignore`

**Interfaces:**
- Produces: `npm test` (vitest), `npm run build`, `npm run build:index`, `npm run validate` script names used by later tasks.

- [ ] **Step 1: Create `package.json`**

```json
{
  "name": "hvac-troubleshooter",
  "version": "0.1.0",
  "private": true,
  "type": "module",
  "engines": { "node": ">=20" },
  "scripts": {
    "test": "vitest run --passWithNoTests",
    "build": "node build/build.js",
    "build:index": "node build/build-index.js",
    "validate": "node build/validate-data.js",
    "find-fault-pages": "node build/find-fault-pages.js"
  },
  "dependencies": {
    "minisearch": "^7.1.0"
  },
  "devDependencies": {
    "esbuild": "^0.24.0",
    "pdfjs-dist": "^4.8.69",
    "vitest": "^2.1.0"
  }
}
```

- [ ] **Step 2: Create `vitest.config.js`**

```js
export default {
  test: {
    include: ['tests/**/*.test.js'],
    testTimeout: 30000,
  },
};
```

- [ ] **Step 3: Create `.gitignore`**

```
node_modules/
pdfs/
app/dist/
build/.cache/
```

- [ ] **Step 4: Install and verify**

Run: `npm install` then `npm test`
Expected: install succeeds; vitest reports "No test files found" and exits 0 (because of `--passWithNoTests`).

- [ ] **Step 5: Commit (only if a git repo exists)**

```bash
git add package.json vitest.config.js .gitignore package-lock.json
git commit -m "chore: project scaffold"
```

---

### Task 2: Hydronic calculators

**Files:**
- Create: `src/lib/num.js`, `src/lib/hydronic.js`
- Test: `tests/hydronic.test.js`

**Interfaces:**
- Produces from `num.js`: `parseNumber(value, name) -> number|undefined` (blank/null/undefined -> `undefined`, non-numeric -> throws `RangeError`), `requireNumber(value, name) -> number` (blank -> throws), `round1(x) -> number`.
- Produces from `hydronic.js`: `WATER_FACTOR = 500`, `deltaT(supplyF, returnF) -> number` (absolute, 1 decimal), `heatOutputBtuh(gpm, deltaTF, factor = 500) -> number` (rounded integer), `flowGpm(btuh, deltaTF, factor = 500) -> number` (1 decimal), `assessDeltaT(measuredF, {min, max} = {}) -> {status: 'low'|'high'|'ok'|'no-target', hints: string[]}`.

- [ ] **Step 1: Write the failing test**

```js
// tests/hydronic.test.js
import { describe, it, expect } from 'vitest';
import { deltaT, heatOutputBtuh, flowGpm, assessDeltaT } from '../src/lib/hydronic.js';
import { parseNumber, requireNumber } from '../src/lib/num.js';

describe('num helpers', () => {
  it('parseNumber treats blank as undefined', () => {
    expect(parseNumber('', 'x')).toBeUndefined();
    expect(parseNumber('  ', 'x')).toBeUndefined();
    expect(parseNumber(null, 'x')).toBeUndefined();
    expect(parseNumber(undefined, 'x')).toBeUndefined();
  });
  it('parseNumber parses numbers and rejects junk, including comma decimals', () => {
    expect(parseNumber(' 12.5 ', 'x')).toBe(12.5);
    expect(parseNumber('-4', 'x')).toBe(-4);
    expect(() => parseNumber('abc', 'Flow')).toThrow('Flow must be a number');
    expect(() => parseNumber('12,5', 'Flow')).toThrow(RangeError);
    expect(() => parseNumber('Infinity', 'Flow')).toThrow(RangeError);
  });
  it('requireNumber rejects blank', () => {
    expect(() => requireNumber('', 'Supply')).toThrow('Supply is required');
    expect(requireNumber('7', 'Supply')).toBe(7);
  });
});

describe('deltaT', () => {
  it('returns supply minus return', () => expect(deltaT(180, 160)).toBe(20));
  it('is positive for chilled water too', () => expect(deltaT(44, 54)).toBe(10));
  it('rounds float noise to one decimal', () => expect(deltaT(180.5, 160.2)).toBe(20.3));
  it('rejects non-numbers', () => {
    expect(() => deltaT(NaN, 160)).toThrow(RangeError);
    expect(() => deltaT('180', 160)).toThrow(RangeError);
  });
});

describe('heatOutputBtuh', () => {
  it('uses 500 x gpm x deltaT for water', () => expect(heatOutputBtuh(10, 20)).toBe(100000));
  it('handles fractional inputs', () => expect(heatOutputBtuh(12.5, 18.5)).toBe(115625));
  it('accepts a custom fluid factor', () => expect(heatOutputBtuh(10, 20, 450)).toBe(90000));
  it('rejects negative flow and non-positive factor', () => {
    expect(() => heatOutputBtuh(-1, 20)).toThrow(RangeError);
    expect(() => heatOutputBtuh(10, 20, 0)).toThrow(RangeError);
  });
});

describe('flowGpm', () => {
  it('inverts heatOutputBtuh', () => {
    expect(flowGpm(100000, 20)).toBe(10);
    expect(flowGpm(75000, 15)).toBe(10);
  });
  it('rejects zero delta-T', () => expect(() => flowGpm(100000, 0)).toThrow('deltaT must not be zero'));
});

describe('assessDeltaT', () => {
  const target = { min: 15, max: 25 };
  it('flags low', () => {
    const r = assessDeltaT(10, target);
    expect(r.status).toBe('low');
    expect(r.hints.length).toBeGreaterThan(0);
  });
  it('flags high', () => expect(assessDeltaT(30, target).status).toBe('high'));
  it('passes inside the range, inclusive', () => {
    expect(assessDeltaT(20, target).status).toBe('ok');
    expect(assessDeltaT(15, target).status).toBe('ok');
    expect(assessDeltaT(25, target).status).toBe('ok');
  });
  it('asks for a target when none given', () => {
    expect(assessDeltaT(20).status).toBe('no-target');
    expect(assessDeltaT(20, {}).status).toBe('no-target');
  });
  it('works with only a min or only a max', () => {
    expect(assessDeltaT(10, { min: 15 }).status).toBe('low');
    expect(assessDeltaT(30, { max: 25 }).status).toBe('high');
  });
  it('rejects min greater than max', () => {
    expect(() => assessDeltaT(20, { min: 30, max: 10 })).toThrow(RangeError);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/hydronic.test.js`
Expected: FAIL (cannot find module `../src/lib/hydronic.js`).

- [ ] **Step 3: Write `src/lib/num.js`**

```js
// src/lib/num.js
export function parseNumber(value, name) {
  if (value === null || value === undefined) return undefined;
  const s = String(value).trim();
  if (s === '') return undefined;
  const n = Number(s);
  if (!Number.isFinite(n)) throw new RangeError(`${name} must be a number`);
  return n;
}

export function requireNumber(value, name) {
  const n = parseNumber(value, name);
  if (n === undefined) throw new RangeError(`${name} is required`);
  return n;
}

export const round1 = (x) => Math.round(x * 10) / 10;
```

- [ ] **Step 4: Write `src/lib/hydronic.js`**

```js
// src/lib/hydronic.js
import { round1 } from './num.js';

export const WATER_FACTOR = 500;

function finite(name, v) {
  if (typeof v !== 'number' || !Number.isFinite(v)) throw new RangeError(`${name} must be a finite number`);
}

export function deltaT(supplyF, returnF) {
  finite('supplyF', supplyF);
  finite('returnF', returnF);
  return round1(Math.abs(supplyF - returnF));
}

export function heatOutputBtuh(gpm, deltaTF, factor = WATER_FACTOR) {
  finite('gpm', gpm);
  finite('deltaTF', deltaTF);
  finite('factor', factor);
  if (gpm < 0) throw new RangeError('gpm must not be negative');
  if (factor <= 0) throw new RangeError('factor must be positive');
  return Math.round(gpm * deltaTF * factor);
}

export function flowGpm(btuh, deltaTF, factor = WATER_FACTOR) {
  finite('btuh', btuh);
  finite('deltaTF', deltaTF);
  finite('factor', factor);
  if (deltaTF === 0) throw new RangeError('deltaT must not be zero');
  if (factor <= 0) throw new RangeError('factor must be positive');
  return round1(btuh / (deltaTF * factor));
}

export function assessDeltaT(measuredF, target = {}) {
  finite('measuredF', measuredF);
  const { min, max } = target;
  const hasMin = Number.isFinite(min);
  const hasMax = Number.isFinite(max);
  if (!hasMin && !hasMax) {
    return { status: 'no-target', hints: ['Enter the target delta-T range from the design documents or the manufacturer.'] };
  }
  if (hasMin && hasMax && min > max) throw new RangeError('Target min must not exceed target max');
  if (hasMin && measuredF < min) {
    return {
      status: 'low',
      hints: [
        'Excess flow, an open bypass, or a three-way valve stuck in bypass.',
        'A very light load (few terminal units calling).',
        'Terminal units not transferring heat: airflow, fouling, control valve not opening.',
      ],
    };
  }
  if (hasMax && measuredF > max) {
    return {
      status: 'high',
      hints: [
        'Low flow: pump speed, closed or partly closed valves, clogged strainer, air lock.',
        'A restricted circuit or a check valve stuck closed.',
      ],
    };
  }
  return { status: 'ok', hints: ['Delta-T is within the target range.'] };
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `npx vitest run tests/hydronic.test.js`
Expected: PASS, all tests green.

- [ ] **Step 6: Commit (only if a git repo exists)**

```bash
git add src/lib/num.js src/lib/hydronic.js tests/hydronic.test.js
git commit -m "feat: hydronic delta-T and heat output calculators"
```

---

### Task 3: Outdoor-reset target

**Files:**
- Create: `src/lib/reset.js`
- Test: `tests/reset.test.js`

**Interfaces:**
- Consumes: `round1` from `num.js`.
- Produces: `resetTarget({outdoorF, outdoorDesignF, supplyDesignF, roomF = 70, supplyMinF, supplyMaxF}) -> number` and `assessSupply(measuredF, targetF, toleranceF = 5) -> {status: 'ok'|'high'|'low', difference: number}`.

This is a **linear approximation**. Tekmar and other controls use characterized curves; the UI must say so and point to the control's manual for its exact curve.

- [ ] **Step 1: Write the failing test**

```js
// tests/reset.test.js
import { describe, it, expect } from 'vitest';
import { resetTarget, assessSupply } from '../src/lib/reset.js';

const base = { outdoorDesignF: 0, supplyDesignF: 180, roomF: 70 };

describe('resetTarget', () => {
  it('returns the design supply at the design outdoor temperature', () => {
    expect(resetTarget({ ...base, outdoorF: 0 })).toBe(180);
  });
  it('is linear between room and design', () => {
    expect(resetTarget({ ...base, outdoorF: 35 })).toBe(125);
  });
  it('returns room temperature when outdoor equals room', () => {
    expect(resetTarget({ ...base, outdoorF: 70 })).toBe(70);
  });
  it('never goes below room temperature on warm days', () => {
    expect(resetTarget({ ...base, outdoorF: 90 })).toBe(70);
  });
  it('applies min and max limits', () => {
    expect(resetTarget({ ...base, outdoorF: 90, supplyMinF: 110 })).toBe(110);
    expect(resetTarget({ ...base, outdoorF: -10, supplyMaxF: 150 })).toBe(150);
  });
  it('rejects impossible design values', () => {
    expect(() => resetTarget({ ...base, outdoorF: 10, outdoorDesignF: 70 })).toThrow(RangeError);
    expect(() => resetTarget({ ...base, outdoorF: 10, supplyDesignF: 60 })).toThrow(RangeError);
  });
  it('rejects non-numbers', () => {
    expect(() => resetTarget({ ...base, outdoorF: NaN })).toThrow(RangeError);
  });
});

describe('assessSupply', () => {
  it('is ok within tolerance', () => {
    expect(assessSupply(128, 125)).toEqual({ status: 'ok', difference: 3 });
  });
  it('flags high and low', () => {
    expect(assessSupply(140, 125).status).toBe('high');
    expect(assessSupply(110, 125).status).toBe('low');
  });
  it('honours a custom tolerance and rejects a negative one', () => {
    expect(assessSupply(133, 125, 10).status).toBe('ok');
    expect(() => assessSupply(133, 125, -1)).toThrow(RangeError);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/reset.test.js`
Expected: FAIL (module not found).

- [ ] **Step 3: Write `src/lib/reset.js`**

```js
// src/lib/reset.js
import { round1 } from './num.js';

function finite(name, v) {
  if (typeof v !== 'number' || !Number.isFinite(v)) throw new RangeError(`${name} must be a finite number`);
}

export function resetTarget({ outdoorF, outdoorDesignF, supplyDesignF, roomF = 70, supplyMinF, supplyMaxF }) {
  finite('outdoorF', outdoorF);
  finite('outdoorDesignF', outdoorDesignF);
  finite('supplyDesignF', supplyDesignF);
  finite('roomF', roomF);
  if (outdoorDesignF >= roomF) throw new RangeError('Design outdoor temperature must be below the room temperature');
  if (supplyDesignF <= roomF) throw new RangeError('Design supply temperature must be above the room temperature');
  const ratio = Math.max(0, (roomF - outdoorF) / (roomF - outdoorDesignF));
  let target = roomF + (supplyDesignF - roomF) * ratio;
  if (Number.isFinite(supplyMinF)) target = Math.max(target, supplyMinF);
  if (Number.isFinite(supplyMaxF)) target = Math.min(target, supplyMaxF);
  return round1(target);
}

export function assessSupply(measuredF, targetF, toleranceF = 5) {
  finite('measuredF', measuredF);
  finite('targetF', targetF);
  finite('toleranceF', toleranceF);
  if (toleranceF < 0) throw new RangeError('Tolerance must not be negative');
  const difference = round1(measuredF - targetF);
  if (difference > toleranceF) return { status: 'high', difference };
  if (difference < -toleranceF) return { status: 'low', difference };
  return { status: 'ok', difference };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/reset.test.js`
Expected: PASS.

- [ ] **Step 5: Commit (only if a git repo exists)**

```bash
git add src/lib/reset.js tests/reset.test.js
git commit -m "feat: linear outdoor reset target calculator"
```

---

### Task 4: PT tables, superheat and subcooling

**Files:**
- Create: `src/lib/pt.js`, `src/lib/refrigerant.js`, `build/gen-pt-tables.py`, `build/import-pt-csv.js`, `data/pt/R-410A.json` (generated), `data/pt/R-32.json` (generated), `data/pt-sources/R-454B.csv` (transcribed), `data/pt/R-454B.json` (generated)
- Test: `tests/pt.test.js`, `tests/refrigerant.test.js`, `tests/pt-data.test.js`

**Interfaces:**
- Consumes: `round1` from `num.js`.
- Produces from `pt.js`:
  - `loadTable(raw) -> {refrigerant, source, points}`. `raw = {refrigerant, source, points: [{tF, bubblePsig, dewPsig}]}`. Throws `Error` on invalid data.
  - `satPressure(table, tF, phase) -> psig`, `satTemp(table, psig, phase) -> tF`, where `phase` is `'bubble'` or `'dew'`. Out-of-range throws `RangeError`.
  - `tableFromCsv(text, meta) -> table` (CSV columns `tF,psig` or `tF,bubblePsig,dewPsig`).
  - `buildTables(rawList) -> {[refrigerant]: table}`.
- Produces from `refrigerant.js`: `superheat(table, {suctionPsig, suctionLineF}) -> number`, `subcooling(table, {liquidPsig, liquidLineF}) -> number`, `rangeStatus(value, {min, max}) -> 'low'|'ok'|'high'|'unknown'`, `interpretCharge({superheat, subcooling}, {superheat: {min,max}, subcooling: {min,max}}) -> {superheat: status, subcooling: status, findings: string[]}`.

Physics note for the implementer: at a fixed temperature the bubble-point pressure is greater than or equal to the dew-point pressure (zeotropes have glide). Superheat uses the **dew** point at suction pressure; subcooling uses the **bubble** point at liquid pressure.

- [ ] **Step 1: Write the failing tests for `pt.js`**

```js
// tests/pt.test.js
import { describe, it, expect } from 'vitest';
import { loadTable, satPressure, satTemp, tableFromCsv, buildTables } from '../src/lib/pt.js';

// Synthetic table: psig = 2 x tF, so expected values are easy to verify by hand.
const linear = loadTable({
  refrigerant: 'TEST',
  source: 'synthetic',
  points: Array.from({ length: 11 }, (_, i) => ({ tF: i * 10, bubblePsig: i * 20, dewPsig: i * 20 })),
});

describe('loadTable', () => {
  it('accepts a valid table', () => expect(linear.points).toHaveLength(11));
  it('rejects fewer than two points', () => {
    expect(() => loadTable({ refrigerant: 'X', points: [{ tF: 0, bubblePsig: 1, dewPsig: 1 }] })).toThrow();
  });
  it('rejects non-increasing temperatures or pressures', () => {
    const pts = [{ tF: 0, bubblePsig: 10, dewPsig: 10 }, { tF: 0, bubblePsig: 20, dewPsig: 20 }];
    expect(() => loadTable({ refrigerant: 'X', points: pts })).toThrow(/increasing/);
    const pts2 = [{ tF: 0, bubblePsig: 10, dewPsig: 10 }, { tF: 10, bubblePsig: 10, dewPsig: 20 }];
    expect(() => loadTable({ refrigerant: 'X', points: pts2 })).toThrow(/increasing/);
  });
  it('rejects non-numeric fields', () => {
    const pts = [{ tF: 0, bubblePsig: 10, dewPsig: 10 }, { tF: 10, bubblePsig: 'x', dewPsig: 20 }];
    expect(() => loadTable({ refrigerant: 'X', points: pts })).toThrow(/bubblePsig/);
  });
  it('rejects dew pressure above bubble pressure', () => {
    const pts = [{ tF: 0, bubblePsig: 10, dewPsig: 20 }, { tF: 10, bubblePsig: 30, dewPsig: 40 }];
    expect(() => loadTable({ refrigerant: 'X', points: pts })).toThrow(/dew/);
  });
});

describe('satPressure / satTemp', () => {
  it('interpolates linearly', () => {
    expect(satPressure(linear, 25, 'bubble')).toBe(50);
    expect(satTemp(linear, 50, 'dew')).toBe(25);
  });
  it('is exact at table points and at both ends', () => {
    expect(satPressure(linear, 0, 'dew')).toBe(0);
    expect(satPressure(linear, 100, 'dew')).toBe(200);
    expect(satTemp(linear, 200, 'bubble')).toBe(100);
  });
  it('throws RangeError outside the table instead of extrapolating', () => {
    expect(() => satPressure(linear, -1, 'bubble')).toThrow(RangeError);
    expect(() => satPressure(linear, 101, 'bubble')).toThrow(RangeError);
    expect(() => satTemp(linear, -0.5, 'dew')).toThrow(RangeError);
    expect(() => satTemp(linear, 201, 'dew')).toThrow(RangeError);
  });
  it('rejects non-numbers and unknown phases', () => {
    expect(() => satTemp(linear, NaN, 'dew')).toThrow(RangeError);
    expect(() => satTemp(linear, 50, 'vapor')).toThrow(/phase/);
  });
});

describe('tableFromCsv', () => {
  it('parses two columns as a pure fluid', () => {
    const t = tableFromCsv('tF,psig\n0,10\n10,20\n', { refrigerant: 'R-X', source: 's' });
    expect(t.points[0]).toEqual({ tF: 0, bubblePsig: 10, dewPsig: 10 });
  });
  it('parses three columns, skipping blanks and comments', () => {
    const t = tableFromCsv('# chart\ntF,bubblePsig,dewPsig\n\n0,12,10\n10,22,20\n', { refrigerant: 'R-Y', source: 's' });
    expect(t.points[1]).toEqual({ tF: 10, bubblePsig: 22, dewPsig: 20 });
  });
  it('reports the bad line number', () => {
    expect(() => tableFromCsv('tF,psig\n0,10\n10,abc\n', { refrigerant: 'R-X', source: 's' })).toThrow(/line 3/);
  });
});

describe('buildTables', () => {
  it('keys tables by refrigerant name', () => {
    const raw = { refrigerant: 'R-T', source: 's', points: linear.points };
    expect(Object.keys(buildTables([raw]))).toEqual(['R-T']);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/pt.test.js`
Expected: FAIL (module not found).

- [ ] **Step 3: Write `src/lib/pt.js`**

```js
// src/lib/pt.js
const KEYS = { bubble: 'bubblePsig', dew: 'dewPsig' };

export function loadTable(raw) {
  const name = raw && raw.refrigerant;
  if (!raw || !Array.isArray(raw.points) || raw.points.length < 2) {
    throw new Error(`PT table ${name || '(unnamed)'}: needs at least two points`);
  }
  const points = raw.points;
  points.forEach((p, i) => {
    for (const k of ['tF', 'bubblePsig', 'dewPsig']) {
      if (typeof p[k] !== 'number' || !Number.isFinite(p[k])) {
        throw new Error(`PT table ${name}: point ${i} has invalid ${k}`);
      }
    }
    if (p.dewPsig > p.bubblePsig + 0.05) {
      throw new Error(`PT table ${name}: point ${i} has dew pressure above bubble pressure`);
    }
    if (i > 0) {
      const q = points[i - 1];
      if (p.tF <= q.tF || p.bubblePsig <= q.bubblePsig || p.dewPsig <= q.dewPsig) {
        throw new Error(`PT table ${name}: values must be strictly increasing (point ${i})`);
      }
    }
  });
  return { refrigerant: raw.refrigerant, source: raw.source, points };
}

function lookup(points, xKey, yKey, x, label) {
  if (typeof x !== 'number' || !Number.isFinite(x)) throw new RangeError(`${label} must be a number`);
  const first = points[0][xKey];
  const last = points[points.length - 1][xKey];
  if (x < first || x > last) {
    throw new RangeError(`${label} ${x} is outside the table range ${first} to ${last}`);
  }
  for (let i = 0; i < points.length - 1; i++) {
    const a = points[i];
    const b = points[i + 1];
    if (x >= a[xKey] && x <= b[xKey]) {
      const f = (x - a[xKey]) / (b[xKey] - a[xKey]);
      return a[yKey] + f * (b[yKey] - a[yKey]);
    }
  }
  throw new RangeError(`${label} ${x} could not be interpolated`);
}

function key(phase) {
  const k = KEYS[phase];
  if (!k) throw new Error(`phase must be "bubble" or "dew", got "${phase}"`);
  return k;
}

export function satPressure(table, tF, phase) {
  return lookup(table.points, 'tF', key(phase), tF, 'Temperature (F)');
}

export function satTemp(table, psig, phase) {
  const k = key(phase);
  return lookup(table.points, k, 'tF', psig, 'Pressure (psig)');
}

export function tableFromCsv(text, meta) {
  const points = [];
  let firstRow = true;
  text.split(/\r?\n/).forEach((line, idx) => {
    const s = line.trim();
    if (!s || s.startsWith('#')) return;
    const cells = s.split(',').map((c) => c.trim());
    const nums = cells.map(Number);
    const isHeader = firstRow && /^[a-z]/i.test(cells[0]);
    firstRow = false;
    if (isHeader) return; // optional header row, e.g. "tF,psig"
    if ((cells.length !== 2 && cells.length !== 3) || nums.some((n) => !Number.isFinite(n))) {
      throw new Error(`PT CSV line ${idx + 1}: expected "tF,psig" or "tF,bubblePsig,dewPsig" numbers, got "${s}"`);
    }
    if (cells.length === 2) points.push({ tF: nums[0], bubblePsig: nums[1], dewPsig: nums[1] });
    else points.push({ tF: nums[0], bubblePsig: nums[1], dewPsig: nums[2] });
  });
  return loadTable({ ...meta, points });
}

export function buildTables(rawList) {
  const tables = {};
  for (const raw of rawList) {
    const t = loadTable(raw);
    tables[t.refrigerant] = t;
  }
  return tables;
}
```

Note: the header row is the first non-blank, non-comment row, and is skipped only if its first cell starts with a letter. In the "bad line" test the failing row is line 3 (`10,abc`), whose first cell is numeric, so it throws with `line 3` as expected.

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/pt.test.js`
Expected: PASS.

- [ ] **Step 5: Write the failing tests for `refrigerant.js`**

```js
// tests/refrigerant.test.js
import { describe, it, expect } from 'vitest';
import { loadTable } from '../src/lib/pt.js';
import { superheat, subcooling, rangeStatus, interpretCharge } from '../src/lib/refrigerant.js';

// Zeotropic synthetic table: bubble = 2 x tF + 2, dew = 2 x tF (bubble pressure is higher at the same temperature).
const glide = loadTable({
  refrigerant: 'GLIDE',
  source: 'synthetic',
  points: Array.from({ length: 11 }, (_, i) => ({ tF: i * 10, bubblePsig: i * 20 + 2, dewPsig: i * 20 })),
});

describe('superheat', () => {
  it('uses the dew point at suction pressure', () => {
    // 100 psig dew -> 50 F saturated; line at 60 F -> 10 F superheat
    expect(superheat(glide, { suctionPsig: 100, suctionLineF: 60 })).toBe(10);
  });
  it('can be negative (flooding)', () => {
    expect(superheat(glide, { suctionPsig: 100, suctionLineF: 45 })).toBe(-5);
  });
  it('throws for pressure outside the table', () => {
    expect(() => superheat(glide, { suctionPsig: 500, suctionLineF: 60 })).toThrow(RangeError);
  });
});

describe('subcooling', () => {
  it('uses the bubble point at liquid pressure', () => {
    // 162 psig bubble -> 80 F saturated; line at 70 F -> 10 F subcooling
    expect(subcooling(glide, { liquidPsig: 162, liquidLineF: 70 })).toBe(10);
  });
});

describe('rangeStatus', () => {
  it('classifies against min and max', () => {
    expect(rangeStatus(5, { min: 8, max: 12 })).toBe('low');
    expect(rangeStatus(10, { min: 8, max: 12 })).toBe('ok');
    expect(rangeStatus(15, { min: 8, max: 12 })).toBe('high');
  });
  it('is unknown without a usable range', () => {
    expect(rangeStatus(10)).toBe('unknown');
    expect(rangeStatus(10, {})).toBe('unknown');
    expect(rangeStatus(undefined, { min: 1, max: 2 })).toBe('unknown');
  });
});

describe('interpretCharge', () => {
  const targets = { superheat: { min: 8, max: 12 }, subcooling: { min: 8, max: 12 } };
  const text = (r) => r.findings.join(' ');
  it('high superheat with low subcooling points at low charge', () => {
    const r = interpretCharge({ superheat: 20, subcooling: 3 }, targets);
    expect(r.superheat).toBe('high');
    expect(r.subcooling).toBe('low');
    expect(text(r)).toMatch(/low refrigerant charge/i);
  });
  it('low superheat with high subcooling points at overcharge', () => {
    expect(text(interpretCharge({ superheat: 3, subcooling: 20 }, targets))).toMatch(/overcharge/i);
  });
  it('high superheat with high subcooling points at a restriction', () => {
    expect(text(interpretCharge({ superheat: 20, subcooling: 20 }, targets))).toMatch(/restriction/i);
  });
  it('low superheat with low subcooling points at compressor or airflow', () => {
    expect(text(interpretCharge({ superheat: 3, subcooling: 3 }, targets))).toMatch(/compressor/i);
  });
  it('reports within-target when both are ok', () => {
    expect(text(interpretCharge({ superheat: 10, subcooling: 10 }, targets))).toMatch(/within/i);
  });
  it('asks for targets instead of guessing', () => {
    const r = interpretCharge({ superheat: 10, subcooling: 10 }, {});
    expect(r.superheat).toBe('unknown');
    expect(text(r)).toMatch(/target/i);
  });
  it('handles only one measurement', () => {
    const r = interpretCharge({ superheat: 20 }, targets);
    expect(r.subcooling).toBe('unknown');
    expect(r.findings.length).toBeGreaterThan(0);
  });
});
```

- [ ] **Step 6: Run to verify failure, then write `src/lib/refrigerant.js`**

Run: `npx vitest run tests/refrigerant.test.js` — Expected: FAIL (module not found).

```js
// src/lib/refrigerant.js
import { satTemp } from './pt.js';
import { round1 } from './num.js';

function finite(name, v) {
  if (typeof v !== 'number' || !Number.isFinite(v)) throw new RangeError(`${name} must be a finite number`);
}

export function superheat(table, { suctionPsig, suctionLineF }) {
  finite('suctionPsig', suctionPsig);
  finite('suctionLineF', suctionLineF);
  return round1(suctionLineF - satTemp(table, suctionPsig, 'dew'));
}

export function subcooling(table, { liquidPsig, liquidLineF }) {
  finite('liquidPsig', liquidPsig);
  finite('liquidLineF', liquidLineF);
  return round1(satTemp(table, liquidPsig, 'bubble') - liquidLineF);
}

export function rangeStatus(value, range = {}) {
  if (!Number.isFinite(value)) return 'unknown';
  const hasMin = Number.isFinite(range.min);
  const hasMax = Number.isFinite(range.max);
  if (!hasMin && !hasMax) return 'unknown';
  if (hasMin && value < range.min) return 'low';
  if (hasMax && value > range.max) return 'high';
  return 'ok';
}

export function interpretCharge({ superheat: sh, subcooling: sc }, targets = {}) {
  const shStatus = rangeStatus(sh, targets.superheat);
  const scStatus = rangeStatus(sc, targets.subcooling);
  const findings = [];
  if (shStatus === 'unknown' || scStatus === 'unknown') {
    findings.push('Enter target ranges for both superheat and subcooling from the unit data plate or manual to get an interpretation.');
    return { superheat: shStatus, subcooling: scStatus, findings };
  }
  if (shStatus === 'ok' && scStatus === 'ok') {
    findings.push('Superheat and subcooling are both within target.');
  } else if (shStatus === 'high' && scStatus === 'low') {
    findings.push('Pattern is consistent with low refrigerant charge. Leak-check and repair per the manufacturer procedure before recharging.');
  } else if (shStatus === 'low' && scStatus === 'high') {
    findings.push('Pattern is consistent with overcharge. Also check for a metering device overfeeding.');
  } else if (shStatus === 'high' && scStatus === 'high') {
    findings.push('Pattern is consistent with a restriction in the liquid line, filter-drier or metering device.');
  } else if (shStatus === 'low' && scStatus === 'low') {
    findings.push('Pattern is consistent with reduced compressor capacity. Also check airflow and load.');
  } else {
    findings.push(`Superheat is ${shStatus} and subcooling is ${scStatus}; no single common cause matches. Check airflow, load and metering device.`);
  }
  return { superheat: shStatus, subcooling: scStatus, findings };
}
```

Note: `interpretCharge` with only one measurement (e.g. `{ superheat: 20 }`) makes the missing one `unknown`, so it returns the "enter targets/measurements" finding and `findings.length > 0` holds.

- [ ] **Step 7: Run to verify it passes**

Run: `npx vitest run tests/refrigerant.test.js`
Expected: PASS.

- [ ] **Step 8: Write `build/gen-pt-tables.py` and generate R-410A and R-32**

```python
# build/gen-pt-tables.py
# One-time generator. Needs: pip install CoolProp
# Usage (from the project root): python build/gen-pt-tables.py
import json
import os

from CoolProp.CoolProp import PropsSI

FLUIDS = {"R-410A": "R410A", "R-32": "R32"}
PA_PER_PSI = 6894.757293168
ATM_PSI = 14.696


def psig(pa):
    return round(pa / PA_PER_PSI - ATM_PSI, 2)


out_dir = os.path.join(os.path.dirname(__file__), "..", "data", "pt")
os.makedirs(out_dir, exist_ok=True)

for name, cp_name in FLUIDS.items():
    points = []
    for t_f in range(-40, 151):
        t_k = (t_f - 32) / 1.8 + 273.15
        bubble = psig(PropsSI("P", "T", t_k, "Q", 0, cp_name))
        dew = psig(PropsSI("P", "T", t_k, "Q", 1, cp_name))
        points.append({"tF": t_f, "bubblePsig": bubble, "dewPsig": min(dew, bubble)})
    doc = {
        "refrigerant": name,
        "source": "Generated with CoolProp (Helmholtz equations of state). psig = absolute minus 14.696 psi (sea level). 1 F steps.",
        "points": points,
    }
    with open(os.path.join(out_dir, name + ".json"), "w", encoding="utf-8") as f:
        json.dump(doc, f, indent=1)
    print("wrote", name, len(points), "points")
```

Run: `pip install CoolProp` then `python build/gen-pt-tables.py`
Expected: `wrote R-410A 191 points` and `wrote R-32 191 points`. If Python or CoolProp is unavailable, transcribe each refrigerant's published manufacturer chart into `data/pt-sources/<name>.csv` and use Step 10 instead.

- [ ] **Step 9: Write the real-data test**

```js
// tests/pt-data.test.js
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { loadTable, satPressure, satTemp } from '../src/lib/pt.js';

const dir = path.resolve('data/pt');
const files = fs.existsSync(dir) ? fs.readdirSync(dir).filter((f) => f.endsWith('.json')) : [];

describe('shipped PT tables', () => {
  it('has the refrigerants named in the spec', () => {
    for (const name of ['R-410A', 'R-32', 'R-454B']) expect(files).toContain(`${name}.json`);
  });

  for (const file of files) {
    describe(file, () => {
      const table = loadTable(JSON.parse(fs.readFileSync(path.join(dir, file), 'utf8')));
      it('is valid and covers 0 F to 120 F', () => {
        expect(table.points[0].tF).toBeLessThanOrEqual(0);
        expect(table.points[table.points.length - 1].tF).toBeGreaterThanOrEqual(120);
      });
      it('records its source', () => expect(String(table.source).length).toBeGreaterThan(10));
      it('round-trips temperature through pressure', () => {
        const p = satPressure(table, 60, 'bubble');
        expect(satTemp(table, p, 'bubble')).toBeCloseTo(60, 1);
      });
    });
  }

  it('R-410A at 40 F is about 119 psig (published charts: ~118-119)', () => {
    const t = loadTable(JSON.parse(fs.readFileSync(path.join(dir, 'R-410A.json'), 'utf8')));
    expect(satPressure(t, 40, 'dew')).toBeGreaterThan(116);
    expect(satPressure(t, 40, 'dew')).toBeLessThan(121);
  });
});
```

- [ ] **Step 10: Add R-454B from the manufacturer chart and verify**

R-454B is not in CoolProp. Transcribe the manufacturer's published PT chart (Chemours Opteon XL41) into `data/pt-sources/R-454B.csv` with header `tF,bubblePsig,dewPsig`, one row per degree or per 2 degrees, covering at least 0 F to 120 F. Then create `build/import-pt-csv.js`:

```js
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
```

Run: `node build/import-pt-csv.js R-454B "Chemours Opteon XL41 (R-454B) published PT chart, transcribed"`
Expected: `wrote R-454B: N points`.

- [ ] **Step 11: Run all tests and spot-check against a chart you trust**

Run: `npx vitest run`
Expected: all PASS.

Then print three points for each table and compare them by eye to the manufacturer chart (Chemours, Honeywell or Daikin) for the same refrigerant. If any value differs by more than about 2 psi, stop and investigate before continuing:

Run: `node -e "import('./src/lib/pt.js').then(({loadTable,satPressure})=>{for(const n of ['R-410A','R-32','R-454B']){const t=loadTable(JSON.parse(require('fs').readFileSync('data/pt/'+n+'.json','utf8')));console.log(n,[0,40,100].map(f=>f+'F bubble '+satPressure(t,f,'bubble').toFixed(1)+' dew '+satPressure(t,f,'dew').toFixed(1)).join(' | '))}})"`

- [ ] **Step 12: Commit (only if a git repo exists)**

```bash
git add src/lib/pt.js src/lib/refrigerant.js build/gen-pt-tables.py build/import-pt-csv.js data/pt data/pt-sources tests/pt.test.js tests/refrigerant.test.js tests/pt-data.test.js
git commit -m "feat: PT tables, superheat and subcooling"
```

---

### Task 5: Decision-tree engine

**Files:**
- Create: `src/lib/tree.js`
- Test: `tests/tree.test.js`

**Interfaces:**
- Produces: `validateTree(tree) -> string[]` (empty means valid), `createSession(tree)` returning `{current(), choose(index), back(), restart(), path(), isDone()}`.
- Tree shape: `{id, title, equipment?, generic?, start, nodes: {[id]: Node}}`. `Node` is either `{type:'question', text, options:[{label, next}]}` (at least two options) or `{type:'result', cause, fix:[string], source?:{manufacturer, doc, page}}`.
- `current()` returns `{id, ...node}`. `path()` returns `[{question, answer}]`.

- [ ] **Step 1: Write the failing test**

```js
// tests/tree.test.js
import { describe, it, expect } from 'vitest';
import { validateTree, createSession } from '../src/lib/tree.js';

const good = () => ({
  id: 't1',
  title: 'Test tree',
  start: 'q1',
  nodes: {
    q1: { type: 'question', text: 'Is it on?', options: [{ label: 'Yes', next: 'q2' }, { label: 'No', next: 'r1' }] },
    q2: { type: 'question', text: 'Is it hot?', options: [{ label: 'Yes', next: 'r2' }, { label: 'No', next: 'r1' }] },
    r1: { type: 'result', cause: 'Off', fix: ['Turn on'] },
    r2: { type: 'result', cause: 'Hot', fix: ['Cool it'], source: { manufacturer: 'tekmar', doc: 'a.pdf', page: 3 } },
  },
});

describe('validateTree', () => {
  it('accepts a good tree', () => expect(validateTree(good())).toEqual([]));
  it('requires id, title and nodes', () => {
    expect(validateTree({}).length).toBeGreaterThan(0);
    expect(validateTree(null)).toEqual(['tree must be an object']);
  });
  it('flags a missing start node', () => {
    const t = good();
    t.start = 'nope';
    expect(validateTree(t).join(' ')).toMatch(/start node "nope"/);
  });
  it('flags options that point to missing nodes', () => {
    const t = good();
    t.nodes.q1.options[1].next = 'ghost';
    expect(validateTree(t).join(' ')).toMatch(/missing node "ghost"/);
  });
  it('flags question nodes with fewer than two options', () => {
    const t = good();
    t.nodes.q2.options = [{ label: 'Only', next: 'r1' }];
    expect(validateTree(t).join(' ')).toMatch(/at least two options/);
  });
  it('flags results with no cause or no fix', () => {
    const t = good();
    t.nodes.r1.fix = [];
    delete t.nodes.r2.cause;
    const msg = validateTree(t).join(' ');
    expect(msg).toMatch(/r1.*fix/);
    expect(msg).toMatch(/r2.*cause/);
  });
  it('flags unreachable nodes', () => {
    const t = good();
    t.nodes.orphan = { type: 'result', cause: 'x', fix: ['y'] };
    expect(validateTree(t).join(' ')).toMatch(/"orphan" is unreachable/);
  });
  it('flags cycles', () => {
    const t = good();
    t.nodes.q2.options[1].next = 'q1';
    expect(validateTree(t).join(' ')).toMatch(/cycle/);
  });
  it('flags a malformed source', () => {
    const t = good();
    t.nodes.r2.source = { doc: 'a.pdf', page: 0 };
    expect(validateTree(t).join(' ')).toMatch(/source/);
  });
  it('flags unknown node types', () => {
    const t = good();
    t.nodes.r1.type = 'banana';
    expect(validateTree(t).join(' ')).toMatch(/unknown type/);
  });
});

describe('createSession', () => {
  it('walks to a result and records the path', () => {
    const s = createSession(good());
    expect(s.current().id).toBe('q1');
    s.choose(0);
    expect(s.current().id).toBe('q2');
    s.choose(0);
    expect(s.isDone()).toBe(true);
    expect(s.current().cause).toBe('Hot');
    expect(s.path()).toEqual([
      { question: 'Is it on?', answer: 'Yes' },
      { question: 'Is it hot?', answer: 'Yes' },
    ]);
  });
  it('can go back and restart', () => {
    const s = createSession(good());
    s.choose(0);
    expect(s.back()).toBe(true);
    expect(s.current().id).toBe('q1');
    expect(s.back()).toBe(false);
    s.choose(1);
    s.restart();
    expect(s.current().id).toBe('q1');
    expect(s.path()).toEqual([]);
  });
  it('rejects bad choices', () => {
    const s = createSession(good());
    expect(() => s.choose(5)).toThrow(RangeError);
    expect(() => s.choose(-1)).toThrow(RangeError);
    s.choose(1);
    expect(() => s.choose(0)).toThrow(/result/);
  });
  it('refuses an invalid tree', () => {
    const t = good();
    t.start = 'nope';
    expect(() => createSession(t)).toThrow(/Invalid tree/);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/tree.test.js`
Expected: FAIL (module not found).

- [ ] **Step 3: Write `src/lib/tree.js`**

```js
// src/lib/tree.js
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
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/tree.test.js`
Expected: PASS.

- [ ] **Step 5: Commit (only if a git repo exists)**

```bash
git add src/lib/tree.js tests/tree.test.js
git commit -m "feat: decision tree validation and session engine"
```

---

### Task 6: Manual search, snippets and PDF links

**Files:**
- Create: `src/lib/search.js`
- Test: `tests/search.test.js`

**Interfaces:**
- Produces:
  - `SEARCH_OPTIONS` (MiniSearch options shared by build and app).
  - `createIndex(pages) -> MiniSearch` where `pages = [{manufacturer, doc, page, text}]`; `index.toJSON()` is what the build writes.
  - `loadIndex(obj) -> MiniSearch` (from the `toJSON()` object).
  - `searchManuals(index, query, {manufacturer, limit = 50}) -> [{manufacturer, doc, page, score, snippet}]`.
  - `makeSnippet(text, query, radius = 120) -> string`.
  - `pdfHref({manufacturer, doc, page}) -> string`, relative to `app/index.html`, e.g. `../pdfs/tekmar/a.pdf#page=3`.

- [ ] **Step 1: Write the failing test**

```js
// tests/search.test.js
import { describe, it, expect } from 'vitest';
import { createIndex, loadIndex, searchManuals, makeSnippet, pdfHref } from '../src/lib/search.js';

const pages = [
  { manufacturer: 'tekmar', doc: 'tN2 manual.pdf', page: 3, text: 'The boiler enters lockout when the sensor is open.' },
  { manufacturer: 'tekmar', doc: 'tN2 manual.pdf', page: 4, text: 'Pump delay is set in the settings menu.' },
  { manufacturer: 'aerco', doc: 'bmk.pdf', page: 1, text: 'Lockout reset procedure for the boiler.' },
];

describe('searchManuals', () => {
  const index = createIndex(pages);

  it('finds pages by word across manufacturers', () => {
    expect(searchManuals(index, 'lockout')).toHaveLength(2);
  });
  it('filters by manufacturer', () => {
    const r = searchManuals(index, 'lockout', { manufacturer: 'tekmar' });
    expect(r).toHaveLength(1);
    expect(r[0]).toMatchObject({ manufacturer: 'tekmar', doc: 'tN2 manual.pdf', page: 3 });
  });
  it('requires all words (AND)', () => {
    const r = searchManuals(index, 'pump delay');
    expect(r).toHaveLength(1);
    expect(r[0].page).toBe(4);
    expect(searchManuals(index, 'lockout reset').map((x) => x.manufacturer)).toEqual(['aerco']);
  });
  it('tolerates a typo and a prefix', () => {
    expect(searchManuals(index, 'lokout').length).toBeGreaterThan(0);
    expect(searchManuals(index, 'proced').length).toBe(1);
  });
  it('returns nothing for blank or symbol-only queries without throwing', () => {
    expect(searchManuals(index, '')).toEqual([]);
    expect(searchManuals(index, '   ')).toEqual([]);
    expect(searchManuals(index, '(')).toEqual([]);
    expect(searchManuals(index, '.*[')).toEqual([]);
  });
  it('includes a snippet around the match', () => {
    expect(searchManuals(index, 'lockout')[0].snippet.toLowerCase()).toContain('lockout');
  });
  it('honours the limit', () => {
    expect(searchManuals(index, 'lockout', { limit: 1 })).toHaveLength(1);
  });
  it('survives a JSON round trip, as shipped to the browser', () => {
    const restored = loadIndex(JSON.parse(JSON.stringify(index.toJSON())));
    expect(searchManuals(restored, 'pump delay')[0].page).toBe(4);
  });
  it('works with an empty index', () => {
    expect(searchManuals(createIndex([]), 'anything')).toEqual([]);
  });
});

describe('makeSnippet', () => {
  it('centres on the first match and collapses whitespace', () => {
    const text = `${'a '.repeat(200)}\n\n  TARGET word  ${'b '.repeat(200)}`;
    const s = makeSnippet(text, 'target', 20);
    expect(s).toContain('TARGET word');
    expect(s).not.toMatch(/\s{2}/);
    expect(s.startsWith('...')).toBe(true);
    expect(s.endsWith('...')).toBe(true);
  });
  it('falls back to the start of the page when no term is found', () => {
    expect(makeSnippet('hello world', 'zzz')).toBe('hello world');
  });
});

describe('pdfHref', () => {
  it('encodes spaces', () => {
    expect(pdfHref({ manufacturer: 'tekmar', doc: 'tN2 manual.pdf', page: 3 })).toBe('../pdfs/tekmar/tN2%20manual.pdf#page=3');
  });
  it('encodes # and % in names and keeps subfolders', () => {
    expect(pdfHref({ manufacturer: 'tekmar', doc: 'sub/My #2 100%.pdf', page: 12 })).toBe('../pdfs/tekmar/sub/My%20%232%20100%25.pdf#page=12');
  });
  it('encodes non-ASCII and encodes the manufacturer too', () => {
    expect(pdfHref({ manufacturer: 'Aerco Intl', doc: 'café.pdf', page: 1 })).toBe('../pdfs/Aerco%20Intl/caf%C3%A9.pdf#page=1');
  });
  it('rejects invalid page numbers', () => {
    expect(() => pdfHref({ manufacturer: 'a', doc: 'b.pdf', page: 0 })).toThrow(RangeError);
    expect(() => pdfHref({ manufacturer: 'a', doc: 'b.pdf', page: 1.5 })).toThrow(RangeError);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/search.test.js`
Expected: FAIL (module not found).

- [ ] **Step 3: Write `src/lib/search.js`**

```js
// src/lib/search.js
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
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/search.test.js`
Expected: PASS. If the `'proced'` prefix test or the typo test is flaky against the MiniSearch version installed, adjust only the fuzzy/prefix values in `SEARCH_OPTIONS`, not the tests.

- [ ] **Step 5: Commit (only if a git repo exists)**

```bash
git add src/lib/search.js tests/search.test.js
git commit -m "feat: manual search index, snippets and PDF page links"
```

---

### Task 7: Fault code search and validation

**Files:**
- Create: `src/lib/manifest.js`, `src/lib/faultcodes.js`
- Test: `tests/faultcodes.test.js`

**Interfaces:**
- Produces from `manifest.js`: `checkSource(label, source, manifest) -> string[]`, where `manifest = [{manufacturer, doc, pages}]`.
- Produces from `faultcodes.js`:
  - Entry shape: `{manufacturer, model, code, meaning, causes: string[], checks: string[], source: {manufacturer, doc, page}}`.
  - `searchFaultCodes(entries, query, {manufacturer, model}) -> entries[]`.
  - `listManufacturers(entries) -> string[]`, `listModels(entries, manufacturer) -> string[]`.
  - `validateFaultCodes(entries, manifest) -> string[]`.

- [ ] **Step 1: Write the failing test**

```js
// tests/faultcodes.test.js
import { describe, it, expect } from 'vitest';
import { searchFaultCodes, listManufacturers, listModels, validateFaultCodes } from '../src/lib/faultcodes.js';
import { checkSource } from '../src/lib/manifest.js';

// Test-only fixture data. Not real manufacturer codes.
const src = (page) => ({ manufacturer: 'acme', doc: 'ctl.pdf', page });
const entries = [
  { manufacturer: 'acme', model: 'X1', code: 'E-01', meaning: 'Supply sensor open', causes: ['Wire broken'], checks: ['Measure sensor resistance'], source: src(5) },
  { manufacturer: 'acme', model: 'X1', code: 'E-02', meaning: 'Return sensor shorted', causes: ['Pinched wire'], checks: ['Inspect wiring'], source: src(5) },
  { manufacturer: 'acme', model: 'X2', code: 'E-01', meaning: 'Outdoor sensor open', causes: [], checks: [], source: src(6) },
  { manufacturer: 'zeta', model: 'Z9', code: '12', meaning: 'Ignition failure', causes: ['No spark'], checks: ['Check igniter'], source: { manufacturer: 'zeta', doc: 'z.pdf', page: 2 } },
];
const manifest = [{ manufacturer: 'acme', doc: 'ctl.pdf', pages: 10 }, { manufacturer: 'zeta', doc: 'z.pdf', pages: 4 }];

describe('searchFaultCodes', () => {
  it('returns everything sorted when the query is blank', () => {
    expect(searchFaultCodes(entries, '')).toHaveLength(4);
    expect(searchFaultCodes(entries, '   ')).toHaveLength(4);
  });
  it('matches codes regardless of case, dashes and spaces', () => {
    for (const q of ['E-01', 'e01', 'e 01', 'E_01']) {
      const r = searchFaultCodes(entries, q);
      expect(r.map((e) => `${e.model}:${e.code}`)).toEqual(['X1:E-01', 'X2:E-01']);
    }
  });
  it('finds by words in the meaning, causes or checks', () => {
    expect(searchFaultCodes(entries, 'ignition')[0].manufacturer).toBe('zeta');
    expect(searchFaultCodes(entries, 'pinched')[0].code).toBe('E-02');
    expect(searchFaultCodes(entries, 'igniter')[0].code).toBe('12');
  });
  it('requires every word to match', () => {
    expect(searchFaultCodes(entries, 'sensor open')).toHaveLength(2);
    expect(searchFaultCodes(entries, 'sensor banana')).toEqual([]);
  });
  it('filters by manufacturer and model', () => {
    expect(searchFaultCodes(entries, '', { manufacturer: 'zeta' })).toHaveLength(1);
    expect(searchFaultCodes(entries, 'e-01', { manufacturer: 'acme', model: 'X2' })).toHaveLength(1);
  });
  it('never throws on regex characters or symbols', () => {
    for (const q of ['(', '.*[', '\\', '+++', '$^']) expect(() => searchFaultCodes(entries, q)).not.toThrow();
  });
  it('ranks an exact code above a partial one', () => {
    const more = [...entries, { manufacturer: 'acme', model: 'X1', code: 'E-010', meaning: 'Other', causes: [], checks: [], source: src(7) }];
    expect(searchFaultCodes(more, 'E-01', { model: 'X1' })[0].code).toBe('E-01');
  });
});

describe('listing helpers', () => {
  it('lists unique sorted manufacturers and models', () => {
    expect(listManufacturers(entries)).toEqual(['acme', 'zeta']);
    expect(listModels(entries, 'acme')).toEqual(['X1', 'X2']);
    expect(listModels(entries)).toEqual(['X1', 'X2', 'Z9']);
  });
});

describe('validateFaultCodes', () => {
  it('accepts good data', () => expect(validateFaultCodes(entries, manifest)).toEqual([]));
  it('requires the core fields', () => {
    const bad = [{ manufacturer: 'acme', model: '', code: 'E1', meaning: '', causes: 'x', checks: [], source: src(1) }];
    const msg = validateFaultCodes(bad, manifest).join(' ');
    expect(msg).toMatch(/model/);
    expect(msg).toMatch(/meaning/);
    expect(msg).toMatch(/causes/);
  });
  it('rejects a source that is not in the manifest or is out of range', () => {
    const e1 = [{ ...entries[0], source: { manufacturer: 'acme', doc: 'missing.pdf', page: 1 } }];
    expect(validateFaultCodes(e1, manifest).join(' ')).toMatch(/not in the manual index/);
    const e2 = [{ ...entries[0], source: src(11) }];
    expect(validateFaultCodes(e2, manifest).join(' ')).toMatch(/beyond the 10-page/);
  });
  it('rejects duplicates of manufacturer + model + code', () => {
    expect(validateFaultCodes([entries[0], entries[0]], manifest).join(' ')).toMatch(/duplicate/i);
  });
});

describe('checkSource', () => {
  it('requires a well-formed source', () => {
    expect(checkSource('x', undefined, manifest)[0]).toMatch(/source/);
    expect(checkSource('x', { manufacturer: 'acme', doc: 'ctl.pdf', page: 1.5 }, manifest)[0]).toMatch(/integer/);
  });
  it('passes a valid source', () => expect(checkSource('x', src(10), manifest)).toEqual([]));
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/faultcodes.test.js`
Expected: FAIL (module not found).

- [ ] **Step 3: Write `src/lib/manifest.js`**

```js
// src/lib/manifest.js
export function checkSource(label, source, manifest) {
  if (!source || typeof source !== 'object') return [`${label}: source {manufacturer, doc, page} is required`];
  const { manufacturer, doc, page } = source;
  if (!manufacturer || !doc || !Number.isInteger(page) || page < 1) {
    return [`${label}: source needs manufacturer, doc and an integer page >= 1`];
  }
  const entry = manifest.find((m) => m.manufacturer === manufacturer && m.doc === doc);
  if (!entry) return [`${label}: "${manufacturer}/${doc}" is not in the manual index (check spelling, or run npm run build)`];
  if (page > entry.pages) return [`${label}: page ${page} is beyond the ${entry.pages}-page document "${doc}"`];
  return [];
}
```

- [ ] **Step 4: Write `src/lib/faultcodes.js`**

```js
// src/lib/faultcodes.js
import { checkSource } from './manifest.js';

const compact = (s) => String(s).toLowerCase().replace(/[^a-z0-9]/g, '');
const same = (a, b) => String(a).toLowerCase() === String(b).toLowerCase();

export function searchFaultCodes(entries, query, { manufacturer, model } = {}) {
  const pool = entries.filter(
    (e) => (!manufacturer || same(e.manufacturer, manufacturer)) && (!model || same(e.model, model)),
  );
  const q = String(query || '').trim();
  const byOrder = (a, b) =>
    a.manufacturer.localeCompare(b.manufacturer) || a.model.localeCompare(b.model) || a.code.localeCompare(b.code, undefined, { numeric: true });
  if (!q) return [...pool].sort(byOrder);

  const qCode = compact(q);
  const words = q.toLowerCase().split(/\s+/).filter(Boolean);
  const scored = [];
  for (const e of pool) {
    const code = compact(e.code);
    let score = 0;
    if (qCode && code === qCode) score = 100;
    else if (qCode && code.startsWith(qCode)) score = 50;
    else if (qCode && code.includes(qCode)) score = 30;
    if (score === 0) {
      const hay = [e.meaning, ...(e.causes || []), ...(e.checks || [])].join(' ').toLowerCase();
      if (words.every((w) => hay.includes(w))) score = 10;
    }
    if (score > 0) scored.push({ e, score });
  }
  scored.sort((a, b) => b.score - a.score || byOrder(a.e, b.e));
  return scored.map((s) => s.e);
}

export function listManufacturers(entries) {
  return [...new Set(entries.map((e) => e.manufacturer))].sort();
}

export function listModels(entries, manufacturer) {
  const pool = manufacturer ? entries.filter((e) => same(e.manufacturer, manufacturer)) : entries;
  return [...new Set(pool.map((e) => e.model))].sort();
}

export function validateFaultCodes(entries, manifest) {
  const errors = [];
  const seen = new Set();
  entries.forEach((e, i) => {
    const label = `fault code #${i + 1} (${e && e.manufacturer}/${e && e.model}/${e && e.code})`;
    for (const k of ['manufacturer', 'model', 'code', 'meaning']) {
      if (typeof e[k] !== 'string' || !e[k].trim()) errors.push(`${label}: ${k} is required`);
    }
    for (const k of ['causes', 'checks']) {
      if (!Array.isArray(e[k]) || e[k].some((x) => typeof x !== 'string')) errors.push(`${label}: ${k} must be an array of strings`);
    }
    errors.push(...checkSource(label, e.source, manifest));
    const key = `${e.manufacturer}|${e.model}|${e.code}`.toLowerCase();
    if (seen.has(key)) errors.push(`${label}: duplicate of an earlier entry`);
    seen.add(key);
  });
  return errors;
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `npx vitest run tests/faultcodes.test.js`
Expected: PASS.

- [ ] **Step 6: Commit (only if a git repo exists)**

```bash
git add src/lib/manifest.js src/lib/faultcodes.js tests/faultcodes.test.js
git commit -m "feat: fault code search and validation"
```

---

### Task 8: PDF extraction and index build

**Files:**
- Create: `build/pdf-extract.js`, `build/build-index.js`, `tests/helpers/make-pdf.js`
- Test: `tests/pdf-extract.test.js`, `tests/build-index.test.js`

**Interfaces:**
- Consumes: `createIndex` from `src/lib/search.js`.
- Produces from `pdf-extract.js`: `extractPdf(filePath) -> Promise<[{page, text}]>` (rejects on corrupt or password-protected files), `findPdfs(root) -> Promise<{pdfs: [{manufacturer, doc, filePath}], skipped: string[]}>` (a missing root returns empty lists).
- Produces from `build-index.js`: `buildIndex({pdfRoot, outDir, cacheDir, log}) -> Promise<{manifest: [{manufacturer, doc, pages}], stats: {docs, pages, emptyPages, failures: [{file, reason}], indexBytes}}>`. Writes `<outDir>/index-data.js` (`window.HVAC_INDEX=...;`), `<outDir>/manifest.json`, and `<cacheDir>/pages.json` when `cacheDir` is given.
- Produces from `tests/helpers/make-pdf.js`: `makePdf(pageTexts: string[]) -> Buffer`, a minimal valid text PDF.

- [ ] **Step 1: Write the PDF test helper**

```js
// tests/helpers/make-pdf.js
// Builds a minimal valid PDF with one line of Helvetica text per page.
export function makePdf(pageTexts) {
  const n = pageTexts.length;
  const objs = [];
  const pageIds = pageTexts.map((_, i) => 4 + i * 2);
  objs[1] = '<< /Type /Catalog /Pages 2 0 R >>';
  objs[2] = `<< /Type /Pages /Kids [${pageIds.map((id) => `${id} 0 R`).join(' ')}] /Count ${n} >>`;
  objs[3] = '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>';
  pageTexts.forEach((text, i) => {
    const pid = 4 + i * 2;
    const cid = pid + 1;
    const escaped = text.replace(/[()\\]/g, '\\$&');
    const stream = `BT /F1 12 Tf 72 720 Td (${escaped}) Tj ET`;
    objs[pid] = `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents ${cid} 0 R /Resources << /Font << /F1 3 0 R >> >> >>`;
    objs[cid] = `<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`;
  });
  let out = '%PDF-1.4\n';
  const offsets = [];
  for (let i = 1; i < objs.length; i++) {
    offsets[i] = out.length;
    out += `${i} 0 obj\n${objs[i]}\nendobj\n`;
  }
  const xref = out.length;
  out += `xref\n0 ${objs.length}\n0000000000 65535 f \n`;
  for (let i = 1; i < objs.length; i++) out += `${String(offsets[i]).padStart(10, '0')} 00000 n \n`;
  out += `trailer\n<< /Size ${objs.length} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  return Buffer.from(out, 'latin1');
}
```

- [ ] **Step 2: Write the failing extraction test**

```js
// tests/pdf-extract.test.js
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { extractPdf, findPdfs } from '../build/pdf-extract.js';
import { makePdf } from './helpers/make-pdf.js';

let tmp;
beforeAll(async () => {
  tmp = await fs.mkdtemp(path.join(os.tmpdir(), 'hvac-pdf-'));
});
afterAll(async () => {
  await fs.rm(tmp, { recursive: true, force: true });
});

describe('extractPdf', () => {
  it('returns text per page, numbered from 1', async () => {
    const file = path.join(tmp, 'two.pdf');
    await fs.writeFile(file, makePdf(['Boiler lockout code 12', 'Second page pump']));
    const pages = await extractPdf(file);
    expect(pages).toHaveLength(2);
    expect(pages[0].page).toBe(1);
    expect(pages[0].text).toContain('lockout');
    expect(pages[1].text).toContain('pump');
  });
  it('rejects a file that is not a PDF', async () => {
    const file = path.join(tmp, 'bad.pdf');
    await fs.writeFile(file, 'this is not a pdf');
    await expect(extractPdf(file)).rejects.toThrow();
  });
});

describe('findPdfs', () => {
  it('maps the first folder to the manufacturer and keeps subfolders in doc', async () => {
    const root = path.join(tmp, 'pdfs');
    await fs.mkdir(path.join(root, 'tekmar', 'sub'), { recursive: true });
    await fs.mkdir(path.join(root, 'aerco'), { recursive: true });
    await fs.writeFile(path.join(root, 'tekmar', 'a.pdf'), makePdf(['x']));
    await fs.writeFile(path.join(root, 'tekmar', 'sub', 'B.PDF'), makePdf(['x']));
    await fs.writeFile(path.join(root, 'tekmar', 'notes.txt'), 'ignore me');
    await fs.writeFile(path.join(root, 'aerco', 'c.pdf'), makePdf(['x']));
    await fs.writeFile(path.join(root, 'loose.pdf'), makePdf(['x']));
    const { pdfs, skipped } = await findPdfs(root);
    expect(pdfs.map((p) => `${p.manufacturer}/${p.doc}`)).toEqual(['aerco/c.pdf', 'tekmar/a.pdf', 'tekmar/sub/B.PDF']);
    expect(skipped).toEqual(['loose.pdf']);
  });
  it('returns empty lists when the folder does not exist', async () => {
    expect(await findPdfs(path.join(tmp, 'nope'))).toEqual({ pdfs: [], skipped: [] });
  });
});
```

- [ ] **Step 3: Run test to verify it fails**

Run: `npx vitest run tests/pdf-extract.test.js`
Expected: FAIL (module not found).

- [ ] **Step 4: Write `build/pdf-extract.js`**

```js
// build/pdf-extract.js
import fs from 'node:fs/promises';
import path from 'node:path';
import * as pdfjs from 'pdfjs-dist/legacy/build/pdf.mjs';

export async function extractPdf(filePath) {
  const data = new Uint8Array(await fs.readFile(filePath));
  const pdf = await pdfjs.getDocument({ data, useSystemFonts: true, verbosity: 0 }).promise;
  const pages = [];
  try {
    for (let n = 1; n <= pdf.numPages; n++) {
      const page = await pdf.getPage(n);
      const content = await page.getTextContent();
      let text = '';
      for (const item of content.items) {
        text += item.str;
        text += item.hasEOL ? '\n' : ' ';
      }
      pages.push({ page: n, text: text.replace(/[ \t]+/g, ' ').trim() });
      page.cleanup();
    }
  } finally {
    await pdf.destroy();
  }
  return pages;
}

export async function findPdfs(root) {
  const pdfs = [];
  const skipped = [];
  let entries;
  try {
    entries = await fs.readdir(root, { withFileTypes: true });
  } catch (err) {
    if (err.code === 'ENOENT') return { pdfs, skipped };
    throw err;
  }
  const isPdf = (name) => name.toLowerCase().endsWith('.pdf');
  const byName = (a, b) => a.name.localeCompare(b.name);

  const walk = async (dir, manufacturer, rel) => {
    const items = (await fs.readdir(dir, { withFileTypes: true })).sort(byName);
    for (const it of items) {
      const full = path.join(dir, it.name);
      const relPath = rel ? `${rel}/${it.name}` : it.name;
      if (it.isDirectory()) await walk(full, manufacturer, relPath);
      else if (it.isFile() && isPdf(it.name)) pdfs.push({ manufacturer, doc: relPath, filePath: full });
    }
  };

  for (const e of entries.sort(byName)) {
    if (e.isDirectory()) await walk(path.join(root, e.name), e.name, '');
    else if (e.isFile() && isPdf(e.name)) skipped.push(e.name);
  }
  return { pdfs, skipped };
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `npx vitest run tests/pdf-extract.test.js`
Expected: PASS. If pdf.js prints canvas or `DOMMatrix` polyfill warnings, they are harmless; the tests must still pass.

- [ ] **Step 6: Write the failing index-build test**

```js
// tests/build-index.test.js
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import vm from 'node:vm';
import { buildIndex } from '../build/build-index.js';
import { loadIndex, searchManuals } from '../src/lib/search.js';
import { makePdf } from './helpers/make-pdf.js';

let tmp;
const quiet = { warn: () => {}, log: () => {} };
beforeEach(async () => {
  tmp = await fs.mkdtemp(path.join(os.tmpdir(), 'hvac-idx-'));
});
afterEach(async () => {
  await fs.rm(tmp, { recursive: true, force: true });
});

const readIndex = async (outDir) => {
  const code = await fs.readFile(path.join(outDir, 'index-data.js'), 'utf8');
  const sandbox = { window: {} };
  vm.runInNewContext(code, sandbox);
  return sandbox.window.HVAC_INDEX;
};

describe('buildIndex', () => {
  it('succeeds with an empty pdfs folder and writes an empty, loadable index', async () => {
    const pdfRoot = path.join(tmp, 'pdfs');
    await fs.mkdir(pdfRoot);
    const outDir = path.join(tmp, 'dist');
    const { manifest, stats } = await buildIndex({ pdfRoot, outDir, log: quiet });
    expect(manifest).toEqual([]);
    expect(stats.docs).toBe(0);
    const index = loadIndex(await readIndex(outDir));
    expect(searchManuals(index, 'anything')).toEqual([]);
  });

  it('succeeds when the pdfs folder does not exist', async () => {
    const outDir = path.join(tmp, 'dist');
    const { manifest } = await buildIndex({ pdfRoot: path.join(tmp, 'missing'), outDir, log: quiet });
    expect(manifest).toEqual([]);
    expect(JSON.parse(await fs.readFile(path.join(outDir, 'manifest.json'), 'utf8'))).toEqual([]);
  });

  it('indexes good PDFs, and skips a corrupt one with a recorded failure', async () => {
    const pdfRoot = path.join(tmp, 'pdfs');
    await fs.mkdir(path.join(pdfRoot, 'tekmar'), { recursive: true });
    await fs.writeFile(path.join(pdfRoot, 'tekmar', 'good file.pdf'), makePdf(['Boiler lockout code', 'Pump delay setting']));
    await fs.writeFile(path.join(pdfRoot, 'tekmar', 'broken.pdf'), 'not a pdf at all');
    const outDir = path.join(tmp, 'dist');
    const cacheDir = path.join(tmp, 'cache');
    const warnings = [];
    const { manifest, stats } = await buildIndex({ pdfRoot, outDir, cacheDir, log: { warn: (m) => warnings.push(m), log: () => {} } });

    expect(manifest).toEqual([{ manufacturer: 'tekmar', doc: 'good file.pdf', pages: 2 }]);
    expect(stats.failures).toHaveLength(1);
    expect(stats.failures[0].file).toContain('broken.pdf');
    expect(warnings.join(' ')).toContain('broken.pdf');

    const index = loadIndex(await readIndex(outDir));
    const hits = searchManuals(index, 'pump delay');
    expect(hits).toHaveLength(1);
    expect(hits[0]).toMatchObject({ manufacturer: 'tekmar', doc: 'good file.pdf', page: 2 });

    const cached = JSON.parse(await fs.readFile(path.join(cacheDir, 'pages.json'), 'utf8'));
    expect(cached).toHaveLength(2);
  });

  it('does not index pages that have no text and counts them', async () => {
    const pdfRoot = path.join(tmp, 'pdfs');
    await fs.mkdir(path.join(pdfRoot, 'acme'), { recursive: true });
    await fs.writeFile(path.join(pdfRoot, 'acme', 'blank.pdf'), makePdf(['', 'has text']));
    const { manifest, stats } = await buildIndex({ pdfRoot, outDir: path.join(tmp, 'dist'), log: quiet });
    expect(manifest[0].pages).toBe(2);
    expect(stats.emptyPages).toBe(1);
    expect(stats.pages).toBe(1);
  });
});
```

- [ ] **Step 7: Run test to verify it fails**

Run: `npx vitest run tests/build-index.test.js`
Expected: FAIL (module not found).

- [ ] **Step 8: Write `build/build-index.js`**

```js
// build/build-index.js
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { extractPdf, findPdfs } from './pdf-extract.js';
import { createIndex } from '../src/lib/search.js';

export async function buildIndex({ pdfRoot, outDir, cacheDir, log = console }) {
  await fs.mkdir(outDir, { recursive: true });
  const { pdfs, skipped } = await findPdfs(pdfRoot);
  for (const name of skipped) log.warn(`Skipped (not inside a manufacturer folder): ${name}`);

  const pages = [];
  const manifest = [];
  const failures = [];
  let emptyPages = 0;

  for (const pdf of pdfs) {
    try {
      const extracted = await extractPdf(pdf.filePath);
      for (const p of extracted) {
        if (!p.text) {
          emptyPages++;
          continue;
        }
        pages.push({ manufacturer: pdf.manufacturer, doc: pdf.doc, page: p.page, text: p.text });
      }
      manifest.push({ manufacturer: pdf.manufacturer, doc: pdf.doc, pages: extracted.length });
      log.log(`Indexed ${pdf.manufacturer}/${pdf.doc} (${extracted.length} pages)`);
    } catch (err) {
      const reason = String((err && err.message) || err);
      failures.push({ file: `${pdf.manufacturer}/${pdf.doc}`, reason });
      log.warn(`FAILED ${pdf.manufacturer}/${pdf.doc}: ${reason}`);
    }
  }

  const json = JSON.stringify(createIndex(pages).toJSON());
  await fs.writeFile(path.join(outDir, 'index-data.js'), `window.HVAC_INDEX=${json};\n`);
  await fs.writeFile(path.join(outDir, 'manifest.json'), JSON.stringify(manifest, null, 2));
  if (cacheDir) {
    await fs.mkdir(cacheDir, { recursive: true });
    await fs.writeFile(path.join(cacheDir, 'pages.json'), JSON.stringify(pages));
  }

  return {
    manifest,
    stats: { docs: manifest.length, pages: pages.length, emptyPages, failures, indexBytes: Buffer.byteLength(json) },
  };
}

const isMain = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
if (isMain) {
  const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
  const { stats } = await buildIndex({
    pdfRoot: path.join(root, 'pdfs'),
    outDir: path.join(root, 'app', 'dist'),
    cacheDir: path.join(root, 'build', '.cache'),
  });
  console.log(`Done: ${stats.docs} documents, ${stats.pages} pages, ${stats.emptyPages} empty pages, ${stats.failures.length} failures, index ${(stats.indexBytes / 1048576).toFixed(1)} MB`);
}
```

- [ ] **Step 9: Run tests to verify they pass**

Run: `npx vitest run tests/build-index.test.js tests/pdf-extract.test.js`
Expected: PASS.

- [ ] **Step 10: Commit (only if a git repo exists)**

```bash
git add build/pdf-extract.js build/build-index.js tests/helpers/make-pdf.js tests/pdf-extract.test.js tests/build-index.test.js
git commit -m "feat: PDF text extraction and search index build"
```

---

### Task 9: Data loading, validation and full build

**Files:**
- Create: `build/load-data.js`, `build/validate-data.js`, `build/build.js`
- Test: `tests/validate-data.test.js`

**Interfaces:**
- Consumes: `validateFaultCodes`, `validateTree`, `checkSource`, `loadTable`, `buildIndex`.
- Produces from `load-data.js`: `loadData(dataDir) -> Promise<{faultCodes: [], trees: [], ptRaw: []}>`. Missing subfolders give empty arrays. Invalid JSON throws an `Error` naming the file. A fault-code file that is not an array throws.
- Produces from `validate-data.js`: `validateAll({faultCodes, trees, ptRaw, manifest}) -> string[]` (also runs as `npm run validate`, using `app/dist/manifest.json`).
- `build.js` writes `app/dist/data.js` (`window.HVAC_DATA = {faultCodes, trees, pt, manifest}`) and `app/dist/app.js` (IIFE bundle of `app/src/main.js`).

- [ ] **Step 1: Write the failing test**

```js
// tests/validate-data.test.js
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { loadData } from '../build/load-data.js';
import { validateAll } from '../build/validate-data.js';

let tmp;
beforeEach(async () => {
  tmp = await fs.mkdtemp(path.join(os.tmpdir(), 'hvac-data-'));
});
afterEach(async () => {
  await fs.rm(tmp, { recursive: true, force: true });
});

const write = async (rel, value) => {
  const file = path.join(tmp, rel);
  await fs.mkdir(path.dirname(file), { recursive: true });
  await fs.writeFile(file, typeof value === 'string' ? value : JSON.stringify(value));
};

const manifest = [{ manufacturer: 'acme', doc: 'ctl.pdf', pages: 10 }];
const tree = {
  id: 't1',
  title: 'T',
  start: 'q',
  nodes: {
    q: { type: 'question', text: 'Q?', options: [{ label: 'a', next: 'r' }, { label: 'b', next: 'r2' }] },
    r: { type: 'result', cause: 'c', fix: ['f'], source: { manufacturer: 'acme', doc: 'ctl.pdf', page: 3 } },
    r2: { type: 'result', cause: 'c2', fix: ['f2'] },
  },
};
const pt = { refrigerant: 'T', source: 's', points: [{ tF: 0, bubblePsig: 0, dewPsig: 0 }, { tF: 10, bubblePsig: 20, dewPsig: 20 }] };

describe('loadData', () => {
  it('returns empty arrays when the data folders are missing', async () => {
    expect(await loadData(tmp)).toEqual({ faultCodes: [], trees: [], ptRaw: [] });
  });
  it('merges fault code files and reads trees and tables', async () => {
    await write('fault-codes/a.json', [{ code: '1' }]);
    await write('fault-codes/b.json', [{ code: '2' }]);
    await write('trees/t.json', tree);
    await write('pt/t.json', pt);
    const d = await loadData(tmp);
    expect(d.faultCodes.map((e) => e.code)).toEqual(['1', '2']);
    expect(d.trees[0].id).toBe('t1');
    expect(d.ptRaw[0].refrigerant).toBe('T');
  });
  it('names the file when JSON is invalid', async () => {
    await write('trees/broken.json', '{ not json');
    await expect(loadData(tmp)).rejects.toThrow(/trees\/broken\.json/);
  });
  it('rejects a fault code file that is not an array', async () => {
    await write('fault-codes/x.json', { code: '1' });
    await expect(loadData(tmp)).rejects.toThrow(/fault-codes\/x\.json.*array/);
  });
});

describe('validateAll', () => {
  it('passes good data', () => {
    expect(validateAll({ faultCodes: [], trees: [tree], ptRaw: [pt], manifest })).toEqual([]);
  });
  it('flags a tree source that is not in the manual index', () => {
    const t = structuredClone(tree);
    t.nodes.r.source.page = 99;
    expect(validateAll({ faultCodes: [], trees: [t], ptRaw: [], manifest }).join(' ')).toMatch(/beyond the 10-page/);
  });
  it('flags duplicate tree ids and bad PT tables', () => {
    const bad = { refrigerant: 'BAD', points: [] };
    const msg = validateAll({ faultCodes: [], trees: [tree, tree], ptRaw: [bad], manifest }).join(' ');
    expect(msg).toMatch(/duplicate tree id "t1"/);
    expect(msg).toMatch(/BAD/);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/validate-data.test.js`
Expected: FAIL (module not found).

- [ ] **Step 3: Write `build/load-data.js`**

```js
// build/load-data.js
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
```

- [ ] **Step 4: Write `build/validate-data.js`**

```js
// build/validate-data.js
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
```

- [ ] **Step 5: Run test to verify it passes**

Run: `npx vitest run tests/validate-data.test.js`
Expected: PASS.

- [ ] **Step 6: Write `build/build.js`**

```js
// build/build.js
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { build as esbuild } from 'esbuild';
import { buildIndex } from './build-index.js';
import { loadData } from './load-data.js';
import { validateAll } from './validate-data.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const dist = path.join(root, 'app', 'dist');

const { manifest, stats } = await buildIndex({
  pdfRoot: path.join(root, 'pdfs'),
  outDir: dist,
  cacheDir: path.join(root, 'build', '.cache'),
});

const data = await loadData(path.join(root, 'data'));
const errors = validateAll({ ...data, manifest });
if (errors.length) {
  console.error(`Data validation failed with ${errors.length} problem(s):\n- ${errors.join('\n- ')}`);
  process.exit(1);
}

const payload = { faultCodes: data.faultCodes, trees: data.trees, pt: data.ptRaw, manifest };
await fs.writeFile(path.join(dist, 'data.js'), `window.HVAC_DATA=${JSON.stringify(payload)};\n`);

await esbuild({
  entryPoints: [path.join(root, 'app', 'src', 'main.js')],
  bundle: true,
  format: 'iife',
  target: 'es2020',
  outfile: path.join(dist, 'app.js'),
  logLevel: 'warning',
});

const mb = stats.indexBytes / 1048576;
console.log(`Build complete: ${stats.docs} documents, ${stats.pages} pages, index ${mb.toFixed(1)} MB, ${data.faultCodes.length} fault codes, ${data.trees.length} trees, ${data.ptRaw.length} PT tables.`);
if (stats.failures.length) console.warn(`${stats.failures.length} PDF(s) could not be read:\n- ${stats.failures.map((f) => `${f.file}: ${f.reason}`).join('\n- ')}`);
if (stats.emptyPages) console.warn(`${stats.emptyPages} page(s) had no extractable text (image-only pages are not searchable).`);
if (mb > 80) console.warn('The search index is over 80 MB and the app may load slowly. Tell the maintainer; the index should be split per manufacturer.');
```

The full build is exercised in Task 10 once `app/src/main.js` exists.

- [ ] **Step 7: Commit (only if a git repo exists)**

```bash
git add build/load-data.js build/validate-data.js build/build.js tests/validate-data.test.js
git commit -m "feat: data loading, validation and full build script"
```

---

### Task 10: App shell and Manuals tab

**Files:**
- Create: `app/index.html`, `app/styles.css`, `app/src/dom.js`, `app/src/main.js`, `app/src/tabs/manuals.js`

**Interfaces:**
- Consumes: `loadIndex`, `searchManuals`, `pdfHref` from `src/lib/search.js`; `window.HVAC_DATA`, `window.HVAC_INDEX`.
- Produces: `h(tag, attrs, ...children)` and `clear(el)` from `dom.js`; every tab module exports `render<Name>(root, ctx)` where `ctx = {data, searchIndex, tables}`; `main.js` holds a `TABS` array `[{id, label, render}]` that later tasks extend.

- [ ] **Step 1: Write `app/index.html`**

```html
<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>HVAC Troubleshooter</title>
  <link rel="stylesheet" href="styles.css">
</head>
<body>
  <header>
    <h1>HVAC Troubleshooter</h1>
    <nav id="tabs" aria-label="Tools"></nav>
  </header>
  <main id="app">
    <p id="boot-msg">Loading... If this message stays, run <code>npm run build</code> in the project folder and reload.</p>
  </main>
  <footer>
    Suggestions only. Follow the manufacturer's procedures, lockout/tagout and refrigerant-handling rules. Never bypass a safety device.
  </footer>
  <script src="dist/data.js"></script>
  <script src="dist/index-data.js"></script>
  <script src="dist/app.js"></script>
</body>
</html>
```

- [ ] **Step 2: Write `app/styles.css`**

```css
:root {
  --bg: #f6f7f9; --fg: #1b1f24; --muted: #5a6572; --card: #ffffff; --line: #d3d9e0;
  --accent: #0b5cad; --accent-fg: #ffffff; --warn: #9a3412; --ok: #166534; --err: #b42318;
}
@media (prefers-color-scheme: dark) {
  :root { --bg: #14181d; --fg: #e6e9ed; --muted: #a0aab6; --card: #1d232a; --line: #33404d;
    --accent: #5aa9f0; --accent-fg: #0b1218; --warn: #f4a261; --ok: #6fcf97; --err: #ff8a80; }
}
* { box-sizing: border-box; }
body { margin: 0; font: 16px/1.5 system-ui, "Segoe UI", sans-serif; background: var(--bg); color: var(--fg); }
header { padding: 12px 20px 0; border-bottom: 1px solid var(--line); background: var(--card); }
h1 { margin: 0 0 8px; font-size: 1.25rem; }
nav { display: flex; gap: 4px; flex-wrap: wrap; }
nav button { border: 0; border-bottom: 3px solid transparent; background: none; color: var(--muted); padding: 10px 16px; font: inherit; cursor: pointer; }
nav button[aria-current="page"] { color: var(--fg); border-bottom-color: var(--accent); font-weight: 600; }
main { max-width: 1000px; margin: 0 auto; padding: 20px; }
footer { max-width: 1000px; margin: 0 auto; padding: 12px 20px 24px; color: var(--muted); font-size: 0.85rem; }
.card, form.card { background: var(--card); border: 1px solid var(--line); border-radius: 8px; padding: 16px; margin: 0 0 16px; }
.card h2, form.card h2 { margin: 0 0 12px; font-size: 1.1rem; }
.row { display: flex; gap: 12px; flex-wrap: wrap; margin-bottom: 12px; }
.field { display: flex; flex-direction: column; gap: 4px; min-width: 150px; flex: 1 1 150px; }
.field small { color: var(--muted); }
input, select, button { font: inherit; }
input, select { padding: 8px 10px; border: 1px solid var(--line); border-radius: 6px; background: var(--bg); color: var(--fg); }
button.primary, form.card button[type="submit"], .choice { background: var(--accent); color: var(--accent-fg); border: 0; border-radius: 6px; padding: 10px 16px; cursor: pointer; }
.choice { display: block; width: 100%; text-align: left; margin: 0 0 8px; }
button.secondary { background: none; border: 1px solid var(--line); color: var(--fg); border-radius: 6px; padding: 8px 14px; cursor: pointer; margin-right: 8px; }
:focus-visible { outline: 3px solid var(--accent); outline-offset: 2px; }
.result { margin-top: 12px; padding: 10px 12px; border-left: 4px solid var(--accent); background: var(--bg); }
.result:empty { display: none; }
.result.error, .error { border-left-color: var(--err); color: var(--err); }
.badge { display: inline-block; font-size: 0.75rem; padding: 2px 8px; border: 1px solid var(--line); border-radius: 999px; color: var(--muted); margin-left: 8px; }
.snippet { color: var(--muted); margin: 4px 0 0; }
.hit { padding: 10px 0; border-bottom: 1px solid var(--line); }
.hit:last-child { border-bottom: 0; }
a { color: var(--accent); }
ul.tight { margin: 4px 0 8px; padding-left: 20px; }
.path { color: var(--muted); font-size: 0.9rem; margin-bottom: 12px; }
.empty { color: var(--muted); }
```

- [ ] **Step 3: Write `app/src/dom.js`**

```js
// app/src/dom.js
export function h(tag, attrs = {}, ...children) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (v === null || v === undefined || v === false) continue;
    if (k === 'class') el.className = v;
    else if (k.startsWith('on') && typeof v === 'function') el.addEventListener(k.slice(2).toLowerCase(), v);
    else el.setAttribute(k, v === true ? '' : String(v));
  }
  for (const c of children.flat()) {
    if (c === null || c === undefined || c === false) continue;
    el.append(c instanceof Node ? c : document.createTextNode(String(c)));
  }
  return el;
}

export function clear(el) {
  el.replaceChildren();
}
```

- [ ] **Step 4: Write `app/src/tabs/manuals.js`**

```js
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
```

- [ ] **Step 5: Write `app/src/main.js`**

```js
// app/src/main.js
import { loadIndex } from '../../src/lib/search.js';
import { buildTables } from '../../src/lib/pt.js';
import { h, clear } from './dom.js';
import { renderManuals } from './tabs/manuals.js';

const TABS = [
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
  const ctx = { data, searchIndex: loadIndex(window.HVAC_INDEX), tables: buildTables(data.pt) };

  const current = () => TABS.find((t) => `#${t.id}` === location.hash) || TABS[0];
  const show = () => {
    const tab = current();
    clear(nav);
    for (const t of TABS) {
      nav.append(h('button', { type: 'button', 'aria-current': t.id === tab.id ? 'page' : null, onclick: () => { location.hash = t.id; } }, t.label));
    }
    clear(root);
    try {
      tab.render(root, ctx);
    } catch (err) {
      root.append(h('p', { class: 'error', role: 'alert' }, `This tab failed to load: ${err.message}`));
    }
  };
  window.addEventListener('hashchange', show);
  show();
}

boot();
```

- [ ] **Step 6: Build with a sample PDF and verify in the browser**

Create a throwaway sample (the `pdfs/` folder is git-ignored):

Run: `node -e "import('./tests/helpers/make-pdf.js').then(m=>{const fs=require('fs');fs.mkdirSync('pdfs/sample',{recursive:true});fs.writeFileSync('pdfs/sample/Sample Manual #1.pdf',m.makePdf(['Boiler lockout code 12 means ignition failure','Pump delay is set in the settings menu']))})"`
Run: `npm run build`
Expected: `Build complete: 1 documents, 2 pages, ...`. No errors.

Open `app/index.html` directly in Chrome or Edge (for example `start app\index.html`). Verify:
1. The Manuals tab shows "1 document indexed".
2. Searching `pump delay` shows one hit, `sample / Sample Manual #1.pdf, page 2`, with a snippet.
3. Clicking the link opens the PDF on page 2 (the `#` and spaces in the filename must not break it).
4. Searching `zzzz` shows "No matches".

Then delete the sample: `Remove-Item -Recurse -Force pdfs/sample` and re-run `npm run build`. Open the page again: the Manuals tab must show the "No manuals are indexed yet" message, not an error.

- [ ] **Step 7: Commit (only if a git repo exists)**

```bash
git add app/index.html app/styles.css app/src
git commit -m "feat: app shell and manuals search tab"
```

---

### Task 11: Readings tab

**Files:**
- Create: `src/lib/readings.js`, `app/src/tabs/readings.js`
- Modify: `app/src/main.js`
- Test: `tests/readings.test.js`

**Interfaces:**
- Consumes: `parseNumber`, `requireNumber`, `WATER_FACTOR`, `deltaT`, `heatOutputBtuh`, `assessDeltaT`, `resetTarget`, `assessSupply`, `superheat`, `subcooling`, `interpretCharge`.
- Produces from `readings.js` (all take an object of raw form strings, throw `RangeError` with a user-readable message on bad input):
  - `computeHydronic({supplyF, returnF, gpm, factor, targetMin, targetMax}) -> {deltaT, btuh?, assessment}`.
  - `computeReset({outdoorF, roomF, outdoorDesignF, supplyDesignF, supplyMinF, supplyMaxF, measuredF, toleranceF}) -> {targetF, check?}`.
  - `computeRefrigerant(tables, {refrigerant, suctionPsig, suctionLineF, liquidPsig, liquidLineF, shMin, shMax, scMin, scMax}) -> {superheat?, subcooling?, interpretation}`.

- [ ] **Step 1: Write the failing test**

```js
// tests/readings.test.js
import { describe, it, expect } from 'vitest';
import { loadTable } from '../src/lib/pt.js';
import { computeHydronic, computeReset, computeRefrigerant } from '../src/lib/readings.js';

const table = loadTable({
  refrigerant: 'TEST',
  source: 'synthetic',
  points: Array.from({ length: 11 }, (_, i) => ({ tF: i * 10, bubblePsig: i * 20, dewPsig: i * 20 })),
});
const tables = { TEST: table };

describe('computeHydronic', () => {
  it('computes delta-T and BTU/h from string inputs', () => {
    const r = computeHydronic({ supplyF: '180', returnF: '160', gpm: '10', targetMin: '15', targetMax: '25' });
    expect(r.deltaT).toBe(20);
    expect(r.btuh).toBe(100000);
    expect(r.assessment.status).toBe('ok');
  });
  it('omits BTU/h when flow is blank and notes no target when none given', () => {
    const r = computeHydronic({ supplyF: '180', returnF: '160', gpm: '' });
    expect(r.btuh).toBeUndefined();
    expect(r.assessment.status).toBe('no-target');
  });
  it('uses a custom fluid factor', () => {
    expect(computeHydronic({ supplyF: '180', returnF: '160', gpm: '10', factor: '450' }).btuh).toBe(90000);
  });
  it('gives clear errors for blank, junk and comma-decimal input', () => {
    expect(() => computeHydronic({ supplyF: '', returnF: '160' })).toThrow('Supply temperature is required');
    expect(() => computeHydronic({ supplyF: 'abc', returnF: '160' })).toThrow('Supply temperature must be a number');
    expect(() => computeHydronic({ supplyF: '180', returnF: '160', gpm: '12,5' })).toThrow('Flow (GPM) must be a number');
  });
});

describe('computeReset', () => {
  const inputs = { outdoorF: '35', outdoorDesignF: '0', supplyDesignF: '180' };
  it('computes the target with defaults', () => {
    expect(computeReset(inputs).targetF).toBe(125);
  });
  it('compares a measured supply to the target', () => {
    const r = computeReset({ ...inputs, measuredF: '150' });
    expect(r.check.status).toBe('high');
  });
  it('requires the design values', () => {
    expect(() => computeReset({ outdoorF: '35', supplyDesignF: '180' })).toThrow('Design outdoor temperature is required');
  });
});

describe('computeRefrigerant', () => {
  const base = { refrigerant: 'TEST', suctionPsig: '100', suctionLineF: '60', liquidPsig: '160', liquidLineF: '70' };
  it('computes superheat and subcooling', () => {
    const r = computeRefrigerant(tables, base);
    expect(r.superheat).toBe(10);
    expect(r.subcooling).toBe(10);
    expect(r.interpretation.superheat).toBe('unknown');
  });
  it('interprets when targets are given', () => {
    const r = computeRefrigerant(tables, { ...base, shMin: '8', shMax: '12', scMin: '8', scMax: '12' });
    expect(r.interpretation.findings.join(' ')).toMatch(/within/i);
  });
  it('works with only the suction side', () => {
    const r = computeRefrigerant(tables, { refrigerant: 'TEST', suctionPsig: '100', suctionLineF: '60' });
    expect(r.superheat).toBe(10);
    expect(r.subcooling).toBeUndefined();
  });
  it('requires at least one complete pair', () => {
    expect(() => computeRefrigerant(tables, { refrigerant: 'TEST' })).toThrow(/suction.*liquid/i);
    expect(() => computeRefrigerant(tables, { refrigerant: 'TEST', suctionPsig: '100' })).toThrow(/line temperature/i);
  });
  it('rejects an unknown refrigerant and out-of-range pressure with a clear message', () => {
    expect(() => computeRefrigerant(tables, { ...base, refrigerant: 'R-NOPE' })).toThrow(/Unknown refrigerant/);
    expect(() => computeRefrigerant(tables, { ...base, suctionPsig: '9999' })).toThrow(/outside the table range/);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/readings.test.js`
Expected: FAIL (module not found).

- [ ] **Step 3: Write `src/lib/readings.js`**

```js
// src/lib/readings.js
import { parseNumber, requireNumber } from './num.js';
import { WATER_FACTOR, deltaT, heatOutputBtuh, assessDeltaT } from './hydronic.js';
import { resetTarget, assessSupply } from './reset.js';
import { superheat, subcooling, interpretCharge } from './refrigerant.js';

export function computeHydronic(i) {
  const supply = requireNumber(i.supplyF, 'Supply temperature');
  const ret = requireNumber(i.returnF, 'Return temperature');
  const gpm = parseNumber(i.gpm, 'Flow (GPM)');
  const factor = parseNumber(i.factor, 'Fluid factor') ?? WATER_FACTOR;
  const dt = deltaT(supply, ret);
  const target = { min: parseNumber(i.targetMin, 'Target min'), max: parseNumber(i.targetMax, 'Target max') };
  return {
    deltaT: dt,
    btuh: gpm === undefined ? undefined : heatOutputBtuh(gpm, dt, factor),
    assessment: assessDeltaT(dt, target),
  };
}

export function computeReset(i) {
  const targetF = resetTarget({
    outdoorF: requireNumber(i.outdoorF, 'Outdoor temperature'),
    outdoorDesignF: requireNumber(i.outdoorDesignF, 'Design outdoor temperature'),
    supplyDesignF: requireNumber(i.supplyDesignF, 'Design supply temperature'),
    roomF: parseNumber(i.roomF, 'Room temperature') ?? 70,
    supplyMinF: parseNumber(i.supplyMinF, 'Minimum supply'),
    supplyMaxF: parseNumber(i.supplyMaxF, 'Maximum supply'),
  });
  const measured = parseNumber(i.measuredF, 'Measured supply');
  const tolerance = parseNumber(i.toleranceF, 'Tolerance') ?? 5;
  return { targetF, check: measured === undefined ? undefined : assessSupply(measured, targetF, tolerance) };
}

export function computeRefrigerant(tables, i) {
  const table = tables[i.refrigerant];
  if (!table) throw new RangeError(`Unknown refrigerant "${i.refrigerant}"`);

  const suctionPsig = parseNumber(i.suctionPsig, 'Suction pressure');
  const suctionLineF = parseNumber(i.suctionLineF, 'Suction line temperature');
  const liquidPsig = parseNumber(i.liquidPsig, 'Liquid pressure');
  const liquidLineF = parseNumber(i.liquidLineF, 'Liquid line temperature');

  const haveSuction = suctionPsig !== undefined || suctionLineF !== undefined;
  const haveLiquid = liquidPsig !== undefined || liquidLineF !== undefined;
  if (!haveSuction && !haveLiquid) throw new RangeError('Enter suction readings, liquid readings, or both');
  if (haveSuction && (suctionPsig === undefined || suctionLineF === undefined)) {
    throw new RangeError('Enter both suction pressure and suction line temperature');
  }
  if (haveLiquid && (liquidPsig === undefined || liquidLineF === undefined)) {
    throw new RangeError('Enter both liquid pressure and liquid line temperature');
  }

  const sh = haveSuction ? superheat(table, { suctionPsig, suctionLineF }) : undefined;
  const sc = haveLiquid ? subcooling(table, { liquidPsig, liquidLineF }) : undefined;
  const targets = {
    superheat: { min: parseNumber(i.shMin, 'Superheat target min'), max: parseNumber(i.shMax, 'Superheat target max') },
    subcooling: { min: parseNumber(i.scMin, 'Subcooling target min'), max: parseNumber(i.scMax, 'Subcooling target max') },
  };
  return { superheat: sh, subcooling: sc, interpretation: interpretCharge({ superheat: sh, subcooling: sc }, targets) };
}
```

Note: the test `computeRefrigerant(tables, { refrigerant: 'TEST', suctionPsig: '100' })` must throw a message matching `/line temperature/i` — "Enter both suction pressure and suction line temperature" does. The empty case message "Enter suction readings, liquid readings, or both" matches `/suction.*liquid/i`.

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/readings.test.js`
Expected: PASS.

- [ ] **Step 5: Write `app/src/tabs/readings.js`**

```js
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
    [field('supplyF', 'Supply temperature (F)'), field('returnF', 'Return temperature (F)'), field('gpm', 'Flow (GPM)')],
    [field('factor', 'Fluid factor', 'Blank = 500 (water)'), field('targetMin', 'Target delta-T min (F)'), field('targetMax', 'Target delta-T max (F)')],
  ], computeHydronic, (out, r) => {
    line(out, `Delta-T: ${r.deltaT} F`);
    if (r.btuh !== undefined) line(out, `Heat output: ${r.btuh.toLocaleString()} BTU/h`);
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
  const select = h('select', { name: 'refrigerant' }, names.map((n) => h('option', { value: n }, n)));
  return card('Superheat and subcooling', 'Pressures in psig. Target ranges come from the unit data plate or manual; none are assumed. Refrigerant handling must follow the manufacturer procedure.', [
    [h('label', { class: 'field' }, h('span', {}, 'Refrigerant'), select)],
    [field('suctionPsig', 'Suction pressure (psig)'), field('suctionLineF', 'Suction line temperature (F)')],
    [field('liquidPsig', 'Liquid pressure (psig)'), field('liquidLineF', 'Liquid line temperature (F)')],
    [field('shMin', 'Superheat target min (F)'), field('shMax', 'Superheat target max (F)'), field('scMin', 'Subcooling target min (F)'), field('scMax', 'Subcooling target max (F)')],
  ], (v) => computeRefrigerant(ctx.tables, v), (out, r) => {
    if (r.superheat !== undefined) line(out, `Superheat: ${r.superheat} F (${r.interpretation.superheat})`);
    if (r.subcooling !== undefined) line(out, `Subcooling: ${r.subcooling} F (${r.interpretation.subcooling})`);
    list(out, r.interpretation.findings);
  });
}

export function renderReadings(root, ctx) {
  root.append(hydronicCard(), resetCard(), refrigerantCard(ctx));
}
```

- [ ] **Step 6: Register the tab in `app/src/main.js`**

Add the import below the existing tab import and insert the entry before `manuals`:

```js
import { renderReadings } from './tabs/readings.js';
```

```js
const TABS = [
  { id: 'readings', label: 'Readings', render: renderReadings },
  { id: 'manuals', label: 'Manuals', render: renderManuals },
];
```

- [ ] **Step 7: Build and verify in the browser**

Run: `npm run build` then open `app/index.html`, choose the Readings tab.
Verify:
1. Hydronic card: supply 180, return 160, flow 10, target 15 to 25 gives `Delta-T: 20 F`, `Heat output: 100,000 BTU/h`, `Assessment: ok`.
2. Hydronic card with blank supply shows a red message "Supply temperature is required", not `NaN`.
3. Reset card: outdoor 35, design outdoor 0, design supply 180 gives `Target supply: 125 F`.
4. Refrigerant card: R-410A, suction 118.8 psig, suction line 50 F gives a superheat of about 10 F (saturation is about 40 F). Pressure 9999 shows "outside the table range".

- [ ] **Step 8: Commit (only if a git repo exists)**

```bash
git add src/lib/readings.js app/src/tabs/readings.js app/src/main.js tests/readings.test.js
git commit -m "feat: readings tab with hydronic, reset and refrigerant calculators"
```

---

### Task 12: Fault codes tab

**Files:**
- Create: `app/src/tabs/faultcodes.js`
- Modify: `app/src/main.js`

**Interfaces:**
- Consumes: `searchFaultCodes`, `listManufacturers`, `listModels` from `src/lib/faultcodes.js`; `pdfHref`.

- [ ] **Step 1: Write `app/src/tabs/faultcodes.js`**

```js
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
    model.append(h('option', { value: '' }, 'All models'), listModels(entries, mfr.value || undefined).map((m) => h('option', { value: m }, m)));
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
    results.append(h('p', { class: 'empty' }, `${hits.length} fault code${hits.length === 1 ? '' : 's'}`), hits.map(card));
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
```

- [ ] **Step 2: Register the tab in `app/src/main.js`**

Add the import and insert the entry between `readings` and `manuals`:

```js
import { renderFaultCodes } from './tabs/faultcodes.js';
```

```js
const TABS = [
  { id: 'readings', label: 'Readings', render: renderReadings },
  { id: 'faultcodes', label: 'Fault codes', render: renderFaultCodes },
  { id: 'manuals', label: 'Manuals', render: renderManuals },
];
```

- [ ] **Step 3: Verify with temporary test data**

Create `pdfs/sample/Sample Manual #1.pdf` again (command in Task 10 Step 6) and a temporary `data/fault-codes/sample.json`:

```json
[
  {
    "manufacturer": "sample",
    "model": "S1",
    "code": "E-01",
    "meaning": "Test entry only",
    "causes": ["Test cause"],
    "checks": ["Test check"],
    "source": { "manufacturer": "sample", "doc": "Sample Manual #1.pdf", "page": 1 }
  }
]
```

Run: `npm run build`. Open `app/index.html`, Fault codes tab. Verify that searching `e01`, `E-01` and `e 01` all show the entry, that `(` shows "No matching fault codes" without an error, and that the Manual link opens page 1.

Then delete the temporary files: `Remove-Item -Recurse -Force pdfs/sample, data/fault-codes/sample.json` and rebuild. The tab must show the "No fault codes have been added yet" message.

- [ ] **Step 4: Commit (only if a git repo exists)**

```bash
git add app/src/tabs/faultcodes.js app/src/main.js
git commit -m "feat: fault codes tab"
```

---

### Task 13: Diagnose tab and generic hydronic trees

**Files:**
- Create: `app/src/tabs/diagnose.js`, `data/trees/generic-no-heat.json`, `data/trees/generic-short-cycling.json`, `data/trees/generic-poor-delta-t.json`, `data/trees/generic-pump-not-running.json`, `data/trees/generic-boiler-lockout.json`
- Modify: `app/src/main.js`
- Test: `tests/data-trees.test.js`

**Interfaces:**
- Consumes: `createSession`, `pdfHref`.
- Tree content rules: `"generic": true`; conservative standard practice only; every safety-relevant result says to follow the manufacturer procedure and not bypass safeties.

- [ ] **Step 1: Write the failing data test**

```js
// tests/data-trees.test.js
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { validateTree } from '../src/lib/tree.js';

const dir = path.resolve('data/trees');
const files = fs.existsSync(dir) ? fs.readdirSync(dir).filter((f) => f.endsWith('.json')) : [];

describe('shipped trees', () => {
  it('includes the five generic hydronic trees named in the spec', () => {
    for (const f of ['generic-no-heat', 'generic-short-cycling', 'generic-poor-delta-t', 'generic-pump-not-running', 'generic-boiler-lockout']) {
      expect(files).toContain(`${f}.json`);
    }
  });
  for (const file of files) {
    const tree = JSON.parse(fs.readFileSync(path.join(dir, file), 'utf8'));
    it(`${file} is structurally valid`, () => expect(validateTree(tree)).toEqual([]));
    it(`${file} has a unique id matching its filename`, () => expect(`${tree.id}.json`).toBe(file));
    if (tree.generic) {
      it(`${file} generic trees carry no manual source (they are not manufacturer content)`, () => {
        for (const n of Object.values(tree.nodes)) expect(n.source).toBeUndefined();
      });
    }
  }
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/data-trees.test.js`
Expected: FAIL (the five generic tree files are missing).

- [ ] **Step 3: Write `data/trees/generic-no-heat.json`**

```json
{
  "id": "generic-no-heat",
  "title": "No heat",
  "equipment": "Hydronic boilers and systems",
  "generic": true,
  "start": "n1",
  "nodes": {
    "n1": { "type": "question", "text": "Is the thermostat or controller calling for heat (call-for-heat present at the boiler or its control)?", "options": [{ "label": "Yes, call is present", "next": "n2" }, { "label": "No call", "next": "r_nocall" }] },
    "r_nocall": { "type": "result", "cause": "No call for heat is reaching the boiler.", "fix": ["Check the thermostat or zone controller setpoint, mode and batteries.", "Check zone valve or zone relay operation and 24 V control power.", "Check for a tripped breaker, blown control fuse or an open limit or switch in the call-for-heat circuit."] },
    "n2": { "type": "question", "text": "Does the boiler start its sequence (fan, igniter or burner start)?", "options": [{ "label": "Yes", "next": "n3" }, { "label": "No", "next": "n4" }] },
    "n4": { "type": "question", "text": "Does the boiler display a lockout, fault or error code?", "options": [{ "label": "Yes", "next": "r_code" }, { "label": "No", "next": "r_nostart" }] },
    "r_code": { "type": "result", "cause": "The boiler is in a fault or lockout state.", "fix": ["Record the code before resetting anything.", "Look it up in the Fault codes tab or the manufacturer manual (Manuals tab).", "Follow the manufacturer's reset and troubleshooting procedure. Do not bypass safety devices."] },
    "r_nostart": { "type": "result", "cause": "The start sequence is not beginning even though a call is present.", "fix": ["Verify power to the boiler and that the service switch is on.", "Check the safety string status per the boiler manual: low-water cut-off, limits, flow switch, gas pressure or air pressure switches.", "Check that an outdoor-reset or warm-weather shutdown setting is not blocking the call (see the control's manual).", "Do not jumper any safety device."] },
    "n3": { "type": "question", "text": "Does the burner light and stay lit?", "options": [{ "label": "Yes", "next": "n5" }, { "label": "No", "next": "r_flame" }] },
    "r_flame": { "type": "result", "cause": "Ignition or flame problem.", "fix": ["Check the gas supply and shutoff valves.", "Check the flame sensor and igniter using the manufacturer's procedure.", "Check vent and condensate drain for blockage per the manual.", "Gas work must follow the manufacturer's procedure and local code."] },
    "n5": { "type": "question", "text": "Is the boiler supply temperature rising toward setpoint?", "options": [{ "label": "Yes", "next": "n6" }, { "label": "No", "next": "r_nohi" }] },
    "r_nohi": { "type": "result", "cause": "The boiler is firing but not producing heat.", "fix": ["Check firing rate and gas pressure against the manual.", "Check for a fouled or dirty heat exchanger.", "Compare the boiler sensor reading with a calibrated thermometer."] },
    "n6": { "type": "question", "text": "Is the system pump running, with flow through the zone (pipe warming, flow indicated)?", "options": [{ "label": "Yes", "next": "n7" }, { "label": "No", "next": "r_pump" }] },
    "r_pump": { "type": "result", "cause": "Heat is produced but not delivered.", "fix": ["Check pump power and the relay or controller output that runs it (see the Pump not running tree).", "Check that the zone valve actuator or end switch is opening.", "Check for an air lock, a closed isolation valve or a clogged strainer."] },
    "n7": { "type": "question", "text": "Is the supply-to-return delta-T far below the design delta-T?", "options": [{ "label": "Yes, much lower", "next": "r_lowdt" }, { "label": "No, about normal", "next": "r_load" }] },
    "r_lowdt": { "type": "result", "cause": "Heat is flowing but not transferring to the space.", "fix": ["Use the Readings tab delta-T calculator.", "Check for excess flow, an open bypass, air in terminal units or failed zone valves.", "Check terminal units (fan coils, baseboard) for fan or airflow problems."] },
    "r_load": { "type": "result", "cause": "The plant looks normal; the load may exceed capacity, or setpoints are too low.", "fix": ["Check heating setpoints and the reset curve (Readings tab).", "Check the building side: outside air dampers, air handler coils, envelope problems."] }
  }
}
```

- [ ] **Step 4: Write `data/trees/generic-short-cycling.json`**

```json
{
  "id": "generic-short-cycling",
  "title": "Short cycling",
  "equipment": "Hydronic boilers and systems",
  "generic": true,
  "start": "n1",
  "nodes": {
    "n1": { "type": "question", "text": "Does the boiler shut off on a high-limit or high supply temperature, rather than when the setpoint is satisfied?", "options": [{ "label": "Yes, high limit or high temperature", "next": "n2" }, { "label": "No", "next": "n3" }] },
    "n2": { "type": "question", "text": "Is there good flow while the boiler runs (pump running, valves open, strainer clean)?", "options": [{ "label": "Yes, flow is good", "next": "n2b" }, { "label": "No or unsure", "next": "r_flow" }] },
    "r_flow": { "type": "result", "cause": "Insufficient flow is overheating the boiler.", "fix": ["Check the pump, isolation and zone valves, strainer and air.", "Confirm the boiler's minimum flow requirement in its manual.", "Do not raise or bypass the high limit."] },
    "n2b": { "type": "question", "text": "Is the supply setpoint or reset curve higher than the building load needs?", "options": [{ "label": "Yes", "next": "r_setpt" }, { "label": "No", "next": "r_sensor" }] },
    "r_setpt": { "type": "result", "cause": "The setpoint is too high for the load, so the boiler reaches it quickly and shuts off.", "fix": ["Lower the setpoint or reset curve (Readings tab for a check).", "Review differential and minimum-on-time settings in the control manual.", "Consider the manufacturer's guidance on minimum load or buffer volume."] },
    "r_sensor": { "type": "result", "cause": "Possible sensor or control problem.", "fix": ["Check supply sensor accuracy against a calibrated thermometer and check its wiring.", "Review control differential and anti-cycle settings per the manual.", "Record any codes and look them up in the Fault codes tab."] },
    "n3": { "type": "question", "text": "Does it shut off because the call for heat ends (zone or thermostat satisfied quickly)?", "options": [{ "label": "Yes, the call ends", "next": "n4" }, { "label": "No, it stops with the call still present", "next": "r_interlock" }] },
    "n4": { "type": "question", "text": "Is the heating load small compared with the boiler's minimum output (few zones calling)?", "options": [{ "label": "Yes", "next": "r_oversize" }, { "label": "No", "next": "r_tstat" }] },
    "r_oversize": { "type": "result", "cause": "Boiler minimum output exceeds the load for the zones currently calling.", "fix": ["Check modulation and minimum-fire settings per the manual.", "Consider buffer volume or zoning changes as recommended by the manufacturer."] },
    "r_tstat": { "type": "result", "cause": "Thermostat or zone control cycling.", "fix": ["Check thermostat cycle-rate and anticipator settings and its location.", "Check for zone valve end-switch chatter.", "Check for a thermostat or sensor drifting or reading a draft."] },
    "r_interlock": { "type": "result", "cause": "Cycling is caused by a safety or sensor interlock opening.", "fix": ["Check flame signal, air or flue pressure switch, flow switch and low-water cut-off status per the manual.", "Record any codes and look them up in the Fault codes tab.", "Do not bypass any safety interlock."] }
  }
}
```

- [ ] **Step 5: Write `data/trees/generic-poor-delta-t.json`**

```json
{
  "id": "generic-poor-delta-t",
  "title": "Poor delta-T",
  "equipment": "Hydronic boilers and systems",
  "generic": true,
  "start": "n1",
  "nodes": {
    "n1": { "type": "question", "text": "Is the measured delta-T lower or higher than the target? (Calculate it in the Readings tab.)", "options": [{ "label": "Lower than target", "next": "n2" }, { "label": "Higher than target", "next": "n4" }] },
    "n2": { "type": "question", "text": "Are there open bypasses, over-pumped circuits, or three-way valves stuck in bypass?", "options": [{ "label": "Yes", "next": "r_exc" }, { "label": "No", "next": "n3" }] },
    "r_exc": { "type": "result", "cause": "Excess flow or a bypass is reducing delta-T.", "fix": ["Check pump speed and balancing valve settings against the design flow.", "Check three-way valve actuators and bypass lines.", "Re-measure delta-T after correcting."] },
    "n3": { "type": "question", "text": "Is the load very light (few terminal units calling, mild weather)?", "options": [{ "label": "Yes", "next": "r_light" }, { "label": "No", "next": "r_ht" }] },
    "r_light": { "type": "result", "cause": "Low delta-T from a light load.", "fix": ["Re-check delta-T when more zones are calling or at a colder outdoor temperature.", "Check reset and setpoints for the current weather (Readings tab)."] },
    "r_ht": { "type": "result", "cause": "Terminal units may not be transferring heat.", "fix": ["Check coils, fins and fans for fouling or failure.", "Check control valves are actually opening.", "Check for air binding in terminal units and bleed per the system procedure."] },
    "n4": { "type": "question", "text": "Is the pump running at the expected speed, with all isolation and zone valves open?", "options": [{ "label": "Yes", "next": "r_restrict" }, { "label": "No or unsure", "next": "r_valves" }] },
    "r_valves": { "type": "result", "cause": "Flow is being reduced or blocked.", "fix": ["Check pump speed setting, motor and coupling.", "Open or replace closed or failed isolation and zone valves.", "Check the pump control output."] },
    "r_restrict": { "type": "result", "cause": "Flow is restricted somewhere in the circuit.", "fix": ["Clean strainers and check differential pressure across them.", "Check balancing valves, air elimination and check valves.", "Check for a partly closed or failed valve and for fouled heat exchangers."] }
  }
}
```

- [ ] **Step 6: Write `data/trees/generic-pump-not-running.json`**

```json
{
  "id": "generic-pump-not-running",
  "title": "Pump not running",
  "equipment": "Hydronic boilers and systems",
  "generic": true,
  "start": "n1",
  "nodes": {
    "n1": { "type": "question", "text": "Is there power at the pump terminals when it should be running?", "options": [{ "label": "No power at the pump", "next": "n2" }, { "label": "Power is present", "next": "n3" }] },
    "n2": { "type": "question", "text": "Is the controller or relay calling for the pump (pump output energized)?", "options": [{ "label": "Yes, output is energized", "next": "r_wiring" }, { "label": "No, no call", "next": "r_nocallp" }] },
    "r_wiring": { "type": "result", "cause": "The call is present but power is not reaching the pump.", "fix": ["De-energize and lock out before inspecting wiring.", "Check relay contacts, fuses, breaker, disconnect and wiring.", "Re-test with a meter once safely re-energized per your site procedure."] },
    "r_nocallp": { "type": "result", "cause": "The control is not calling the pump.", "fix": ["Check control settings such as pump exercise, warm-weather shutdown and pump delay (see the manufacturer manual in the Manuals tab).", "Check thermostat and zone calls.", "Check the control for fault codes (Fault codes tab)."] },
    "n3": { "type": "question", "text": "Is the pump motor shaft or fan turning?", "options": [{ "label": "Not turning", "next": "r_seize" }, { "label": "Turning", "next": "r_noflow" }] },
    "r_seize": { "type": "result", "cause": "The motor is energized but not turning.", "fix": ["De-energize and lock out first.", "Check for a seized rotor or bearings, foreign material, and a failed capacitor where applicable, using the pump manufacturer's procedure.", "Replace or repair per the pump manual."] },
    "r_noflow": { "type": "result", "cause": "The pump is turning but there is no flow.", "fix": ["Check the coupling, if the pump is coupled.", "Check for an air lock and bleed the pump per the system procedure.", "Check for closed valves, a damaged impeller, and rotation direction on three-phase pumps."] }
  }
}
```

- [ ] **Step 7: Write `data/trees/generic-boiler-lockout.json`**

```json
{
  "id": "generic-boiler-lockout",
  "title": "Boiler lockout",
  "equipment": "Hydronic boilers and systems",
  "generic": true,
  "start": "n1",
  "nodes": {
    "n1": { "type": "question", "text": "Can you read a fault or lockout code from the boiler display or control?", "options": [{ "label": "Yes, I have a code", "next": "r_code" }, { "label": "No code available", "next": "n2" }] },
    "r_code": { "type": "result", "cause": "A fault code identifies the safety or condition that locked out the boiler.", "fix": ["Record the code and time before resetting.", "Look it up in the Fault codes tab, then confirm in the manufacturer manual (Manuals tab).", "Follow the manufacturer's reset procedure. Repeated lockouts mean the cause must be found, not reset away."] },
    "n2": { "type": "question", "text": "Which safety circuit opened? (Check status indicators per the boiler manual.)", "options": [{ "label": "Flame or ignition failure", "next": "r_ign" }, { "label": "Low water or no flow", "next": "r_water" }, { "label": "High limit or high temperature", "next": "r_limit" }, { "label": "Air pressure, flue or condensate switch", "next": "r_air" }, { "label": "Cannot tell", "next": "r_unknown" }] },
    "r_ign": { "type": "result", "cause": "Ignition or flame failure.", "fix": ["Check gas supply and shutoffs, igniter and flame sensor per the manufacturer's procedure.", "Check vent and combustion air.", "Gas work follows the manufacturer's procedure and local code."] },
    "r_water": { "type": "result", "cause": "Low water or no flow.", "fix": ["Check system pressure, water level or low-water cut-off, and look for leaks.", "Check pump operation and flow switch.", "Do not bypass the low-water cut-off or flow switch."] },
    "r_limit": { "type": "result", "cause": "High limit or high temperature.", "fix": ["Allow the boiler to cool before resetting.", "Check flow, supply sensor accuracy and setpoints.", "Do not raise or bypass the limit."] },
    "r_air": { "type": "result", "cause": "Air pressure, flue or condensate switch is open.", "fix": ["Check vent and intake for blockage, the condensate drain and trap, and the switch tubing per the manual.", "Do not jumper the switch."] },
    "r_unknown": { "type": "result", "cause": "The tripped safety cannot be identified from outside.", "fix": ["Check the boiler manual's status indicator or diagnostics section (Manuals tab: search lockout).", "Check the control for stored fault history.", "Contact the manufacturer support line if the cause is still unclear."] }
  }
}
```

- [ ] **Step 8: Run the data test**

Run: `npx vitest run tests/data-trees.test.js`
Expected: PASS (five files found, all valid, ids match filenames).

- [ ] **Step 9: Write `app/src/tabs/diagnose.js`**

```js
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
  const picker = h('div', { class: 'card' }, h('h2', {}, 'Diagnose'), h('p', { class: 'empty' }, 'Pick the problem, then answer each question.'));
  for (const tree of trees) {
    picker.append(
      h('button', { type: 'button', class: 'choice', onclick: () => start(tree) },
        tree.title,
        tree.generic ? h('span', { class: 'badge' }, 'generic') : null,
        tree.equipment ? h('span', { class: 'badge' }, tree.equipment) : null,
      ),
    );
  }

  function start(tree) {
    const session = createSession(tree);
    const draw = () => {
      clear(body);
      const node = session.current();
      const trail = session.path();
      const card = h('div', { class: 'card' }, h('h2', {}, tree.title, tree.generic ? h('span', { class: 'badge' }, 'generic guidance') : null));
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
          node.source ? h('p', {}, h('a', { href: pdfHref(node.source), target: '_blank', rel: 'noopener' }, `Manual: ${node.source.doc}, page ${node.source.page}`)) : null,
        );
      }
      card.append(
        h('div', {},
          h('button', { type: 'button', class: 'secondary', onclick: () => { session.back(); draw(); } }, 'Back'),
          h('button', { type: 'button', class: 'secondary', onclick: () => { session.restart(); draw(); } }, 'Start over'),
          h('button', { type: 'button', class: 'secondary', onclick: () => { clear(body); body.append(picker); } }, 'Choose another problem'),
        ),
      );
      body.append(card);
    };
    draw();
  }

  body.append(picker);
  root.append(body);
}
```

- [ ] **Step 10: Register the tab in `app/src/main.js`**

Add the import and make `diagnose` the first (default) tab:

```js
import { renderDiagnose } from './tabs/diagnose.js';
```

```js
const TABS = [
  { id: 'diagnose', label: 'Diagnose', render: renderDiagnose },
  { id: 'readings', label: 'Readings', render: renderReadings },
  { id: 'faultcodes', label: 'Fault codes', render: renderFaultCodes },
  { id: 'manuals', label: 'Manuals', render: renderManuals },
];
```

- [ ] **Step 11: Build and verify in the browser**

Run: `npm run build`; expected `5 trees` in the summary line. Open `app/index.html`. Verify:
1. Diagnose is the first tab and lists five problems, each with a "generic" badge.
2. "No heat" then "Yes, call is present" then "Yes" ... reaches a result with a cause and a fix list; Back and Start over work; "Choose another problem" returns to the list.
3. The footer safety text is visible on every tab.

- [ ] **Step 12: Commit (only if a git repo exists)**

```bash
git add app/src/tabs/diagnose.js app/src/main.js data/trees tests/data-trees.test.js
git commit -m "feat: diagnose tab and generic hydronic decision trees"
```

---

### Task 14: Tekmar content from the manuals

This task needs the 31 Tekmar PDFs on the machine doing the work. Do it after the PDFs are copied to `pdfs/tekmar/`. Fault codes and manufacturer-specific tree branches are transcribed from the manuals, never written from memory.

**Files:**
- Create: `build/find-fault-pages.js`, `data/fault-codes/tekmar.json`, `data/trees/tekmar-<control>.json` (one per tekmar control that has a troubleshooting flow)
- Test: `tests/find-fault-pages.test.js`

**Interfaces:**
- Produces from `find-fault-pages.js`: `scoreFaultPages(pages, topPerDoc = 15) -> [{manufacturer, doc, page, score}]` grouped by document and sorted by score descending; `npm run find-fault-pages` prints them using `build/.cache/pages.json`.
- Fault code entry shape and tree shape are the ones in Tasks 5 and 7.

- [ ] **Step 1: Write the failing test**

```js
// tests/find-fault-pages.test.js
import { describe, it, expect } from 'vitest';
import { scoreFaultPages } from '../build/find-fault-pages.js';

const mk = (doc, page, text) => ({ manufacturer: 'tekmar', doc, page, text });

describe('scoreFaultPages', () => {
  const pages = [
    mk('a.pdf', 1, 'Welcome to the product. Installation overview.'),
    mk('a.pdf', 2, 'Error codes: Error 1 sensor fault. Fault display flashes. Lockout alarm. Reset the control. Error 2 fault.'),
    mk('a.pdf', 3, 'One error mentioned here.'),
    mk('b.pdf', 1, 'Troubleshooting guide: fault code table, LED flashes, alarm, error, lockout, reset.'),
  ];
  it('ranks dense fault pages first within each document', () => {
    const r = scoreFaultPages(pages);
    const a = r.filter((x) => x.doc === 'a.pdf');
    expect(a[0].page).toBe(2);
  });
  it('drops pages below the minimum score', () => {
    const r = scoreFaultPages(pages);
    expect(r.some((x) => x.doc === 'a.pdf' && x.page === 1)).toBe(false);
  });
  it('limits results per document', () => {
    expect(scoreFaultPages(pages, 1).filter((x) => x.doc === 'a.pdf')).toHaveLength(1);
  });
  it('handles no pages', () => expect(scoreFaultPages([])).toEqual([]));
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/find-fault-pages.test.js`
Expected: FAIL (module not found).

- [ ] **Step 3: Write `build/find-fault-pages.js`**

```js
// build/find-fault-pages.js
// Ranks pages likely to hold fault-code tables or troubleshooting flows, to speed up transcription.
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const STRONG = /\b(error|fault|lockout|alarm|trouble\w*|diagnos\w*)\b/gi;
const WEAK = /\b(code|display|led|flash\w*|blink\w*|reset)\b/gi;
const MIN_SCORE = 6;

const count = (re, s) => (s.match(re) || []).length;

export function scoreFaultPages(pages, topPerDoc = 15) {
  const byDoc = new Map();
  for (const p of pages) {
    const score = count(STRONG, p.text) * 3 + count(WEAK, p.text);
    if (score < MIN_SCORE) continue;
    const key = `${p.manufacturer}/${p.doc}`;
    if (!byDoc.has(key)) byDoc.set(key, []);
    byDoc.get(key).push({ manufacturer: p.manufacturer, doc: p.doc, page: p.page, score });
  }
  const out = [];
  for (const list of byDoc.values()) {
    list.sort((a, b) => b.score - a.score || a.page - b.page);
    out.push(...list.slice(0, topPerDoc));
  }
  return out;
}

const isMain = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
if (isMain) {
  const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
  const pages = JSON.parse(await fs.readFile(path.join(root, 'build', '.cache', 'pages.json'), 'utf8'));
  for (const r of scoreFaultPages(pages)) console.log(`${r.manufacturer}/${r.doc}  page ${r.page}  score ${r.score}`);
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/find-fault-pages.test.js`
Expected: PASS.

- [ ] **Step 5: Index the real manuals**

Copy the 31 PDFs into `pdfs/tekmar/` (subfolders allowed).
Run: `npm run build`
Expected: `Build complete: 31 documents, ...`. Read any "could not be read" or "no extractable text" warnings. If any PDF fails, stop and report which ones before continuing. Note the printed index size (the build warns above 80 MB).

- [ ] **Step 6: Locate fault code and troubleshooting pages**

Run: `npm run find-fault-pages`
Expected: a list of `tekmar/<doc>  page N  score S` lines. Open the top pages for each control (click through from the Manuals tab or open the PDFs) and identify the fault-code or error tables and the troubleshooting flowcharts.

- [ ] **Step 7: Transcribe fault codes into `data/fault-codes/tekmar.json`**

For each fault or error code in a tekmar manual, add one entry exactly as the manual describes it:

```json
{
  "manufacturer": "tekmar",
  "model": "<the control model exactly as named in the manual>",
  "code": "<the code or display text exactly as shown in the manual>",
  "meaning": "<the manual's meaning, copied or closely paraphrased>",
  "causes": ["<causes listed in the manual, if any>"],
  "checks": ["<checks or actions listed in the manual, if any>"],
  "source": { "manufacturer": "tekmar", "doc": "<path of the PDF under pdfs/tekmar, with forward slashes>", "page": 0 }
}
```

The `page` must be the real page number where the entry appears in that PDF (replace the `0`; the validator rejects anything below 1 or beyond the document). Use empty arrays for `causes` or `checks` when the manual lists none. Do not add codes that are not in the manuals.

- [ ] **Step 8: Add tekmar-specific decision trees**

For each tekmar control whose manual has a troubleshooting flow (for example "no heat", "pump does not run", "sensor fault"), add `data/trees/tekmar-<control>.json` in the same shape as the generic trees, with `"generic": false`, the control named in `equipment`, and each manual-derived result carrying a `source` of `{ "manufacturer": "tekmar", "doc": "<pdf path>", "page": <n> }`. Follow the manual's own sequence of checks. The file name must equal `<id>.json`.

- [ ] **Step 9: Validate and test**

Run: `npm run validate`
Expected: `Data files are valid.` Fix every reported problem (wrong page, mistyped doc path, duplicate code, unreachable node) and re-run until it passes.
Run: `npx vitest run`
Expected: all PASS (the shipped-trees test also checks the new tekmar trees).
Run: `npm run build`, open the app, and spot-check five fault codes: each one's text matches its manual page, and the Manual link opens that exact page.

- [ ] **Step 10: Commit (only if a git repo exists)**

```bash
git add build/find-fault-pages.js tests/find-fault-pages.test.js data/fault-codes data/trees
git commit -m "feat: tekmar fault codes and troubleshooting trees from manuals"
```

---

### Task 15: README and final check

**Files:**
- Create: `README.md`

- [ ] **Step 1: Write `README.md`**

````markdown
# HVAC Troubleshooter

An offline, no-AI tool for troubleshooting commercial hydronic HVAC equipment. Open it in Chrome or Edge on a laptop.

Tabs: **Diagnose** (decision trees), **Readings** (delta-T, outdoor reset, superheat/subcooling), **Fault codes**, **Manuals** (full-text search that opens the PDF at the right page).

It gives suggestions only. Always follow the manufacturer's procedures, lockout/tagout and refrigerant-handling rules, and never bypass a safety device.

## First-time setup

Requires Node 20 or newer.

```
npm install
```

## Using it

1. Put manuals in `pdfs/<manufacturer>/` (for example `pdfs/tekmar/`). Subfolders are fine. The `pdfs` folder is not stored in git.
2. Run `npm run build`.
3. Open `app/index.html` in Chrome or Edge (double-click it, or `start app\index.html`). Keep the `pdfs` folder next to `app`; the manual links point to it.

Run `npm run build` again whenever you add manuals or change anything in `data/`.

## Adding a manufacturer

1. Drop its PDFs in `pdfs/<manufacturer>/` and run `npm run build`. The manuals are searchable immediately.
2. Add fault codes to `data/fault-codes/<manufacturer>.json` (an array of entries; see `data/fault-codes/tekmar.json`). `npm run find-fault-pages` lists the pages most likely to hold fault tables.
3. Add decision trees to `data/trees/<id>.json` (the file name must equal the tree `id`).
4. Run `npm run validate`. It checks every citation against the indexed manuals: wrong page numbers and misspelled document names are reported.

Fault code meanings and manufacturer procedures must come from the manuals. Each entry cites `{manufacturer, doc, page}`.

## Refrigerant PT tables

`data/pt/*.json` holds the pressure-temperature tables used for superheat and subcooling. R-410A and R-32 are generated with `python build/gen-pt-tables.py` (needs `pip install CoolProp`). R-454B and any other refrigerant are transcribed from the manufacturer's published chart into `data/pt-sources/<name>.csv` and converted with `node build/import-pt-csv.js <name> "<source description>"`. Pressures are psig at sea level.

## Limits

- The reset calculator is a linear approximation. Use the control manual's own curve for exact values.
- Target ranges (delta-T, superheat, subcooling) are entered by you from the data plate or manual. None are assumed.
- Generic decision trees are standard practice and are labelled "generic". They are not manufacturer content.
- Image-only (scanned) PDF pages are not searchable.

## Development

`npm test` runs the unit tests. Logic lives in `src/lib/` (tested); `app/src/` is thin UI code; `build/` turns PDFs and data into `app/dist/`.
````

- [ ] **Step 2: Full verification**

Run: `npm test`
Expected: every test file PASS, exit code 0.
Run: `npm run validate`
Expected: `Data files are valid.`
Run: `npm run build`
Expected: `Build complete: ...` with no errors.

Manual check on the laptop, opening `app/index.html` from disk in Chrome and then Edge:
1. All four tabs render with the data loaded (no "App data not found" message).
2. A Manuals search returns tekmar pages and the link opens the PDF at the right page.
3. A fault code from `tekmar.json` is found by code and by keyword.
4. The Diagnose, Readings and footer safety text all display.
5. Disconnect the network (airplane mode) and repeat steps 1 to 3: everything still works.

- [ ] **Step 3: Commit (only if a git repo exists)**

```bash
git add README.md
git commit -m "docs: README"
```

---

## Self-Review

**Spec coverage**
- 4.1 Manuals: Tasks 6 (search, snippets, `pdfHref`), 8 (extraction, index), 10 (tab).
- 4.2 Fault codes: Task 7 (search, validation), 12 (tab), 14 (Tekmar content from the manuals).
- 4.3 Diagnose: Task 5 (engine), 13 (tab, five generic trees), 14 (Tekmar branches).
- 4.4 Readings: Task 2 (hydronic), 3 (reset), 4 (PT tables, superheat, subcooling, interpretation), 11 (tab and form wrappers).
- Section 5 layout, section 6 data flow, section 7 content rules: Tasks 1, 8, 9, and the Global Constraints; the validator enforces citations.
- Section 8 testing: calculator tests (Tasks 2 to 4, 11), PT spot checks (Task 4 steps 9 to 11), data validation (Task 9), build script test on a sample PDF (Task 8), full run on the real PDFs (Task 14).
- Open item "extraction library": pdfjs-dist 4.x chosen and exercised in Task 8 and against the real PDFs in Task 14 step 5. Open item "refrigerants": R-410A, R-32, R-454B in Task 4.
- Safety note: footer text in `index.html` (Task 10), reset-card and refrigerant-card notes (Task 11), result text in the trees (Task 13).

**Placeholder scan:** No TBD or TODO. Task 14 intentionally contains a fault-code entry template (with `<...>` values and `page: 0`) because those values must come from the manuals the implementer reads; the validator rejects `page: 0`, so an unfilled entry cannot pass the build.

**Type consistency:** `satTemp`/`satPressure` phases are `'bubble'|'dew'` everywhere; `superheat`/`subcooling` take `{suctionPsig, suctionLineF}` and `{liquidPsig, liquidLineF}` consistently in Tasks 4 and 11; manifest entries are `{manufacturer, doc, pages}` in Tasks 7, 8, 9; `source` is `{manufacturer, doc, page}` in Tasks 5, 7, 9, 13, 14; tab modules export `render<Name>(root, ctx)` with `ctx = {data, searchIndex, tables}` in Tasks 10 to 13.

**Review Focus coverage:** empty or missing pdfs folder (Task 8 tests); corrupt PDF (Task 8 test); blank, junk and comma-decimal input and out-of-range pressure (Tasks 4 and 11 tests); special-character filenames (Task 6 `pdfHref` tests); fault code query oddities (Task 7 tests).
