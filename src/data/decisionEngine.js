import { applyFilters, buildAvgMonthlySalesByKey, calcNOD, formatCurrency, getPriorMonth, groupBy, isOOS, marginValue, sum, sumSalesValue, stockValue, trailing3MoAvgQty } from './metrics.js';
import { buildRootCauseAnalysis } from './decisionIntelligence.js';

const PRIORITY_SCORE = { critical: 4, high: 3, medium: 2, low: 1 };

function safe(v) { return Number.isFinite(Number(v)) ? Number(v) : 0; }
function clamp(v, min, max) { return Math.max(min, Math.min(max, v)); }

export function buildDecisionSet(records, allRecords, listingMatrix = [], month, monthlyQtyIndex = {}) {
  const current = records.filter(r => !month || r.month === month);
  const avgSales = buildAvgMonthlySalesByKey(allRecords);
  const decisions = [];
  const push = (d) => decisions.push({
    status: 'open', owner: d.owner || 'Sales Manager', deadline: '', confidence: clamp(Math.round(d.confidence ?? 75), 50, 98),
    score: PRIORITY_SCORE[d.priority] || 1, createdAt: new Date().toISOString(), ...d,
  });

  // 1. OOS / sales-at-risk
  current.filter(isOOS).forEach(r => {
    const key = `${r.outletCode}|${r.skuCode}`;
    const risk = avgSales[key] || r.salesValue || 0;
    if (risk <= 0) return;
    const priority = r.pareto === 'Top 10' ? 'critical' : r.pareto === 'Top 25' ? 'high' : 'medium';
    push({ id: `oos-${key}`, type: 'Availability', priority, entity: `${r.chainName} · ${r.outletName}`, sku: r.sku, title: `Replenish ${r.sku}`, why: `Listed SKU is out of stock while generating demand.`, impact: risk, action: 'Replenish / transfer stock', recommendation: `Prioritize ${r.sku} for ${r.outletName}. Target at least one normal replenishment cycle.`, confidence: r.pareto === 'Top 10' ? 92 : 84, source: 'OOS + trailing sales velocity' });
  });

  // 2. Excess stock / working-capital risk
  current.forEach(r => {
    const avgQty = trailing3MoAvgQty(r.outletCode, r.skuCode, r.month, monthlyQtyIndex);
    const nod = calcNOD(r, monthlyQtyIndex);
    if (r.stockQty > 0 && (nod > 60 || (avgQty === 0 && r.stockQty > 0))) {
      const value = r.stockQty * r.mrp;
      const impact = value * 0.10;
      if (impact <= 0) return;
      push({ id: `excess-${r.outletCode}|${r.skuCode}`, type: 'Inventory', priority: nod > 120 ? 'high' : 'medium', entity: `${r.chainName} · ${r.outletName}`, sku: r.sku, title: `Reduce excess stock: ${r.sku}`, why: avgQty === 0 ? 'Stock exists but there is no trailing demand.' : `Stock cover is approximately ${Math.round(nod)} days.`, impact, action: 'Transfer / liquidate / slow replenishment', recommendation: `Review ${r.sku} before placing further replenishment. Consider transfer to a higher-velocity outlet.`, confidence: avgQty === 0 ? 90 : 78, source: 'NOD + stock value' });
    }
  });

  // 3. Stock variance
  current.forEach(r => {
    const expected = safe(r.opStock) + safe(r.primaryQty) - safe(r.tertiaryQty);
    const variance = safe(r.clStock) - expected;
    const variancePct = expected ? (variance / expected) * 100 : 0;
    if (Math.abs(variancePct) >= 5) {
      const impact = Math.abs(variance) * safe(r.mrp);
      push({ id: `variance-${r.outletCode}|${r.skuCode}`, type: 'Control', priority: Math.abs(variancePct) >= 15 ? 'high' : 'medium', entity: `${r.chainName} · ${r.outletName}`, sku: r.sku, title: `Investigate stock variance: ${r.sku}`, why: `Closing stock differs from expected by ${variancePct.toFixed(1)}%.`, impact, action: 'Investigate reconciliation', recommendation: 'Verify opening stock, inward, sales and physical stock before the next planning cycle.', confidence: 88, source: 'Opening + inward − tertiary vs closing' });
    }
  });

  // 4. Target gap / recovery decisions
  const target = sum(current, 'targetValue');
  const sales = sumSalesValue(current);
  const gap = Math.max(0, target - sales);
  if (gap > 0) {
    const byChain = Object.entries(groupBy(current, 'chainName')).map(([chain, recs]) => ({ chain, sales: sumSalesValue(recs), target: sum(recs, 'targetValue') })).filter(x => x.target > 0).map(x => ({ ...x, gap: Math.max(0, x.target - x.sales) })).sort((a,b) => b.gap-a.gap);
    byChain.slice(0, 5).forEach(x => push({ id: `target-${x.chain}`, type: 'Target Recovery', priority: x.gap > gap * .25 ? 'high' : 'medium', entity: x.chain, title: `Recover target gap in ${x.chain}`, why: `${formatCurrency(x.gap)} remains between sales and target.`, impact: x.gap, action: 'Create recovery plan', recommendation: 'Prioritize OOS fixes, distribution gaps and high-velocity SKUs before adding broad discounting.', confidence: 72, source: 'Sales vs target' }));
  }

  // 5. Margin / promo leakage
  const marginByChain = Object.entries(groupBy(current, 'chainName')).map(([chain, recs]) => ({ chain, sales: sumSalesValue(recs), margin: marginValue(recs), promo: sum(recs, 'promoPct') / Math.max(1,recs.length) })).filter(x => x.sales > 0);
  marginByChain.forEach(x => {
    const m = x.margin / x.sales * 100;
    if (x.promo > 15 && m < 30) {
      const impact = x.sales * Math.max(0, (30 - m) / 100);
      if (impact > 0) push({ id: `promo-${x.chain}`, type: 'Margin', priority: impact > 100000 ? 'high' : 'medium', entity: x.chain, title: `Review promo / margin in ${x.chain}`, why: `Average promo intensity is ${x.promo.toFixed(1)}% while blended margin is ${m.toFixed(1)}%.`, impact, action: 'Review promotion economics', recommendation: 'Separate incremental sales from subsidized sales before extending the promotion.', confidence: 74, source: 'Margin + promotion' });
    }
  });

  // 6. Distribution opportunities using existing listing matrix
  const listedSet = new Set(listingMatrix.filter(l => l.listed).map(l => `${l.outletCode}|${l.skuCode}`));
  const bySku = groupBy(current, 'skuCode');
  Object.entries(bySku).map(([skuCode, recs]) => ({ skuCode, sales: sumSalesValue(recs), outlets: new Set(recs.map(r=>r.outletCode)).size, avg: sumSalesValue(recs) / Math.max(1,new Set(recs.map(r=>r.outletCode)).size), pareto: recs[0]?.pareto })).filter(x => x.sales > 0).sort((a,b)=>b.avg-a.avg).slice(0, 20).forEach(x => {
    const candidateOutlets = [...new Set(current.map(r=>r.outletCode))].filter(o => !listedSet.has(`${o}|${x.skuCode}`));
    if (!candidateOutlets.length) return;
    const meta = current.find(r=>r.skuCode === x.skuCode);
    const impact = x.avg * Math.min(candidateOutlets.length, 5) * 0.5;
    if (impact > 0) push({ id: `dist-${x.skuCode}`, type: 'Distribution', priority: x.pareto === 'Top 10' ? 'high' : 'medium', entity: `${candidateOutlets.length} candidate outlets`, sku: meta?.sku || x.skuCode, title: `Expand distribution for ${meta?.sku || x.skuCode}`, why: `High sales per currently active outlet with distribution headroom.`, impact, action: 'Expand distribution', recommendation: `Test the SKU in up to ${Math.min(candidateOutlets.length,5)} high-potential outlets first.`, confidence: 68, source: 'Sales velocity + listing gap' });
  });

  return decisions.sort((a,b) => (b.impact - a.impact) || (b.score - a.score)).slice(0, 500);
}

