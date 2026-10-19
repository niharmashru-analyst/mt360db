// INSIGHT ENGINE — turns records into ranked, ₹-valued, plain-language insights.
// Pure functions. Every insight: what happened, why, how much it's worth, what to do.
import { applyFilters, getPriorYearMonth, formatCurrency as inr } from './metrics.js';
import { growthBridge, monthlySeries, forecastSales, replenishmentRisk } from './analytics.js';

const sum = (a, f) => a.reduce((s, x) => s + f(x), 0);
const by = (recs, key, f = (r) => r.salesValue) => { const m = {}; recs.forEach((r) => { m[r[key]] = (m[r[key]] || 0) + f(r); }); return m; };
const pct = (a, b) => (b > 0 ? (a / b - 1) * 100 : null);
const clamp = (v) => Math.max(0, Math.min(100, v));

export function buildInsights({ allRecords, filters, months, month, records, idx }) {
  const lyM = getPriorYearMonth(month);
  const lyRecs = applyFilters(allRecords, { ...filters, month: lyM });
  const total = sum(records, (r) => r.salesValue), lyTotal = sum(lyRecs, (r) => r.salesValue);
  const yoy = pct(total, lyTotal);
  const out = [];

  // 1. Growth drivers + quality of growth
  const bridge = growthBridge(allRecords, filters, month);
  if (bridge) {
    const d = bridge.cy - bridge.ly;
    const parts = [['volume', bridge.vol], ['price / mix', bridge.price], ['new listings', bridge.add], ['lost listings', bridge.drop]].sort((a, b) => Math.abs(b[1]) - Math.abs(a[1]));
    const lfl = bridge.lflPct;
    out.push({
      id: 'growth', tone: d >= 0 ? 'success' : 'danger', tag: 'Growth driver', impact: d,
      title: `${month} sales ${d >= 0 ? 'grew' : 'fell'} ${inr(Math.abs(d))} (${bridge.growthPct.toFixed(1)}%) vs last year`,
      why: `Main driver: ${parts[0][0]} (${parts[0][1] >= 0 ? '+' : '−'}${inr(Math.abs(parts[0][1]))}). Like-for-like growth on the same SKU × stores is ${lfl == null ? 'n/a' : lfl.toFixed(1) + '%'}${lfl != null && lfl < bridge.growthPct - 3 ? ' — headline growth leans on new listings, not on existing shelves.' : '.'}`,
      action: lfl != null && lfl < bridge.growthPct - 3 ? 'Protect the base: audit lost listings and push velocity on existing SKU × store pairs.' : 'Keep the mix; replicate what works in lagging chains.',
    });
  }

  // 2. Chain momentum (ignores chain filter so all chains are compared)
  const cf = { ...filters, chainName: '' };
  const curC = applyFilters(allRecords, { ...cf, month }), lyC = applyFilters(allRecords, { ...cf, month: lyM });
  const cs = by(curC, 'chainName'), ls = by(lyC, 'chainName');
  const allCur = sum(curC, (r) => r.salesValue), allLy = sum(lyC, (r) => r.salesValue), allYoy = pct(allCur, allLy);
  const chainRows = Object.keys(cs).map((c) => ({ chain: c, sales: cs[c], ly: ls[c] || 0, yoy: pct(cs[c], ls[c] || 0) })).filter((c) => c.yoy != null);
  if (chainRows.length > 1 && allYoy != null) {
    const sorted = [...chainRows].sort((a, b) => a.yoy - b.yoy), lag = sorted[0], lead = sorted[sorted.length - 1];
    out.push({
      id: 'chain', tone: lag.yoy < allYoy - 5 ? 'warning' : 'info', tag: 'Chain momentum', impact: -((allYoy - lag.yoy) / 100) * lag.ly,
      title: `${lag.chain} is the laggard at ${lag.yoy.toFixed(1)}% YoY while ${lead.chain} leads at ${lead.yoy.toFixed(1)}%`,
      why: `If ${lag.chain} had grown at the channel rate (${allYoy.toFixed(1)}%), sales would be ${inr(((allYoy - lag.yoy) / 100) * lag.ly)} higher.`,
      action: `Review ${lag.chain}'s listings, OOS and visibility against ${lead.chain}'s playbook.`,
    });
  }

  // 3. Stock-out risk + excess capital
  const rep = replenishmentRisk(records, idx);
  if (rep.rows.length) {
    const byChain = by(rep.rows, 'chain', (r) => r.atRisk), top = Object.entries(byChain).sort((a, b) => b[1] - a[1])[0];
    out.push({
      id: 'stockout', tone: 'danger', tag: 'Stock-out risk', impact: -rep.atRiskTotal,
      title: `${rep.rows.length} SKU × store pairs will run out before replenishment arrives`,
      why: `${inr(rep.atRiskTotal)} of sales at risk; ${top[0]} carries ${inr(top[1])} of it. Worst: ${rep.rows[0].sku} at ${rep.rows[0].store} (${rep.rows[0].cover.toFixed(0)} days cover).`,
      action: `Raise orders now — ${rep.rows.slice(0, 3).map((r) => `${r.sku} @ ${r.store} (${r.orderQty} pcs)`).join('; ')}.`,
    });
  }
  if (rep.excessValue > 0 || rep.deadValue > 0) {
    out.push({
      id: 'excess', tone: 'warning', tag: 'Working capital', impact: -0.1 * (rep.excessValue + rep.deadValue), // stock is not lost sales: ranked at ~10% holding / markdown cost
      title: `${inr(rep.excessValue + rep.deadValue)} of stock sits beyond 60 days cover or has no sales`,
      why: `${inr(rep.excessValue)} is excess cover, ${inr(rep.deadValue)} has no sales in the trailing window (at MRP). Impact shown is an estimated ~10% holding / markdown cost: ${inr(0.1 * (rep.excessValue + rep.deadValue))}.`,
      action: 'Redistribute to fast-moving stores or run a targeted push before this ages further.',
    });
  }

  // 4. Concentration risk
  const skuS = Object.entries(by(records, 'sku')).sort((a, b) => b[1] - a[1]);
  if (skuS.length > 5 && total > 0) {
    const t3 = sum(skuS.slice(0, 3), (x) => x[1]) / total * 100;
    out.push({
      id: 'conc', tone: t3 > 40 ? 'warning' : 'info', tag: 'Concentration', impact: -sum(skuS.slice(0, 3), (x) => x[1]) * 0.1,
      title: `Top 3 SKUs deliver ${t3.toFixed(0)}% of sales`,
      why: `${skuS.slice(0, 3).map((x) => x[0]).join(', ')}. A 10% slip on these alone costs ${inr(sum(skuS.slice(0, 3), (x) => x[1]) * 0.1)}.`,
      action: 'Guard availability of these three first; grow the next tier to widen the base.',
    });
  }

  // 5. Outlet decliners
  const oc = by(records, 'outletCode'), ol = by(lyRecs, 'outletCode'), nm = {};
  records.forEach((r) => { nm[r.outletCode] = r; });
  const decl = Object.keys(ol).map((k) => ({ k, loss: ol[k] - (oc[k] || 0), y: pct(oc[k] || 0, ol[k]) })).filter((x) => x.y != null && x.y < -10 && x.loss > 0).sort((a, b) => b.loss - a.loss);
  if (decl.length) {
    out.push({
      id: 'decliners', tone: 'warning', tag: 'Store watchlist', impact: -sum(decl, (x) => x.loss),
      title: `${decl.length} stores are down more than 10% YoY`,
      why: `Combined shortfall ${inr(sum(decl, (x) => x.loss))}. Largest: ${decl.slice(0, 3).map((x) => `${nm[x.k]?.outletName || x.k} (${x.y.toFixed(0)}%)`).join(', ')}.`,
      action: 'Visit the top 3: check OOS days, visibility and manpower before blaming demand.',
    });
  }

  // 6. Forecast vs last year
  const series = monthlySeries(allRecords, filters, months, month);
  const fc = forecastSales(series, 3);
  if (fc) {
    const f = sum(fc.points, (p) => p.value);
    const l = sum(fc.points, (p) => sum(applyFilters(allRecords, { ...filters, month: getPriorYearMonth(p.month) }), (r) => r.salesValue));
    if (l > 0) out.push({
      id: 'forecast', tone: f >= l ? 'success' : 'warning', tag: 'Outlook', impact: f - l,
      title: `Next 3 months forecast at ${inr(f)}, ${pct(f, l).toFixed(1)}% vs same months last year`,
      why: `${fc.method} model, backtest error ${fc.mape.toFixed(1)}% MAPE. 80% range: ${inr(sum(fc.points, (p) => p.lo))} to ${inr(sum(fc.points, (p) => p.hi))}.`,
      action: 'Use this as the baseline for targets and for pre-building stock ahead of the peak.',
    });
  }

  // 7. Category mix shift
  const mc = by(records, 'category'), ml = by(lyRecs, 'category');
  const shift = Object.keys(mc).map((c) => ({ c, d: (mc[c] / total - (ml[c] || 0) / lyTotal) * 100 })).filter((x) => lyTotal > 0 && isFinite(x.d)).sort((a, b) => Math.abs(b.d) - Math.abs(a.d))[0];
  if (shift && Math.abs(shift.d) >= 2) out.push({
    id: 'mix', tone: 'info', tag: 'Mix shift', impact: (shift.d / 100) * total,
    title: `${shift.c} share ${shift.d > 0 ? 'rose' : 'fell'} ${Math.abs(shift.d).toFixed(1)} pts vs last year`,
    why: `It now makes up ${(mc[shift.c] / total * 100).toFixed(0)}% of sales. Mix changes alter margin and stock needs even when total sales look flat.`,
    action: `Check ${shift.c} margin and range depth before the next buy.`,
  });

  out.sort((a, b) => Math.abs(b.impact) - Math.abs(a.impact));

  // ---- chart datasets -----------------------------------------------------
  const win = months.filter((m) => m <= month).slice(-6);
  const heat = chainRows.map((c) => ({
    chain: c.chain,
    cells: win.map((m) => {
      const a = sum(applyFilters(allRecords, { ...cf, month: m, chainName: c.chain }), (r) => r.salesValue);
      const b = sum(applyFilters(allRecords, { ...cf, month: getPriorYearMonth(m), chainName: c.chain }), (r) => r.salesValue);
      return { m, v: pct(a, b) };
    }),
  }));
  const outlets = Object.keys(oc).map((k) => ({
    name: nm[k].outletName, chain: nm[k].chainName, sales: oc[k], yoy: pct(oc[k], ol[k] || 0),
    stock: sum(records.filter((r) => r.outletCode === k), (r) => r.stockQty * r.mrp),
  })).filter((o) => o.yoy != null);
  const radar = Object.keys(cs).map((c) => {
    const rs = curC.filter((r) => r.chainName === c), sv = sum(rs, (r) => r.salesValue), tv = sum(rs, (r) => r.targetValue);
    const cr = chainRows.find((x) => x.chain === c);
    return {
      chain: c, Growth: clamp(50 + (cr?.yoy || 0) * 2.5), Target: tv > 0 ? clamp(sv / tv * 100) : 0,
      'In-stock': clamp(100 - rs.filter((r) => r.stockQty <= 0).length / (rs.length || 1) * 100),
      Margin: clamp(sum(rs, (r) => r.salesValue * r.marginPct) / (sv || 1) * 1.6),
      Visibility: clamp(sum(rs, (r) => r.visibility) / (rs.length || 1)),
    };
  });
  const mix = Object.entries(mc).map(([name, value]) => ({ name, value })).sort((a, b) => b.value - a.value);
  const sub = {};
  records.forEach((r) => { ((sub[r.category] ||= {})[r.subCategory || 'Other'] ||= 0); sub[r.category][r.subCategory || 'Other'] += r.salesValue; });
  const tree = Object.entries(sub).map(([name, kids]) => ({ name, children: Object.entries(kids).map(([n, size]) => ({ name: n, size })) }));

  return { insights: out, total, lyTotal, yoy, bridge, series, fc, heat, win, outlets, radar, mix, tree,
    headline: out.slice(0, 3).map((i) => i.title) };
}
