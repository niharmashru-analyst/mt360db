import React, { useMemo } from 'react';
import { useFilters } from '../context/FilterContext.jsx';
import KpiCard from '../components/KpiCard.jsx';
import DataTable from '../components/DataTable.jsx';
import Callout from '../components/Callout.jsx';
import StatusBadge from '../components/StatusBadge.jsx';
import { groupBy, sumSalesValue, formatCurrency, formatPct, formatNumber } from '../data/metrics.js';

export default function Assortment() {
  const { filteredRecords, skuMaster } = useFilters();

  const activeSkuCount = skuMaster.filter((s) => s.status === 'Active').length;
  const sellingSkus = new Set(filteredRecords.filter((r) => r.salesQty > 0).map((r) => r.skuCode));
  const nonSellingActive = skuMaster.filter((s) => s.status === 'Active' && !sellingSkus.has(s.skuCode));

  const skuRows = useMemo(() => {
    const groups = groupBy(filteredRecords, 'skuCode');
    return Object.entries(groups).map(([skuCode, recs]) => {
      const meta = skuMaster.find((s) => s.skuCode === skuCode) || {};
      const outlets = new Set(recs.map((r) => r.outletCode)).size;
      const sales = sumSalesValue(recs);
      return {
        key: skuCode,
        sku: meta.sku || skuCode,
        pareto: meta.pareto,
        status: meta.status,
        outlets,
        sales,
        salesPerOutlet: outlets > 0 ? sales / outlets : 0,
      };
    });
  }, [filteredRecords, skuMaster]);

  const totalSales = skuRows.reduce((a, r) => a + r.sales, 0);
  const sortedByPareto = [...skuRows].sort((a, b) => b.sales - a.sales);
  const bottom40Pct = sortedByPareto.slice(Math.floor(sortedByPareto.length * 0.6));
  const bottomContribution = bottom40Pct.reduce((a, r) => a + r.sales, 0);
  const bottomContributionPct = totalSales > 0 ? (bottomContribution / totalSales) * 100 : 0;

  return (
    <div className="page">
      <h1>Assortment Analytics</h1>
      <p className="page-subtitle">Not every SKU deserves equal shelf space.</p>

      <div className="kpi-grid">
        <KpiCard label="Active SKUs" value={formatNumber(activeSkuCount)} />
        <KpiCard label="Selling SKUs (this month)" value={formatNumber(sellingSkus.size)} />
        <KpiCard label="Non-Selling Active SKUs" value={formatNumber(nonSellingActive.length)} tone="warning" />
        <KpiCard label="Bottom 40% SKU Contribution" value={formatPct(bottomContributionPct)} tone="warning" />
      </div>

      <Callout tone="warning" title="Tail Assortment Check">
        The bottom 40% of SKUs by sales contribute only <strong>{formatPct(bottomContributionPct)}</strong> of
        total sales in the current filter — worth reviewing whether this tail is worth the stock investment and
        shelf space it occupies.
      </Callout>

      <div className="section">
        <h2>SKU Productivity</h2>
        <DataTable
          defaultSortKey="salesPerOutlet"
          columns={[
            { key: 'sku', label: 'SKU' },
            { key: 'pareto', label: 'Pareto' },
            { key: 'status', label: 'Status', format: (v) => <StatusBadge status={v} /> },
            { key: 'outlets', label: 'Outlets Selling', align: 'right' },
            { key: 'sales', label: 'Total Sales', align: 'right', format: formatCurrency },
            { key: 'salesPerOutlet', label: 'Sales / Outlet', align: 'right', format: formatCurrency },
          ]}
          rows={skuRows}
        />
      </div>
    </div>
  );
}
