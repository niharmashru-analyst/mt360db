// ============================================================================
// DATA LOADER
// Tries the real /api/data route (live OneDrive Excel). Falls back to mock
// data if that's unavailable — e.g. running `npm run dev` without the
// Express server, ONEDRIVE_EXCEL_URL not set yet, or the fetch failed.
// Always logs which path was taken so it's never a silent switch.
// ============================================================================
import { generateMockData } from './generateMockData.js';

let cachedData = null;
let cachedSource = null; // 'live' | 'mock'
let lastDiagnostics = null;

function deriveMastersFromRecords(records) {
  const storeMap = new Map();
  const skuMap = new Map();
  records.forEach((r) => {
    if (!storeMap.has(r.outletCode)) {
      storeMap.set(r.outletCode, {
        outletCode: r.outletCode, outletName: r.outletName, chainName: r.chainName,
        chainType: r.chainType, city: r.city, state: r.state, region: r.region,
      });
    }
    if (!skuMap.has(r.skuCode)) {
      skuMap.set(r.skuCode, {
        skuCode: r.skuCode, sku: r.sku, brand: r.brand, category: r.category,
        subCategory: r.subCategory, mrp: r.mrp, pareto: r.pareto, status: r.status,
      });
    }
  });
  const listingMatrix = records.map((r) => ({
    outletCode: r.outletCode, skuCode: r.skuCode, listed: r.listed !== false,
  }));
  return { storeMaster: [...storeMap.values()], skuMaster: [...skuMap.values()], listingMatrix };
}

async function fetchLive() {
  const res = await fetch('/api/data');
  const body = await res.json();
  if (!res.ok) throw new Error(body.error || res.statusText);
  const masters = deriveMastersFromRecords(body.records);
  return {
    records: body.records,
    months: body.months,
    ...masters,
    meta: { rowCount: body.rowCount, sheetUsed: body.sheetUsed, cached: body.cached },
  };
}

export async function loadData({ force = false } = {}) {
  if (cachedData && !force) return cachedData;

  try {
    const data = await fetchLive();
    console.log(`[loadData] LIVE data: ${data.meta.rowCount} rows from sheet "${data.meta.sheetUsed}"${data.meta.cached ? ' (cached)' : ''}.`);
    cachedData = data;
    cachedSource = 'live';
    return cachedData;
  } catch (err) {
    console.warn(`[loadData] Falling back to mock data — ${err.message}`);
    cachedData = generateMockData();
    cachedSource = 'mock';
    return cachedData;
  }
}

export async function refreshData() {
  cachedData = null;
  try {
    await fetch('/api/refresh', { method: 'POST' });
  } catch {
    // if /api/refresh isn't reachable (e.g. dev mode with mock data), just
    // clear the local cache and let the next loadData() call re-fetch/regenerate
  }
  return loadData({ force: true });
}

export function getDataSource() {
  return cachedSource;
}

export async function fetchDataHealth() {
  const res = await fetch('/api/health');
  const body = await res.json();
  lastDiagnostics = body;
  return body;
}
