import React from 'react';
import {
  ResponsiveContainer, ComposedChart, Bar, Line, Cell, XAxis, YAxis, CartesianGrid, Tooltip, Legend,
  ReferenceLine, Treemap, ScatterChart, Scatter, ZAxis,
} from 'recharts';
import { formatCurrency, formatGrowthPct } from '../data/metrics.js';

const box = { background: '#fff', border: '1px solid #e5e7eb', borderRadius: 8, padding: '8px 12px', fontSize: 12, boxShadow: '0 4px 14px rgba(0,0,0,.08)' };
const axis = { tick: { fontSize: 11 }, axisLine: false, tickLine: false };
const mix = (a, b, t) => a.map((v, i) => Math.round(v + (b[i] - v) * t));
const short = (v) => (v == null ? 'n/a' : `${v >= 0 ? '+' : ''}${v.toFixed(0)}%`);

// Diverging red–white–green scale for growth values (saturates at ±30%).
export function growthColor(v) {
  if (v == null) return { bg: '#f3f4f6', fg: '#9ca3af' };
  const t = Math.min(1, Math.abs(v) / 30);
  const c = mix([255, 255, 255], v >= 0 ? [22, 163, 74] : [220, 38, 38], t * 0.9 + 0.08);
  return { bg: `rgb(${c})`, fg: t > 0.55 ? '#fff' : '#111827' };
}

// Sales bars + last-year line + target line + YoY% on a second axis.
// data: [{ label, current, ly, target, yoy }]
export function TrendCombo({ data, height = 340 }) {
  const Tip = ({ active, payload, label }) => (active && payload?.length ? (
    <div style={box}>
      <div style={{ fontWeight: 600, marginBottom: 4 }}>{label}</div>
      {payload.map((p) => (p.value == null ? null : (
        <div key={p.dataKey} style={{ color: p.dataKey === 'current' ? '#6366f1' : p.color }}>
          {p.name}: <strong>{p.dataKey === 'yoy' ? formatGrowthPct(p.value) : formatCurrency(p.value)}</strong>
        </div>
      )))}
    </div>
  ) : null);
  return (
    <ResponsiveContainer width="100%" height={height}>
      <ComposedChart data={data} margin={{ top: 10, right: 10, left: 10, bottom: 0 }}>
        <defs>
          <linearGradient id="gCur" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#6366f1" stopOpacity={0.95} />
            <stop offset="100%" stopColor="#6366f1" stopOpacity={0.3} />
          </linearGradient>
        </defs>
        <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e5e7eb" />
        <XAxis dataKey="label" {...axis} />
        <YAxis yAxisId="v" tickFormatter={formatCurrency} {...axis} />
        <YAxis yAxisId="g" orientation="right" tickFormatter={(v) => `${v}%`} {...axis} />
        <ReferenceLine yAxisId="g" y={0} stroke="#9ca3af" strokeDasharray="2 2" />
        <Tooltip content={<Tip />} />
        <Legend />
        <Bar isAnimationActive={false} yAxisId="v" dataKey="current" name="Sales" fill="url(#gCur)" radius={[6, 6, 0, 0]} maxBarSize={38} />
        <Line isAnimationActive={false} yAxisId="v" dataKey="ly" name="Last year" stroke="#9ca3af" strokeWidth={2} strokeDasharray="5 4" dot={false} connectNulls />
        <Line isAnimationActive={false} yAxisId="v" dataKey="target" name="Target" stroke="#f59e0b" strokeWidth={2} dot={{ r: 3 }} connectNulls />
        <Line isAnimationActive={false} yAxisId="g" dataKey="yoy" name="YoY %" stroke="#16a34a" strokeWidth={2} dot={{ r: 3 }} connectNulls />
      </ComposedChart>
    </ResponsiveContainer>
  );
}

// Treemap: area = size, colour = growth. data: [{ name, size, growth }]
function TreeCell({ x, y, width, height, name, size, growth, depth }) {
  if (depth === 0 || !name || width < 2 || height < 2) return null;
  const { bg, fg } = growthColor(growth);
  return (
    <g>
      <rect x={x} y={y} width={width} height={height} fill={bg} stroke="#fff" strokeWidth={2} rx={4} />
      {width > 70 && height > 38 && (<>
        <text x={x + 8} y={y + 20} fill={fg} fontSize={12} fontWeight={600}>{name}</text>
        <text x={x + 8} y={y + 36} fill={fg} fontSize={11}>{formatCurrency(size)} · {short(growth)}</text>
      </>)}
    </g>
  );
}
export function TreemapChart({ data, height = 320 }) {
  return (
    <ResponsiveContainer width="100%" height={height}>
      <Treemap data={data} dataKey="size" content={<TreeCell />} isAnimationActive={false} />
    </ResponsiveContainer>
  );
}

