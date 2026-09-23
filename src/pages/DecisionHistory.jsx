import React, { useMemo, useRef, useState } from 'react';
import DataTable from '../components/DataTable.jsx';
import KpiCard from '../components/KpiCard.jsx';
import Callout from '../components/Callout.jsx';
import { formatCurrency, formatNumber } from '../data/metrics.js';

const KEY = 'mt360_decision_log_v1';
function read() { try { return JSON.parse(localStorage.getItem(KEY) || '[]'); } catch { return []; } }
function save(v) { localStorage.setItem(KEY, JSON.stringify(v)); }

function toCSV(rows) {
  const cols = ['status', 'type', 'title', 'owner', 'entity', 'sku', 'deadline', 'impact', 'actualImpact', 'outcome', 'decisionAt'];
  const escape = (v) => {
    const s = v === null || v === undefined ? '' : String(v);
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const lines = [cols.join(',')];
  rows.forEach((r) => lines.push(cols.map((c) => escape(r[c])).join(',')));
  return lines.join('\n');
}

function download(filename, content, mime) {
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

export default function DecisionHistory() {
  const [tick, setTick] = useState(0);
  const rows = useMemo(() => read(), [tick]);
  const fileInputRef = useRef(null);
  const [importMsg, setImportMsg] = useState('');

  const accepted = rows.filter((x) => x.status === 'accepted' || x.status === 'modified');

  function clearLog() {
    if (confirm('Clear pilot decision history from this browser? This cannot be undone — export a copy first if you want to keep it.')) {
      save([]);
      setTick((x) => x + 1);
    }
  }

  // Update a single field on one row, keyed by its position in the raw
  // (unsorted) log array. Replaces the old window.prompt()-based editing —
  // this is the outcome-capture step of the pilot loop, so it gets the same
  // inline-input treatment as the rest of the app rather than a browser popup.
  function updateField(i, field, value) {
    const next = read();
    if (!next[i]) return;
    next[i] = { ...next[i], [field]: value };
    save(next);
    setTick((t) => t + 1);
  }

  function exportCSV() {
    download(`mt360-decision-log-${new Date().toISOString().slice(0, 10)}.csv`, toCSV(read()), 'text/csv;charset=utf-8');
  }

  function exportJSON() {
    download(`mt360-decision-log-${new Date().toISOString().slice(0, 10)}.json`, JSON.stringify(read(), null, 2), 'application/json');
  }

  // Merge-import: imported items overwrite an existing row with the same id,
  // anything new is appended. This is meant as recovery insurance for a log
  // that only lives in one browser's localStorage — not a full sync mechanism.
  function handleImportFile(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const imported = JSON.parse(reader.result);
        if (!Array.isArray(imported)) throw new Error('File must contain a JSON array of decisions.');
        const current = read();
        const byId = new Map(current.map((r, i) => [r.id ?? `__idx${i}`, r]));
        imported.forEach((r) => byId.set(r.id ?? `__imp${Math.random()}`, r));
        save([...byId.values()]);
        setTick((t) => t + 1);
        setImportMsg(`Imported ${imported.length} decision${imported.length === 1 ? '' : 's'} (merged by id).`);
      } catch (err) {
        setImportMsg(`Import failed: ${err.message}`);
      }
    };
    reader.readAsText(file);
    e.target.value = '';
  }

  return (
    <div className="page">
      <h1>🧾 Decision History &amp; Outcomes</h1>
      <p className="page-subtitle">
        Track whether recommendations were accepted and what happened after the action. This is the feedback loop for the pilot.
      </p>

      <div className="kpi-grid">
        <KpiCard label="Decisions Recorded" value={formatNumber(rows.length)} />
        <KpiCard label="Accepted / Modified" value={formatNumber(accepted.length)} tone="success" />
        <KpiCard label="Rejected" value={formatNumber(rows.filter((x) => x.status === 'rejected').length)} tone="warning" />
        <KpiCard label="Tracked Impact" value={formatCurrency(rows.reduce((a, x) => a + (Number(x.actualImpact) || 0), 0))} tone="success" />
      </div>

      <Callout tone="info" title="Pilot learning">
        Use Actual Impact to compare recommendations with reality. This turns the dashboard into a measurable
        decision system rather than a static reporting tool. Edit Actual ₹ and Outcome directly in the table below.
      </Callout>

      <div className="section">
        <div className="page-header-row">
          <h2>Outcome Log</h2>
          <div className="history-toolbar">
            <button className="secondary-btn" onClick={exportCSV}>Export CSV</button>
            <button className="secondary-btn" onClick={exportJSON}>Export JSON</button>
            <button className="ghost-btn" onClick={() => fileInputRef.current?.click()}>Import JSON</button>
            <input ref={fileInputRef} type="file" accept="application/json" onChange={handleImportFile} />
            <button className="danger-btn" onClick={clearLog}>Clear Local Pilot Log</button>
          </div>
        </div>
        {importMsg && <Callout tone={importMsg.startsWith('Import failed') ? 'danger' : 'success'}>{importMsg}</Callout>}

        <DataTable
          rows={rows.map((r, i) => ({ ...r, _i: i, actualImpact: Number(r.actualImpact) || 0, outcome: r.outcome || '' }))}
          columns={[
            { key: 'status', label: 'Decision' },
            { key: 'type', label: 'Type' },
            { key: 'title', label: 'Recommendation' },
            { key: 'owner', label: 'Owner' },
            { key: 'impact', label: 'Expected ₹', align: 'right', format: formatCurrency },
            {
              key: 'actualImpact', label: 'Actual ₹', align: 'right',
              format: (v, row) => (
                <input
                  type="number"
                  className="inline-edit align-right"
                  value={row.actualImpact}
                  onChange={(e) => updateField(row._i, 'actualImpact', Number(e.target.value) || 0)}
                />
              ),
            },
            {
              key: 'outcome', label: 'Outcome',
              format: (v, row) => (
                <input
                  type="text"
                  className="inline-edit"
                  placeholder="What happened? What did we learn?"
                  value={row.outcome}
                  onChange={(e) => updateField(row._i, 'outcome', e.target.value)}
                />
              ),
            },
          ]}
        />
      </div>
    </div>
  );
}
