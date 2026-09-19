import React, { useMemo, useState } from 'react';
import { useFilters } from '../context/FilterContext.jsx';
import KpiCard from '../components/KpiCard.jsx';
import DataTable from '../components/DataTable.jsx';
import Matrix2x2, { classifyQuadrant } from '../components/Matrix2x2.jsx';
import {
  stockValue, avgNOD, calcNOD, stockHealthFlag, formatCurrency, formatPct, formatNumber,
} from '../data/metrics.js';

export default function Inventory() {
  const { filteredRecords } = useFilters();
  const [quadrantFilter, setQuadrantFilter] = useState(null);

  const withHealth = useMemo(
    () => filteredRecords.map((r) => ({ ...r, health: stockHealthFlag(r), nod: calcNOD(r) })),
    [filteredRecords]
  );

  const excessCount = withHealth.filter((r) => r.health === 'Excess').length;
  const lowCount = withHealth.filter((r) => r.health === 'Low').length;
  const oosCount = withHealth.filter((r) => r.health === 'OOS').length;
  const healthyCount = withHealth.filter((r) => r.health === 'Healthy').length;

  const matrixPoints = useMemo(() => {
    const maxSales = Math.max(1, ...withHealth.map((r) => r.salesValue));
    const maxStock = Math.max(1, ...withHealth.map((r) => r.stockQty));
    // sample down to keep chart legible
    const sampled = withHealth.filter((_, i) => i % Math.max(1, Math.floor(withHealth.length / 300)) === 0);
    return sampled.map((r) => ({
      x: r.stockQty,
      y: r.salesValue,
      label: `${r.sku} @ ${r.outletName}`,
      quadrant: classifyQuadrant(r.stockQty, r.salesValue, maxStock * 0.3, maxSales * 0.3),
    }));
  }, [withHealth]);

  const displayedRows = useMemo(() => {
    if (!quadrantFilter) return [];
    return withHealth.filter((r) => r.health === quadrantFilter).map((r) => ({
      key: `${r.outletCode}|${r.skuCode}`,
      sku: r.sku, outlet: r.outletName, chain: r.chainName,
      stock: r.stockQty, sales: r.salesValue, nod: r.nod,
    }));
  }, [withHealth, quadrantFilter]);

  return (
    <div className="page">
      <h1>Inventory 360</h1>

      <div className="kpi-grid">
        <KpiCard label="Stock Value (est.)" value={formatCurrency(stockValue(filteredRecords))} />
        <KpiCard label="Avg NOD" value={`${avgNOD(filteredRecords).toFixed(0)} days`} />
        <KpiCard label="OOS Combos" value={formatNumber(oosCount)} tone="danger" />
        <KpiCard label="Low Stock Combos" value={formatNumber(lowCount)} tone="warning" />
        <KpiCard label="Excess Combos" value={formatNumber(excessCount)} tone="warning" />
        <KpiCard label="Healthy Combos" value={formatNumber(healthyCount)} tone="success" />
      </div>

      <div className="section">
        <h2>Inventory Matrix — click a quadrant label below to drill in</h2>
        <div className="quadrant-buttons">
          <button onClick={() => setQuadrantFilter('OOS')} className="q-btn q-danger">OOS ({oosCount})</button>
          <button onClick={() => setQuadrantFilter('Healthy')} className="q-btn q-success">Healthy ({healthyCount})</button>
          <button onClick={() => setQuadrantFilter('Low')} className="q-btn q-warning">Low Stock ({lowCount})</button>
          <button onClick={() => setQuadrantFilter('Excess')} className="q-btn q-warning">Excess ({excessCount})</button>
        </div>
        <Matrix2x2
          points={matrixPoints}
          xMid={Math.max(1, ...withHealth.map((r) => r.stockQty)) * 0.3}
          yMid={Math.max(1, ...withHealth.map((r) => r.salesValue)) * 0.3}
          labels={{
            topLeft: 'High Sales / Low Stock (OOS risk)',
            topRight: 'High Sales / High Stock (Healthy)',
            bottomLeft: 'Low Sales / Low Stock (Replenish?)',
            bottomRight: 'Low Sales / High Stock (Excess)',
            xAxis: 'Stock Qty',
            yAxis: 'Sales Value',
          }}
        />
      </div>

      {quadrantFilter && (
        <div className="section">
          <h2>{quadrantFilter} — {displayedRows.length} combinations</h2>
          <DataTable
            defaultSortKey="sales"
            columns={[
              { key: 'chain', label: 'Chain' },
              { key: 'outlet', label: 'Outlet' },
              { key: 'sku', label: 'SKU' },
              { key: 'sales', label: 'Sales', align: 'right', format: formatCurrency },
              { key: 'stock', label: 'Stock', align: 'right', format: formatNumber },
              { key: 'nod', label: 'NOD', align: 'right', format: (v) => (isFinite(v) ? v.toFixed(0) : '∞') },
            ]}
            rows={displayedRows}
          />
        </div>
      )}
    </div>
  );
}
