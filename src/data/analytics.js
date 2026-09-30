// ============================================================================
// ANALYTICS LAYER — statistical methods on top of metrics.js.
// Pure functions, no React. Every method returns null when there isn't enough
// history, instead of inventing a number.
// ============================================================================
import {
  applyFilters, getPriorMonth, getPriorYearMonth, groupBy, trailing3MoAvgQty, isOOS,
} from './metrics.js';

export const CFG = {
  SEASON: 12,
  HORIZON: 3,
  LEAD_TIME_DAYS: 15,     // replenishment lead time: stock below this cover = will stock out
  TARGET_COVER_DAYS: 30,  // order-up-to cover
  EXCESS_COVER_DAYS: 60,
  ABC: [0.8, 0.95],       // cumulative revenue cut-offs for A / B
  XYZ: [0.25, 0.5],       // demand CV cut-offs for X / Y (Z = erratic)
  ANOMALY_Z: 3,
  MIN_BASELINE: 6,
};

const sumArr = (a) => a.reduce((x, y) => x + y, 0);
const avg = (a) => (a.length ? sumArr(a) / a.length : 0);
const median = (a) => {
  const s = [...a].sort((x, y) => x - y), m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
};

// ---- 1. Monthly series (respects all filters except month) -----------------
export function monthlySeries(allRecords, filters, months, upTo) {
  const by = {};
  applyFilters(allRecords, { ...filters, month: '' }).forEach((r) => {
    by[r.month] = (by[r.month] || 0) + r.salesValue;
  });
  return months.filter((m) => m <= upTo).map((m) => ({ month: m, value: by[m] || 0 }));
}

// ---- 2. Forecast: backtest-selected model + prediction intervals -------------
// Damped-trend multiplicative Holt-Winters, tuned on a train-only holdout.
function holtWinters(y, h, [a, b, g], phi = 0.9) {
  const L = CFG.SEASON, n = y.length, s1 = avg(y.slice(0, L));
  let level = s1;
  let trend = n >= 2 * L ? (avg(y.slice(L, 2 * L)) - s1) / L : 0;
  const season = y.slice(0, L).map((v) => (s1 > 0 ? v / s1 : 1));
  for (let t = L; t < n; t++) {
    const si = season[t % L] || 1, prev = level;
    level = a * (y[t] / si) + (1 - a) * (prev + phi * trend);
    trend = b * (level - prev) + (1 - b) * phi * trend;
    season[t % L] = g * (y[t] / (level || 1)) + (1 - g) * si;
  }
  const out = [];
  let damp = 0;
  for (let k = 1; k <= h; k++) {
    damp += phi ** k;
    out.push(Math.max(0, (level + damp * trend) * season[(n + k - 1) % L]));
  }
  return out;
}

function tunedHW(y, h) {
  let best = [0.3, 0.1, 0.3];
  if (y.length >= CFG.SEASON + 6) {
    const tr = y.slice(0, -3), te = y.slice(-3);
    let bestErr = Infinity;
    for (const a of [0.2, 0.4, 0.6]) for (const b of [0.05, 0.15]) for (const g of [0.1, 0.3, 0.5]) {
      const err = avg(holtWinters(tr, 3, [a, b, g]).map((v, i) => Math.abs(v - te[i])));
      if (err < bestErr) { bestErr = err; best = [a, b, g]; }
    }
  }
  return holtWinters(y, h, best);
}

const MODELS = {
  'Holt-Winters (damped, seasonal)': (y, h) => (y.length >= CFG.SEASON + 3 ? tunedHW(y, h) : null),
  'Seasonal naive × recent trend': (y, h) => {
    const n = y.length, L = CFG.SEASON;
    if (n < L + 3) return null;
    const ly3 = sumArr(y.slice(n - 3 - L, n - L));
    const g = ly3 > 0 ? Math.min(1.5, Math.max(0.6, sumArr(y.slice(-3)) / ly3)) : 1;
    return Array.from({ length: h }, (_, k) => y[n - L + k] * g);
  },
  'Recent average (no seasonality)': (y, h) => Array(h).fill(avg(y.slice(-3))),
};

