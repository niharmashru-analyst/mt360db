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

## Known limitations / what's queued next

- **The EKA-style filter and table overhaul is not yet ported.** This is the biggest
  remaining piece: multi-select checkbox filters with search and shift-click ranges,
  a column picker with drag-to-reorder, a persisted Qty/Value toggle, click-through
  drill-down modals (chart bar → SKU-to-stores view), and CSV export on every table.
  Current filters are single-select dropdowns only.
- **NOD/Stock Health derived filters** (`<15`/`15-30`/`31-60`/`>60` days bucket, and
  Dead/Slow/Healthy stock health) exist as formulas (`nodBucket()`, `stockHealthFlag()`
  in `metrics.js`) but aren't yet wired up as filter UI — currently only shown as
  status badges and Inventory-page quadrant buttons.
- No ₹ trade spend (estimated from Promos % instead), no shade/variant-level
  analysis, no SKU lifecycle staging, no competitor/execution data — out of scope
  per the original data fields available.
- The Opportunity Engine score is a v1 heuristic — validate against real outcomes
  before trusting the numbers.
- Variance page with field submissions and the AI Analyst are intentionally deferred
  until the filter/table work and security hardening are further along.

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

