import React from 'react';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, Cell,
} from 'recharts';

const COLORS = ['#6366f1', '#22c55e', '#f59e0b', '#ef4444', '#06b6d4', '#a855f7', '#84cc16'];

export default function BarChartBlock({ data, dataKey = 'value', nameKey = 'key', height = 300, colorByIndex = true, yFormat, horizontal = false }) {
  return (
    <ResponsiveContainer width="100%" height={height}>
      <BarChart data={data} layout={horizontal ? 'vertical' : 'horizontal'} margin={{ top: 10, right: 20, left: horizontal ? 80 : 0, bottom: 0 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
        {horizontal ? (
          <>
            <XAxis type="number" tick={{ fontSize: 12 }} tickFormatter={yFormat} />
            <YAxis type="category" dataKey={nameKey} tick={{ fontSize: 11 }} width={100} />
          </>
        ) : (
          <>
            <XAxis dataKey={nameKey} tick={{ fontSize: 11 }} angle={-20} textAnchor="end" height={60} />
            <YAxis tick={{ fontSize: 12 }} tickFormatter={yFormat} />
          </>
        )}
        <Tooltip formatter={(v) => (yFormat ? yFormat(v) : v)} />
        <Bar dataKey={dataKey} radius={[4, 4, 0, 0]}>
          {colorByIndex && data.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}
