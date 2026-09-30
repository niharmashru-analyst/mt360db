# MT360 Performance Optimization

## What changed

### 1. Route-level code splitting
The 19 dashboard pages are now loaded with `React.lazy()`. The browser no longer downloads the JavaScript for every page before the first screen can render.

### 2. Render/Express static caching
Vite's fingerprinted `/assets/*` files are served with:
- `Cache-Control: public, max-age=31536000, immutable`
- ETag/Last-Modified support

`index.html`, `sw.js`, and API/auth routes are not shared-cached.

### 3. Startup data warm-up
After the Node server starts, it begins loading and parsing the OneDrive workbook in the background. `/api/data` shares the same in-flight promise, avoiding duplicate workbook downloads/parses during startup.

This does NOT prevent Render Free from sleeping. It only reduces the work left to do after a cold start.

### 4. React transition for filters
Filter changes use React 18 transitions so the filter controls remain responsive while the analytical pages recalculate.

### 5. Fewer full-dataset scans
A `salesByMonth()` helper was added to aggregate multiple months in one pass. Executive Overview and Business Review no longer scan the complete dataset once per month for their trend charts.

Business Review chain YoY calculations now reuse the already-filtered LY dataset instead of running a separate full-dataset filter for every chain.

### 6. Static service worker
A lightweight service worker caches only same-origin fingerprinted static assets and the application shell for repeat visits. `/api/*`, `/login`, and `/logout` are never intercepted.

No business data is put into the service-worker cache.

## Cloudflare configuration

Recommended once the custom domain is connected:

1. Add the domain/subdomain to Cloudflare.
2. Point the application hostname to the Render custom domain/target.
3. Use **SSL/TLS: Full (strict)**.
4. Enable **Brotli**.
5. Keep `/api/*`, `/login`, and `/logout` uncached.
6. Add a Cache Rule for `/assets/*`:
   - Cache eligibility: eligible for cache
   - Edge TTL: 1 year
   - Browser TTL: 1 year
7. Do not enable aggressive HTML caching for the dashboard.
8. Avoid Rocket Loader initially; React applications can require testing with it.
9. Cloudflare's proxy/CDN does not remove Render Free cold-start time.

## Important remaining bottleneck

The current architecture still downloads the complete normalized dataset to the browser through `/api/data`. That is the next major optimization if the production workbook is 30 MB+.

For a large dataset, the next architecture should be:

Excel/OneDrive
  -> server-side sync
  -> SQLite/Parquet or pre-aggregated data
  -> small query responses
  -> React pages

The current changes improve startup JS, static delivery, repeated visits, filter scheduling, and redundant calculations without requiring a database migration.

## Verification

The production server JavaScript passes Node syntax validation.

A full Vite production build should still be run in the target Node/npm environment before deployment because dependency installation was not completed in the isolated audit environment.
