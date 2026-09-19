# MT 360 — Modern Trade Intelligence Dashboard

Full 17-page dashboard, built with realistic mock data matching your real fields.
This is meant to be your working codebase for the 15-day plan — read, break, edit,
and gradually replace pieces with your real data.

## What's inside

- **17 pages**, wired exactly to the architecture doc: Executive 360, Sales Analysis,
  Retailer 360, Geography 360, Store 360, SKU 360, Availability/OOS, Inventory 360,
  Distribution 360, Assortment Analytics, Pricing & Promotion, Variance Analysis,
  Pareto Analysis, Store Performance Matrix, SKU × Store Opportunity Engine,
  Growth Simulator, and the Action Center.
- **One formula layer** (`src/data/metrics.js`) — every KPI on every page traces back
  to a single function here. Change a formula once, every page updates.
- **One data loader** (`src/data/loadData.js`) — the only file you need to edit to
  switch from mock data to your real OneDrive Excel file. Instructions are in the
  comments at the top of that file.
- **Mock data generator** (`src/data/generateMockData.js`) — produces ~36,000 realistic
  rows across 24 months, 61 outlets, 48 SKUs, with genuine OOS events, excess stock,
  distribution gaps, and stock-count variances baked in — so every page actually has
  something interesting to show.

## Running it locally

```bash
npm install
npm run dev
```
Opens at `http://localhost:5173`. Hot-reloads as you edit.

## Building & running in production mode (same as Render will do)

```bash
npm run build
npm start
```
`npm start` runs `server.js`, an Express server that serves the built app —
this is exactly what Render will run.

## Deploying to Render (same pattern as your EKA Dashboard)

1. Push this folder to a new GitHub repo.
2. On Render: New → Web Service → connect the repo.
3. Build Command: `npm install && npm run build`
4. Start Command: `npm start`
5. That's it — same pattern as EKA, separate repo.

## Switching from mock data to your real Excel file

Open `src/data/loadData.js`. Everything you need — including a worked example using
SheetJS (`xlsx`) to read an OneDrive-hosted Excel file — is in the comment block at
the top of that file. You do not need to touch any page component; every page reads
through `src/data/metrics.js`, which only cares about the field names, not where the
data came from.

**Field names your data needs to match** (see `MT_360_Dashboard_Architecture.md`,
Section 0, for the full canonical list): Month, Outlet Code, Outlet Name, Chain Name,
Chain Type, City, State, Region, SKU, SKU Code, Brand, Category, Sub Category, Pareto,
Status, Sales Qty, Sales Value, MRP, Stock Qty, OP Stock, CL Stock, Primary Qty/Value,
Tertiary Qty/Value, Targets, Margins, Promos %, Distribution.

## Adjusting business thresholds

Open `src/data/schema.js` → `THRESHOLDS`. This controls:
- `NOD_LOW` / `NOD_HIGH` — what counts as Low Stock vs Excess Stock
- `VARIANCE_ALERT_PCT` — how big a stock-count discrepancy has to be before it shows
  in the Variance Analysis exception list
- `HIGH_DISCOUNT_PCT` — the promo % level that triggers a warning on the Pricing page

Change these once here; every page that uses them updates automatically.

## Project structure

```
src/
  data/
    schema.js          — canonical field list, dropdown options, thresholds
    metrics.js          — every formula (NOD, OOS, Growth%, Variance, etc.)
    generateMockData.js — mock data generator (swap out via loadData.js)
    loadData.js          — ← EDIT THIS to go live with real data
  context/
    FilterContext.jsx    — shared filter state (Month/Region/Chain/etc.) across all pages
  components/            — shared UI: KpiCard, DataTable, Callout, TrendChart,
                            BarChartBlock, Matrix2x2, Sidebar, TopFilterBar, StatusBadge
  pages/                  — the 17 dashboard pages
  App.jsx                 — routing
  main.jsx                — React entry point
  styles.css              — all styling
server.js                 — production Express server (for Render)
vite.config.js
```

## Known limitations (by design, matching what your data can support today)

- **No ₹ trade spend** — Pricing & Promotion page estimates spend as
  `Sales Value × Promo %`. Treat as directional.
- **Variance Analysis** is built against a synthetic ~4% stock-count-discrepancy rate
  in the mock data — with your real data, this page will show whatever discrepancies
  actually exist between reported CL Stock and the OP+Primary−Tertiary reconciliation.
- **SKU × Store Opportunity Engine** score is a v1 heuristic (see the in-app callout
  on that page) — refine the weighting once you've validated a few real outcomes.
- No shade/variant-level analysis, no SKU lifecycle staging, no competitor/execution
  data — these were explicitly out of scope per the architecture doc.

## Suggested order to work through this over 15 days

See `MT_360_Dashboard_Architecture.md`, Section 5, for the day-by-day plan. Broadly:
data layer first (Days 1-2), then Executive/Sales/Retailer/Geography/Store/SKU
(Days 3-5), then Availability/Inventory/Distribution/Assortment/Pricing/Variance
(Days 6-9), then Pareto/Store Matrix/Opportunity Engine/Growth Simulator (Days 10-13),
then Action Center + full walkthrough (Days 14-15).
