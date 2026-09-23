import React, { useMemo, useState } from 'react';
import { useFilters } from '../context/FilterContext.jsx';
import KpiCard from '../components/KpiCard.jsx';
import DataTable from '../components/DataTable.jsx';
import Callout from '../components/Callout.jsx';
import { buildScenario } from '../data/decisionEngine.js';
import { sumSalesValue, oosPct, formatCurrency, formatPct } from '../data/metrics.js';

// ============================================================================
// Growth Simulator — the full-page version of the What-If tool.
//
// This used to run its own inline formulas (different multipliers than the
// Decision Center's "What-If Quick Test") so the same lever could produce two
// different ₹ numbers depending on which page you tried it on. It now calls
// the identical buildScenario() used by Decision Center, so the two are
// guaranteed to agree — this page just gives the levers more room and adds
// margin / risk-adjusted context alongside the breakdown.
// ============================================================================

export default function GrowthSimulator() {
  const { filteredRecords, listingMatrix } = useFilters();

  const currentSales = sumSalesValue(filteredRecords);
  const currentOOS = oosPct(filteredRecords);
  const totalListings = listingMatrix.length;
  const listedCount = listingMatrix.filter((l) => l.listed).length;
  const currentDist = totalListings > 0 ? (listedCount / totalListings) * 100 : 0;

  const [distributionLift, setDistributionLift] = useState(10);
  const [oosTarget, setOosTarget] = useState(3);
  const [velocityLift, setVelocityLift] = useState(10);
  const [assortmentLift, setAssortmentLift] = useState(5);

  const outletCount = useMemo(() => new Set(filteredRecords.map((r) => r.outletCode)).size, [filteredRecords]);
  const approxOutlets = Math.round((distributionLift / 100) * outletCount);

  const scenario = useMemo(
    () => buildScenario(filteredRecords, { distributionLift, oosTarget, velocityLift, assortmentLift }),
    [filteredRecords, distributionLift, oosTarget, velocityLift, assortmentLift]
  );

  return (
    <div className="page">
      <h1>Growth Simulator</h1>
      <p className="page-subtitle">
        Estimated opportunity, not guaranteed sales — use this to prioritize, not to forecast. Uses the same
        calculation as Decision Center's "What-If Quick Test", so the numbers always match.
      </p>

      <div className="kpi-grid">
        <KpiCard label="Current Sales" value={formatCurrency(currentSales)} />
        <KpiCard label="Current OOS %" value={formatPct(currentOOS)} tone={currentOOS > 10 ? 'danger' : 'success'} />
        <KpiCard label="Current Distribution %" value={formatPct(currentDist)} />
      </div>

      <div className="section simulator-inputs">
        <h2>Levers</h2>
        <div className="slider-row">
          <label>
            Distribution lift: <strong>+{distributionLift}%</strong>{' '}
            <span className="lever-hint">(≈ {approxOutlets} more active outlets at current sales-per-outlet)</span>
          </label>
          <input type="range" min="0" max="30" value={distributionLift} onChange={(e) => setDistributionLift(Number(e.target.value))} />
        </div>
        <div className="slider-row">
          <label>Bring OOS % down to: <strong>{oosTarget}%</strong> (currently {formatPct(currentOOS)})</label>
          <input type="range" min="0" max="10" value={oosTarget} onChange={(e) => setOosTarget(Number(e.target.value))} />
        </div>
        <div className="slider-row">
          <label>Velocity improvement: <strong>+{velocityLift}%</strong></label>
          <input type="range" min="0" max="20" value={velocityLift} onChange={(e) => setVelocityLift(Number(e.target.value))} />
        </div>
        <div className="slider-row">
          <label>Assortment lift: <strong>+{assortmentLift}%</strong></label>
          <input type="range" min="0" max="20" value={assortmentLift} onChange={(e) => setAssortmentLift(Number(e.target.value))} />
        </div>
      </div>

      <div className="section">
        <h2>Estimated Impact Breakdown</h2>
        <DataTable
          defaultSortKey="impact"
          columns={[
            { key: 'lever', label: 'Lever' },
            { key: 'assumption', label: 'Assumption' },
            { key: 'impact', label: 'Est. Impact', align: 'right', format: formatCurrency },
          ]}
          rows={[
            { key: 'dist', lever: 'Distribution', assumption: `+${distributionLift}% (≈ ${approxOutlets} outlets)`, impact: scenario.distribution },
            { key: 'avail', lever: 'Availability', assumption: `OOS ${formatPct(currentOOS)} → ${oosTarget}%`, impact: scenario.availability },
            { key: 'velocity', lever: 'Velocity', assumption: `+${velocityLift}%`, impact: scenario.velocity },
            { key: 'assortment', lever: 'Assortment', assumption: `+${assortmentLift}%`, impact: scenario.assortment },
          ]}
        />
      </div>

      <div className="kpi-grid">
        <KpiCard label="Total Incremental Sales" value={formatCurrency(scenario.incrementalSales)} tone="success" />
        <KpiCard label="Estimated Margin" value={formatCurrency(scenario.margin)} />
        <KpiCard label="Risk-Adjusted (75%)" value={formatCurrency(scenario.riskAdjusted)} />
      </div>

      <Callout tone="success" title="Total Identified Opportunity">
        <strong style={{ fontSize: '1.5rem' }}>{formatCurrency(scenario.incrementalSales)}</strong>
        <div style={{ marginTop: 8 }}>
          This is an estimated opportunity based on the levers above — validate each assumption against a
          pilot before committing budget or targets to it. The risk-adjusted figure (75% of incremental sales)
          is a more conservative planning number.
        </div>
      </Callout>
    </div>
  );
}
