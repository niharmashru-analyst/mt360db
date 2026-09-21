import React, { useMemo, useState } from 'react';
import { useFilters } from '../context/FilterContext.jsx';
import KpiCard from '../components/KpiCard.jsx';
import DataTable from '../components/DataTable.jsx';
import Callout from '../components/Callout.jsx';
import StatusBadge from '../components/StatusBadge.jsx';
import {
  applyFilters, sumSalesValue, avgNODForScope, oosPct, calcNOD, stockHealthFlag, getPriorYearMonth,
  formatCurrency, formatPct, formatNumber, formatGrowthPct,
} from '../data/metrics.js';

export default function StoreProfile() {
  const { allRecords, filters, monthlyQtyIndex } = useFilters();
  const outlets = useMemo(
    () => [...new Set(allRecords.map((r) => r.outletName))].sort(),
    [allRecords]
  );
  const [selectedOutlet, setSelectedOutlet] = useState(outlets[0]);

  const records = useMemo(
    () => allRecords.filter((r) => r.outletName === selectedOutlet && r.month === filters.month),
    [allRecords, selectedOutlet, filters.month]
  );
  const outletHistory = useMemo(
    () => allRecords.filter((r) => r.outletName === selectedOutlet),
    [allRecords, selectedOutlet]
  );
  const lyRecords = useMemo(
    () => allRecords.filter((r) => r.outletName === selectedOutlet && r.month === getPriorYearMonth(filters.month)),
    [allRecords, selectedOutlet, filters.month]
  );

  const sales = sumSalesValue(records);
  const lySales = sumSalesValue(lyRecords);
  const growth = lySales > 0 ? ((sales - lySales) / lySales) * 100 : null;

  const skuRows = records.map((r) => ({
    key: r.skuCode,
    sku: r.sku,
    sales: r.salesValue,
    stock: r.stockQty,
    nod: calcNOD(r, monthlyQtyIndex),
    pareto: r.pareto,
    status: stockHealthFlag(r, monthlyQtyIndex),
  }));

  const opportunityRows = skuRows.filter((r) => r.status === 'OOS' && r.pareto !== 'Others')
    .sort((a, b) => b.sales - a.sales);

  return (
    <div className="page">
      <h1>Store 360</h1>
      <div className="filter-field inline-select">
        <label>Select Outlet</label>
        <select value={selectedOutlet} onChange={(e) => setSelectedOutlet(e.target.value)}>
          {outlets.map((o) => <option key={o} value={o}>{o}</option>)}
        </select>
      </div>

      <div className="kpi-grid">
        <KpiCard label="Sales (MTD)" value={formatCurrency(sales)} />
        <KpiCard label="Growth % YoY" value={formatGrowthPct(growth)} tone={growth === null ? 'neutral' : growth >= 0 ? 'success' : 'danger'} />
        <KpiCard label="Contribution to Chain" value="—" subtext="see Retailer 360" />
        <KpiCard label="Avg NOD" value={`${avgNODForScope(records, outletHistory, filters.month).toFixed(0)} days`} />
        <KpiCard label="OOS %" value={formatPct(oosPct(records))} tone={oosPct(records) > 10 ? 'danger' : 'success'} />
        <KpiCard label="SKUs Listed" value={records.length} />
      </div>

      <div className="section">
        <h2>SKU Performance at this Store</h2>
        <DataTable
          defaultSortKey="sales"
          columns={[
            { key: 'sku', label: 'SKU' },
            { key: 'sales', label: 'Sales', align: 'right', format: formatCurrency },
            { key: 'stock', label: 'Stock', align: 'right', format: formatNumber },
            { key: 'nod', label: 'NOD', align: 'right', format: (v) => (isFinite(v) ? v.toFixed(0) : '∞') },
            { key: 'pareto', label: 'Pareto' },
            { key: 'status', label: 'Status', format: (v) => <StatusBadge status={v} /> },
          ]}
          rows={skuRows}
        />
      </div>

      {opportunityRows.length > 0 && (
        <Callout tone="danger" title="Store Opportunity — High-Priority SKUs Out of Stock">
          {opportunityRows.length} Top/Priority-Pareto SKUs are OOS at this store, representing potential lost sales.
          Top of the list: <strong>{opportunityRows[0].sku}</strong>.
        </Callout>
      )}
    </div>
  );
}
