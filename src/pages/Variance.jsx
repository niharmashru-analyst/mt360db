import React, { useMemo } from 'react';
import { useFilters } from '../context/FilterContext.jsx';
import KpiCard from '../components/KpiCard.jsx';
import DataTable from '../components/DataTable.jsx';
import Callout from '../components/Callout.jsx';
import { varianceExceptions, formatNumber, formatPct } from '../data/metrics.js';

export default function Variance() {
  const { filteredRecords } = useFilters();

  const exceptions = useMemo(() => varianceExceptions(filteredRecords), [filteredRecords]);

  const rows = exceptions.map((r) => ({
    key: `${r.outletCode}|${r.skuCode}`,
    chain: r.chainName,
    outlet: r.outletName,
    sku: r.sku,
    opStock: r.opStock,
    primary: r.primaryQty,
    tertiary: r.tertiaryQty,
    expectedClose: r.expectedClose,
    actualClose: r.clStock,
    variance: r.variance,
    variancePct: r.variancePct,
  }));

  return (
    <div className="page">
      <h1>Variance Analysis</h1>
      <p className="page-subtitle">
        Stock Movement Check: Opening Stock + Primary − Tertiary = Expected Closing Stock, compared against actual.
      </p>

      <div className="kpi-grid">
        <KpiCard label="Exception Rows" value={formatNumber(rows.length)} tone={rows.length > 0 ? 'danger' : 'success'} />
        <KpiCard label="Total Rows Checked" value={formatNumber(filteredRecords.length)} />
        <KpiCard label="Exception Rate" value={formatPct(filteredRecords.length > 0 ? (rows.length / filteredRecords.length) * 100 : 0)} />
      </div>

      {rows.length === 0 ? (
        <Callout tone="success" title="Clean">No stock movement exceptions above the alert threshold this month.</Callout>
      ) : (
        <Callout tone="danger" title="Red Exception List">
          Only combinations with variance beyond the alert threshold are shown below — you don't need to
          scan every row, just these.
        </Callout>
      )}

      <div className="section">
        <h2>Exceptions</h2>
        <DataTable
          defaultSortKey="variancePct"
          columns={[
            { key: 'chain', label: 'Chain' },
            { key: 'outlet', label: 'Outlet' },
            { key: 'sku', label: 'SKU' },
            { key: 'expectedClose', label: 'Expected Close', align: 'right', format: formatNumber },
            { key: 'actualClose', label: 'Actual Close', align: 'right', format: formatNumber },
            { key: 'variance', label: 'Variance', align: 'right', format: formatNumber },
            { key: 'variancePct', label: 'Variance %', align: 'right', format: formatPct },
          ]}
          rows={rows}
        />
      </div>
    </div>
  );
}