export function buildRootCauses(records, allRecords=records, filters={}) {
  const analysis=buildRootCauseAnalysis(allRecords, filters);
  return analysis.drivers.map(d=>({
    driver:`${d.dimension}: ${d.key}`,
    impact:Math.abs(d.change),
    contribution:Math.abs(d.contribution),
    evidence:`${d.current.toLocaleString('en-IN')} vs ${d.prior.toLocaleString('en-IN')} sales; change ${d.change>=0?'+':''}${d.change.toLocaleString('en-IN')}`,
    action:d.change<0?'Investigate decline drivers and prioritize recovery actions':'Validate growth driver and replicate the pattern',
    change:d.change, changePct:d.changePct, dimension:d.dimension, key:d.key
  })).concat(analysis.operationalDrivers.map(d=>({driver:d.driver,impact:Math.abs(d.change),contribution:0,evidence:d.detail,action:d.change<0?'Investigate and assign an owner':'Monitor and validate',change:d.change})));
}

export function buildScenario(records, options={}) {
  const sales = sumSalesValue(records);
  const oos = records.filter(isOOS).length / Math.max(1, records.length) * 100;
  const distributionLift = safe(options.distributionLift);
  const oosTarget = safe(options.oosTarget);
  const velocityLift = safe(options.velocityLift);
  const assortmentLift = safe(options.assortmentLift);
  const distribution = sales * distributionLift / 100 * 0.55;
  const availability = sales * Math.max(0, oos - oosTarget) / 100 * 0.75;
  const velocity = sales * velocityLift / 100;
  const assortment = sales * assortmentLift / 100 * 0.4;
  const incrementalSales = distribution + availability + velocity + assortment;
  const margin = incrementalSales * 0.3;
  return { distribution, availability, velocity, assortment, incrementalSales, margin, riskAdjusted: incrementalSales * 0.75 };
}

export const decisionPriorityScore = PRIORITY_SCORE;
