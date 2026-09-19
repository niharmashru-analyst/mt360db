import React from 'react';

export default function KpiCard({ label, value, subtext, tone = 'neutral' }) {
  return (
    <div className={`kpi-card kpi-tone-${tone}`}>
      <div className="kpi-label">{label}</div>
      <div className="kpi-value">{value}</div>
      {subtext && <div className="kpi-subtext">{subtext}</div>}
    </div>
  );
}
