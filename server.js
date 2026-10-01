// Production server for MT 360 Dashboard.
//   Deploy on Render: Build Command: npm install && npm run build
//                      Start Command: npm start
import 'dotenv/config';
import express from 'express';
import compression from 'compression';
import crypto from 'crypto';
import session from 'express-session';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import * as XLSX from 'xlsx';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
app.set('trust proxy', 1); // Render terminates TLS in front of Node
app.use(compression()); // /api/data is ~20 MB of JSON uncompressed, ~1.5 MB gzipped
const PORT = process.env.PORT || 3000;
const CACHE_MINUTES = Number(process.env.CACHE_MINUTES || 10);
const FETCH_TIMEOUT_MS = 25000;
const STATIC_MAX_AGE = 31536000; // Vite assets are content-hashed.
const HTML_MAX_AGE = 0;

app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(session({
  secret: process.env.SESSION_SECRET || 'change-this-in-render-env-vars',
  resave: false,
  saveUninitialized: false,
  cookie: { maxAge: 12 * 60 * 60 * 1000, httpOnly: true, sameSite: 'lax', secure: 'auto' }, // 12 hours
}));

// Never let a shared proxy/CDN cache authenticated or business-data API responses.
app.use('/api', (req, res, next) => {
  res.setHeader('Cache-Control', 'private, no-store, max-age=0');
  next();
});

// ============================================================================
// LOGIN — real sales data shouldn't sit behind an open link.
// Single shared password via APP_PASSWORD env var. Not user-level accounts —
// good enough for "keep this off the open internet", upgrade later if needed.
// ============================================================================
const APP_PASSWORD = process.env.APP_PASSWORD; // if unset, login is skipped (local dev convenience)

function requireAuth(req, res, next) {
  if (!APP_PASSWORD) return next(); // no password configured — open (local dev only)
  if (req.session && req.session.authed) return next();
  if (req.path.startsWith('/api/')) {
    return res.status(401).json({ error: 'Not authenticated. Log in first.' });
  }
  return res.redirect('/login');
}

app.get('/login', (req, res) => {
  const error = req.query.error ? '<p style="color:#dc2626;margin:0 0 12px;font-size:14px;">Wrong password.</p>' : '';
  res.send(`<!doctype html><html><head><meta charset="utf-8"><title>Login — MT 360</title>
    <style>body{font-family:-apple-system,sans-serif;background:#111827;display:flex;align-items:center;justify-content:center;height:100vh;margin:0}
    form{background:#fff;padding:32px;border-radius:12px;width:280px}
    h1{font-size:1.2rem;margin:0 0 16px}
    input{width:100%;padding:10px;border:1px solid #d1d5db;border-radius:6px;font-size:14px;box-sizing:border-box;margin-bottom:12px}
    button{width:100%;padding:10px;background:#6366f1;color:#fff;border:none;border-radius:6px;font-size:14px;cursor:pointer;font-weight:600}
    </style></head><body>
    <form method="POST" action="/login">
      <h1>MT 360 — Login</h1>
      ${error}
      <input type="password" name="password" placeholder="Password" autofocus />
      <button type="submit">Enter</button>
    </form></body></html>`);
});

const fails = new Map(); // ip -> { n, until } — simple in-memory brute-force limiter
const sha = (v) => crypto.createHash('sha256').update(String(v)).digest();
app.post('/login', (req, res) => {
  const f = fails.get(req.ip) || { n: 0, until: 0 };
  if (Date.now() > f.until) f.n = 0;
  if (f.n >= 5) return res.status(429).send('Too many attempts. Try again in 15 minutes.');
  if (APP_PASSWORD && crypto.timingSafeEqual(sha(req.body.password || ''), sha(APP_PASSWORD))) {
    fails.delete(req.ip);
    req.session.authed = true;
    return res.redirect('/');
  }
  fails.set(req.ip, { n: f.n + 1, until: Date.now() + 15 * 60 * 1000 });
  res.redirect('/login?error=1');
});

app.post('/logout', (req, res) => {
  req.session.destroy(() => res.redirect('/login'));
});

app.use(requireAuth);