export function forecastSales(series, h = CFG.HORIZON) {
  const y = series.map((p) => p.value);
  if (y.length < 6 || avg(y) === 0) return null;
  // Rolling-origin backtest: 4 origins x 3-step-ahead. No model sees its own test data.
  const origins = [6, 5, 4, 3].map((k) => y.length - k).filter((o) => o >= 6);
  const leaderboard = Object.entries(MODELS).map(([name, fn]) => {
    const sq = [], pe = [];
    origins.forEach((o) => {
      const f = fn(y.slice(0, o), 3);
      if (f) f.forEach((v, i) => { const act = y[o + i]; sq.push((act - v) ** 2); if (act > 0) pe.push(Math.abs(act - v) / act); });
    });
    return sq.length ? { key: name, name, mape: avg(pe) * 100, rmse: Math.sqrt(avg(sq)) } : null;
  }).filter(Boolean).sort((a, b) => a.mape - b.mape);
  if (!leaderboard.length) return null;

  const best = leaderboard[0];
  const f = MODELS[best.name](y, h);
  const last = series[series.length - 1].month;
  const sigma = Math.max(best.rmse, avg(y.slice(-6)) * 0.03); // floor: never claim <3% uncertainty
  return {
    method: best.name, mape: best.mape, leaderboard,
    points: f.map((v, i) => {
      const w = 1.28 * sigma * Math.sqrt(i + 1); // ~80% interval, widening with horizon
      return { month: getPriorMonth(last, -(i + 1)), value: v, lo: Math.max(0, v - w), hi: v + w };
    }),
  };
}

// ---- 3. Anomalies: is this month's YoY growth abnormal for THIS entity? ----
// Robust z-score (median/MAD) of log-YoY vs the entity's own history, so
// seasonality (same month LY) is controlled for and outliers don't pollute the baseline.
export function detectAnomalies(allRecords, filters, months, dim, month) {
  const by = {};
  applyFilters(allRecords, { ...filters, month: '' }).forEach((r) => {
    const e = r[dim];
    if (!e) return;
    const o = (by[e] = by[e] || {});
    o[r.month] = (o[r.month] || 0) + r.salesValue;
  });
  const hist = months.filter((m) => m <= month);
  const flagged = [];
  let scanned = 0;
  Object.entries(by).forEach(([key, o]) => {
    const gs = hist.map((m) => {
      const c = o[m], l = o[getPriorYearMonth(m)];
      return c > 0 && l > 0 ? { m, g: Math.log(c / l) } : null;
    }).filter(Boolean);
    const latest = gs.find((x) => x.m === month);
    const base = gs.filter((x) => x.m !== month).map((x) => x.g);
    if (!latest || base.length < CFG.MIN_BASELINE) return;
    scanned++;
    const med = median(base);
    const mad = Math.max(median(base.map((v) => Math.abs(v - med))), 0.02);
    const z = (0.6745 * (latest.g - med)) / mad;
    if (Math.abs(z) < CFG.ANOMALY_Z) return;
    const expected = o[getPriorYearMonth(month)] * Math.exp(med);
    flagged.push({
      key, sales: o[month], expected, impact: o[month] - expected,
      yoy: (Math.exp(latest.g) - 1) * 100, z, signal: z > 0 ? 'Spike' : 'Drop',
    });
  });
  flagged.sort((a, b) => Math.abs(b.impact) - Math.abs(a.impact));
  return { scanned, flagged };
}

