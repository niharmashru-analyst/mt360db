import React, { useMemo, useState } from 'react';
import { useFilters } from '../context/FilterContext.jsx';
import KpiCard from '../components/KpiCard.jsx';
import DataTable from '../components/DataTable.jsx';
import Callout from '../components/Callout.jsx';
import {
  applyFilters, sumSalesValue, sumStockQty, oosPct, avgNOD, getPriorYearMonth,
  formatCurrency, formatPct, formatNumber,
} from '../data/metrics.js';

export default function RetailerProfile() {
  const { allRecords, filters, listingMatrix, storeMaster } = useFilters();
  const chains = useMemo(() => [...new Set(allRecords.map((r) => r.chainName))].sort(), [allRecords]);
  const [selectedChain, setSelectedChain] = useState(chains[0]);

  const chainFilters = { ...filters, chainName: selectedChain };
  const records = useMemo(() => applyFilters(allRecords, chainFilters), [allRecords, chainFilters]);
  const lyRecords = useMemo(
    () => applyFilters(allRecords, { ...chainFilters, month: getPriorYearMonth(filters.month) }),
    [allRecords, chainFilters, filters.month]
  );

  const sales = sumSalesValue(records);
  const lySales = sumSalesValue(lyRecords);
  const growth = lySales > 0 ? ((sales - lySales) / lySales) * 100 : null;

  const chainOutlets = storeMaster.filter((s) => s.chainName === selectedChain).map((s) => s.outletCode);
  const activeOutlets = new Set(records.filter((r) => r.salesQty > 0).map((r) => r.outletCode)).size;
  const chainListing = listingMatrix.filter((l) => chainOutlets.includes(l.outletCode));
  const distributionPct = chainListing.length > 0
    ? (chainListing.filter((l) => l.listed).length / chainListing.length) * 100 : 0;

  const oos = oosPct(records);
  const nod = avgNOD(records);

  // opportunity calc: what if distribution went to 95% and OOS dropped to 3%
  const potentialFromDist = sales * Math.max(0, (0.95 - distributionPct / 100));
  const potentialFromOOS = sales * Math.max(0, (oos / 100 - 0.03));

  return (
    <div className="page">
      <h1>Retailer 360</h1>
      <div className="filter-field inline-select">
        <label>Select Chain</label>
        <select value={selectedChain} onChange={(e) => setSelectedChain(e.target.value)}>
          {chains.map((c) => <option key={c} value={c}>{c}</option>)}
        </select>
      </div>

      <div className="kpi-grid">
        <KpiCard label="Sales (MTD)" value={formatCurrency(sales)} />
        <KpiCard label="Growth % YoY" value={formatPct(growth)} tone={growth >= 0 ? 'success' : 'danger'} />
        <KpiCard label="Active Outlets" value={`${activeOutlets} / ${chainOutlets.length}`} />
        <KpiCard label="Distribution %" value={formatPct(distributionPct)} />
        <KpiCard label="OOS %" value={formatPct(oos)} tone={oos > 10 ? 'danger' : 'success'} />
        <KpiCard label="Avg NOD" value={`${nod.toFixed(0)} days`} />
      </div>

      <div className="section">
        <h2>Retailer Opportunity</h2>
        <DataTable
          defaultSortKey="metric"
          columns={[
            { key: 'metric', label: 'Metric' },
            { key: 'current', label: 'Current' },
            { key: 'potential', label: 'Potential' },
            { key: 'gap', label: 'Est. Sales Gap', align: 'right', format: formatCurrency },
          ]}
          rows={[
            { key: 'dist', metric: 'Distribution %', current: formatPct(distributionPct), potential: '95%', gap: potentialFromDist },
            { key: 'oos', metric: 'OOS %', current: formatPct(oos), potential: '<3%', gap: potentialFromOOS },
          ]}
        />
      </div>

      <Callout tone="info" title="Reading this">
        This chain has an estimated <strong>{formatCurrency(potentialFromDist + potentialFromOOS)}</strong> of
        upside available purely from closing distribution and OOS gaps — before considering any velocity improvement.
      </Callout>
    </div>
  );
}
