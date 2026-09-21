import React, { useMemo, useState } from 'react';
import { useFilters } from '../context/FilterContext.jsx';
import KpiCard from '../components/KpiCard.jsx';
import DataTable from '../components/DataTable.jsx';
import Callout from '../components/Callout.jsx';
import { sumSalesValue, oosPct, formatCurrency, formatPct } from '../data/metrics.js';

export default function GrowthSimulator() {
  const { filteredRecords, listingMatrix } = useFilters();

  const currentSales = sumSalesValue(filteredRecords);
  const currentOOS = oosPct(filteredRecords);
  const totalListings = listingMatrix.length;
  const listedCount = listingMatrix.filter((l) => l.listed).length;
  const currentDist = totalListings > 0 ? (listedCount / totalListings) * 100 : 0;

  const [newOutlets, setNewOutlets] = useState(20);
  const [targetOOS, setTargetOOS] = useState(3);
  const [velocityLift, setVelocityLift] = useState(10);
  const [assortmentSkus, setAssortmentSkus] = useState(5);

  const avgSalesPerOutlet = useMemo(() => {
    const outletCount = new Set(filteredRecords.map((r) => r.outletCode)).size;
    return outletCount > 0 ? currentSales / outletCount : 0;
  }, [filteredRecords, currentSales]);

  const distributionImpact = newOutlets * avgSalesPerOutlet * 0.6; // new outlets ramp slower than mature ones
  const oosImpact = currentSales * Math.max(0, (currentOOS - targetOOS) / 100);
  const velocityImpact = currentSales * (velocityLift / 100);
  const assortmentImpact = assortmentSkus * (avgSalesPerOutlet / 20); // rough per-SKU average contribution

  const totalOpportunity = distributionImpact + oosImpact + velocityImpact + assortmentImpact;

  return (
    <div className="page">
      <h1>Growth Simulator</h1>
      <p className="page-subtitle">
        Estimated opportunity, not guaranteed sales — use this to prioritize, not to forecast.
      </p>

      <div className="section simulator-inputs">
        <h2>Levers</h2>
        <div className="slider-row">
          <label>Add outlets (Distribution): <strong>{newOutlets}</strong></label>
          <input type="range" min="0" max="100" value={newOutlets} onChange={(e) => setNewOutlets(Number(e.target.value))} />
        </div>
        <div className="slider-row">
          <label>Bring OOS % down to: <strong>{targetOOS}%</strong> (currently {formatPct(currentOOS)})</label>
          <input type="range" min="0" max="20" value={targetOOS} onChange={(e) => setTargetOOS(Number(e.target.value))} />
        </div>
        <div className="slider-row">
          <label>Velocity improvement: <strong>{velocityLift}%</strong></label>
          <input type="range" min="0" max="30" value={velocityLift} onChange={(e) => setVelocityLift(Number(e.target.value))} />
        </div>
        <div className="slider-row">
          <label>Add productive SKUs per store: <strong>{assortmentSkus}</strong></label>
          <input type="range" min="0" max="15" value={assortmentSkus} onChange={(e) => setAssortmentSkus(Number(e.target.value))} />
        </div>
      </div>

      <div className="section">
        <h2>Estimated Impact</h2>
        <DataTable
          defaultSortKey="impact"
          columns={[
            { key: 'lever', label: 'Lever' },
            { key: 'assumption', label: 'Assumption' },
            { key: 'impact', label: 'Est. Impact', align: 'right', format: formatCurrency },
          ]}
          rows={[
            { key: 'dist', lever: 'Distribution', assumption: `+${newOutlets} outlets`, impact: distributionImpact },
            { key: 'avail', lever: 'Availability', assumption: `OOS ${formatPct(currentOOS)} → ${targetOOS}%`, impact: oosImpact },
            { key: 'velocity', lever: 'Velocity', assumption: `+${velocityLift}%`, impact: velocityImpact },
            { key: 'assortment', lever: 'Assortment', assumption: `+${assortmentSkus} SKUs/store`, impact: assortmentImpact },
          ]}
        />
      </div>

      <Callout tone="success" title="Total Identified Opportunity">
        <strong style={{ fontSize: '1.5rem' }}>{formatCurrency(totalOpportunity)}</strong>
        <div style={{ marginTop: 8 }}>
          This is an estimated opportunity based on the levers above — validate each assumption against a
          pilot before committing budget or targets to it.
        </div>
      </Callout>
    </div>
  );
}
