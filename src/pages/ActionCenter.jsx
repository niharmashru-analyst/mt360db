import React, { useMemo, useState } from 'react';
import { useFilters } from '../context/FilterContext.jsx';
import KpiCard from '../components/KpiCard.jsx';
import DataTable from '../components/DataTable.jsx';
import Callout from '../components/Callout.jsx';
import { buildDecisionSet } from '../data/decisionEngine.js';
import { formatCurrency, formatNumber } from '../data/metrics.js';

// ============================================================================
// Action Center — the fast checklist a Sales Head opens Monday morning.
//
// This used to run its own, independent OOS / excess-stock / variance
// detection logic in parallel with Decision Center's engine — same idea,
// different formulas (a single-month NOD rate here vs. the standardized
// trailing-3-month one there), so the two pages could disagree on the same
// SKU. It now reads from the identical `buildDecisionSet()` used by Decision
// Center and Analyst, so the numbers always match across all three.
//
// What keeps this a distinct page rather than a duplicate: Decision Center
// is the full workflow (root cause, confidence, owner/deadline, accept /
// modify / reject, audit trail). Action Center is the lightweight version —
// tick things off as done, no owner/deadline required — for a quick
// Monday-morning pass rather than a governed decision log.
// ============================================================================

const DONE_KEY = 'mt360_action_done_v1';
function readDone() { try { return JSON.parse(localStorage.getItem(DONE_KEY) || '{}'); } catch { return {}; } }
function writeDone(v) { localStorage.setItem(DONE_KEY, JSON.stringify(v)); }

export default function ActionCenter() {
  const { filteredRecords, allRecords, listingMatrix, filters, monthlyQtyIndex } = useFilters();
  const [showDone, setShowDone] = useState(false);
  const [doneTick, setDoneTick] = useState(0);

  const decisions = useMemo(
    () => buildDecisionSet(filteredRecords, allRecords, listingMatrix, filters.month, monthlyQtyIndex),
    [filteredRecords, allRecords, listingMatrix, filters.month, monthlyQtyIndex]
  );
  const done = useMemo(() => readDone(), [doneTick]);

  function toggleDone(id) {
    const next = { ...done };
    if (next[id]) delete next[id];
    else next[id] = { doneAt: new Date().toISOString() };
    writeDone(next);
    setDoneTick((t) => t + 1);
  }

  const visible = showDone ? decisions : decisions.filter((d) => !done[d.id]);
  const doneCount = decisions.filter((d) => done[d.id]).length;
  const openOpportunity = decisions.filter((d) => !done[d.id]).reduce((a, d) => a + d.impact, 0);
  const criticalOpen = decisions.filter((d) => !done[d.id] && d.priority === 'critical').length;
  const highOpen = decisions.filter((d) => !done[d.id] && d.priority === 'high').length;

  const rows = visible.map((d) => ({ ...d, doneAt: done[d.id]?.doneAt }));

  return (
    <div className="page">
      <h1>⚡ Action Center</h1>
      <p className="page-subtitle">
        The page a Sales Head opens Monday morning — same detection engine as Decision Center, tick items off as you clear them.
      </p>

      <div className="kpi-grid">
        <KpiCard label="Open Opportunity" value={formatCurrency(openOpportunity)} tone="success" />
        <KpiCard label="Open Items" value={formatNumber(decisions.length - doneCount)} />
        <KpiCard label="Critical (Open)" value={formatNumber(criticalOpen)} tone={criticalOpen ? 'danger' : 'success'} />
        <KpiCard label="High Priority (Open)" value={formatNumber(highOpen)} tone={highOpen ? 'warning' : 'success'} />
        <KpiCard label="Cleared" value={formatNumber(doneCount)} tone="success" />
      </div>

      <Callout tone="success" title="This week">
        Not "here are 17 charts" — here are the <strong>{Math.min(20, decisions.length - doneCount)}</strong> things that
        matter most this week, out of {decisions.length} total identified issues. For root cause, confidence and a
        recorded decision trail, open an item in <strong>Decision Center</strong> instead.
      </Callout>

      <div className="section">
        <div className="action-toolbar">
          <h2 style={{ margin: 0 }}>Priority Action List</h2>
          <label>
            <input type="checkbox" checked={showDone} onChange={(e) => setShowDone(e.target.checked)} />
            Show cleared items
          </label>
        </div>
        <DataTable
          defaultSortKey="impact"
          rows={rows}
          columns={[
            {
              key: 'done', label: '✓',
              format: (_, row) => (
                <input
                  type="checkbox"
                  className="done-checkbox"
                  checked={!!done[row.id]}
                  onChange={() => toggleDone(row.id)}
                  onClick={(e) => e.stopPropagation()}
                />
              ),
            },
            { key: 'priority', label: 'Priority', format: (v) => <span className={`priority-pill ${v}`}>{v.toUpperCase()}</span> },
            { key: 'type', label: 'Issue' },
            { key: 'entity', label: 'Chain / Store' },
            { key: 'sku', label: 'SKU' },
            { key: 'impact', label: 'Opportunity ₹', align: 'right', format: formatCurrency },
            { key: 'action', label: 'Action' },
          ]}
        />
      </div>
    </div>
  );
}