// ---- 4. YoY growth bridge at SKU × store level ---------------------------------
// LY + new listings − lost listings + volume (same SKU×store) + price = CY  (exact identity)
export function growthBridge(allRecords, filters, month) {
  const agg = (recs) => {
    const m = {};
    recs.forEach((r) => {
      const o = (m[`${r.outletCode}|${r.skuCode}`] ||= { v: 0, q: 0 });
      o.v += r.salesValue; o.q += r.salesQty;
    });
    return m;
  };
  const cy = agg(applyFilters(allRecords, { ...filters, month }));
  const ly = agg(applyFilters(allRecords, { ...filters, month: getPriorYearMonth(month) }));
  let lyTot = 0, cyTot = 0, add = 0, drop = 0, vol = 0, price = 0, cLy = 0, cCy = 0;
  new Set([...Object.keys(cy), ...Object.keys(ly)]).forEach((k) => {
    const c = cy[k] || { v: 0, q: 0 }, l = ly[k] || { v: 0, q: 0 };
    lyTot += l.v; cyTot += c.v;
    if (l.q > 0 && c.q > 0) {
      const la = l.v / l.q, ca = c.v / c.q;
      vol += (c.q - l.q) * la; price += c.q * (ca - la); cLy += l.v; cCy += c.v;
    } else if (c.q > 0) add += c.v;
    else if (l.q > 0) drop -= l.v;
  });
  if (lyTot === 0) return null;
  return {
    ly: lyTot, cy: cyTot, add, drop, vol, price,
    growthPct: (cyTot / lyTot - 1) * 100,
    lflPct: cLy > 0 ? (cCy / cLy - 1) * 100 : null, // like-for-like: only SKU×stores live in both years
  };
}

// ---- 5. ABC-XYZ: value × demand predictability (trailing 12 months) ----------------
export function abcXyz(allRecords, filters, months, month) {
  const win = months.filter((m) => m <= month).slice(-12);
  const inWin = new Set(win);
  const bySku = {};
  applyFilters(allRecords, { ...filters, month: '' }).forEach((r) => {
    if (!inWin.has(r.month)) return;
    const o = (bySku[r.skuCode] ||= { sku: r.sku, val: 0, q: {} });
    o.val += r.salesValue; o.q[r.month] = (o.q[r.month] || 0) + r.salesQty;
  });
  const rows = Object.entries(bySku).map(([skuCode, o]) => {
    const qs = win.map((m) => o.q[m] || 0), mu = avg(qs);
    const cv = mu > 0 ? Math.sqrt(avg(qs.map((v) => (v - mu) ** 2))) / mu : Infinity;
    return { skuCode, sku: o.sku, sales: o.val, cv };
  }).sort((a, b) => b.sales - a.sales);
  const total = sumArr(rows.map((r) => r.sales));
  if (!rows.length || total <= 0) return null;
  let cum = 0;
  rows.forEach((r) => {
    const before = cum / total; cum += r.sales;
    r.abc = before < CFG.ABC[0] ? 'A' : before < CFG.ABC[1] ? 'B' : 'C';
    r.xyz = r.cv <= CFG.XYZ[0] ? 'X' : r.cv <= CFG.XYZ[1] ? 'Y' : 'Z';
    r.cls = r.abc + r.xyz;
  });
  const summary = Object.entries(groupBy(rows, 'cls')).map(([cls, rs]) => ({
    key: cls, cls, skus: rs.length, sales: sumArr(rs.map((r) => r.sales)),
    share: (sumArr(rs.map((r) => r.sales)) / total) * 100,
  }));
  return { rows, summary };
}

// ---- 6. Stock-out risk & replenishment (forward-looking) -----------------------------
// Uses trailing-3-month demand (same basis as NOD everywhere else in the app).
export function replenishmentRisk(records, monthlyQtyIndex) {
  const rows = [];
  let excessValue = 0, deadValue = 0;
  records.forEach((r) => {
    if (!r.listed) return;
    const d = trailing3MoAvgQty(r.outletCode, r.skuCode, r.month, monthlyQtyIndex) / 30;
    if (d <= 0) { if (r.stockQty > 0) deadValue += r.stockQty * r.mrp; return; }
    const cover = r.stockQty / d;
    if (cover > CFG.EXCESS_COVER_DAYS) excessValue += (r.stockQty - d * CFG.EXCESS_COVER_DAYS) * r.mrp;
    if (cover < CFG.LEAD_TIME_DAYS) {
      const asp = r.salesQty > 0 ? r.salesValue / r.salesQty : r.mrp;
      rows.push({
        key: `${r.outletCode}|${r.skuCode}`, chain: r.chainName, store: r.outletName, sku: r.sku,
        pareto: r.pareto, stock: r.stockQty, cover,
        orderQty: Math.ceil(Math.max(0, d * CFG.TARGET_COVER_DAYS - r.stockQty)),
        atRisk: (CFG.LEAD_TIME_DAYS - cover) * d * asp,
      });
    }
  });
  rows.sort((a, b) => b.atRisk - a.atRisk);
  return { rows, excessValue, deadValue, atRiskTotal: sumArr(rows.map((r) => r.atRisk)) };
}