// ============================================================================
// Header aliases — real exports rarely match your exact header text.
// Left side: normalized variants seen in the wild. Right side: the field
// name every page/formula actually uses. Normalization strips punctuation,
// case and extra spaces before matching, so "Sales Value", "sales value",
// "Sales_Value" all match the same alias.
// ============================================================================
const ALIASES = {
  month: ['month', 'month year', 'period', 'date'],
  outletCode: ['outlet code', 'store code', 'outlet id', 'store id'],
  outletName: ['outlet name', 'store name', 'outlet', 'store'],
  chainName: ['chain name', 'chain', 'retailer', 'retailer name'],
  chainType: ['chain type', 'channel type', 'format', 'store type'],
  city: ['city'],
  state: ['state'],
  region: ['region', 'zone'],
  sku: ['sku', 'product', 'product name'],
  skuCode: ['sku code', 'sku id', 'product code', 'ean', 'ean code'],
  brand: ['brand', 'brand name'],
  category: ['category'],
  subCategory: ['sub category', 'subcategory', 'sub-category'],
  pareto: ['pareto', 'pareto group'],
  status: ['status', 'sku status'],
  salesQty: ['sales qty', 'sales quantity', 'qty', 'tertiary sales qty', 'tertiary qty'],
  salesValue: ['sales value', 'sales', 'net sales', 'sales amount', 'tertiary value'],
  mrp: ['mrp', 'price'],
  opStock: ['op stock', 'opening stock', 'opening stock qty'],
  clStock: ['cl stock', 'closing stock', 'closing stock qty'],
  stockQty: ['stock qty', 'stock quantity', 'stock'],
  primaryQty: ['primary qty', 'primary quantity'],
  primaryValue: ['primary value'],
  tertiaryQty: ['tertiary qty', 'tertiary quantity'],
  tertiaryValue: ['tertiary value'],
  targetValue: ['target', 'targets', 'sales target', 'target value'],
  marginPct: ['margins', 'margin', 'margin %', 'margin pct'],
  promoPct: ['promos%', 'promo %', 'promo pct', 'promotion %'],
  listed: ['distribution', 'listed', 'availability', 'distributed'],
  bgr: ['bgr', 'bgr name', 'business growth region', 'business region'],
  launchDate: ['launch date', 'launch month', 'date of launch'],
  manpower: ['manpower', 'headcount', 'sales manpower', 'field force', 'fo count', 'sales exec count'],
  visibility: ['visibility', 'visibility %', 'visibility pct', 'facings', 'display compliance', 'shelf share'],
  orderQty: ['order qty', 'ordered qty', 'order quantity', 'ordered quantity'],
  filledQty: ['filled qty', 'fill qty', 'fulfilled qty', 'fulfilled quantity'],
  fillRate: ['fill rate', 'fill rate %', 'fill rate pct', 'fill rate percent'],
};

const NUMBER_FIELDS = new Set([
  'mrp', 'salesQty', 'salesValue', 'opStock', 'clStock', 'stockQty',
  'primaryQty', 'primaryValue', 'tertiaryQty', 'tertiaryValue', 'targetValue',
  'marginPct', 'promoPct', 'visibility', 'orderQty', 'filledQty', 'fillRate',
]);

function normalizeHeader(h) {
  return String(h).toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
}

// Build a reverse lookup: normalized alias text -> field name, once at startup.
const ALIAS_LOOKUP = {};
Object.entries(ALIASES).forEach(([field, variants]) => {
  variants.forEach((v) => { ALIAS_LOOKUP[normalizeHeader(v)] = field; });
});

function resolveHeaderMap(actualHeaders) {
  const map = {}; // actualHeader -> fieldName
  const unmatched = [];
  actualHeaders.forEach((h) => {
    const norm = normalizeHeader(h);
    const field = ALIAS_LOOKUP[norm];
    if (field) map[h] = field;
    else unmatched.push(h);
  });
  const matchedFields = new Set(Object.values(map));
  const missingFields = Object.keys(ALIASES).filter((f) => !matchedFields.has(f));
  return { map, unmatched, missingFields };
}

// Excel dates arrive as JS Date objects (cellDates:true below) or as plain
// text. This normalizes either into the 'YYYY-MM' string the app expects —
// a real Excel date column would otherwise silently break every prior-year
// lookup, since 'YYYY-MM' string matching wouldn't work against Date objects.
function normalizeMonth(value) {
  if (value instanceof Date && !isNaN(value)) {
    return `${value.getFullYear()}-${String(value.getMonth() + 1).padStart(2, '0')}`;
  }
  const str = String(value).trim();
  // Already 'YYYY-MM' or 'YYYY-MM-DD'
  const isoMatch = str.match(/^(\d{4})-(\d{2})/);
  if (isoMatch) return `${isoMatch[1]}-${isoMatch[2]}`;
  // 'MM/DD/YYYY' or 'DD/MM/YYYY' — assume the year is the 4-digit group
  const slashMatch = str.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (slashMatch) return `${slashMatch[3]}-${slashMatch[1].padStart(2, '0')}`;
  // 'Sep-2026', 'September 2026', etc — let JS Date try, then reformat
  const parsed = new Date(str);
  if (!isNaN(parsed)) return `${parsed.getFullYear()}-${String(parsed.getMonth() + 1).padStart(2, '0')}`;
  return str; // give up gracefully — this row's month will just not match anything, not crash
}

