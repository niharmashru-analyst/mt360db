import React, { useMemo } from 'react';
import { useFilters } from '../context/FilterContext.jsx';
import KpiCard from '../components/KpiCard.jsx';
import DataTable from '../components/DataTable.jsx';
import Callout from '../components/Callout.jsx';
import {
  isOOS, buildAvgMonthlySalesByKey, groupBy, sumSalesValue,
  formatCurrency, formatNumber,
} from '../data/metrics.js';

// Builds a simple opportunity score per SKU-outlet combo from OOS status,
// NOD extremes, and relative velocity vs the SKU's own chain-wide average.
export default function OpportunityEngine() {
  const { filteredRecords, allRecords, listingMatrix, skuMaster } = useFilters();

  const avgSalesMap = useMemo(() => buildAvgMonthlySalesByKey(allRecords), [allRecords]);

  const opportunities = useMemo(() => {
    const results = [];

    // 1. Availability opportunities — OOS on priority SKUs
    filteredRecords.filter(isOOS).forEach((r) => {
      if (r.pareto === 'Others') return; // focus on priority SKUs
      const key = `${r.outletCode}|${r.skuCode}`;
      const potential = avgSalesMap[key] || r.salesValue;
      results.push({
        key: `avail-${key}`,
        type: 'Availability',
        chain: r.chainName,
        store: r.outletName,
        sku: r.sku,
        why: 'Out of stock on a priority SKU',
        potential,
      });
    });

    // 2. Distribution opportunities — SKU sells well elsewhere in the chain but isn't listed here
    const skuVelocityBySkuCode = {};
    groupBy(filteredRecords, 'skuCode');
    const bySku = groupBy(filteredRecords, 'skuCode');
    Object.entries(bySku).forEach(([skuCode, recs]) => {
      const listedOutlets = new Set(recs.map((r) => r.outletCode)).size;
      skuVelocityBySkuCode[skuCode] = listedOutlets > 0 ? sumSalesValue(recs) / listedOutlets : 0;
    });

    const listedSet = new Set(listingMatrix.filter((l) => l.listed).map((l) => `${l.outletCode}|${l.skuCode}`));
    const allOutlets = [...new Set(filteredRecords.map((r) => r.outletCode))];
    const highVelocitySkus = Object.entries(skuVelocityBySkuCode)
      .filter(([, v]) => v > 0)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 15); // top 15 SKUs by velocity — check their distribution gaps

    highVelocitySkus.forEach(([skuCode, velocity]) => {
      const meta = skuMaster.find((s) => s.skuCode === skuCode);
      if (!meta) return;
      allOutlets.forEach((outletCode) => {
        const key = `${outletCode}|${skuCode}`;
        if (!listedSet.has(key)) {
          const outletRec = filteredRecords.find((r) => r.outletCode === outletCode);
          results.push({
            key: `dist-${key}`,
            type: 'Distribution',
            chain: outletRec?.chainName || '—',
            store: outletRec?.outletName || outletCode,
            sku: meta.sku,
            why: `High velocity elsewhere (${formatCurrency(velocity)}/outlet), not listed here`,
            potential: velocity * 0.5, // conservative — assume 50% of average velocity if listed
          });
        }
      });
    });

    return results.sort((a, b) => b.potential - a.potential).slice(0, 200);
  }, [filteredRecords, allRecords, listingMatrix, skuMaster, avgSalesMap]);

  const totalPotential = opportunities.reduce((a, o) => a + o.potential, 0);
  const byType = groupBy(opportunities, 'type');

  return (
    <div className="page">
      <h1>SKU × Store Opportunity Engine</h1>
      <p className="page-subtitle">This is the heart of the dashboard — where's the next ₹ of sales hiding?</p>

      <div className="kpi-grid">
        <KpiCard label="Total Opportunities Found" value={formatNumber(opportunities.length)} />
        <KpiCard label="Est. Total Potential" value={formatCurrency(totalPotential)} tone="success" />
        <KpiCard label="Availability Opportunities" value={formatNumber((byType.Availability || []).length)} />
        <KpiCard label="Distribution Opportunities" value={formatNumber((byType.Distribution || []).length)} />
      </div>

      <Callout tone="info" title="How this score works">
        Availability opportunities come from priority SKUs currently OOS. Distribution opportunities come from
        the top 15 highest-velocity SKUs (by sales per listed outlet) checked against every outlet where they
        are NOT currently listed — potential is estimated conservatively at 50% of the SKU's average velocity.
        This is a v1 heuristic — refine the weighting once you've validated a few of these against real outcomes.
      </Callout>

      <div className="section">
        <h2>Growth Opportunities (Top 200 by Potential)</h2>
        <DataTable
          defaultSortKey="potential"
          columns={[
            { key: 'type', label: 'Type' },
            { key: 'chain', label: 'Chain' },
            { key: 'store', label: 'Store' },
            { key: 'sku', label: 'SKU' },
            { key: 'why', label: 'Why' },
            { key: 'potential', label: 'Est. Potential', align: 'right', format: formatCurrency },
          ]}
          rows={opportunities}
        />
      </div>
    </div>
  );
}
