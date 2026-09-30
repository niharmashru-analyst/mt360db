import React, { useMemo } from 'react';
import { useFilters } from '../context/FilterContext.jsx';
import KpiCard from '../components/KpiCard.jsx';
import DataTable from '../components/DataTable.jsx';
import Callout from '../components/Callout.jsx';
import {
  isOOS, oosPct, buildAvgMonthlySalesByKey, estimateSalesAtRisk, avgNOD,
  formatCurrency, formatPct, formatNumber,
} from '../data/metrics.js';

export default function Availability() {
  const { filteredRecords, allRecords, filters } = useFilters();

  const avgSalesMap = useMemo(() => buildAvgMonthlySalesByKey(allRecords), [allRecords]);

  const oosRecords = useMemo(() => filteredRecords.filter(isOOS), [filteredRecords]);
  const salesAtRisk = useMemo(() => estimateSalesAtRisk(filteredRecords, avgSalesMap), [filteredRecords, avgSalesMap]);

  const priorityList = useMemo(() => {
    return oosRecords.map((r) => {
      const key = `${r.outletCode}|${r.skuCode}`;
      const estRisk = avgSalesMap[key] || r.salesValue;
      return {
        key,
        chain: r.chainName,
        outlet: r.outletName,
        sku: r.sku,
        pareto: r.pareto,
        estRisk,
      };
    }).sort((a, b) => b.estRisk - a.estRisk);
  }, [oosRecords, avgSalesMap]);

  const topPareto = priorityList.filter((r) => r.pareto === 'Top 10' || r.pareto === 'Top 25');
  const excessCount = filteredRecords.filter((r) => {
    const rate = r.salesQty / 30;
    return rate > 0 && r.stockQty / rate > 60;
  }).length;

  return (
    <div className="page">
      <h1>Availability / OOS</h1>
      <p className="page-subtitle">No stock = no sale. This is treated as a major page, not a small KPI.</p>

      <div className="kpi-grid">
        <KpiCard label="OOS %" value={formatPct(oosPct(filteredRecords))} tone="danger" />
        <KpiCard label="OOS SKU-Store Combos" value={formatNumber(oosRecords.length)} />
        <KpiCard label="Est. Sales at Risk" value={formatCurrency(salesAtRisk)} tone="danger" />
        <KpiCard label="Top/Priority Pareto OOS" value={formatNumber(topPareto.length)} tone="warning" />
        <KpiCard label="Avg NOD" value={`${avgNOD(filteredRecords, allRecords, filters).toFixed(0)} days`} />
        <KpiCard label="Excess Stock Combos" value={formatNumber(excessCount)} tone="warning" />
      </div>

      <Callout tone="danger" title="Sales at Risk">
        <strong>{formatCurrency(salesAtRisk)}</strong> in estimated monthly sales is at risk because of{' '}
        <strong>{oosRecords.length}</strong> OOS SKU-store combinations, of which{' '}
        <strong>{topPareto.length}</strong> are Top/Priority Pareto SKUs — fix these first.
      </Callout>

      <div className="section">
        <h2>Priority Replenishment List</h2>
        <DataTable
          defaultSortKey="estRisk"
          columns={[
            { key: 'chain', label: 'Chain' },
            { key: 'outlet', label: 'Outlet' },
            { key: 'sku', label: 'SKU' },
            { key: 'pareto', label: 'Pareto' },
            { key: 'estRisk', label: 'Est. Sales at Risk', align: 'right', format: formatCurrency },
          ]}
          rows={priorityList}
        />
      </div>
    </div>
  );
}
