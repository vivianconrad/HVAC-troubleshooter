# HVAC Troubleshooter

An offline, no-AI tool for troubleshooting commercial hydronic HVAC equipment. Open it in Chrome or Edge on a laptop.

Tabs: **Diagnose** (decision trees), **Readings** (delta-T, outdoor reset, superheat/subcooling), **Fault codes**, **Manuals** (full-text search that opens the PDF at the right page).

It gives suggestions only. Always follow the manufacturer's procedures, lockout/tagout and refrigerant-handling rules, and never bypass a safety device.

## Status

Done: the four tabs, the calculators, the build and validation scripts, five generic hydronic decision trees, and the unit tests.

Still owed:

1. **Manuals, fault codes and Tekmar trees.** Keep manuals in `pdfs/<manufacturer>/` (for example, `pdfs/tekmar/`); PDFs in `pdfs/` are tracked in git. Run `npm run build`, then `npm run find-fault-pages` to locate the fault-code tables. Then transcribe the fault codes into `data/fault-codes/tekmar.json` and the Tekmar decision trees into `data/trees/`. The five generic trees are standard practice and are labelled "generic"; they should still be reviewed by someone qualified.
2. **Refrigerant PT tables.** `data/pt/` does not exist yet, so the Readings tab shows "no refrigerant pressure-temperature tables" in the refrigerant card. Generate and verify them (see below).
3. **Browser checks.** Click through all four tabs in a real browser (Chrome and Edge), with the network disconnected as well.
4. **package-lock.json.** package-lock.json has no `resolved` URLs, so clones can run `npm ci` from any registry. A later `npm install` on a machine whose .npmrc points at a private registry may re-add private URLs; do not commit that change.

## First-time setup

Requires Node 20 or newer.

```
npm install
```

## Using it

1. Put manuals in `pdfs/<manufacturer>/` (for example `pdfs/tekmar/`). Subfolders are fine. PDFs in `pdfs/` are stored in git and available when the repository is cloned.
2. Run `npm run build`.
3. Open `app/index.html` in Chrome or Edge (double-click it, or `start app\index.html`). Keep the `pdfs` folder next to `app`; the manual links point to it.

Run `npm run build` again whenever you add manuals or change anything in `data/`.

Other commands: `npm test` (unit tests), `npm run validate` (check data files), `npm run build:index` (rebuild only the search index), `npm run find-fault-pages` (rank pages likely to hold fault tables).

## GitHub Pages

Every push to `main` runs `.github/workflows/pages.yml`, which tests, builds, and publishes `app/` and `pdfs/` to GitHub Pages at https://vivianconrad.github.io/HVAC-troubleshooter/. One-time setup: in the repo, go to Settings > Pages and set Source to "GitHub Actions". The site publishes only the PDFs in `pdfs/`, publicly. The workflow first removes non-PDF files, `pdfs/XYLEM/FLOW METER RENTAL/` and the B&G price list from the CI checkout (they stay in git and in your local build). To keep another file off the site, add a line to the "Remove files that must not be published" step.

## Adding a manufacturer

1. Drop its PDFs in `pdfs/<manufacturer>/` and run `npm run build`. The manuals are searchable immediately.
2. Add fault codes to `data/fault-codes/<manufacturer>.json` (an array of entries, shaped like the example below). `npm run find-fault-pages` lists the pages most likely to hold fault tables.
3. Add decision trees to `data/trees/<id>.json` (the file name must equal the tree `id`).
4. Run `npm run validate`. It checks every citation against the indexed manuals: wrong page numbers and misspelled document names are reported.

Fault code meanings and manufacturer procedures must come from the manuals. Each entry cites `{manufacturer, doc, page}`. Real entries must be transcribed from the manufacturer's manuals; the source of every entry is checked against the indexed PDFs by `npm run validate` and `npm run build`.

EXAMPLE of one fault-code entry (fictional values, do not copy):

```json
{
  "manufacturer": "ExampleCo",
  "model": "EX-100",
  "code": "E99",
  "meaning": "Example meaning (fictional)",
  "causes": ["Example cause one", "Example cause two"],
  "checks": ["Example check one", "Example check two"],
  "source": { "manufacturer": "ExampleCo", "doc": "EX-100 Installation Manual.pdf", "page": 12 }
}
```

## Refrigerant PT tables

`data/pt/*.json` holds the pressure-temperature tables used for superheat and subcooling. Until it exists, the refrigerant card says no tables are installed. Pressures are psig at sea level.

Generate R-410A, R-32 and R-454B with Python and CoolProp:

```
pip install CoolProp
python build/gen-pt-tables.py
```

CoolProp may not provide a wheel for the newest Python (3.14 failed here); use Python 3.11 or 3.12 in a venv.

R-410A and R-32 are computed as pure/pseudo-pure fluids. R-454B is computed as a CoolProp HEOS mixture of R-32/R-1234yf at 68.9/31.1 mass percent (the nominal composition). That R-454B table is computed, NOT a manufacturer chart. Compare it against the published manufacturer chart (Chemours Opteon XL41) before field use.

To use a transcribed manufacturer chart instead (or for any other refrigerant), put it in `data/pt-sources/<name>.csv` and convert it with:

```
node build/import-pt-csv.js <name> "<source description>"
```

After generating the tables, a data test should be added that checks them against published chart values. This is left for a person to decide and write.

## Limits

- The reset calculator is a linear approximation. Use the control manual's own curve for exact values.
- Target ranges (delta-T, superheat, subcooling) are entered by you from the data plate or manual. None are assumed.
- Generic decision trees are standard practice and are labelled "generic". They are not manufacturer content.
- Image-only (scanned) PDF pages are not searchable.

## Development

`npm test` runs the unit tests. Logic lives in `src/lib/` (tested); `app/src/` is thin UI code; `build/` turns PDFs and data into `app/dist/`.
