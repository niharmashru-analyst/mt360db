import React, { useMemo } from 'react';
import { Link } from 'react-router-dom';
import {
  ResponsiveContainer, ComposedChart, Area, Line, XAxis, YAxis, Tooltip, CartesianGrid, Bar, BarChart, Cell,
  ScatterChart, Scatter, ZAxis, RadarChart, PolarGrid, PolarAngleAxis, Radar, Legend, PieChart, Pie, Treemap, ReferenceLine,
} from 'recharts';
import { useFilters } from '../context/FilterContext.jsx';
import { buildInsights } from '../data/insightEngine.js';
import { formatCurrency as inr } from '../data/metrics.js';

const PAL = ['#6366f1', '#10b981', '#f59e0b', '#f43f5e', '#06b6d4', '#8b5cf6', '#ec4899'];
const UP = '#10b981', DN = '#f43f5e';
const tip = { contentStyle: { borderRadius: 12, border: '1px solid #e5e7eb', boxShadow: '0 8px 24px rgba(17,24,39,.12)', fontSize: 12 }, formatter: (v) => (typeof v === 'number' ? inr(v) : v) };

function Panel({ title, sub, children, wide }) {
  return (
    <section className={`ipanel${wide ? ' wide' : ''}`}>
      <header><h3>{title}</h3>{sub && <p>{sub}</p>}</header>
      <div className="ipanel-body">{children}</div>
    </section>
  );
}

const heatColor = (v) => v == null ? '#f3f4f6' : v >= 0 ? `rgba(16,185,129,${Math.min(0.12 + v / 40, 0.9)})` : `rgba(244,63,94,${Math.min(0.12 + -v / 40, 0.9)})`;

