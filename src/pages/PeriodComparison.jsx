import React, { useMemo, useState } from 'react';
import { useFilters } from '../context/FilterContext.jsx';
import KpiCard from '../components/KpiCard.jsx';
import DataTable from '../components/DataTable.jsx';
import {
  ResponsiveContainer, ComposedChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend,
} from 'recharts';
import {
  PERIOD_DEFS, periodWindows, sumWindow, matchesFilters, formatCurrency, formatGrowthPct, formatPct, formatNumber,
} from '../data/metrics.js';

const g = (c, b) => (b > 0 ? (c / b - 1) * 100 : null);
const tone = (v) => (v === null ? 'neutral' : v < 0 ? 'danger' : 'success');
const isVal = (m) => m === 'salesValue' || m === 'targetValue';
const lakh = (v, m) => (isVal(m) ? Math.round(v / 1e3) / 100 : Math.round(v / 10) / 100); // ₹ Lakh or '00 units

export default function PeriodComparison() {
  const { allRecords, filters, months } = useFilters();
  const end = filters.month || months[months.length - 1];
  const [metric, setMetric] = useState('salesValue');
  const [periodKey, setPeriodKey] = useState('YTD');
  const [dim, setDim] = useState('chainName');
  const field = metric;
  const fmt = metric === 'salesValue' || metric === 'targetValue' ? formatCurrency : formatNumber;

  const rows = useMemo(() => PERIOD_DEFS.map((p) => {
    const w = periodWindows(end, p.key);
    const cur = sumWindow(allRecords, filters, w.cur, field);
    const ly = sumWindow(allRecords, filters, w.ly, field);
    const prev = sumWindow(allRecords, filters, w.prev, field);
    const tgt = sumWindow(allRecords, filters, w.cur, 'targetValue');
    const sales = sumWindow(allRecords, filters, w.cur, 'salesValue');
    return {
      key: p.key, label: p.label, months: `${w.cur[0]} → ${w.cur[w.cur.length - 1]}`,
      cur, ly, prev, yoy: g(cur, ly), vsPrev: g(cur, prev), ach: tgt > 0 ? (sales / tgt) * 100 : null,
    };
  }), [allRecords, filters, end, field]);

  const dimRows = useMemo(() => {
    const w = periodWindows(end, periodKey);
    const wc = new Set(w.cur), wl = new Set(w.ly), wp = new Set(w.prev);
    const map = {};
    allRecords.forEach((r) => {
      if (!matchesFilters(r, filters, true)) return;
      const inC = wc.has(r.month), inL = wl.has(r.month), inP = wp.has(r.month);
      if (!inC && !inL && !inP) return;
      const k = r[dim] || '—';
      const o = (map[k] ||= { name: k, cur: 0, ly: 0, prev: 0 });
      const v = Number(r[field] || 0);
      if (inC) o.cur += v; if (inL) o.ly += v; if (inP) o.prev += v;
    });
    const total = Object.values(map).reduce((a, o) => a + o.cur, 0);
    return Object.values(map).map((o) => ({
      ...o, yoy: g(o.cur, o.ly), vsPrev: g(o.cur, o.prev), share: total > 0 ? (o.cur / total) * 100 : 0,
    }));
  }, [allRecords, filters, end, periodKey, dim, field]);

  const chartData = rows.map((r) => ({ name: r.key, Current: lakh(r.cur, metric), 'Last Year': lakh(r.ly, metric), 'Prev Period': lakh(r.prev, metric) }));
  const sel = (v, set, opts) => (
    <select value={v} onChange={(e) => set(e.target.value)} style={{ marginRight: 8, padding: '6px 10px' }}>
      {opts.map(([k, l]) => <option key={k} value={k}>{l}</option>)}
    </select>
  );

  return (
    <div className="page">
      <h1>Period Comparison</h1>
      <p className="page-subtitle">MTD · QTD · YTD · L3M · L6M — each vs last year and vs the previous period. Anchored on {end} (fiscal year Apr–Mar).</p>

      <div className="section">
        {sel(metric, setMetric, [['salesValue', 'Sales Value'], ['salesQty', 'Sales Qty'], ['primaryQty', 'Primary (Filled) Qty'], ['targetValue', 'Target Value']])}
      </div>

      <div className="kpi-grid">
        {rows.map((r) => (
          <KpiCard key={r.key} label={`${r.key} ${metric === 'salesQty' || metric === 'primaryQty' ? 'Qty' : ''}`} value={fmt(r.cur)}
            tone={tone(r.yoy)}
            subtext={`YoY ${r.yoy === null ? '—' : formatGrowthPct(r.yoy)} · vs Prev ${r.vsPrev === null ? '—' : formatGrowthPct(r.vsPrev)}`} />
        ))}
      </div>

      <div className="section">
        <h2>Current vs Last Year vs Previous Period (₹ Lakh for value, hundreds for qty)</h2>
        <ResponsiveContainer width="100%" height={320}>
          <ComposedChart data={chartData}>
            <CartesianGrid strokeDasharray="3 3" />
            <XAxis dataKey="name" /><YAxis /><Tooltip /><Legend />
            <Bar isAnimationActive={false} dataKey="Current" fill="#6366f1" radius={[4, 4, 0, 0]} />
            <Bar isAnimationActive={false} dataKey="Last Year" fill="#9ca3af" radius={[4, 4, 0, 0]} />
            <Bar isAnimationActive={false} dataKey="Prev Period" fill="#f59e0b" radius={[4, 4, 0, 0]} />
          </ComposedChart>
        </ResponsiveContainer>
      </div>

      <div className="section">
        <h2>Period Scorecard</h2>
        <DataTable pageSize={10} rows={rows} columns={[
          { key: 'label', label: 'Period' }, { key: 'months', label: 'Window' },
          { key: 'cur', label: 'Current', align: 'right', format: fmt },
          { key: 'ly', label: 'Last Year', align: 'right', format: fmt },
          { key: 'yoy', label: 'YoY %', align: 'right', format: formatGrowthPct },
          { key: 'prev', label: 'Prev Period', align: 'right', format: fmt },
          { key: 'vsPrev', label: 'vs Prev %', align: 'right', format: formatGrowthPct },
          { key: 'ach', label: 'Target Ach %', align: 'right', format: (v) => (v === null ? '—' : formatPct(v)) },
        ]} />
      </div>

      <div className="section">
        <h2>Breakdown</h2>
        {sel(periodKey, setPeriodKey, PERIOD_DEFS.map((p) => [p.key, p.label]))}
        {sel(dim, setDim, [['chainName', 'by Chain'], ['region', 'by Region'], ['state', 'by State'], ['category', 'by Category'], ['brand', 'by Brand'], ['pareto', 'by Pareto']])}
        <DataTable defaultSortKey="cur" pageSize={12} rows={dimRows} columns={[
          { key: 'name', label: 'Name' },
          { key: 'cur', label: 'Current', align: 'right', format: fmt },
          { key: 'share', label: 'Share %', align: 'right', format: (v) => formatPct(v) },
          { key: 'ly', label: 'Last Year', align: 'right', format: fmt },
          { key: 'yoy', label: 'YoY %', align: 'right', format: formatGrowthPct },
          { key: 'prev', label: 'Prev Period', align: 'right', format: fmt },
          { key: 'vsPrev', label: 'vs Prev %', align: 'right', format: formatGrowthPct },
        ]} />
      </div>
    </div>
  );
}