// Heatmap grid. matrix[row][col] = value (null = no data). Default scale: growth %.
export function Heatmap({ rows, cols, matrix, format = short }) {
  return (
    <div style={{ overflowX: 'auto' }}>
      <div style={{ display: 'grid', gridTemplateColumns: `minmax(110px,auto) repeat(${cols.length}, minmax(54px,1fr))`, gap: 3, fontSize: 12 }}>
        <div />
        {cols.map((c) => <div key={c} style={{ textAlign: 'center', color: '#6b7280' }}>{c}</div>)}
        {rows.map((r, i) => (
          <React.Fragment key={r}>
            <div style={{ alignSelf: 'center', fontWeight: 500 }}>{r}</div>
            {matrix[i].map((v, j) => {
              const { bg, fg } = growthColor(v);
              return <div key={j} title={`${r} · ${cols[j]}`} style={{ background: bg, color: fg, textAlign: 'center', padding: '8px 0', borderRadius: 4 }}>{v == null ? '—' : format(v)}</div>;
            })}
          </React.Fragment>
        ))}
      </div>
    </div>
  );
}

// Store bubble map: x = OOS %, y = sales, size = SKU depth, colour = segment. Dashed lines = averages.
const SEG = { Flagship: '#6366f1', 'Supply-constrained': '#ef4444', 'Under-ranged': '#f59e0b', Core: '#22c55e' };
export function StoreBubble({ rows, height = 380 }) {
  const mean = (k) => rows.reduce((a, r) => a + r[k], 0) / Math.max(1, rows.length);
  const Tip = ({ active, payload }) => {
    const p = active && payload?.[0]?.payload;
    return p ? <div style={box}><strong>{p.store}</strong><div>{p.chain} · {p.segment}</div>
      <div>Sales {formatCurrency(p.sales)} · OOS {p.oos.toFixed(1)}% · {p.skus} SKUs</div></div> : null;
  };
  return (
    <ResponsiveContainer width="100%" height={height}>
      <ScatterChart margin={{ top: 10, right: 20, left: 10, bottom: 10 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
        <XAxis type="number" dataKey="oos" name="OOS %" unit="%" {...axis} />
        <YAxis type="number" dataKey="sales" name="Sales" tickFormatter={formatCurrency} {...axis} />
        <ZAxis type="number" dataKey="skus" range={[40, 420]} name="SKUs" />
        <ReferenceLine x={mean('oos')} stroke="#9ca3af" strokeDasharray="4 4" />
        <ReferenceLine y={mean('sales')} stroke="#9ca3af" strokeDasharray="4 4" />
        <Tooltip content={<Tip />} />
        <Legend />
        {[...new Set(rows.map((r) => r.segment))].map((s) => (
          <Scatter isAnimationActive={false}  key={s} name={s} data={rows.filter((r) => r.segment === s)} fill={SEG[s] || '#6366f1'} fillOpacity={0.65} />
        ))}
      </ScatterChart>
    </ResponsiveContainer>
  );
}

// Pareto curve: bars coloured by ABC class + cumulative % line with an 80% marker.
// rows: [{ name, sales, cum, abc }] sorted by sales desc
const ABC = { A: '#6366f1', B: '#f59e0b', C: '#9ca3af' };
export function ParetoCurve({ rows, height = 320 }) {
  const Tip = ({ active, payload }) => {
    const p = active && payload?.[0]?.payload;
    return p ? <div style={box}><strong>{p.name}</strong><div>Sales {formatCurrency(p.sales)}</div>
      <div>Cumulative {p.cum.toFixed(1)}% · Class {p.abc}</div></div> : null;
  };
  return (
    <ResponsiveContainer width="100%" height={height}>
      <ComposedChart data={rows} margin={{ top: 10, right: 20, left: 10, bottom: 0 }}>
        <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e5e7eb" />
        <XAxis dataKey="name" tick={false} axisLine={false} tickLine={false} />
        <YAxis yAxisId="v" tickFormatter={formatCurrency} {...axis} />
        <YAxis yAxisId="c" orientation="right" domain={[0, 100]} tickFormatter={(v) => `${v}%`} {...axis} />
        <ReferenceLine yAxisId="c" y={80} stroke="#ef4444" strokeDasharray="4 4" />
        <Tooltip content={<Tip />} />
        <Bar isAnimationActive={false} yAxisId="v" dataKey="sales" name="Sales" radius={[3, 3, 0, 0]}>
          {rows.map((r, i) => <Cell key={i} fill={ABC[r.abc]} />)}
        </Bar>
        <Line isAnimationActive={false} yAxisId="c" dataKey="cum" name="Cumulative %" stroke="#111827" strokeWidth={2} dot={false} />
      </ComposedChart>
    </ResponsiveContainer>
  );
}