// ---- 7. Opportunity model: expected vs actual per SKU × store ------------------------
// Rank-1 (independence) model: expected = storeTotal × skuTotal / grandTotal.
// A cell far below expectation is under-performing for its store and SKU strength;
// an unlisted strong SKU at a strong store is white space (haircut 40%: unproven).
export function opportunityModel(records) {
  const R = {}, C = {}, cells = new Set(), meta = {};
  let T = 0;
  records.forEach((r) => {
    R[r.outletCode] = (R[r.outletCode] || 0) + r.salesValue;
    C[r.skuCode] = (C[r.skuCode] || 0) + r.salesValue;
    T += r.salesValue;
    cells.add(`${r.outletCode}|${r.skuCode}`);
    meta[r.outletCode] = r; meta[`s${r.skuCode}`] = r;
  });
  if (T <= 0) return null;
  const rows = [];
  records.forEach((r) => {
    const e = (R[r.outletCode] * C[r.skuCode]) / T;
    if (e > 0 && r.salesValue < 0.5 * e) {
      rows.push({ key: `u|${r.outletCode}|${r.skuCode}`, type: isOOS(r) ? 'Availability' : 'Velocity', chain: r.chainName,
        store: r.outletName, sku: r.sku, expected: e, actual: r.salesValue, potential: e - r.salesValue });
    }
  });
  const topSkus = Object.entries(C).sort((a, b) => b[1] - a[1]).slice(0, 15).map((x) => x[0]);
  Object.keys(R).forEach((o) => topSkus.forEach((s) => {
    if (cells.has(`${o}|${s}`)) return;
    const e = (R[o] * C[s]) / T * 0.6;
    rows.push({ key: `w|${o}|${s}`, type: 'Distribution', chain: meta[o].chainName, store: meta[o].outletName,
      sku: meta[`s${s}`].sku, expected: e, actual: 0, potential: e });
  }));
  rows.sort((a, b) => b.potential - a.potential);
  return { rows: rows.slice(0, 200), total: sumArr(rows.map((r) => r.potential)), count: rows.length };
}

