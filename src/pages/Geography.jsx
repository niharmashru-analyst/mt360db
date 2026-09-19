import React, { useMemo } from 'react';
import { useFilters } from '../context/FilterContext.jsx';
import DataTable from '../components/DataTable.jsx';
import Callout from '../components/Callout.jsx';
import { groupBy, sumSalesValue, oosPct, formatCurrency, formatPct } from '../data/metrics.js';

function heatColor(pct, invert = false) {
  const v = invert ? 100 - pct : pct;
  if (v >= 75) return '#16a34a';
  if (v >= 50) return '#84cc16';
  if (v >= 25) return '#f59e0b';
  return '#ef4444';
}

export default function Geography() {
  const { filteredRecords, listingMatrix } = useFilters();

  const byRegion = useMemo(() => {
    const groups = groupBy(filteredRecords, 'region');
    return Object.entries(groups).map(([region, recs]) => ({
      key: region, region,
      sales: sumSalesValue(recs),
      oos: oosPct(recs),
      outlets: new Set(recs.map((r) => r.outletCode)).size,
    })).sort((a, b) => b.sales - a.sales);
  }, [filteredRecords]);

  const byState = useMemo(() => {
    const groups = groupBy(filteredRecords, 'state');
    return Object.entries(groups).map(([state, recs]) => ({
      key: state, state,
      sales: sumSalesValue(recs),
      oos: oosPct(recs),
      outlets: new Set(recs.map((r) => r.outletCode)).size,
    })).sort((a, b) => b.sales - a.sales);
  }, [filteredRecords]);

  const byCity = useMemo(() => {
    const groups = groupBy(filteredRecords, 'city');
    return Object.entries(groups).map(([city, recs]) => ({
      key: city, city,
      sales: sumSalesValue(recs),
      oos: oosPct(recs),
      outlets: new Set(recs.map((r) => r.outletCode)).size,
    })).sort((a, b) => b.sales - a.sales);
  }, [filteredRecords]);

  const lowestDistState = byState.length ? byState.reduce((min, s) => (s.oos > min.oos ? s : min), byState[0]) : null;

  return (
    <div className="page">
      <h1>Geography 360</h1>
      <p className="page-subtitle">Region → State → City drill-down</p>

      <div className="section">
        <h2>By Region</h2>
        <DataTable
          defaultSortKey="sales"
          columns={[
            { key: 'region', label: 'Region' },
            { key: 'sales', label: 'Sales', align: 'right', format: formatCurrency },
            {
              key: 'oos', label: 'OOS %', align: 'right',
              format: (v) => <span style={{ color: heatColor(v, true) }}>{formatPct(v)}</span>,
            },
            { key: 'outlets', label: 'Active Outlets', align: 'right' },
          ]}
          rows={byRegion}
        />
      </div>

      <div className="two-col">
        <div className="section">
          <h2>By State</h2>
          <DataTable
            defaultSortKey="sales"
            columns={[
              { key: 'state', label: 'State' },
              { key: 'sales', label: 'Sales', align: 'right', format: formatCurrency },
              { key: 'oos', label: 'OOS %', align: 'right', format: formatPct },
            ]}
            rows={byState}
          />
        </div>
        <div className="section">
          <h2>By City</h2>
          <DataTable
            defaultSortKey="sales"
            columns={[
              { key: 'city', label: 'City' },
              { key: 'sales', label: 'Sales', align: 'right', format: formatCurrency },
              { key: 'oos', label: 'OOS %', align: 'right', format: formatPct },
            ]}
            rows={byCity}
          />
        </div>
      </div>

      {lowestDistState && (
        <Callout tone="warning" title="White Space">
          <strong>{lowestDistState.state}</strong> shows the highest OOS rate at <strong>{formatPct(lowestDistState.oos)}</strong> across{' '}
          {lowestDistState.outlets} active outlets — worth a closer look at replenishment routing here.
        </Callout>
      )}
    </div>
  );
}
