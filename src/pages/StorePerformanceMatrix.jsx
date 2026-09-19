import React, { useMemo, useState } from 'react';
import { useFilters } from '../context/FilterContext.jsx';
import DataTable from '../components/DataTable.jsx';
import Matrix2x2, { classifyQuadrant } from '../components/Matrix2x2.jsx';
import { groupBy, sumSalesValue, sumStockQty, formatCurrency, formatNumber } from '../data/metrics.js';

export default function StorePerformanceMatrix() {
  const { filteredRecords } = useFilters();
  const [quadrantFilter, setQuadrantFilter] = useState(null);

  const storeStats = useMemo(() => {
    const groups = groupBy(filteredRecords, 'outletName');
    return Object.entries(groups).map(([outlet, recs]) => ({
      key: outlet,
      outlet,
      chain: recs[0]?.chainName,
      sales: sumSalesValue(recs),
      stock: sumStockQty(recs),
    }));
  }, [filteredRecords]);

  const maxSales = Math.max(1, ...storeStats.map((s) => s.sales));
  const maxStock = Math.max(1, ...storeStats.map((s) => s.stock));

  const matrixPoints = storeStats.map((s) => ({
    x: s.stock, y: s.sales, label: s.outlet,
    quadrant: classifyQuadrant(s.stock, s.sales, maxStock * 0.4, maxSales * 0.4),
  }));

  const quadrantLabelToKey = {
    topLeft: 'STAR (High Sales, Low Stock)',
    topRight: 'GROWTH (High Sales, High Stock)',
    bottomLeft: 'RISK (Low Sales, Low Stock)',
    bottomRight: 'SLOW (Low Sales, High Stock)',
  };

  const rows = useMemo(() => {
    if (!quadrantFilter) return [];
    return storeStats.filter((s) => classifyQuadrant(s.stock, s.sales, maxStock * 0.4, maxSales * 0.4) === quadrantFilter);
  }, [storeStats, quadrantFilter, maxStock, maxSales]);

  return (
    <div className="page">
      <h1>Store Performance Matrix</h1>
      <p className="page-subtitle">High sales + low stock = opportunity. Low sales + high stock = inventory risk.</p>

      <div className="quadrant-buttons">
        <button className="q-btn q-warning" onClick={() => setQuadrantFilter('topLeft')}>⭐ Star</button>
        <button className="q-btn q-success" onClick={() => setQuadrantFilter('topRight')}>🚀 Growth</button>
        <button className="q-btn q-danger" onClick={() => setQuadrantFilter('bottomLeft')}>⚠️ Risk</button>
        <button className="q-btn q-info" onClick={() => setQuadrantFilter('bottomRight')}>💤 Slow</button>
      </div>

      <Matrix2x2
        points={matrixPoints}
        xMid={maxStock * 0.4}
        yMid={maxSales * 0.4}
        labels={{
          topLeft: 'Star', topRight: 'Growth', bottomLeft: 'Risk', bottomRight: 'Slow',
          xAxis: 'Stock Qty', yAxis: 'Sales Value',
        }}
      />

      {quadrantFilter && (
        <div className="section">
          <h2>{quadrantLabelToKey[quadrantFilter]} — {rows.length} stores</h2>
          <DataTable
            defaultSortKey="sales"
            columns={[
              { key: 'chain', label: 'Chain' },
              { key: 'outlet', label: 'Outlet' },
              { key: 'sales', label: 'Sales', align: 'right', format: formatCurrency },
              { key: 'stock', label: 'Stock Qty', align: 'right', format: formatNumber },
            ]}
            rows={rows}
          />
        </div>
      )}
    </div>
  );
}
