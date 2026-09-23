// Production server for MT 360 Dashboard.
//   Deploy on Render: Build Command: npm install && npm run build
//                      Start Command: npm start
import 'dotenv/config';
import express from 'express';
import session from 'express-session';
import path from 'path';
import { fileURLToPath } from 'url';
import * as XLSX from 'xlsx';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 3000;
const CACHE_MINUTES = Number(process.env.CACHE_MINUTES || 10);
const FETCH_TIMEOUT_MS = 25000;

app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(session({
  secret: process.env.SESSION_SECRET || 'change-this-in-render-env-vars',
  resave: false,
  saveUninitialized: false,
  cookie: { maxAge: 12 * 60 * 60 * 1000 }, // 12 hours
}));

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

app.post('/login', (req, res) => {
  if (req.body.password === APP_PASSWORD) {
    req.session.authed = true;
    return res.redirect('/');
  }
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
};

const NUMBER_FIELDS = new Set([
  'mrp', 'salesQty', 'salesValue', 'opStock', 'clStock', 'stockQty',
  'primaryQty', 'primaryValue', 'tertiaryQty', 'tertiaryValue', 'targetValue',
  'marginPct', 'promoPct',
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
    if (fieldName === 'listed') {
      record.listed = value === 'Listed' || value === 'Y' || value === true || value === undefined || value === '';
      return;
    }
    if (NUMBER_FIELDS.has(fieldName)) {
      const n = Number(value);
      record[fieldName] = isNaN(n) ? 0 : n;
      return;
    }
    record[fieldName] = value !== undefined ? String(value) : '';
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
const CACHE_TTL_MS = CACHE_MINUTES * 60 * 1000;

async function loadWorkbookFromSource() {
  const sourceUrl = process.env.ONEDRIVE_EXCEL_URL;
  if (!sourceUrl) {
    throw new Error('ONEDRIVE_EXCEL_URL is not set. Add it in Render → Environment (or .env locally).');
  }

  const fetchUrl = toDirectDownloadUrl(sourceUrl);
  const response = await fetchWithTimeout(fetchUrl, FETCH_TIMEOUT_MS);

  if (!response.ok) {
    throw new Error(`Fetch failed with status ${response.status}. Check the link is set to "Anyone with the link".`);
  }

  const contentType = response.headers.get('content-type') || '';
  const buffer = await response.arrayBuffer();

  if (contentType.includes('text/html')) {
    throw new Error('Received an HTML page instead of an Excel file — the link likely requires login or redirected to a viewer.');
  }

  const workbook = XLSX.read(buffer, { type: 'array', cellDates: true });
  const sheetName = workbook.SheetNames.includes('Data') ? 'Data' : workbook.SheetNames[0];
  const sheet = workbook.Sheets[sheetName];
  const rawRows = XLSX.utils.sheet_to_json(sheet, { defval: '' });

  if (rawRows.length === 0) {
    throw new Error(`Sheet "${sheetName}" parsed but contained 0 rows.`);
  }

  const actualHeaders = Object.keys(rawRows[0]);
  const { map: headerMap, unmatched, missingFields } = resolveHeaderMap(actualHeaders);
  const records = rawRows.map((row) => excelRowToRecord(row, headerMap));
  const months = [...new Set(records.map((r) => r.month))].filter(Boolean).sort();

  // ---- Data health diagnostics (surfaced on the Data Health page) ----
  const storeCodesInData = new Set(records.map((r) => r.outletCode));
  const skuCodesInData = new Set(records.map((r) => r.skuCode));
  const monthPattern = /^\d{4}-\d{2}$/;
  const badMonthRows = records.filter((r) => !monthPattern.test(r.month)).length;
  const zeroValueRows = records.filter((r) => r.salesQty === 0 && r.salesValue === 0).length;

  const diagnostics = {
    sheetUsed: sheetName,
    rowCount: records.length,
    monthsFound: months,
    columnsInFile: actualHeaders,
    matchedFields: Object.values(headerMap),
    unmatchedColumns: unmatched,
    missingFields, // fields the app needs but couldn't find in this file
    badMonthRows, // rows whose month couldn't be parsed to YYYY-MM
    zeroValueRows,
    uniqueOutletCodes: storeCodesInData.size,
    uniqueSkuCodes: skuCodesInData.size,
    checkedAt: new Date().toISOString(),
  };

  return { records, months, sheetUsed: sheetName, rowCount: records.length, diagnostics };
}

app.get('/api/data', async (req, res) => {
  try {
    const forceRefresh = req.query.refresh === '1';
    const now = Date.now();
    if (!forceRefresh && cache.data && now - cache.fetchedAt < CACHE_TTL_MS) {
      return res.json({ ...cache.data, cached: true, cacheAgeSeconds: Math.round((now - cache.fetchedAt) / 1000) });
    }
    const result = await loadWorkbookFromSource();
    cache = { data: result, fetchedAt: now, diagnostics: result.diagnostics };
    res.json({ ...result, cached: false });
  } catch (err) {
    console.error('Error in /api/data:', err.message);
    res.status(502).json({ error: err.message });
  }
});

// POST, not GET — this has a side effect (clears the cache), so it shouldn't
// be triggerable by a plain link click, a prefetch, or a crawler.
app.post('/api/refresh', async (req, res) => {
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

app.use(express.static(path.join(__dirname, 'dist')));

app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'dist', 'index.html'));
});

app.listen(PORT, () => {
  console.log(`MT 360 Dashboard running on port ${PORT}`);
  console.log(process.env.ONEDRIVE_EXCEL_URL ? 'ONEDRIVE_EXCEL_URL is set.' : 'ONEDRIVE_EXCEL_URL is NOT set.');
  console.log(APP_PASSWORD ? 'Login is enabled.' : 'APP_PASSWORD not set — login is DISABLED (fine for local dev only).');
});
