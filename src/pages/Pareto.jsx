import React, { useMemo, useState } from 'react';
import { useFilters } from '../context/FilterContext.jsx';
import DataTable from '../components/DataTable.jsx';
import BarChartBlock from '../components/BarChartBlock.jsx';
import Callout from '../components/Callout.jsx';
import { groupBy, sumSalesValue, sumSalesQty, stockValue, marginValue, formatCurrency, formatPct, formatNumber } from '../data/metrics.js';

export default function Pareto() {
  const { filteredRecords } = useFilters();
  const [metric, setMetric] = useState('value'); // 'value' | 'qty'

  const byTier = useMemo(() => {
    const groups = groupBy(filteredRecords, 'pareto');
    const total = metric === 'value' ? sumSalesValue(filteredRecords) : sumSalesQty(filteredRecords);
    return ['Top 10', 'Top 25', 'Others'].map((tier) => {
      const recs = groups[tier] || [];
      const val = metric === 'value' ? sumSalesValue(recs) : sumSalesQty(recs);
      return {
        key: tier,
        value: val,
        contribution: total > 0 ? (val / total) * 100 : 0,
        stock: stockValue(recs),
        margin: marginValue(recs),
        skuCount: new Set(recs.map((r) => r.skuCode)).size,
      };
    });
  }, [filteredRecords, metric]);

  const top10Contribution = byTier.find((t) => t.key === 'Top 10')?.contribution || 0;

  return (
    <div className="page">
      <h1>Pareto Analysis</h1>
      <p className="page-subtitle">Are we dependent on a small number of SKUs?</p>

      <div className="filter-field inline-select">
        <label>Metric</label>
        <select value={metric} onChange={(e) => setMetric(e.target.value)}>
          <option value="value">Sales Value</option>
          <option value="qty">Sales Qty</option>
        </select>
      </div>

      <Callout tone="info" title="Concentration Check">
        Top 10 Pareto SKUs contribute <strong>{formatPct(top10Contribution)}</strong> of{' '}
        {metric === 'value' ? 'sales value' : 'sales quantity'} in the current filter.
      </Callout>

      <div className="two-col">
        <div className="section">
          <h2>Contribution by Tier</h2>
          <BarChartBlock
            data={byTier.map((t) => ({ key: t.key, value: t.value }))}
            yFormat={metric === 'value' ? formatCurrency : formatNumber}
          />
        </div>
        <div className="section">
          <h2>Detail</h2>
          <DataTable
            defaultSortKey="value"
            columns={[
              { key: 'key', label: 'Tier' },
              { key: 'skuCount', label: 'SKU Count', align: 'right' },
              { key: 'value', label: metric === 'value' ? 'Sales Value' : 'Sales Qty', align: 'right', format: metric === 'value' ? formatCurrency : formatNumber },
              { key: 'contribution', label: 'Contribution %', align: 'right', format: formatPct },
              { key: 'stock', label: 'Stock Value', align: 'right', format: formatCurrency },
              { key: 'margin', label: 'Margin Value', align: 'right', format: formatCurrency },
            ]}
            rows={byTier}
          />
        </div>
      </div>
    </div>
  );
}
