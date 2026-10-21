# HVAC Troubleshooter

An offline, no-AI tool for troubleshooting commercial hydronic HVAC equipment. Open it in Chrome or Edge on a laptop.

It is built for remote support: talking an on-site tech through a problem by phone or video, and troubleshooting the third-party brands whose manuals are in `pdfs/` (AERCO, B&G/Xylem, Bock, Cemline, Danfoss, Hyfab, McDonnell & Miller, Tekmar, Wessels, WEG). It is not a general boiler troubleshooting guide. Questions are worded as "ask the tech to...".

Tabs: **Diagnose** (decision trees, grouped by manufacturer), **Readings** (delta-T, outdoor reset, superheat/subcooling), **Fault codes**, **Manuals** (full-text search that opens the PDF at the right page).

It gives suggestions only. Always follow the manufacturer's procedures, lockout/tagout and refrigerant-handling rules, and never bypass a safety device.

## Status

Done: the four tabs, the calculators, the build and validation scripts, 29 decision trees, 457 fault codes, and the unit tests.

Decision trees (`data/trees/`), by brand:

- **AERCO:** Benchmark E startup, ignition/airflow/high-water-temp faults, external interlock. Cited to the Benchmark 5000-6000 manual and the Benchmark E startup form.
- **B&G (Xylem):** pump startup readiness (cited), Ecocirc E02 and E06 (field-derived, no manual).
- **Bock:** OptiTherm maintenance and tank warranty claim (from a spreadsheet and Word file, so not cited).
- **Cemline:** unfired steam generator symptoms, cited to the manual's troubleshooting table.
- **Danfoss:** startup cheat sheet and bypass terminals (Word file, not cited), unknown "FA04" code (field-derived).
- **Hyfab:** booster pump startup check-through, cited.
- **McDonnell & Miller:** Series 47 feeder, Series 63 LWCO, Guard Dog / FPC-1000 probe controls, WFE Uni-Match feeder (all cited), and a boiler-won't-fire LWCO triage (field-derived).
- **Tekmar:** outdoor temperature (256/274), 274 staging, 274 DHW, 360/356 mixing (cited); 671 open circuit and heat-not-on (field-derived).
- **Wessels:** replacement bladder kit lookup, cited.
- **WEG (via Xylem):** motor no-fault warranty claim, cited.
- **General:** five generic hydronic trees (no heat, short cycling, lockout, poor delta-T, pump not running), shown last.

Trees marked "generic" are not manufacturer content. That covers the five general trees and the field-derived drafts above, which come from field notes and need a manual page before they are promoted.

Still owed:

1. **More fault codes.** Done so far: Tekmar error messages for models 132, 254, 255, 256, 261, 265, 274, 284, 294, 354, 356, 360, 374, 401, 403, 420, 519, 528, 552, 563, 654, 661, 664, 665, 670 and 680 (one `data/fault-codes/tekmar-<model>.json` each, plus `tekmar.json`); AERCO Benchmark 5000-6000 (Table 5-1) and Innovation (Table 7-1); McDonnell & Miller Guard Dog and FPC-1000 LED blink codes. Where a Tekmar manual prints its error headings as graphics, the code name was written from the manual's own description. Still to do: Tekmar 304, 316 and T090 (no error messages found), the AERCO Benchmark 750-3000 and Boiler Management System manuals, and Danfoss. Run `npm run find-fault-pages` to locate tables. No B&G Ecocirc manual is in `pdfs/` yet, so E02 and E06 stay field-derived.
2. **Citations for the field-derived trees.** Add the Ecocirc and Tekmar 671 manuals, then replace the draft wording with cited steps.
3. **Refrigerant PT tables.** `data/pt/` does not exist yet, so the Readings tab shows "no refrigerant pressure-temperature tables" in the refrigerant card. Generate and verify them (see below).
4. **Browser checks.** Click through all four tabs in a real browser (Chrome and Edge), with the network disconnected as well.
5. **package-lock.json.** package-lock.json has no `resolved` URLs, so clones can run `npm ci` from any registry. A later `npm install` on a machine whose .npmrc points at a private registry may re-add private URLs; do not commit that change.

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
3. Add decision trees to `data/trees/<id>.json` (the file name must equal the tree `id`). Set `"manufacturer"` (for example `"Tekmar"`) so the Diagnose tab groups the tree under that brand; trees without it appear last under general guidance. Each result can cite `{manufacturer, doc, page}`, where `page` is the PDF page index. Only PDFs are indexed, so Word and Excel files cannot be cited. A tree with any citation must not be marked `"generic": true`.
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
- Trees labelled "generic" are standard practice or field-derived drafts, not manufacturer content. Verify them against the manual before relying on them.
- Field-derived trees come from notes of past cases. Observed sequences (for example a setting change followed by an alarm clearing) are correlations, not root causes.
- Image-only (scanned) PDF pages are not searchable.

## Development

`npm test` runs the unit tests. Logic lives in `src/lib/` (tested); `app/src/` is thin UI code; `build/` turns PDFs and data into `app/dist/`.
