# MT360 — Presentation Ready Build

This package keeps the MT360 analytical dashboard with the dummy/sample data fallback enabled and all existing chart views active.

## Main chart-heavy views
- Executive 360 — 12M Sales vs LY / Target / Growth, Chain Treemap, YoY Heatmap
- Intelligence Hub — Forecast, Growth Bridge, Pareto Curve, Store Bubble / opportunity visuals
- Sales Analysis — sales trend, top/bottom SKU, category and brand contribution
- Management Review — sales trend, chain ranking, category, Pareto, state/town, key-account views
- Period Comparison — period comparison charts
- Pareto Analysis — Pareto visualization
- SKU 360 — SKU sales and stock trends
- Distribution / Inventory / Store Performance Matrix — matrix and performance visuals

## Dummy data
The bundled `data/` CSV files remain included. If the live `/api/data` endpoint is unavailable, the app automatically falls back to sample/mock data so the dashboard remains demonstrable.

## Run
```bash
npm install
npm run dev
```

For a production build:
```bash
npm run build
```
