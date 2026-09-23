# MT 360 — Modern Trade Intelligence Dashboard

Full 17-page dashboard (18 with Data Health), built with realistic mock data matching
your real fields. This is your working codebase for the 15-day plan.

## What's new in this version

- **Login** — session-based, single shared password via `APP_PASSWORD` env var. Gates
  every page and every `/api/*` route. If `APP_PASSWORD` isn't set, login is skipped
  (convenient for local dev only — always set it in Render).
- **Header aliases** — real Excel exports rarely match your exact column names. The
  server now matches common variants ("Sales", "Net Sales", "Sales Amount" all map to
  `salesValue`, etc.) — see `ALIASES` in `server.js`.
- **Date parsing fix** — Excel date cells (not just text) are now correctly normalized
  to `YYYY-MM`. Previously a real date-typed Month column would have silently broken
  every year-over-year comparison.
- **"Not Active LY" instead of misleading 0.0%** — every growth/YoY figure now clearly
  says "Not Active LY" when there's no prior-year data, instead of a confusing zero.
- **NOD formula standardized** — Number of Days of stock cover is never computed by
  averaging individual NOD values. It's always: total stock ÷ trailing-3-month average
  sales, at whatever level you're looking (one row, one store, one chain, everything).
- **Dynamic filter options** — dropdowns (Region, Chain, Category, etc.) are now built
  from your actual loaded data, not the hard-coded placeholder lists in `schema.js`.
- **Caching + Refresh button** — data is cached for `CACHE_MINUTES` (default 10); the
  Refresh button in the top filter bar clears it and re-fetches immediately.
- **Data Health page** — row counts, months found, unmatched columns, missing fields,
  and blank-code checks for your live file. Sidebar → Data Health.
- **Loading / timeout / retry** — a 25-second fetch timeout with a clear error message,
  a "this is taking a while" notice after 8 seconds, and a Retry button on failure.
- **`render.yaml`** — deploy settings live in the repo. Render will prompt you to fill
  in `ONEDRIVE_EXCEL_URL` and `APP_PASSWORD` (marked `sync: false` so they're never
  committed); `SESSION_SECRET` auto-generates.

## What's inside

- **18 pages**: Executive 360, Sales Analysis, Retailer/Geography/Store/SKU 360,
  Availability/OOS, Inventory/Distribution 360, Assortment, Pricing & Promotion,
  Variance, Pareto, Store Performance Matrix, SKU × Store Opportunity Engine,
  Growth Simulator, Action Center, and Data Health.
- **One formula layer** (`src/data/metrics.js`) — every KPI on every page traces back
  to a single function here.
- **One data pipeline** (`server.js` `/api/data`) — fetches your OneDrive Excel,
  applies header aliases, parses dates, and returns clean JSON. The link never
  reaches the browser.
- **Mock data generator** (`src/data/generateMockData.js`) — ~36,000 realistic rows
  across 24 months, with genuine OOS events, excess/dead stock, and stock-count
  variances baked in.

## Running it locally

```bash
npm install
cp .env.example .env   # fill in ONEDRIVE_EXCEL_URL, APP_PASSWORD if you want login locally
npm run build
npm start
```
Visit `http://localhost:3000`. Plain `npm run dev` (Vite dev server) always uses mock
data, since `/api/data` only exists when the Express server (`npm start`) is running.

## Deploying to Render

`render.yaml` is already set up. On Render: New → Blueprint → connect the repo → it
reads `render.yaml` automatically. You'll be prompted to fill in `ONEDRIVE_EXCEL_URL`
and `APP_PASSWORD` in the dashboard — never commit these.

## Adjusting business thresholds

`src/data/schema.js` → `THRESHOLDS`: `NOD_LOW`/`NOD_HIGH` (Low/Excess Stock cutoffs),
`VARIANCE_ALERT_PCT`, `HIGH_DISCOUNT_PCT`. Change once here, every page updates.

## Fixed since the last pilot review

- **NOD formula standardization is now actually complete everywhere.** `ActionCenter`,
  `ExecutiveOverview` and `Availability` were still using an old single-month
  `salesQty / 30` rate for their "excess stock" counts, while every other page had
  already moved to the trailing-3-month `calcNOD()`/`avgNOD()` rule. A SKU could
  show as excess on one page and not another. All three now call the same
  standardized functions, so the number is identical wherever it's shown.
- **One what-if engine, not three.** `GrowthSimulator` and Decision Center's
  "What-If Quick Test" used to run independent formulas with different multipliers
  (e.g. 0.6 vs 0.55 on distribution lift), so the same lever gave two different ₹
  numbers depending on which page you tried it on. `GrowthSimulator` now calls the
  same `buildScenario()` function Decision Center uses, and its sliders use the
  same % semantics — the two pages will always agree.
