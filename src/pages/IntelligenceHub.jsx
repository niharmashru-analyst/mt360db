import React, { useMemo, useState } from 'react';
import {
  ComposedChart, Area, Line, BarChart, Bar, Cell, XAxis, YAxis, CartesianGrid,
  Tooltip, Legend, ResponsiveContainer,
} from 'recharts';
import { useFilters } from '../context/FilterContext.jsx';
import KpiCard from '../components/KpiCard.jsx';
import DataTable from '../components/DataTable.jsx';
import Callout from '../components/Callout.jsx';
import {
  formatCurrency, formatPct, formatGrowthPct, formatNumber, getPriorYearMonth,
} from '../data/metrics.js';
import {
  CFG, monthlySeries, forecastSales, detectAnomalies, growthBridge, abcXyz, replenishmentRisk,
  opportunityModel, clusterStores, promoElasticity,
} from '../data/analytics.js';

const DIMS = { chainName: 'Chains', state: 'States', category: 'Categories', brand: 'Brands', city: 'Cities' };
const tip = { background: '#fff', border: '1px solid #e5e7eb', padding: '6px 10px', borderRadius: 6, fontSize: 12 };

export default function IntelligenceHub() {
  const { allRecords, filteredRecords, filters, months, monthlyQtyIndex } = useFilters();
  const month = filters.month || months[months.length - 1];
  const [dim, setDim] = useState('chainName');

  const series = useMemo(() => monthlySeries(allRecords, filters, months, month), [allRecords, filters, months, month]);
  const fc = useMemo(() => forecastSales(series), [series]);
  const bridge = useMemo(() => growthBridge(allRecords, filters, month), [allRecords, filters, month]);
  const anom = useMemo(() => detectAnomalies(allRecords, filters, months, dim, month), [allRecords, filters, months, dim, month]);
  const abc = useMemo(() => abcXyz(allRecords, filters, months, month), [allRecords, filters, months, month]);
  const rep = useMemo(() => replenishmentRisk(filteredRecords, monthlyQtyIndex), [filteredRecords, monthlyQtyIndex]);

  const opp = useMemo(() => opportunityModel(filteredRecords), [filteredRecords]);
  const seg = useMemo(() => clusterStores(filteredRecords), [filteredRecords]);
  const elast = useMemo(() => promoElasticity(allRecords, filters), [allRecords, filters]);

  const chartData = useMemo(() => {
    const hist = series.slice(-18).map((p) => ({ label: p.month, actual: p.value }));
    if (!fc || !hist.length) return hist;
    const last = hist[hist.length - 1];
    last.fcst = last.actual; last.band = [last.actual, last.actual]; // join the lines
    return [...hist, ...fc.points.map((p) => ({ label: p.month, fcst: p.value, band: [p.lo, p.hi] }))];
  }, [series, fc]);

  const waterfall = useMemo(() => {
    if (!bridge) return [];
    let run = bridge.ly;
    const rows = [{ name: 'LY', base: 0, value: bridge.ly, delta: bridge.ly, fill: '#6366f1' }];
    [['New SKU×store', bridge.add], ['Lost SKU×store', bridge.drop], ['Volume', bridge.vol], ['Price', bridge.price]]
      .forEach(([name, v]) => {
        const end = run + v;
        rows.push({ name, base: Math.min(run, end), value: Math.abs(v), delta: v, fill: v >= 0 ? '#22c55e' : '#ef4444' });
        run = end;
      });
    rows.push({ name: 'CY', base: 0, value: bridge.cy, delta: bridge.cy, fill: '#6366f1' });
    return rows;
  }, [bridge]);

  const insights = [];
  if (fc) {
    const p = fc.points[0];
    const lyVal = series.find((s) => s.month === getPriorYearMonth(p.month))?.value;
    insights.push(`${p.month} forecast: ${formatCurrency(p.value)} (80% range ${formatCurrency(p.lo)}–${formatCurrency(p.hi)})${lyVal ? `, ${formatGrowthPct((p.value / lyVal - 1) * 100)} vs same month LY` : ''}. Model: ${fc.method}, backtest MAPE ${fc.mape.toFixed(1)}%.`);
  }
  if (bridge) {
    const top = [['new listings', bridge.add], ['lost listings', bridge.drop], ['volume', bridge.vol], ['price realisation', bridge.price]]
      .sort((a, b) => Math.abs(b[1]) - Math.abs(a[1]))[0];
    insights.push(`YoY change of ${formatCurrency(bridge.cy - bridge.ly)} is driven mainly by ${top[0]} (${formatCurrency(top[1])}). Like-for-like growth is ${formatGrowthPct(bridge.lflPct)} against ${formatGrowthPct(bridge.growthPct)} headline.`);
  }
  if (anom?.flagged.length) {
    const a = anom.flagged[0];
    insights.push(`${anom.flagged.length} of ${anom.scanned} ${DIMS[dim].toLowerCase()} show abnormal YoY momentum. Largest: ${a.key} (${a.signal}, ${formatCurrency(a.impact)} vs expected).`);
  }
  if (rep.rows.length) {
    insights.push(`${formatNumber(rep.rows.length)} SKU×store lines will run out inside the ${CFG.LEAD_TIME_DAYS}-day replenishment window, putting ${formatCurrency(rep.atRiskTotal)} of sales at risk. ${formatCurrency(rep.excessValue)} is tied up above ${CFG.EXCESS_COVER_DAYS} days of cover.`);
  }

  return (
    <div className="page">
      <h1>Intelligence Hub</h1>
      <p className="page-subtitle">
        Forecast, diagnose, act — statistical layer on top of {month}. Scoped to your current filters.
      </p>

      <div className="kpi-grid">
        <KpiCard label={fc ? `Forecast ${fc.points[0].month}` : 'Forecast'} value={fc ? formatCurrency(fc.points[0].value) : '—'}
          subtext={fc ? `${formatCurrency(fc.points[0].lo)} – ${formatCurrency(fc.points[0].hi)}` : 'Need 6+ months'} />
        <KpiCard label="Forecast Error (MAPE)" value={fc ? formatPct(fc.mape) : '—'} subtext="Rolling backtest"
          tone={!fc ? 'neutral' : fc.mape < 10 ? 'success' : fc.mape < 20 ? 'warning' : 'danger'} />
        <KpiCard label="Like-for-Like Growth" value={bridge ? formatGrowthPct(bridge.lflPct) : 'Not Active LY'}
          subtext={bridge ? `Headline ${formatGrowthPct(bridge.growthPct)}` : undefined}
          tone={bridge && bridge.lflPct !== null ? (bridge.lflPct >= 0 ? 'success' : 'danger') : 'neutral'} />
        <KpiCard label="Sales at Risk (Stock-out)" value={formatCurrency(rep.atRiskTotal)} tone={rep.atRiskTotal > 0 ? 'danger' : 'success'}
          subtext={`${formatNumber(rep.rows.length)} lines < ${CFG.LEAD_TIME_DAYS}d cover`} />
        <KpiCard label="Excess Stock (MRP)" value={formatCurrency(rep.excessValue)} tone="warning" subtext={`> ${CFG.EXCESS_COVER_DAYS}d cover`} />
        <KpiCard label="Dead Stock (MRP)" value={formatCurrency(rep.deadValue)} tone="warning" subtext="Stock, no sales in 3M" />
      </div>

      {insights.length > 0 && (
        <Callout tone="info" title="Auto-generated read-out">
          <ul>{insights.map((t, i) => <li key={i}>{t}</li>)}</ul>
        </Callout>
      )}

      <div className="section">
        <h2>Sales Forecast — next {CFG.HORIZON} months (₹, with 80% interval)</h2>
        {fc ? (
          <div className="chart-panel">
            <ResponsiveContainer width="100%" height={300}>
              <ComposedChart data={chartData} margin={{ top: 10, right: 20, left: 10, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                <XAxis dataKey="label" tick={{ fontSize: 11 }} />
                <YAxis tick={{ fontSize: 11 }} tickFormatter={formatCurrency} />
                <Tooltip formatter={(v) => (Array.isArray(v) ? `${formatCurrency(v[0])} – ${formatCurrency(v[1])}` : formatCurrency(v))} />
                <Legend />
                <Area dataKey="band" name="80% interval" stroke="none" fill="#6366f1" fillOpacity={0.15} />
                <Line dataKey="actual" name="Actual" stroke="#111827" strokeWidth={2} dot={{ r: 2 }} />
                <Line dataKey="fcst" name="Forecast" stroke="#6366f1" strokeWidth={2} strokeDasharray="5 4" dot={{ r: 3 }} />
              </ComposedChart>
            </ResponsiveContainer>
          </div>
        ) : <Callout tone="warning" title="Not enough history">At least 6 months of sales are needed to backtest a forecast.</Callout>}
        {fc && (
          <details style={{ marginTop: 10 }}>
            <summary>Model leaderboard (why this model was chosen)</summary>
            <DataTable compact defaultSortKey="mape" defaultSortDesc={false} rows={fc.leaderboard} columns={[
              { key: 'name', label: 'Model' },
              { key: 'mape', label: 'Backtest MAPE', align: 'right', format: formatPct },
              { key: 'rmse', label: 'RMSE', align: 'right', format: formatCurrency },
            ]} />
          </details>
        )}
        <Callout tone="warning" title="Read before relying on this">
          If the latest month is month-to-date rather than complete, the forecast will be biased low. Accuracy is best at
          chain or region level; SKU × store forecasts are far noisier.
        </Callout>
      </div>

      <div className="section">
        <h2>Growth Bridge — what actually drove YoY ({getPriorYearMonth(month)} → {month})</h2>
        {bridge ? (
          <div className="chart-panel">
            <ResponsiveContainer width="100%" height={280}>
              <BarChart data={waterfall} margin={{ top: 10, right: 20, left: 10, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                <XAxis dataKey="name" tick={{ fontSize: 11 }} />
                <YAxis tick={{ fontSize: 11 }} tickFormatter={formatCurrency} />
                <Tooltip content={({ active, payload }) => (active && payload?.length
                  ? <div style={tip}>{payload[0].payload.name}: <strong>{formatCurrency(payload[0].payload.delta)}</strong></div> : null)} />
                <Bar dataKey="base" stackId="w" fill="transparent" isAnimationActive={false} />
                <Bar dataKey="value" stackId="w" isAnimationActive={false}>
                  {waterfall.map((r, i) => <Cell key={i} fill={r.fill} />)}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        ) : <Callout tone="info" title="Not Active LY">No prior-year sales for this selection, so there is nothing to bridge.</Callout>}
      </div>

      <div className="section">
        <h2>Anomaly Radar — abnormal YoY momentum by&nbsp;
          <select value={dim} onChange={(e) => setDim(e.target.value)}>
            {Object.entries(DIMS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </select>
        </h2>
        <p className="page-subtitle">
          Flagged when this month's YoY growth is more than {CFG.ANOMALY_Z} robust deviations from the entity's own history
          (median/MAD on log-YoY, so seasonality is controlled for).
        </p>
        {anom && anom.flagged.length ? (
          <DataTable defaultSortKey="impact" rows={anom.flagged} columns={[
            { key: 'key', label: DIMS[dim].slice(0, -1) },
            { key: 'signal', label: 'Signal' },
            { key: 'sales', label: 'Sales', align: 'right', format: formatCurrency },
            { key: 'expected', label: 'Expected', align: 'right', format: formatCurrency },
            { key: 'impact', label: 'vs Expected', align: 'right', format: formatCurrency },
            { key: 'yoy', label: 'YoY', align: 'right', format: formatGrowthPct },
            { key: 'z', label: 'Robust z', align: 'right', format: (v) => v.toFixed(1) },
          ]} />
        ) : <Callout tone="success" title="Nothing abnormal">
          {anom?.scanned ? `${anom.scanned} ${DIMS[dim].toLowerCase()} scanned — all within their normal range.` : 'Not enough history per entity (needs 6+ comparable months).'}
        </Callout>}
      </div>

      <div className="two-col">
        <div className="section">
          <h2>ABC-XYZ — value × predictability (12M)</h2>
          {abc ? <DataTable compact defaultSortKey="share" rows={abc.summary} columns={[
            { key: 'cls', label: 'Class' },
            { key: 'skus', label: 'SKUs', align: 'right' },
            { key: 'share', label: 'Sales share', align: 'right', format: formatPct },
          ]} /> : <Callout tone="info">No sales in the trailing 12 months.</Callout>}
          <p className="page-subtitle">
            A = top 80% of revenue. X = stable demand (CV ≤ {CFG.XYZ[0]}), Z = erratic. <strong>AZ</strong> SKUs are the
            risky ones: high value, hard to forecast — hold safety stock and review weekly.
          </p>
        </div>
        <div className="section">
          <h2>Replenish first — top stock-out risks</h2>
          <DataTable compact defaultSortKey="atRisk" pageSize={10} rows={rep.rows.slice(0, 200)} columns={[
            { key: 'store', label: 'Store' },
            { key: 'sku', label: 'SKU' },
            { key: 'cover', label: 'Cover (d)', align: 'right', format: (v) => v.toFixed(1) },
            { key: 'orderQty', label: 'Order Qty', align: 'right', format: formatNumber },
            { key: 'atRisk', label: 'Sales at Risk', align: 'right', format: formatCurrency },
          ]} />
        </div>
      </div>

      <div className="section">
        <h2>Opportunity Model — expected vs actual by SKU × store</h2>
        <p className="page-subtitle">
          Expected sales = store strength × SKU strength. Lines selling under half of expectation are flagged
          (Availability if out of stock, else Velocity); strong SKUs missing from strong stores are Distribution white space
          at a 40% haircut. Single-month, peer-relative estimate — validate with a pilot.
        </p>
        {opp ? <>
          <div className="kpi-grid">
            <KpiCard label="Opportunities" value={formatNumber(opp.count)} />
            <KpiCard label="Est. Potential / month" value={formatCurrency(opp.total)} tone="success" />
          </div>
          <DataTable defaultSortKey="potential" pageSize={10} rows={opp.rows} columns={[
            { key: 'type', label: 'Type' }, { key: 'chain', label: 'Chain' }, { key: 'store', label: 'Store' }, { key: 'sku', label: 'SKU' },
            { key: 'expected', label: 'Expected', align: 'right', format: formatCurrency },
            { key: 'actual', label: 'Actual', align: 'right', format: formatCurrency },
            { key: 'potential', label: 'Gap', align: 'right', format: formatCurrency },
          ]} />
        </> : <Callout tone="info">No sales in this selection.</Callout>}
      </div>

      <div className="two-col">
        <div className="section">
          <h2>Store Segments (k-means)</h2>
          {seg ? <DataTable compact defaultSortKey="sales" rows={seg.summary} columns={[
            { key: 'segment', label: 'Segment' }, { key: 'stores', label: 'Stores', align: 'right' },
            { key: 'sales', label: 'Avg Sales', align: 'right', format: formatCurrency },
            { key: 'oos', label: 'OOS %', align: 'right', format: formatPct },
            { key: 'play', label: 'Playbook' },
          ]} /> : <Callout tone="info">Need at least 8 stores in the current filter to segment.</Callout>}
        </div>
        <div className="section">
          <h2>Promo Elasticity by Category</h2>
          <DataTable compact defaultSortKey="t" defaultSortDesc={false} rows={elast} columns={[
            { key: 'group', label: 'Category' },
            { key: 'elasticity', label: 'Elasticity', align: 'right', format: (v) => v.toFixed(2) },
            { key: 't', label: 't-stat', align: 'right', format: (v) => v.toFixed(1) },
            { key: 'verdict', label: 'Verdict' },
          ]} />
          <p className="page-subtitle">Only |t| &gt; 2 with a negative sign is treated as real. Promo depth is rarely randomised, so treat this as directional.</p>
        </div>
      </div>
    </div>
  );
}
