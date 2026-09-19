import React, { useMemo } from 'react';
import { useFilters } from '../context/FilterContext.jsx';
import KpiCard from '../components/KpiCard.jsx';
import Callout from '../components/Callout.jsx';
import TrendChart from '../components/TrendChart.jsx';
import {
  sumSalesValue, sumStockQty, stockValue, oosPct, avgNOD, marginPctBlended,
  achievementPct, growthPct, applyFilters, topN, formatCurrency, formatPct,
} from '../data/metrics.js';

export default function ExecutiveOverview() {
  const { filteredRecords, allRecords, filters, months } = useFilters();

  const growth = growthPct(allRecords, filters);
  const achievement = achievementPct(filteredRecords);
  const oos = oosPct(filteredRecords);
  const nod = avgNOD(filteredRecords);
  const margin = marginPctBlended(filteredRecords);
  const stockVal = stockValue(filteredRecords);

  // trend across last 12 months (ignoring month filter, respecting other filters)
  const trendData = useMemo(() => {
    const last12 = months.slice(-12);
    return last12.map((m) => {
      const recs = applyFilters(allRecords, { ...filters, month: m });
      return { label: m.slice(2), sales: Math.round(sumSalesValue(recs) / 100000) };
    });
  }, [months, allRecords, filters]);

  const growthDrivers = useMemo(() => topN(filteredRecords, 'salesValue', 'chainName', 3), [filteredRecords]);
  const growthDrags = useMemo(() => topN(filteredRecords, 'salesValue', 'chainName', 3, false), [filteredRecords]);

  const oosCount = filteredRecords.filter((r) => r.stockQty <= 0 && r.listed).length;
  const excessCount = filteredRecords.filter((r) => {
    const dailyRate = r.salesQty / 30;
    return dailyRate > 0 && r.stockQty / dailyRate > 60;
  }).length;

  return (
    <div className="page">
      <h1>Executive 360</h1>
      <p className="page-subtitle">{filters.month} — landing page. Everything below is scoped to your current filters.</p>

      <div className="kpi-grid">
        <KpiCard label="MT Sales (MTD)" value={formatCurrency(sumSalesValue(filteredRecords))} />
        <KpiCard label="Growth % (YoY)" value={formatPct(growth)} tone={growth >= 0 ? 'success' : 'danger'} />
        <KpiCard label="Achievement %" value={formatPct(achievement)} tone={achievement >= 100 ? 'success' : 'warning'} />
        <KpiCard label="Stock Value" value={formatCurrency(stockVal)} />
        <KpiCard label="Avg NOD" value={`${nod.toFixed(0)} days`} />
        <KpiCard label="OOS %" value={formatPct(oos)} tone={oos > 10 ? 'danger' : 'success'} />
        <KpiCard label="Margin %" value={formatPct(margin)} />
        <KpiCard label="Active Rows" value={filteredRecords.length.toLocaleString('en-IN')} subtext="SKU-store combos" />
      </div>

      <Callout tone={growth >= 0 ? 'success' : 'danger'} title="What's happening in MT">
        Sales are {growth >= 0 ? 'up' : 'down'} <strong>{formatPct(Math.abs(growth))}</strong> YoY this month.{' '}
        <strong>{oosCount}</strong> SKU-store combinations are out of stock and <strong>{excessCount}</strong> are
        carrying excess inventory (NOD &gt; 60 days). Achievement vs target stands at <strong>{formatPct(achievement)}</strong>.
      </Callout>

      <div className="section">
        <h2>Sales Trend — Last 12 Months (₹ Lakh)</h2>
        <TrendChart data={trendData} xKey="label" series={[{ dataKey: 'sales', name: 'Sales (₹L)', color: '#6366f1' }]} />
      </div>

      <div className="two-col">
        <Callout tone="success" title="🟢 Growth Drivers (Top Chains)">
          <ul>
            {growthDrivers.map((d) => <li key={d.key}>{d.key} — {formatCurrency(d.value)}</li>)}
          </ul>
        </Callout>
        <Callout tone="danger" title="🔴 Growth Drags (Bottom Chains)">
          <ul>
            {growthDrags.map((d) => <li key={d.key}>{d.key} — {formatCurrency(d.value)}</li>)}
          </ul>
        </Callout>
      </div>
    </div>
  );
}