- **Action Center no longer duplicates detection logic.** It used to run its own
  parallel OOS/excess-stock/variance detectors (with the old NOD formula above).
  It now reads from the same `buildDecisionSet()` engine as Decision Center and
  Analyst, and is scoped as the lightweight "tick it off" checklist view —
  Decision Center remains the governed workflow with root cause, confidence,
  owner/deadline and accept/modify/reject. Cleared items persist locally
  (`mt360_action_done_v1`) independent of the Decision Center audit trail.
- **Decision History no longer uses `prompt()`/`confirm()` for outcome capture.**
  Actual ₹ Impact and Outcome/Learning are now inline-editable fields in the table.
  The log can also be exported as CSV or JSON, and a JSON export can be re-imported
  (merged by decision id) — cheap insurance against losing pilot data if the
  browser's localStorage is cleared, since it isn't backed by a database yet.
- **Analyst is repositioned honestly** as guided, rule-based Q&A over the Decision
  Engine — not a natural-language interface — and its keyword coverage was
  broadened (variance, margin/promo, target gap, in addition to the original set).
  It also had a real bug: it was calling the root-cause engine with only the
  current month's filtered records, so the engine had no prior-month data to
  compare against and would report every SKU as a fake "+100% vs 0" grower instead
  of genuine month-over-month movement. It now passes the full dataset and
  filters, matching Decision Center and Root Cause Analytics.

## Known limitations / what's queued next

- **The EKA-style filter and table overhaul is not yet ported.** This is the biggest
  remaining piece: multi-select checkbox filters with search and shift-click ranges,
  a column picker with drag-to-reorder, a persisted Qty/Value toggle, click-through
  drill-down modals (chart bar → SKU-to-stores view). Current filters are
  single-select dropdowns only. (Decision History now has CSV/JSON export, but no
  other table does yet.)
- **NOD/Stock Health derived filters** (`<15`/`15-30`/`31-60`/`>60` days bucket, and
  Dead/Slow/Healthy stock health) exist as formulas (`nodBucket()`, `stockHealthFlag()`
  in `metrics.js`) but aren't yet wired up as filter UI — currently only shown as
  status badges and Inventory-page quadrant buttons.
- No ₹ trade spend (estimated from Promos % instead), no shade/variant-level
  analysis, no SKU lifecycle staging, no competitor/execution data — out of scope
  per the original data fields available.
- The Opportunity Engine score is a v1 heuristic — validate against real outcomes
  before trusting the numbers.
- The Decision Center / Action Center / Decision History log is still local-only
  (`localStorage`), just with export/import as a stopgap. Moving it to a shared
  Postgres/API service is still the right next step once the workflow is validated.

## Project structure

```
src/
  data/
    schema.js          — thresholds + mock-data-only constants
    metrics.js          — every formula (NOD, OOS, Growth%, Variance, etc.)
    generateMockData.js — mock data generator
    loadData.js          — fetches /api/data, falls back to mock, handles refresh
  context/
    FilterContext.jsx    — shared filter state, loading/error/retry, dynamic filter options
  components/            — shared UI: KpiCard, DataTable, Callout, TrendChart,
                            BarChartBlock, Matrix2x2, Sidebar, TopFilterBar, StatusBadge
  pages/                  — the 18 dashboard pages
  App.jsx / main.jsx / styles.css
server.js                 — Express: login, /api/data, /api/refresh, /api/health
render.yaml                — Render deploy config
.env.example
```


## Decision Intelligence Pilot (added)

MT 360 now includes a Decision Intelligence layer designed for live internal validation before productizing the concept for external field-management/SFA platforms.

### New capabilities
- Decision Center as the default homepage
- Root-cause driver analysis
- Decision scoring, priority and confidence
- Quantified ₹ impact for decisions
- Recommendation + owner + deadline workflow
- Accept / modify / reject decision capture
- Decision History & Outcome tracking
- Actual impact and outcome/learning capture
- What-if scenario simulator inside Decision Center
- Analyst natural-language interface using the same deterministic decision engine
- Decision memory in browser local storage for pilot testing

### Pilot loop

`Detect → Diagnose → Quantify → Recommend → Decide → Act → Measure → Learn`

The current pilot deliberately stores decision history in browser local storage so it can be tested immediately without adding a database. Once the workflow is validated internally, the next production step is moving the decision log to a shared PostgreSQL/API service and adding SFA/CRM integrations.
