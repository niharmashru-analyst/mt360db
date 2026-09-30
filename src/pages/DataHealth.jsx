import React, { useEffect, useState } from 'react';
import { useFilters } from '../context/FilterContext.jsx';
import KpiCard from '../components/KpiCard.jsx';
import Callout from '../components/Callout.jsx';
import DataTable from '../components/DataTable.jsx';
import { formatNumber } from '../data/metrics.js';
import { fetchDataHealth } from '../data/loadData.js';

export default function DataHealth() {
  const { dataSource, allRecords } = useFilters();
  const [health, setHealth] = useState(null);
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (dataSource !== 'live') {
      setLoading(false);
      return;
    }
    fetchDataHealth()
      .then((h) => { if (h.ok === false) setError(h.error); else setHealth(h); })
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, [dataSource]);

  if (dataSource !== 'live') {
    return (
      <div className="page">
        <h1>Data Health</h1>
        <Callout tone="info" title="Running on mock data">
          Data Health checks apply to your live OneDrive Excel connection — connect
          <code> ONEDRIVE_EXCEL_URL</code> to see row counts, unmatched columns, and code-mismatch
          diagnostics for your real file here.
        </Callout>
      </div>
    );
  }

  if (loading) {
    return <div className="page"><h1>Data Health</h1><p className="page-subtitle">Checking…</p></div>;
  }

  if (error) {
    return (
      <div className="page">
        <h1>Data Health</h1>
        <Callout tone="danger" title="Couldn't run health check">{error}</Callout>
      </div>
    );
  }

  // Unmatched outlet/SKU codes: codes referenced somewhere that don't appear
  // consistently — a lightweight proxy check using what's already loaded.
  const outletCodesSeen = new Set(allRecords.map((r) => r.outletCode));
  const skuCodesSeen = new Set(allRecords.map((r) => r.skuCode));
  const blankOutletCodes = allRecords.filter((r) => !r.outletCode).length;
  const blankSkuCodes = allRecords.filter((r) => !r.skuCode).length;

  return (
    <div className="page">
      <h1>Data Health</h1>
      <p className="page-subtitle">Checked {new Date(health.checkedAt).toLocaleString()} · sheet "{health.sheetUsed}"</p>

      <div className="kpi-grid">
        <KpiCard label="Rows Loaded" value={formatNumber(health.rowCount)} />
        <KpiCard label="Months Found" value={health.monthsFound.length} />
        <KpiCard label="Unique Outlets" value={formatNumber(health.uniqueOutletCodes)} />
        <KpiCard label="Unique SKUs" value={formatNumber(health.uniqueSkuCodes)} />
        <KpiCard
          label="Unparseable Month Rows"
          value={formatNumber(health.badMonthRows)}
          tone={health.badMonthRows > 0 ? 'danger' : 'success'}
        />
        <KpiCard
          label="Zero-Value Rows"
          value={formatNumber(health.zeroValueRows)}
          tone={health.zeroValueRows > 0 ? 'warning' : 'success'}
        />
      </div>

      {health.missingFields.length > 0 && (
        <Callout tone="danger" title="Missing expected columns">
          Your file has no column matching: <strong>{health.missingFields.join(', ')}</strong>. Pages that rely on
          these fields will show zeros or blanks until this is fixed — check the alias list in{' '}
          <code>server.js</code> or add/rename the column in your Excel file.
        </Callout>
      )}

      {health.unmatchedColumns.length > 0 && (
        <Callout tone="warning" title="Unmatched columns in your file">
          These columns exist in your Excel file but weren't recognized and are being ignored:{' '}
          <strong>{health.unmatchedColumns.join(', ')}</strong>. If one of these should map to a real field,
          add it to the <code>ALIASES</code> list in <code>server.js</code>.
        </Callout>
      )}

      {(blankOutletCodes > 0 || blankSkuCodes > 0) && (
        <Callout tone="warning" title="Blank codes found">
          {blankOutletCodes} rows have a blank Outlet Code and {blankSkuCodes} rows have a blank SKU Code —
          these rows will be excluded from Store/SKU-level pages.
        </Callout>
      )}

      {health.missingFields.length === 0 && health.badMonthRows === 0 && (
        <Callout tone="success" title="Looking good">
          All expected columns matched and every row's month parsed correctly.
        </Callout>
      )}

      <div className="section">
        <h2>Months Found in Your Data</h2>
        <DataTable
          defaultSortKey="month"
          columns={[{ key: 'month', label: 'Month' }, { key: 'rows', label: 'Rows', align: 'right', format: formatNumber }]}
          rows={health.monthsFound.map((m) => ({
            key: m, month: m, rows: allRecords.filter((r) => r.month === m).length,
          }))}
        />
      </div>

      <div className="section">
        <h2>All Columns in Your Uploaded File</h2>
        <DataTable
          defaultSortKey="column"
          columns={[
            { key: 'column', label: 'Column in Your File' },
            { key: 'matched', label: 'Matched To' },
          ]}
          rows={health.columnsInFile.map((c) => ({
            key: c, column: c,
            matched: health.unmatchedColumns.includes(c) ? '— not matched —' : 'matched',
          }))}
        />
      </div>
    </div>
  );
}
