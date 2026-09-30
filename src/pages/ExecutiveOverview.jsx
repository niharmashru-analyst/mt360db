import React, { useMemo } from 'react';
import { useFilters } from '../context/FilterContext.jsx';
import KpiCard from '../components/KpiCard.jsx';
import Callout from '../components/Callout.jsx';
import TrendChart from '../components/TrendChart.jsx';
import { TrendCombo, TreemapChart, Heatmap } from '../components/AdvancedCharts.jsx';
import {
  sumSalesValue, sumStockQty, stockValue, oosPct, avgNOD, marginPctBlended,
  achievementPct, growthPct, applyFilters, salesByMonth, stockHealthFlag, matchesFilters, getPriorYearMonth, topN, formatCurrency, formatPct, formatGrowthPct,
} from '../data/metrics.js';

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
    const win = months.filter((m) => m <= (filters.month || months[months.length - 1])).slice(-12);
    const cur = salesByMonth(allRecords, filters, win);
    const ly = salesByMonth(allRecords, filters, win.map(getPriorYearMonth));
    const tgt = salesByMonth(allRecords, filters, win, 'targetValue');
    return win.map((m, i) => ({
      label: m.slice(2), current: cur[i], ly: ly[i] || null, target: tgt[i] || null,
      yoy: ly[i] > 0 ? (cur[i] / ly[i] - 1) * 100 : null,
    }));
  }, [months, allRecords, filters]);

  // Chain × month YoY, one pass (ignores the chain filter so every chain is visible).
  const chainView = useMemo(() => {
    const win = months.filter((m) => m <= (filters.month || months[months.length - 1])).slice(-6);
    const want = new Set([...win, ...win.map(getPriorYearMonth)]);
    const f = { ...filters, chainName: '' };
    const map = {};
    allRecords.forEach((r) => {
      if (!want.has(r.month) || !matchesFilters(r, f, true)) return;
      const o = (map[r.chainName] ||= {});
      o[r.month] = (o[r.month] || 0) + r.salesValue;
    });
    const chains = Object.keys(map);
    const growth = (c, m) => { const l = map[c][getPriorYearMonth(m)]; return l > 0 ? ((map[c][m] || 0) / l - 1) * 100 : null; };
    const last = win[win.length - 1];
    return {
      win, chains, matrix: chains.map((c) => win.map((m) => growth(c, m))),
      tree: chains.map((c) => ({ name: c, size: map[c][last] || 0, growth: growth(c, last) })).filter((t) => t.size > 0),
    };
  }, [months, allRecords, filters]);

  const growthDrivers = useMemo(() => topN(filteredRecords, 'salesValue', 'chainName', 3), [filteredRecords]);
  const growthDrags = useMemo(() => topN(filteredRecords, 'salesValue', 'chainName', 3, false), [filteredRecords]);

  const oosCount = filteredRecords.filter((r) => r.stockQty <= 0 && r.listed).length;
  const excessCount = filteredRecords.filter((r) => {
    const h = stockHealthFlag(r, monthlyQtyIndex); // same trailing-3M NOD rule as every other page
    return h === 'Excess' || h === 'Dead';
  }).length;

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
        <h2>Sales vs Last Year, Target &amp; Growth — Last 12 Months</h2>
        <div className="chart-panel"><TrendCombo data={trendData} /></div>
      </div>

      <div className="two-col">
        <div className="section">
          <h2>Chain Contribution — size = sales, colour = YoY</h2>
          <div className="chart-panel"><TreemapChart data={chainView.tree} /></div>
        </div>
        <div className="section">
          <h2>YoY Growth Heatmap — Chain × Month</h2>
          <div className="chart-panel"><Heatmap rows={chainView.chains} cols={chainView.win.map((m) => m.slice(2))} matrix={chainView.matrix} /></div>
        </div>
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