function excelRowToRecord(row, headerMap) {
  const record = {};
  Object.entries(headerMap).forEach(([excelHeader, fieldName]) => {
    let value = row[excelHeader];
    if (fieldName === 'month') { record.month = normalizeMonth(value); return; }
    if (fieldName === 'launchDate') { record.launchDate = normalizeMonth(value); return; }
    if (fieldName === 'listed') {
      record.listed = value === 'Listed' || value === 'Y' || value === true || value === undefined || value === '';
      return;
    }
    if (NUMBER_FIELDS.has(fieldName)) {
      const n = Number(value);
      record[fieldName] = isNaN(n) ? 0 : n;
      return;
    }
    record[fieldName] = value !== undefined ? String(value).trim() : '';
  });
  if (!record.tertiaryQty) record.tertiaryQty = record.salesQty;
  if (!record.tertiaryValue) record.tertiaryValue = record.salesValue;
  if (!record.stockQty) record.stockQty = record.clStock;
  return record;
}

function toDirectDownloadUrl(shareUrl) {
  if (!shareUrl) return shareUrl;
  if (shareUrl.includes('download=1')) return shareUrl;
  const separator = shareUrl.includes('?') ? '&' : '?';
  return `${shareUrl}${separator}download=1`;
}

async function fetchWithTimeout(url, ms) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), ms);
  try {
    return await fetch(url, { signal: controller.signal });
  } catch (err) {
    if (err.name === 'AbortError') {
      throw new Error(`Request timed out after ${ms / 1000}s. The OneDrive file may be large or the link may be slow to resolve.`);
    }
    throw err;
  } finally {
    clearTimeout(timer);
  }
}

// ============================================================================
// Cache — the whole point is the link never touches the browser, and every
// page load doesn't re-fetch/re-parse the workbook. /api/refresh clears it.
// ============================================================================
let cache = { data: null, fetchedAt: 0, diagnostics: null };
let warmPromise = null;
const CACHE_TTL_MS = CACHE_MINUTES * 60 * 1000;

// ============================================================================
// MONTH-ON-MONTH FILES
// Each file = one month (same columns). Sources, merged in this order:
//   1. every .xlsx/.xlsm/.xls/.csv in the data/ folder (or DATA_DIR)
//   2. every share link in ONEDRIVE_EXCEL_URLS (comma / semicolon / new-line separated;
//      the old single ONEDRIVE_EXCEL_URL still works)
// Month comes from the "Month" column; if a row has none, from the file name
// (2026-08.xlsx, 2026_08_sales.csv, Aug-2026.xlsx, August 2026.xlsx).
// ============================================================================
const MAX_ROWS = Number(process.env.MAX_ROWS || 400000); // every row goes to the browser; refuse rather than crash
const MONTHS_EN = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];

