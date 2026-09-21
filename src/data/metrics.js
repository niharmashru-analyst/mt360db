// ============================================================================
// METRICS LAYER
// Every formula here matches Section 1 ("Derived Metrics") of the
// MT_360_Dashboard_Architecture.md doc. Pages should NEVER compute a KPI
// inline — always call a function here, so the formula lives in exactly
// one place.
// ============================================================================
import { THRESHOLDS } from './schema.js';

// ---- Filtering --------------------------------------------------------
export function applyFilters(records, filters) {
  return records.filter((r) => {
    if (filters.month && r.month !== filters.month) return false;
    if (filters.region && r.region !== filters.region) return false;
    if (filters.state && r.state !== filters.state) return false;
    if (filters.city && r.city !== filters.city) return false;
    if (filters.chainName && r.chainName !== filters.chainName) return false;
    if (filters.chainType && r.chainType !== filters.chainType) return false;
    if (filters.category && r.category !== filters.category) return false;
    if (filters.subCategory && r.subCategory !== filters.subCategory) return false;
    if (filters.brand && r.brand !== filters.brand) return false;
    if (filters.sku && r.sku !== filters.sku) return false;
    if (filters.pareto && r.pareto !== filters.pareto) return false;
    return true;
  });
}

export function getPriorYearMonth(month) {
  const [y, m] = month.split('-').map(Number);
  return `${y - 1}-${String(m).padStart(2, '0')}`;
}

