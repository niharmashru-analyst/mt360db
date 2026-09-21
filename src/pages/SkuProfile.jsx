import React, { useMemo, useState } from 'react';
import { useFilters } from '../context/FilterContext.jsx';
import KpiCard from '../components/KpiCard.jsx';
import DataTable from '../components/DataTable.jsx';
import TrendChart from '../components/TrendChart.jsx';
import StatusBadge from '../components/StatusBadge.jsx';
import {
  applyFilters, sumSalesValue, calcNOD, stockHealthFlag, getPriorYearMonth,
  formatCurrency, formatPct, formatNumber, formatGrowthPct,
} from '../data/metrics.js';

export default function SkuProfile() {
  const { allRecords, filters, months, monthlyQtyIndex } = useFilters();
  const skus = useMemo(() => [...new Set(allRecords.map((r) => r.sku))].sort(), [allRecords]);
  const [selectedSku, setSelectedSku] = useState(skus[0]);

  const records = useMemo(
    () => allRecords.filter((r) => r.sku === selectedSku && r.month === filters.month),
    [allRecords, selectedSku, filters.month]
  );
  const lyRecords = useMemo(
    () => allRecords.filter((r) => r.sku === selectedSku && r.month === getPriorYearMonth(filters.month)),
    [allRecords, selectedSku, filters.month]
  );

  const meta = records[0] || {};
  const sales = sumSalesValue(records);
  const lySales = sumSalesValue(lyRecords);
  const growth = lySales > 0 ? ((sales - lySales) / lySales) * 100 : null;
  const totalStock = records.reduce((a, r) => a + r.stockQty, 0);

  const trendData = useMemo(() => {
    const last6 = months.slice(-6);
    return last6.map((m) => {
      const recs = allRecords.filter((r) => r.sku === selectedSku && r.month === m);
      return {
        label: m.slice(2),
        sales: Math.round(sumSalesValue(recs) / 1000),
        stock: recs.reduce((a, r) => a + r.stockQty, 0),
      };
    });
  }, [months, allRecords, selectedSku]);

  const outletRows = records.map((r) => ({
    key: r.outletCode,
    outlet: r.outletName,
    sales: r.salesValue,
    stock: r.stockQty,
    nod: calcNOD(r, monthlyQtyIndex),
    growth: null,
    status: stockHealthFlag(r, monthlyQtyIndex),
  }));

  return (
    <div className="page">
      <h1>SKU 360</h1>
      <div className="filter-field inline-select">
        <label>Select SKU</label>
        <select value={selectedSku} onChange={(e) => setSelectedSku(e.target.value)}>
          {skus.map((s) => <option key={s} value={s}>{s}</option>)}
        </select>
      </div>

      <div className="two-col">
        <div className="section">
          <h2>Product Info</h2>
          <table className="kv-table">
            <tbody>
              <tr><td>Brand</td><td>{meta.brand}</td></tr>
              <tr><td>Category</td><td>{meta.category} / {meta.subCategory}</td></tr>
              <tr><td>MRP</td><td>{formatCurrency(meta.mrp)}</td></tr>
              <tr><td>Pareto</td><td>{meta.pareto}</td></tr>
              <tr><td>Status</td><td>{meta.status && <StatusBadge status={meta.status} />}</td></tr>
            </tbody>
          </table>
        </div>
        <div className="kpi-grid kpi-grid-compact">
          <KpiCard label="Sales (MTD)" value={formatCurrency(sales)} />
          <KpiCard label="Growth % YoY" value={formatGrowthPct(growth)} tone={growth === null ? 'neutral' : growth >= 0 ? 'success' : 'danger'} />
          <KpiCard label="Stock Qty" value={formatNumber(totalStock)} />
          <KpiCard label="Outlets Listed" value={records.length} />
        </div>
      </div>

      <div className="two-col">
        <div className="section">
          <h2>Sales Trend (₹K)</h2>
          <TrendChart data={trendData} series={[{ dataKey: 'sales', name: 'Sales (₹K)', color: '#6366f1' }]} />
        </div>
        <div className="section">
          <h2>Stock Trend (Units)</h2>
          <TrendChart data={trendData} series={[{ dataKey: 'stock', name: 'Stock (Units)', color: '#06b6d4' }]} />
        </div>
      </div>

      <div className="section">
        <h2>Outlet Performance</h2>
        <DataTable
          defaultSortKey="sales"
          columns={[
            { key: 'outlet', label: 'Outlet' },
            { key: 'sales', label: 'Sales', align: 'right', format: formatCurrency },
            { key: 'stock', label: 'Stock', align: 'right', format: formatNumber },
            { key: 'nod', label: 'NOD', align: 'right', format: (v) => (isFinite(v) ? v.toFixed(0) : '∞') },
            { key: 'status', label: 'Status', format: (v) => <StatusBadge status={v} /> },
          ]}
          rows={outletRows}
        />
      </div>
    </div>
  );
}