// ---- 8. Store segmentation: k-means on standardised features ----------------------------
export function clusterStores(records, k = 4) {
  const rows = Object.entries(groupBy(records, 'outletCode')).map(([code, rs]) => {
    const sales = sumArr(rs.map((r) => r.salesValue));
    return { key: code, store: rs[0].outletName, chain: rs[0].chainName, sales,
      skus: new Set(rs.map((r) => r.skuCode)).size, oos: (rs.filter(isOOS).length / rs.length) * 100,
      margin: sales > 0 ? (sumArr(rs.map((r) => r.salesValue * r.marginPct)) / sales) : 0 };
  });
  if (rows.length < 2 * k) return null;
  const F = rows.map((r) => [Math.log1p(r.sales), r.oos, r.margin, r.skus]);
  const mu = [0, 1, 2, 3].map((j) => avg(F.map((f) => f[j])));
  const sd = [0, 1, 2, 3].map((j) => Math.sqrt(avg(F.map((f) => (f[j] - mu[j]) ** 2))) || 1);
  const Z = F.map((f) => f.map((v, j) => (v - mu[j]) / sd[j]));
  const d2 = (a, b) => a.reduce((s, v, j) => s + (v - b[j]) ** 2, 0);
  const cent = [Z[F.map((f) => f[0]).indexOf(Math.max(...F.map((f) => f[0])))]]; // deterministic farthest-point init
  while (cent.length < k) {
    let bi = 0, bd = -1;
    Z.forEach((z, i) => { const d = Math.min(...cent.map((c) => d2(z, c))); if (d > bd) { bd = d; bi = i; } });
    cent.push(Z[bi]);
  }
  let asg = [];
  for (let it = 0; it < 25; it++) {
    asg = Z.map((z) => { let bi = 0, bd = Infinity; cent.forEach((c, i) => { const d = d2(z, c); if (d < bd) { bd = d; bi = i; } }); return bi; });
    cent.forEach((_, i) => { const m = Z.filter((__, j) => asg[j] === i); if (m.length) cent[i] = m[0].map((__, j) => avg(m.map((v) => v[j]))); });
  }
  const cl = [...Array(k).keys()].map((i) => {
    const m = rows.filter((_, j) => asg[j] === i);
    return { i, sales: avg(m.map((r) => r.sales)), oos: avg(m.map((r) => r.oos)), skus: avg(m.map((r) => r.skus)), n: m.length };
  }).filter((c) => c.n);
  const left = [...cl], name = {};
  const take = (label, fn) => { if (!left.length) return; const c = left.reduce((a, b) => (fn(b) > fn(a) ? b : a)); name[c.i] = label; left.splice(left.indexOf(c), 1); };
  take('Flagship', (c) => c.sales); take('Supply-constrained', (c) => c.oos); take('Under-ranged', (c) => -c.skus);
  left.forEach((c) => { name[c.i] = 'Core'; });
  rows.forEach((r, j) => { r.segment = name[asg[j]]; });
  const PLAY = { Flagship: 'Protect availability; showcase launches', 'Supply-constrained': 'Fix replenishment before pushing volume',
    'Under-ranged': 'Add proven SKUs from the opportunity list', Core: 'Maintain; watch for drift' };
  const summary = Object.entries(groupBy(rows, 'segment')).map(([seg, rs]) => ({
    key: seg, segment: seg, stores: rs.length, sales: avg(rs.map((r) => r.sales)), oos: avg(rs.map((r) => r.oos)),
    skus: avg(rs.map((r) => r.skus)), play: PLAY[seg] }));
  return { rows, summary };
}

// ---- 9. Promo / price elasticity with a significance guard -------------------------------
// log(qty) ~ log(ASP/MRP), demeaned by SKU then by month (approximate two-way fixed effects).
// Reports "Not significant" rather than a misleading number when the data can't support one.
export function promoElasticity(allRecords, filters, dim = 'category') {
  const base = applyFilters(allRecords, { ...filters, month: '' }).filter((r) => r.salesQty > 0 && r.salesValue > 0 && r.mrp > 0);
  return Object.entries(groupBy(base, dim)).map(([key, rs]) => {
    const pts = rs.map((r) => ({ x: Math.log(r.salesValue / r.salesQty / r.mrp), y: Math.log(r.salesQty), s: r.skuCode, m: r.month }));
    ['x', 'y'].forEach((f) => ['s', 'm'].forEach((g) => {
      const sm = {}, ct = {};
      pts.forEach((p) => { sm[p[g]] = (sm[p[g]] || 0) + p[f]; ct[p[g]] = (ct[p[g]] || 0) + 1; });
      pts.forEach((p) => { p[f] -= sm[p[g]] / ct[p[g]]; });
    }));
    const n = pts.length, sxx = sumArr(pts.map((p) => p.x * p.x)), sxy = sumArr(pts.map((p) => p.x * p.y));
    if (n < 30 || sxx < 1e-9) return null;
    const b = sxy / sxx, ssr = sumArr(pts.map((p) => (p.y - b * p.x) ** 2));
    const t = b / Math.sqrt(ssr / (n - 2) / sxx);
    const verdict = t <= -2 ? (b < -1 ? 'Elastic — discounts grow revenue' : 'Inelastic — discounts give margin away') : 'Not significant — do not use for pricing';
    return { key, group: key, elasticity: b, t, n, verdict };
  }).filter(Boolean);
}