export function getPriorMonth(month, n = 1) {
  const [y, m] = month.split('-').map(Number);
  const d = new Date(y, m - 1 - n, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

// ---- Aggregate sums -----------------------------------------------------
export function sum(records, field) {
  return records.reduce((acc, r) => acc + (r[field] || 0), 0);
}

export function sumSalesValue(records) { return sum(records, 'salesValue'); }
export function sumSalesQty(records) { return sum(records, 'salesQty'); }
export function sumStockQty(records) { return sum(records, 'stockQty'); }
export function sumTargetValue(records) { return sum(records, 'targetValue'); }

// ---- Core derived KPIs (Section 1 of architecture doc) -------------------

export function realizedASP(records) {
  const qty = sumSalesQty(records);
  return qty > 0 ? sumSalesValue(records) / qty : 0;
}

export function discountPct(records) {
  if (records.length === 0) return 0;
  const avgMrp = sum(records, 'mrp') / records.length;
  const asp = realizedASP(records);
  return avgMrp > 0 ? ((avgMrp - asp) / avgMrp) * 100 : 0;
}

export function growthPct(allRecords, filters) {
  const current = applyFilters(allRecords, filters);
  const lyMonth = filters.month ? getPriorYearMonth(filters.month) : null;
  if (!lyMonth) return null;
  const lyFilters = { ...filters, month: lyMonth };
  const ly = applyFilters(allRecords, lyFilters);
  const curVal = sumSalesValue(current);
  const lyVal = sumSalesValue(ly);
  if (lyVal === 0) return null;
  return ((curVal - lyVal) / lyVal) * 100;
}

export function achievementPct(records) {
  const target = sumTargetValue(records);
  return target > 0 ? (sumSalesValue(records) / target) * 100 : 0;
}

export function contributionPct(subsetRecords, totalRecords) {
  const total = sumSalesValue(totalRecords);
  return total > 0 ? (sumSalesValue(subsetRecords) / total) * 100 : 0;
}

// ============================================================================
// NOD (Number of Days of stock cover) — EKA's rule, which we're standardizing
// on: NOD is NEVER computed by averaging individual per-row NOD values
// (that's what 360-MT did, and it's misleading — e.g. one SKU at 5 days and
// another at Infinity averages to a meaningless number). Instead it's always:
//   total stock ÷ (trailing 3-month average sales, expressed as a daily rate)
// computed at whatever aggregation level you're looking at (one row, one
// SKU, one store, one chain, the whole filtered set).
// This requires the full historical dataset (allRecords), not just the
// current month's filtered slice, to look back 3 months per SKU-outlet key.
// ============================================================================

// Precompute once per dataset load: { "outletCode|skuCode|month": salesQty }
export function buildMonthlyQtyIndex(allRecords) {
  const idx = {};
  allRecords.forEach((r) => {
    idx[`${r.outletCode}|${r.skuCode}|${r.month}`] = (idx[`${r.outletCode}|${r.skuCode}|${r.month}`] || 0) + r.salesQty;
  });
  return idx;
}

// Trailing 3-month average sales qty for one SKU-outlet combo, as of `month`.
export function trailing3MoAvgQty(outletCode, skuCode, month, monthlyQtyIndex) {
  const months = [month, getPriorMonth(month, 1), getPriorMonth(month, 2)];
  const vals = months
    .map((m) => monthlyQtyIndex[`${outletCode}|${skuCode}|${m}`])
    .filter((v) => v !== undefined);
  if (vals.length === 0) return 0;
  return vals.reduce((a, b) => a + b, 0) / vals.length;
}

// Per-row NOD using the trailing-3-month rule (replaces the old single-month calcNOD).
export function calcNOD(record, monthlyQtyIndex) {
  if (!monthlyQtyIndex) {
    // No index provided — caller hasn't wired trailing-month data through yet.
    // Fall back to single-month rate so the app doesn't crash, but this path
    // should be avoided; pass buildMonthlyQtyIndex(allRecords) wherever possible.
    const dailyRate = record.salesQty / 30;
    if (dailyRate <= 0) return record.stockQty > 0 ? Infinity : 0;
    return record.stockQty / dailyRate;
  }
  const avgQty = trailing3MoAvgQty(record.outletCode, record.skuCode, record.month, monthlyQtyIndex);
  const dailyRate = avgQty / 30;
  if (dailyRate <= 0) return record.stockQty > 0 ? Infinity : 0;
  return record.stockQty / dailyRate;
}

// Aggregate NOD for a whole filtered set — total stock ÷ the group's own
// trailing-3-month average sales (summed across the group each month), never
// an average of individual NOD values.
export function avgNOD(records, allRecords, filters) {
  if (records.length === 0) return 0;
  const totalStock = sum(records, 'stockQty');
  if (!allRecords || !filters || !filters.month) {
    // fallback: single-month rate (same limitation as calcNOD's fallback)
    const totalDailyRate = sum(records, 'salesQty') / 30;
    return totalDailyRate > 0 ? totalStock / totalDailyRate : 0;
  }
  const months = [filters.month, getPriorMonth(filters.month, 1), getPriorMonth(filters.month, 2)];
  const monthlyTotals = months.map((m) => sumSalesQty(applyFilters(allRecords, { ...filters, month: m })));
  const presentTotals = monthlyTotals.filter((_, i) => allRecords.some((r) => r.month === months[i]));
  const avgQty = presentTotals.length > 0 ? presentTotals.reduce((a, b) => a + b, 0) / presentTotals.length : 0;
  const dailyRate = avgQty / 30;
  return dailyRate > 0 ? totalStock / dailyRate : 0;
}

// Same aggregate NOD rule, but for pages that scope by something applyFilters
// doesn't know about (a single outlet name, a single SKU) rather than the
// generic filter fields. Pass every record already scoped to that one
// outlet/SKU (across all months) plus the current month's slice of it.
export function avgNODForScope(currentMonthRecords, allRecordsInScope, month) {
  if (currentMonthRecords.length === 0) return 0;
  const totalStock = sum(currentMonthRecords, 'stockQty');
  const months = [month, getPriorMonth(month, 1), getPriorMonth(month, 2)];
  const monthlyTotals = months.map((m) => sumSalesQty(allRecordsInScope.filter((r) => r.month === m)));
  const presentTotals = monthlyTotals.filter((_, i) => allRecordsInScope.some((r) => r.month === months[i]));
  const avgQty = presentTotals.length > 0 ? presentTotals.reduce((a, b) => a + b, 0) / presentTotals.length : 0;
  const dailyRate = avgQty / 30;
  return dailyRate > 0 ? totalStock / dailyRate : 0;
}

export function stockValue(records) {
  return records.reduce((acc, r) => acc + r.stockQty * r.mrp, 0);
}

export function isOOS(record) {
  return record.stockQty <= THRESHOLDS.OOS_STOCK_QTY && record.listed;
}

// Dead / Slow / Healthy, per EKA's derived Stock Health filter definitions.
export function stockHealthFlag(record, monthlyQtyIndex) {
  if (isOOS(record)) return 'OOS';
  const nod = calcNOD(record, monthlyQtyIndex);
  const avgQty = monthlyQtyIndex
    ? trailing3MoAvgQty(record.outletCode, record.skuCode, record.month, monthlyQtyIndex)
    : record.salesQty;
  if (record.stockQty > 0 && avgQty === 0) return 'Dead'; // stock but no sales in the trailing window
  if (nod === Infinity || nod > THRESHOLDS.NOD_HIGH) return 'Excess';
  if (nod < THRESHOLDS.NOD_LOW) return 'Low';
  return 'Healthy';
}

// NOD bucket for the derived filter EKA uses: <15, 15-30, 31-60, >60 days.
export function nodBucket(nod) {
  if (nod === Infinity) return '>60';
  if (nod < 15) return '<15';
  if (nod <= 30) return '15-30';
  if (nod <= 60) return '31-60';
  return '>60';
}

export function oosPct(records) {
  if (records.length === 0) return 0;
  const oosCount = records.filter(isOOS).length;
  return (oosCount / records.length) * 100;
}

export function marginValue(records) {
  return records.reduce((acc, r) => acc + r.salesValue * (r.marginPct / 100), 0);
}

export function marginPctBlended(records) {
  const salesVal = sumSalesValue(records);
  return salesVal > 0 ? (marginValue(records) / salesVal) * 100 : 0;
}

export function promoSpendEstimate(records) {
  return records.reduce((acc, r) => acc + r.salesValue * (r.promoPct / 100), 0);
}

export function sellInVsSellOutGap(records) {
  return sum(records, 'primaryValue') - sum(records, 'salesValue');
}

// Sales at risk from OOS: uses each SKU-outlet's own trailing average sales
// (computed by caller passing in avgMonthlySales map) — kept generic here.
export function estimateSalesAtRisk(records, avgMonthlySalesByKey) {
  let risk = 0;
  records.forEach((r) => {
    if (isOOS(r)) {
      const key = `${r.outletCode}|${r.skuCode}`;
      const avg = avgMonthlySalesByKey[key] || r.salesValue;
      risk += avg; // treat as ~1 month of lost sales; refine with real OOS-days data later
    }
  });
  return risk;
}

export function buildAvgMonthlySalesByKey(allRecords) {
  const map = {};
  const counts = {};
  allRecords.forEach((r) => {
    const key = `${r.outletCode}|${r.skuCode}`;
    map[key] = (map[key] || 0) + r.salesValue;
    counts[key] = (counts[key] || 0) + 1;
  });
  Object.keys(map).forEach((k) => { map[k] = map[k] / counts[k]; });
  return map;
}

// ---- Distribution ---------------------------------------------------------
export function distributionPct(listingMatrix, filterFn) {
  const relevant = filterFn ? listingMatrix.filter(filterFn) : listingMatrix;
  if (relevant.length === 0) return 0;
  const listedCount = relevant.filter((l) => l.listed).length;
  return (listedCount / relevant.length) * 100;
}

// ---- Variance (stock movement reconciliation) -----------------------------
export function calcVariance(record) {
  const expectedClose = record.opStock + record.primaryQty - record.tertiaryQty;
  const variance = record.clStock - expectedClose;
  const variancePct = expectedClose !== 0 ? (variance / expectedClose) * 100 : 0;
  return { expectedClose, variance, variancePct };
}

export function varianceExceptions(records) {
  return records
    .map((r) => ({ ...r, ...calcVariance(r) }))
    .filter((r) => Math.abs(r.variancePct) > THRESHOLDS.VARIANCE_ALERT_PCT);
}

// ---- Grouping helper --------------------------------------------------------
export function groupBy(records, field) {
  const groups = {};
  records.forEach((r) => {
    const key = r[field];
    if (!groups[key]) groups[key] = [];
    groups[key].push(r);
  });
  return groups;
}

export function topN(records, field, groupField, n = 10, desc = true) {
  const groups = groupBy(records, groupField);
  const rows = Object.entries(groups).map(([key, recs]) => ({
    key,
    value: sum(recs, field),
    records: recs,
  }));
  rows.sort((a, b) => (desc ? b.value - a.value : a.value - b.value));
  return rows.slice(0, n);
}

export function formatCurrency(value) {
  if (value === null || value === undefined || isNaN(value)) return '—';
  const absVal = Math.abs(value);
  if (absVal >= 10000000) return `₹${(value / 10000000).toFixed(2)}Cr`;
  if (absVal >= 100000) return `₹${(value / 100000).toFixed(2)}L`;
  if (absVal >= 1000) return `₹${(value / 1000).toFixed(1)}K`;
  return `₹${Math.round(value)}`;
}

export function formatPct(value, decimals = 1) {
  if (value === null || value === undefined || isNaN(value) || !isFinite(value)) return '—';
  return `${value.toFixed(decimals)}%`;
}

// Dedicated formatter for YoY growth values specifically — shows "Not Active LY"
// instead of a blank dash or (worse) a misleading "0.0%" when there's no
// prior-year data to compare against. Use this anywhere growth/YoY is shown;
// use formatPct for every other percentage (OOS%, discount%, achievement%, etc).
export function formatGrowthPct(value, decimals = 1) {
  if (value === null || value === undefined || isNaN(value) || !isFinite(value)) return 'Not Active LY';
  return `${value >= 0 ? '+' : ''}${value.toFixed(decimals)}%`;
}

export function formatNumber(value) {
  if (value === null || value === undefined || isNaN(value)) return '—';
  return Math.round(value).toLocaleString('en-IN');
}
