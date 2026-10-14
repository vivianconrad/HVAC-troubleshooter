# HVAC Troubleshooter - Design Spec

Date: 2026-10-13
Status: Draft for review

## 1. Purpose

A laptop-based, offline tool for live troubleshooting of commercial hydronic HVAC equipment that uses no AI. It replaces the current habit of asking ChatGPT mid-job by providing:

1. Guided diagnosis from a symptom.
2. Interpretation of field readings.
3. Fault code lookup.
4. Reference lookup in the manufacturers' own manuals.

Success means: during a job, the user can reach a likely cause, a calculated result or a manual page in a few clicks, with every answer traceable to a formula, a data file entry or a manual page. No network or AI service is needed at runtime.

## 2. Context and constraints

- Used on a laptop (Windows), opened in Chrome or Edge.
- Equipment is commercial HVAC, hydronic-leaning. The Bornquist line card (a Chicago hydronic rep the user works with) includes Tekmar, Aerco, McDonnell Miller, Sellers, Danfoss (drives and valves), Panasonic (mini-split and VRF), Galletti (air-to-water heat pumps), Bell & Gossett and Goulds.
- Available manuals today: 31 text-based (not scanned) PDFs, 106 MB, all Tekmar. More manufacturers may be added later.
- The PDFs live on another device. They are not in the project and are git-ignored (size).
- The project will be a new, separate repo, uploaded to GitHub by the user. It is not part of the Unified Design System repo.

Assumptions (from the conversation, correct if wrong): runtime is fully offline; the tool suggests causes and does not replace manufacturer procedures.

## 3. Approach

A static offline web app: a folder opened in the browser, no server and no install. A one-time Node build script turns the PDFs into a search index. Chosen over a local server (extra launch step) and a desktop app (heavy, not needed).

## 4. Modules

### 4.1 Manuals (search)
- Full-text search over all PDFs using MiniSearch in the browser (ranked results, typo tolerance, filter by manufacturer).
- Each result shows the matching passage, manufacturer, document and page number, and opens the PDF at that page (`file.pdf#page=N`).
- Manufacturer is derived from the folder name: `pdfs/<manufacturer>/<file>.pdf`.

### 4.2 Fault codes
- One JSON format for any manufacturer: manufacturer, model or controller, code, meaning, common causes, suggested checks, source document and page.
- Searchable and filterable by manufacturer and model.
- Version 1 content: Tekmar, taken from the supplied manuals. Other manufacturers are not filled in until their manuals exist.

### 4.3 Diagnose (decision trees)
- A small tree engine: a node is a question (yes/no or a numeric check) or a result (likely cause, fix, source page). Trees are JSON files.
- Version 1 content: generic hydronic trees (no heat, short cycling, poor delta-T, pump not running, boiler lockout), marked "generic", plus Tekmar-specific branches taken from the manuals.
- Each node can link to a manual page.

### 4.4 Readings (calculators)
- Hydronic: delta-T, flow and heat output (GPM and BTU/h), boiler reset-curve check against supply temperature and outdoor temperature.
- Refrigerant (for the Panasonic and Galletti heat pump lines): superheat and subcooling using PT tables for common refrigerants (R-410A, R-32, R-454B, others as supplied). The PT table source is recorded in the data file.
- Results are compared to target ranges held in data files and flagged with the usual meaning (for example high superheat with low subcooling).

## 5. Project layout

```
hvac-troubleshooter/
  pdfs/<manufacturer>/        manuals (git-ignored)
  data/                       fault codes, decision trees, PT tables, target ranges (JSON)
  build/                      PDF-to-index build script, data validation script
  app/                        static site (HTML, CSS, JS, generated index.json)
  docs/superpowers/specs/     this spec
```

## 6. Data flow

1. User places PDFs in `pdfs/<manufacturer>/`.
2. `npm run build` extracts text page by page, writes `app/index.json` and a page map, and copies or links the PDFs for the app.
3. The app loads the index and the `data/` JSON at startup and runs entirely in the browser.
4. Adding a manufacturer later: add its PDFs, re-run the build (manuals searchable immediately), then add its fault codes and trees to `data/`.

## 7. Content rules

- Fault code meanings and manufacturer procedures come only from the supplied manuals. They are not written from memory.
- Generic hydronic trees come from standard published practice and are labelled "generic".
- Anything involving refrigerant handling or electrical work links to the manufacturer's own procedure and does not give steps of its own.

## 8. Testing

- Unit tests for every calculator against known reference values (highest priority: wrong numbers on a job are the main risk).
- PT table spot checks against published reference points.
- A data validation script: broken node links, missing result nodes, page numbers beyond the document length, unknown manufacturers.
- Build script test on a sample PDF; full run on the 31 Tekmar PDFs once available.

## 9. Out of scope for version 1

- Any AI or language-model features.
- Fault codes, trees or procedures for manufacturers without supplied manuals.
- Phone or tablet layouts, accounts, cloud sync, and saving job history.
- Chillers and rooftop-unit specific content (no manuals supplied).

## 10. Open items

- Exact PDF text extraction library (to be chosen in the plan, tested on the real Tekmar files).
- Which refrigerants beyond R-410A, R-32 and R-454B are needed.