export default function Insights() {
  const { filteredRecords, allRecords, filters, months, monthlyQtyIndex } = useFilters();
  const month = filters.month || months[months.length - 1];
  const D = useMemo(() => buildInsights({ allRecords, filters, months, month, records: filteredRecords, idx: monthlyQtyIndex }),
    [allRecords, filters, months, month, filteredRecords, monthlyQtyIndex]);

  const wf = useMemo(() => {
    const b = D.bridge; if (!b) return [];
    const steps = [['Volume', b.vol], ['Price/mix', b.price], ['New listings', b.add], ['Lost listings', b.drop]];
    let run = b.ly; const rows = [{ name: 'Last year', base: 0, val: b.ly, c: '#94a3b8' }];
    steps.forEach(([name, d]) => { rows.push({ name, base: Math.min(run, run + d), val: Math.abs(d), c: d >= 0 ? UP : DN, d }); run += d; });
    rows.push({ name: 'This year', base: 0, val: run, c: '#6366f1' });
    return rows;
  }, [D.bridge]);

  const fcData = useMemo(() => {
    const hist = D.series.slice(-12).map((p) => ({ m: p.month.slice(2), actual: p.value }));
    if (!D.fc) return hist;
    const last = hist[hist.length - 1];
    last.forecast = last.actual;
    return [...hist, ...D.fc.points.map((p) => ({ m: p.month.slice(2), forecast: p.value, band: [p.lo, p.hi] }))];
  }, [D.series, D.fc]);

  const chains = [...new Set(D.outlets.map((o) => o.chain))];
  const radarAxes = ['Growth', 'Target', 'In-stock', 'Margin', 'Visibility'];
  const radarData = radarAxes.map((a) => Object.fromEntries([['axis', a], ...D.radar.map((r) => [r.chain, Math.round(r[a])])]));
  const pctTxt = D.yoy == null ? 'n/a' : `${D.yoy >= 0 ? '+' : ''}${D.yoy.toFixed(1)}%`;

  return (
    <div className="insights-page">
      <div className="hero">
        <div className="hero-eyebrow">WHAT'S GOING ON · {month}</div>
        <h1>{(D.insights.find((i) => i.id === 'growth') || D.insights[0])?.title || 'Not enough data to explain this month yet'}</h1>
        <p>{D.insights.filter((i) => i.id !== 'growth').slice(0, 2).map((i) => i.title).join(' · ')}</p>
        <div className="hero-kpis">
          <div><span>Sales</span><b>{inr(D.total)}</b></div>
          <div><span>vs last year</span><b className={D.yoy >= 0 ? 'pos' : 'neg'}>{pctTxt}</b></div>
          <div><span>Estimated value at risk</span><b>{inr(D.insights.filter((i) => i.impact < 0).reduce((s, i) => s - i.impact, 0))}</b></div>
          <div><span>Insights found</span><b>{D.insights.length}</b></div>
        </div>
      </div>

      <h2 className="sec-title">What needs attention <small>ranked by ₹ impact</small></h2>
      <div className="insight-list">
        {D.insights.map((i, n) => (
          <article key={i.id} className={`icard tone-${i.tone}`}>
            <div className="icard-rank">{n + 1}</div>
            <div className="icard-main">
              <div className="icard-tag">{i.tag}</div>
              <h4>{i.title}</h4>
              <p>{i.why}</p>
              <div className="icard-action"><b>Do this →</b> {i.action}</div>
            </div>
            <div className={`icard-impact ${i.impact >= 0 ? 'pos' : 'neg'}`}>{i.impact >= 0 ? '+' : '−'}{inr(Math.abs(i.impact))}<small>{i.impact >= 0 ? 'upside / gain' : 'at risk'}</small></div>
          </article>
        ))}
      </div>

      <h2 className="sec-title">The picture <small>every chart answers one question · <Link to="/executive">open the data →</Link></small></h2>
      <div className="ipanel-grid">
        <Panel title="Where did the growth come from?" sub="Last year → this year, split by driver (waterfall)">
          <ResponsiveContainer width="100%" height={280}><BarChart data={wf}><CartesianGrid vertical={false} stroke="#eef0f4" /><XAxis dataKey="name" tick={{ fontSize: 11 }} /><YAxis tickFormatter={inr} tick={{ fontSize: 11 }} width={60} />
            <Tooltip {...tip} formatter={(v, n, p) => [inr(p.payload.d ?? v), p.payload.name]} /><Bar dataKey="base" stackId="a" fill="transparent" /><Bar dataKey="val" stackId="a" radius={[6, 6, 0, 0]}>{wf.map((r, k) => <Cell key={k} fill={r.c} />)}</Bar></BarChart></ResponsiveContainer>
        </Panel>
        <Panel title="Where are we heading?" sub="Actuals, forecast and 80% confidence band">
          <ResponsiveContainer width="100%" height={280}><ComposedChart data={fcData}><defs><linearGradient id="g1" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#6366f1" stopOpacity=".35" /><stop offset="1" stopColor="#6366f1" stopOpacity=".02" /></linearGradient></defs>
            <CartesianGrid vertical={false} stroke="#eef0f4" /><XAxis dataKey="m" tick={{ fontSize: 11 }} /><YAxis tickFormatter={inr} tick={{ fontSize: 11 }} width={60} /><Tooltip {...tip} />
            <Area dataKey="band" stroke="none" fill="#f59e0b" fillOpacity={0.18} name="80% range" /><Area dataKey="actual" stroke="#6366f1" strokeWidth={2.5} fill="url(#g1)" name="Actual" /><Line dataKey="forecast" stroke="#f59e0b" strokeWidth={2.5} strokeDasharray="6 4" dot={{ r: 3 }} name="Forecast" /></ComposedChart></ResponsiveContainer>
        </Panel>
        <Panel title="Which chain is slipping, and since when?" sub="YoY % by chain, last 6 months (heatmap)" wide>
          <div className="heat" style={{ gridTemplateColumns: `140px repeat(${D.win.length}, 1fr)` }}>
            <span />{D.win.map((m) => <span key={m} className="heat-h">{m.slice(2)}</span>)}
            {D.heat.map((r) => (<React.Fragment key={r.chain}><span className="heat-r">{r.chain}</span>{r.cells.map((c) => <span key={c.m} className="heat-c" style={{ background: heatColor(c.v) }}>{c.v == null ? '–' : `${c.v > 0 ? '+' : ''}${c.v.toFixed(0)}%`}</span>)}</React.Fragment>))}
          </div>
        </Panel>
        <Panel title="Which stores are stars or problems?" sub="Sales (x) vs YoY growth (y); bubble = stock value">
          <ResponsiveContainer width="100%" height={300}><ScatterChart margin={{ left: 0, right: 10 }}><CartesianGrid stroke="#eef0f4" /><XAxis type="number" dataKey="sales" name="Sales" tickFormatter={inr} tick={{ fontSize: 11 }} /><YAxis type="number" dataKey="yoy" name="YoY %" unit="%" tick={{ fontSize: 11 }} width={46} /><ZAxis dataKey="stock" range={[40, 400]} name="Stock" />
            <ReferenceLine y={0} stroke="#94a3b8" strokeDasharray="4 4" /><Tooltip cursor={{ strokeDasharray: '3 3' }} {...tip} formatter={(v, n) => (n === 'YoY %' ? `${(+v).toFixed(1)}%` : inr(v))} />
            {chains.map((c, k) => <Scatter key={c} name={c} data={D.outlets.filter((o) => o.chain === c)} fill={PAL[k % PAL.length]} fillOpacity={0.7} />)}<Legend /></ScatterChart></ResponsiveContainer>
        </Panel>
        <Panel title="How healthy is each chain overall?" sub="Five scores out of 100 (radar)">
          <ResponsiveContainer width="100%" height={300}><RadarChart data={radarData} outerRadius="72%"><PolarGrid stroke="#e5e7eb" /><PolarAngleAxis dataKey="axis" tick={{ fontSize: 11 }} />
            {D.radar.map((r, k) => <Radar key={r.chain} name={r.chain} dataKey={r.chain} stroke={PAL[k]} fill={PAL[k]} fillOpacity={0.12} />)}<Legend /><Tooltip /></RadarChart></ResponsiveContainer>
        </Panel>
        <Panel title="What are we made of?" sub="Category split (donut)">
          <ResponsiveContainer width="100%" height={280}><PieChart><Pie data={D.mix} dataKey="value" nameKey="name" innerRadius="58%" outerRadius="85%" paddingAngle={3} cornerRadius={6}>{D.mix.map((_, k) => <Cell key={k} fill={PAL[k % PAL.length]} />)}</Pie><Tooltip {...tip} /><Legend /></PieChart></ResponsiveContainer>
        </Panel>
        <Panel title="Which sub-categories carry the sales?" sub="Area = sales (treemap)">
          <ResponsiveContainer width="100%" height={280}><Treemap data={D.tree} dataKey="size" stroke="#fff" content={<TreeCell />} /></ResponsiveContainer>
        </Panel>
      </div>
    </div>
  );
}

function TreeCell({ x, y, width, height, name, depth, index }) {
  if (depth === 0) return null;
  return (<g><rect x={x} y={y} width={width} height={height} rx={6} fill={PAL[(index || 0) % PAL.length]} fillOpacity={depth === 1 ? 0.9 : 0.65} stroke="#fff" strokeWidth={2} />
    {width > 56 && height > 22 && <text x={x + 8} y={y + 18} fill="#fff" fontSize={11} fontWeight={600}>{name}</text>}</g>);
}
