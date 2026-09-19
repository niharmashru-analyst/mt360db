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

// NOD = Days of stock cover, monthly grain assumed (30 days)
export function calcNOD(record) {
  const dailyRate = record.salesQty / 30;
  if (dailyRate <= 0) return record.stockQty > 0 ? Infinity : 0;
  return record.stockQty / dailyRate;
}

export function avgNOD(records) {
  const withSales = records.filter((r) => r.salesQty > 0);
  if (withSales.length === 0) return 0;
  const totalStock = sum(withSales, 'stockQty');
  const totalDailyRate = sum(withSales, 'salesQty') / 30;
  return totalDailyRate > 0 ? totalStock / totalDailyRate : 0;
}

export function stockValue(records) {
  return records.reduce((acc, r) => acc + r.stockQty * r.mrp, 0);
}

export function isOOS(record) {
  return record.stockQty <= THRESHOLDS.OOS_STOCK_QTY && record.listed;
}

export function stockHealthFlag(record) {
  if (isOOS(record)) return 'OOS';
  const nod = calcNOD(record);
  if (nod === Infinity || nod > THRESHOLDS.NOD_HIGH) return 'Excess';
  if (nod < THRESHOLDS.NOD_LOW) return 'Low';
  return 'Healthy';
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

export function formatNumber(value) {
  if (value === null || value === undefined || isNaN(value)) return '—';
  return Math.round(value).toLocaleString('en-IN');
}
