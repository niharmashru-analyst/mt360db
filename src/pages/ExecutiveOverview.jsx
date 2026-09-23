import React, { useMemo } from 'react';
import { useFilters } from '../context/FilterContext.jsx';
import KpiCard from '../components/KpiCard.jsx';
import Callout from '../components/Callout.jsx';
import TrendChart from '../components/TrendChart.jsx';
import {
  sumSalesValue, sumStockQty, stockValue, oosPct, avgNOD, marginPctBlended, isOOS, calcNOD,
  achievementPct, growthPct, applyFilters, topN, formatCurrency, formatPct, formatGrowthPct,
} from '../data/metrics.js';
import { THRESHOLDS } from '../data/schema.js';

export default function ExecutiveOverview() {
  const { filteredRecords, allRecords, filters, months, monthlyQtyIndex } = useFilters();

  const growth = growthPct(allRecords, filters);
  const achievement = achievementPct(filteredRecords);
  const oos = oosPct(filteredRecords);
  const nod = avgNOD(filteredRecords, allRecords, filters);
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

  // Both counts use the same standardized formulas as every other page
  // (isOOS / calcNOD with the trailing-3-month index) — this used to be a
  // hand-rolled single-month rate here, which could silently disagree with
  // the Avg NOD KPI two rows up on this very page.
  const oosCount = filteredRecords.filter(isOOS).length;
  const excessCount = filteredRecords.filter((r) => calcNOD(r, monthlyQtyIndex) > THRESHOLDS.NOD_HIGH).length;

  return (
    <div className="page">
      <h1>Executive 360</h1>
      <p className="page-subtitle">{filters.month} — landing page. Everything below is scoped to your current filters.</p>

      <div className="kpi-grid">
        <KpiCard label="MT Sales (MTD)" value={formatCurrency(sumSalesValue(filteredRecords))} />
        <KpiCard label="Growth % (YoY)" value={formatGrowthPct(growth)} tone={growth === null ? 'neutral' : growth >= 0 ? 'success' : 'danger'} />
        <KpiCard label="Achievement %" value={formatPct(achievement)} tone={achievement >= 100 ? 'success' : 'warning'} />
        <KpiCard label="Stock Value" value={formatCurrency(stockVal)} />
        <KpiCard label="Avg NOD" value={`${nod.toFixed(0)} days`} />
        <KpiCard label="OOS %" value={formatPct(oos)} tone={oos > 10 ? 'danger' : 'success'} />
        <KpiCard label="Margin %" value={formatPct(margin)} />
        <KpiCard label="Active Rows" value={filteredRecords.length.toLocaleString('en-IN')} subtext="SKU-store combos" />
      </div>

      <Callout tone={growth === null ? 'info' : growth >= 0 ? 'success' : 'danger'} title="What's happening in MT">
        {growth === null
          ? <>No last-year data is available for this month yet — YoY growth will show once 12+ months of history exist.{' '}</>
          : <>Sales are {growth >= 0 ? 'up' : 'down'} <strong>{formatPct(Math.abs(growth))}</strong> YoY this month.{' '}</>
        }
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
