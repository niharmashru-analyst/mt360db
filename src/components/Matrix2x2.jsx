import React from 'react';
import {
  ScatterChart, Scatter, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  ReferenceLine, Cell,
} from 'recharts';

const QUADRANT_COLORS = {
  topLeft: '#f59e0b',
  topRight: '#22c55e',
  bottomLeft: '#ef4444',
  bottomRight: '#06b6d4',
};

// points: [{ x, y, label, quadrant }]
// labels: { topLeft, topRight, bottomLeft, bottomRight, xAxis, yAxis }
export default function Matrix2x2({ points, xMid, yMid, labels, height = 380 }) {
  return (
    <div>
      <div className="matrix-quadrant-labels">
        <span style={{ color: QUADRANT_COLORS.topLeft }}>◆ {labels.topLeft}</span>
        <span style={{ color: QUADRANT_COLORS.topRight }}>◆ {labels.topRight}</span>
        <span style={{ color: QUADRANT_COLORS.bottomLeft }}>◆ {labels.bottomLeft}</span>
        <span style={{ color: QUADRANT_COLORS.bottomRight }}>◆ {labels.bottomRight}</span>
      </div>
      <ResponsiveContainer width="100%" height={height}>
        <ScatterChart margin={{ top: 20, right: 30, left: 10, bottom: 10 }}>
          <CartesianGrid stroke="#e5e7eb" />
          <XAxis type="number" dataKey="x" name={labels.xAxis} tick={{ fontSize: 11 }} />
          <YAxis type="number" dataKey="y" name={labels.yAxis} tick={{ fontSize: 11 }} />
          <ReferenceLine x={xMid} stroke="#9ca3af" strokeDasharray="4 4" />
          <ReferenceLine y={yMid} stroke="#9ca3af" strokeDasharray="4 4" />
          <Tooltip
            cursor={{ strokeDasharray: '3 3' }}
            formatter={(value, name) => [value, name]}
            labelFormatter={() => ''}
            content={({ payload }) => {
              if (!payload || !payload.length) return null;
              const p = payload[0].payload;
              return (
                <div className="matrix-tooltip">
                  <strong>{p.label}</strong>
                  <div>{labels.xAxis}: {p.x}</div>
                  <div>{labels.yAxis}: {p.y}</div>
                </div>
              );
            }}
          />
          <Scatter data={points}>
            {points.map((p, i) => (
              <Cell key={i} fill={QUADRANT_COLORS[p.quadrant]} fillOpacity={0.75} />
            ))}
          </Scatter>
        </ScatterChart>
      </ResponsiveContainer>
    </div>
  );
}

export function classifyQuadrant(x, y, xMid, yMid) {
  if (x < xMid && y >= yMid) return 'topLeft';
  if (x >= xMid && y >= yMid) return 'topRight';
  if (x < xMid && y < yMid) return 'bottomLeft';
  return 'bottomRight';
}
