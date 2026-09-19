import React, { useMemo } from 'react';
import { useFilters } from '../context/FilterContext.jsx';
import KpiCard from '../components/KpiCard.jsx';
import DataTable from '../components/DataTable.jsx';
import Callout from '../components/Callout.jsx';
import {
  isOOS, varianceExceptions, buildAvgMonthlySalesByKey, groupBy, sumSalesValue,
  formatCurrency, formatNumber,
} from '../data/metrics.js';

export default function ActionCenter() {
  const { filteredRecords, allRecords, listingMatrix, skuMaster } = useFilters();
  const avgSalesMap = useMemo(() => buildAvgMonthlySalesByKey(allRecords), [allRecords]);

  const actions = useMemo(() => {
    const list = [];

    // OOS actions
    filteredRecords.filter(isOOS).forEach((r) => {
      const key = `${r.outletCode}|${r.skuCode}`;
      const potential = avgSalesMap[key] || r.salesValue;
      list.push({
        key: `oos-${key}`,
        priority: r.pareto !== 'Others' ? 'high' : 'medium',
        issue: 'OOS',
        area: `${r.chainName} — ${r.outletName}`,
        detail: r.sku,
        potential,
        action: 'Replenish',
      });
    });

    // Excess stock actions
    filteredRecords.forEach((r) => {
      const rate = r.salesQty / 30;
      if (rate > 0 && r.stockQty / rate > 60) {
        list.push({
          key: `excess-${r.outletCode}|${r.skuCode}`,
          priority: 'medium',
          issue: 'Excess Stock',
          area: `${r.chainName} — ${r.outletName}`,
          detail: r.sku,
          potential: r.stockQty * r.mrp * 0.1, // rough carrying-cost-avoided estimate
          action: 'Transfer / liquidate',
        });
      }
    });

    // Variance exceptions
    varianceExceptions(filteredRecords).forEach((r) => {
      list.push({
        key: `var-${r.outletCode}|${r.skuCode}`,
        priority: 'low',
        issue: 'Stock Variance',
        area: `${r.chainName} — ${r.outletName}`,
        detail: `${r.sku} (${r.variancePct.toFixed(1)}% off)`,
        potential: 0,
        action: 'Investigate',
      });
    });

    return list.sort((a, b) => b.potential - a.potential).slice(0, 300);
  }, [filteredRecords, avgSalesMap]);

  const totalOpportunity = actions.reduce((a, r) => a + r.potential, 0);
  const priorityCounts = groupBy(actions, 'priority');

  return (
    <div className="page">
      <h1>⚡ Action Center</h1>
      <p className="page-subtitle">The page a Sales Head opens Monday morning.</p>

      <div className="kpi-grid">
        <KpiCard label="Identified Opportunity" value={formatCurrency(totalOpportunity)} tone="success" />
        <KpiCard label="Total Actions" value={formatNumber(actions.length)} />
        <KpiCard label="High Priority" value={formatNumber((priorityCounts.high || []).length)} tone="danger" />
        <KpiCard label="Medium Priority" value={formatNumber((priorityCounts.medium || []).length)} tone="warning" />
      </div>

      <Callout tone="success" title="This week">
        Not "here are 17 charts" — here are the <strong>{Math.min(20, actions.length)}</strong> things that
        matter most this week, out of {actions.length} total identified issues.
      </Callout>

      <div className="section">
        <h2>Priority Action List</h2>
        <DataTable
          defaultSortKey="potential"
          columns={[
            {
              key: 'priority', label: 'Priority',
              format: (v) => <span className={`priority-dot priority-${v}`}>●</span>,
            },
            { key: 'issue', label: 'Issue' },
            { key: 'area', label: 'Chain / Store' },
            { key: 'detail', label: 'Detail' },
            { key: 'potential', label: 'Opportunity ₹', align: 'right', format: formatCurrency },
            { key: 'action', label: 'Action' },
          ]}
          rows={actions}
        />
      </div>
    </div>
  );
}