function monthFromName(name) {
  const n = name.toLowerCase();
  let m = n.match(/(20\d{2})[-_ .]?(0[1-9]|1[0-2])(?!\d)/);
  if (m) return `${m[1]}-${m[2]}`;
  m = n.match(/(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*[-_ .]*(20\d{2}|\d{2})(?!\d)/);
  if (m) return `${m[2].length === 2 ? `20${m[2]}` : m[2]}-${String(MONTHS_EN.indexOf(m[1]) + 1).padStart(2, '0')}`;
  return null;
}

// "1.Top 10" / "2.Top 25" / "6.Tail" -> the three tiers the Pareto pages use.
function paretoTier(v) {
  const t = String(v).replace(/^\d+\s*\.\s*/, '').trim();
  return t === 'Top 10' || t === 'Top 25' ? t : 'Others';
}

async function fetchBuffer(url) {
  const response = await fetchWithTimeout(toDirectDownloadUrl(url), FETCH_TIMEOUT_MS);
  if (!response.ok) throw new Error(`Fetch failed with status ${response.status}. Check the link is set to "Anyone with the link".`);
  if ((response.headers.get('content-type') || '').includes('text/html')) {
    throw new Error('Received an HTML page instead of an Excel file — the link likely requires login or redirected to a viewer.');
  }
  return Buffer.from(await response.arrayBuffer());
}

function listSources() {
  const dir = process.env.DATA_DIR || path.join(__dirname, 'data');
  const files = fs.existsSync(dir)
    ? fs.readdirSync(dir).filter((f) => /\.(xlsx|xlsm|xls|csv)$/i.test(f) && !f.startsWith('~$')).sort()
      .map((f) => ({ name: f, read: async () => fs.readFileSync(path.join(dir, f)) }))
    : [];
  const links = (process.env.ONEDRIVE_EXCEL_URLS || process.env.ONEDRIVE_EXCEL_URL || '')
    .split(/[\n,;]+/).map((s) => s.trim()).filter(Boolean)
    .map((u, i) => ({ name: `link ${i + 1}`, read: () => fetchBuffer(u) }));
  return [...files, ...links];
}

function parseOne(buffer, name) {
  const workbook = XLSX.read(buffer, { type: 'buffer', cellDates: true });
  const sheetName = workbook.SheetNames.includes('Data') ? 'Data' : workbook.SheetNames[0];
  const rawRows = XLSX.utils.sheet_to_json(workbook.Sheets[sheetName], { defval: '' });
  if (!rawRows.length) throw new Error(`sheet "${sheetName}" has 0 rows.`);
  const actualHeaders = Object.keys(rawRows[0]);
  const { map, unmatched, missingFields } = resolveHeaderMap(actualHeaders);
  const fallbackMonth = monthFromName(name);
  let placeholders = 0;
  const records = [];
  rawRows.forEach((row) => {
    const r = excelRowToRecord(row, map);
    if (!r.outletCode || !r.skuCode || r.outletCode === '-' || r.skuCode === '-') { placeholders++; return; } // "-" filler rows
    if (!/^\d{4}-\d{2}$/.test(r.month || '') && fallbackMonth) r.month = fallbackMonth;
    if (r.pareto !== undefined) r.pareto = paretoTier(r.pareto);
    records.push(r);
  });
  return { records, sheetName, actualHeaders, unmatched, missingFields, placeholders, matchedFields: Object.values(map) };
}

async function loadWorkbookFromSource() {
  const sources = listSources();
  if (!sources.length) {
    throw new Error('No data found. Put one file per month (e.g. 2026-08.xlsx) in the data/ folder, or set ONEDRIVE_EXCEL_URLS to the share links.');
  }
  const seen = new Set();
  const records = [];
  const files = [];
  let dupes = 0, placeholders = 0, first = null;

  for (const src of sources) { // one file at a time: peak memory = one month, not all months
    let parsed;
    try { parsed = parseOne(await src.read(), src.name); } catch (err) { throw new Error(`${src.name}: ${err.message}`); }
    first = first || parsed;
    let kept = 0;
    parsed.records.forEach((r) => {
      const k = `${r.month}|${r.outletCode}|${r.skuCode}`;
      if (seen.has(k)) { dupes++; return; }
      seen.add(k); records.push(r); kept++;
    });
    placeholders += parsed.placeholders;
    files.push({ name: src.name, rows: kept, months: [...new Set(parsed.records.map((r) => r.month))].sort() });
    if (records.length > MAX_ROWS) {
      throw new Error(`Loaded ${records.length.toLocaleString()} rows (limit ${MAX_ROWS.toLocaleString()}). The dashboard sends every row to the browser, so this would crash it. Use fewer months, or aggregate the files first.`);
    }
  }

  const months = [...new Set(records.map((r) => r.month))].filter(Boolean).sort();
  const warnings = [];
  if (!records.some((r) => r.salesValue > 0)) warnings.push('Sales Value is 0 in every row — is MRP filled in? All revenue numbers will show zero.');
  if (months.length < 13) warnings.push(`Only ${months.length} month(s) loaded — year-on-year growth needs the same month last year (13+ months).`);
  warnings.forEach((w) => console.warn(`[data] ${w}`));

  const diagnostics = {
    sheetUsed: files.length === 1 ? first.sheetName : `${files.length} files`,
    rowCount: records.length,
    monthsFound: months,
    columnsInFile: first.actualHeaders,
    matchedFields: first.matchedFields,
    unmatchedColumns: first.unmatched,
    missingFields: first.missingFields,
    badMonthRows: records.filter((r) => !/^\d{4}-\d{2}$/.test(r.month)).length,
    zeroValueRows: records.filter((r) => r.salesQty === 0 && r.salesValue === 0).length,
    uniqueOutletCodes: new Set(records.map((r) => r.outletCode)).size,
    uniqueSkuCodes: new Set(records.map((r) => r.skuCode)).size,
    filesLoaded: files,
    duplicatesDropped: dupes,
    placeholderRowsDropped: placeholders,
    warnings,
    checkedAt: new Date().toISOString(),
  };
  return { records, months, sheetUsed: diagnostics.sheetUsed, rowCount: records.length, diagnostics };
}

app.get('/api/data', async (req, res) => {
  try {
    const forceRefresh = req.query.refresh === '1';
    const now = Date.now();

    if (!forceRefresh && cache.data && now - cache.fetchedAt < CACHE_TTL_MS) {
      return res.json({ ...cache.data, cached: true, cacheAgeSeconds: Math.round((now - cache.fetchedAt) / 1000) });
    }

    // If startup warm-up is already fetching the workbook, share that same
    // promise instead of downloading/parsing the Excel file a second time.
    if (!forceRefresh && warmPromise) {
      const result = await warmPromise;
      if (result) {
        return res.json({ ...result, cached: true, cacheAgeSeconds: Math.round((Date.now() - cache.fetchedAt) / 1000) });
      }
    }

    const result = await loadWorkbookFromSource();
    cache = { data: result, fetchedAt: Date.now(), diagnostics: result.diagnostics };
    res.json({ ...result, cached: false, cacheAgeSeconds: 0 });
  } catch (err) {
    console.error('Error in /api/data:', err.message);
    res.status(502).json({ error: err.message });
  }
});

app.get('/api/refresh', async (req, res) => {
  cache = { data: null, fetchedAt: 0, diagnostics: null };
  res.json({ ok: true });
});

app.get('/api/health', async (req, res) => {
  try {
    if (!cache.diagnostics) {
      // trigger a load if nothing cached yet, so /api/health works standalone
      const result = await loadWorkbookFromSource();
      cache = { data: result, fetchedAt: Date.now(), diagnostics: result.diagnostics };
    }
    res.json({ ok: true, ...cache.diagnostics, cacheAgeSeconds: Math.round((Date.now() - cache.fetchedAt) / 1000) });
  } catch (err) {
    res.status(502).json({ ok: false, error: err.message });
  }
});

// Static assets are safe to cache aggressively because Vite fingerprints their
// filenames. HTML stays revalidated so deployments are picked up immediately.
// API responses are deliberately NOT cached here because they contain business data.
app.use(express.static(path.join(__dirname, 'dist'), {
  etag: true,
  lastModified: true,
  maxAge: 0, // only hashed /assets/* get long caching (setHeaders below)
  setHeaders: (res, filePath) => {
    if (filePath.endsWith('index.html') || filePath.endsWith('sw.js') || filePath.endsWith('manifest.webmanifest')) {
      res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
    } else if (filePath.includes(`${path.sep}assets${path.sep}`)) {
      res.setHeader('Cache-Control', `public, max-age=${STATIC_MAX_AGE}, immutable`);
    }
  },
}));

app.get('*', (req, res) => {
  res.setHeader('Cache-Control', `private, max-age=${HTML_MAX_AGE}, must-revalidate`);
  res.sendFile(path.join(__dirname, 'dist', 'index.html'));
});

app.listen(PORT, () => {
  console.log(`MT 360 Dashboard running on port ${PORT}`);
  console.log(`Data sources found: ${listSources().length} (data/ folder + ONEDRIVE_EXCEL_URLS).`);
  console.log(APP_PASSWORD ? 'Login is enabled.' : 'APP_PASSWORD not set — login is DISABLED (fine for local dev only).');

  // Warm the data cache without delaying the HTTP listener. This removes the
  // Excel-download/parse penalty for most users after a Render cold start.
  if (listSources().length) {
    warmPromise = loadWorkbookFromSource()
      .then((result) => {
        cache = { data: result, fetchedAt: Date.now(), diagnostics: result.diagnostics };
        console.log(`Data cache warmed: ${result.rowCount.toLocaleString()} rows.`);
        return result;
      })
      .catch((err) => {
        console.warn(`Data cache warm-up failed: ${err.message}`);
        return null;
      })
      .finally(() => { warmPromise = null; });
  }
});
