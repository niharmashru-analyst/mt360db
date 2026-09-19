import React, { useMemo, useState } from 'react';
import { useFilters } from '../context/FilterContext.jsx';
import KpiCard from '../components/KpiCard.jsx';
import DataTable from '../components/DataTable.jsx';
import Matrix2x2, { classifyQuadrant } from '../components/Matrix2x2.jsx';
import { groupBy, sumSalesValue, formatCurrency, formatPct, formatNumber } from '../data/metrics.js';

export default function Distribution() {
  const { filteredRecords, listingMatrix, skuMaster } = useFilters();
  const [quadrantFilter, setQuadrantFilter] = useState(null);

  const totalListings = listingMatrix.length;
  const listedCount = listingMatrix.filter((l) => l.listed).length;
  const distributionPct = totalListings > 0 ? (listedCount / totalListings) * 100 : 0;

  // per-SKU: distribution % and velocity (sales per listed outlet)
  const skuStats = useMemo(() => {
    const skuGroups = groupBy(filteredRecords, 'skuCode');
    const listingBySku = groupBy(listingMatrix, 'skuCode');
    return Object.entries(skuGroups).map(([skuCode, recs]) => {
      const meta = skuMaster.find((s) => s.skuCode === skuCode) || {};
      const listings = listingBySku[skuCode] || [];
      const listedN = listings.filter((l) => l.listed).length;
      const dist = listings.length > 0 ? (listedN / listings.length) * 100 : 0;
      const velocity = listedN > 0 ? sumSalesValue(recs) / listedN : 0;
      return { key: skuCode, sku: meta.sku || skuCode, dist, velocity, sales: sumSalesValue(recs) };
    });
  }, [filteredRecords, listingMatrix, skuMaster]);

  const matrixPoints = useMemo(() => {
    const maxDist = 100;
    const maxVelocity = Math.max(1, ...skuStats.map((s) => s.velocity));
    return skuStats.map((s) => ({
      x: s.dist,
      y: s.velocity,
      label: s.sku,
      quadrant: classifyQuadrant(s.dist, s.velocity, maxDist * 0.5, maxVelocity * 0.4),
    }));
  }, [skuStats]);

  const quadrantRows = useMemo(() => {
    if (!quadrantFilter) return [];
    const maxDist = 100;
    const maxVelocity = Math.max(1, ...skuStats.map((s) => s.velocity));
    return skuStats.filter((s) => classifyQuadrant(s.dist, s.velocity, maxDist * 0.5, maxVelocity * 0.4) === quadrantFilter);
  }, [skuStats, quadrantFilter]);

  const catDistribution = useMemo(() => {
    const byCat = groupBy(listingMatrix.map((l) => {
      const sku = skuMaster.find((s) => s.skuCode === l.skuCode);
      return { ...l, category: sku?.category };
    }), 'category');
    return Object.entries(byCat).map(([cat, items]) => ({
      key: cat,
      dist: items.length > 0 ? (items.filter((i) => i.listed).length / items.length) * 100 : 0,
    }));
  }, [listingMatrix, skuMaster]);

  return (
    <div className="page">
      <h1>Distribution 360</h1>
      <p className="page-subtitle">Don't just count stores — show distribution quality.</p>

      <div className="kpi-grid">
        <KpiCard label="Overall Distribution %" value={formatPct(distributionPct)} />
        <KpiCard label="Total Listings" value={formatNumber(totalListings)} />
        <KpiCard label="Active Listings" value={formatNumber(listedCount)} />
      </div>

      <div className="section">
        <h2>Category Distribution %</h2>
        <DataTable
          defaultSortKey="dist"
          columns={[
            { key: 'key', label: 'Category' },
            { key: 'dist', label: 'Distribution %', align: 'right', format: formatPct },
          ]}
          rows={catDistribution}
        />
      </div>

      <div className="section">
        <h2>Distribution × Velocity Matrix (by SKU)</h2>
        <div className="quadrant-buttons">
          <button onClick={() => setQuadrantFilter('bottomLeft')} className="q-btn q-danger">Fix (Low Dist / Low Velocity)</button>
          <button onClick={() => setQuadrantFilter('topLeft')} className="q-btn q-warning">Grow (High Velocity / Low Dist)</button>
          <button onClick={() => setQuadrantFilter('bottomRight')} className="q-btn q-info">Saturated (High Dist / Low Velocity)</button>
          <button onClick={() => setQuadrantFilter('topRight')} className="q-btn q-success">Hero (High Dist / High Velocity)</button>
        </div>
        <Matrix2x2
          points={matrixPoints}
          xMid={50}
          yMid={Math.max(1, ...skuStats.map((s) => s.velocity)) * 0.4}
          labels={{
            topLeft: 'Grow (expand distribution)',
            topRight: 'Hero',
            bottomLeft: 'Fix (assortment question)',
            bottomRight: 'Saturated (productivity problem)',
            xAxis: 'Distribution %',
            yAxis: 'Sales per Listed Outlet',
          }}
        />
      </div>

      {quadrantFilter && (
        <div className="section">
          <h2>SKUs in this quadrant</h2>
          <DataTable
            defaultSortKey="sales"
            columns={[
              { key: 'sku', label: 'SKU' },
              { key: 'dist', label: 'Distribution %', align: 'right', format: formatPct },
              { key: 'velocity', label: 'Sales/Outlet', align: 'right', format: formatCurrency },
              { key: 'sales', label: 'Total Sales', align: 'right', format: formatCurrency },
            ]}
            rows={quadrantRows}
          />
        </div>
      )}
    </div>
  );
}
