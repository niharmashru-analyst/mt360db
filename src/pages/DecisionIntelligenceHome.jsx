import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useFilters } from '../context/FilterContext.jsx';
import { buildDecisionSet, buildRootCauses } from '../data/decisionEngine.js';
import { applyFilters, formatCurrency, formatNumber } from '../data/metrics.js';
import {
  TAG_OPTIONS, ROLE_PRESETS, filterDecisionsByTags, pctChange,
  estimateTimeSaved, buildBriefingSummary, buildTemplateBriefing,
} from '../data/briefing.js';

const VIEW_KEY = 'mt360_di_view_v1';
const LOG_KEY = 'mt360_decision_log_v1';
function readLog() { try { return JSON.parse(localStorage.getItem(LOG_KEY) || '[]'); } catch { return []; } }
function writeLog(v) { localStorage.setItem(LOG_KEY, JSON.stringify(v)); }
function readSavedView() { try { return JSON.parse(localStorage.getItem(VIEW_KEY) || 'null'); } catch { return null; } }

export default function DecisionIntelligenceHome() {
  const { filteredRecords, allRecords, listingMatrix, monthlyQtyIndex, filters, months } = useFilters();
  const navigate = useNavigate();

  const saved = readSavedView();
  const [role, setRole] = useState(saved?.role || 'Sales Head');
  const [tags, setTags] = useState(saved?.tags || ROLE_PRESETS['Sales Head']);
  const [savedFlash, setSavedFlash] = useState(false);
  const [acceptedFlash, setAcceptedFlash] = useState(false);

  function handleRoleChange(nextRole) {
    setRole(nextRole);
    setTags(ROLE_PRESETS[nextRole] || TAG_OPTIONS.map((t) => t.key));
  }
  function toggleTag(key) {
    setTags((prev) => (prev.includes(key) ? prev.filter((k) => k !== key) : [...prev, key]));
  }
  function saveView() {
    localStorage.setItem(VIEW_KEY, JSON.stringify({ role, tags }));
    setSavedFlash(true);
    setTimeout(() => setSavedFlash(false), 2000);
  }

  // Same engine, same inputs, as Decision Center / Action Center / Analyst —
  // this page must never disagree with any of them on the underlying numbers.
  const decisions = useMemo(
    () => buildDecisionSet(filteredRecords, allRecords, listingMatrix, filters.month, monthlyQtyIndex),
    [filteredRecords, allRecords, listingMatrix, filters.month, monthlyQtyIndex]
  );
  const causes = useMemo(() => buildRootCauses(filteredRecords, allRecords, filters), [filteredRecords, allRecords, filters]);

  // Trend vs the prior month, filtered by the same tags, so "up 6%" means
  // something specific to what this person actually cares about.
  const trendPct = useMemo(() => {
    const idx = months.indexOf(filters.month);
    const priorMonth = idx > 0 ? months[idx - 1] : null;
    if (!priorMonth) return null;
    const priorRecords = applyFilters(allRecords, { ...filters, month: priorMonth });
    const priorDecisions = buildDecisionSet(priorRecords, allRecords, listingMatrix, priorMonth, monthlyQtyIndex);
    const currentTotal = filterDecisionsByTags(decisions, tags).reduce((a, d) => a + d.impact, 0);
    const priorTotal = filterDecisionsByTags(priorDecisions, tags).reduce((a, d) => a + d.impact, 0);
    return pctChange(currentTotal, priorTotal);
  }, [months, filters, allRecords, listingMatrix, monthlyQtyIndex, decisions, tags]);

  const summary = useMemo(() => buildBriefingSummary({ decisions, causes, trendPct, tagKeys: tags }), [decisions, causes, trendPct, tags]);
  const templateText = useMemo(() => buildTemplateBriefing(summary), [summary]);
  const timeSaved = estimateTimeSaved(summary.openCount, causes.length);

  // The template briefing renders instantly (no network dependency). If the
  // server has an LLM key configured, we ask it to rewrite the same numbers
  // into something that reads more naturally, and swap it in when it
  // arrives — never before, never instead of. A stale/failed request must
  // never leave the page blank.
  const [enhancedText, setEnhancedText] = useState(null);
  const [briefingLoading, setBriefingLoading] = useState(false);
  const requestId = useRef(0);

  useEffect(() => {
    const id = ++requestId.current;
    setEnhancedText(null);
    if (!summary.top) return; // nothing to narrate — template's "no issues" message is enough
    setBriefingLoading(true);
    fetch('/api/briefing', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        role, tags,
        top: summary.top && { entity: summary.top.entity, title: summary.top.title, why: summary.top.why, impact: summary.top.impact },
        secondary: summary.secondary.map((d) => ({ title: d.title, impact: d.impact })),
        totalOpportunity: summary.totalOpportunity,
        criticalCount: summary.criticalCount,
        openCount: summary.openCount,
        trendPct: summary.trendPct,
      }),
    })
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => { if (id === requestId.current && data?.enhanced && data.text) setEnhancedText(data.text); })
      .catch(() => {})
      .finally(() => { if (id === requestId.current) setBriefingLoading(false); });
  }, [role, tags, summary]);

  function acceptTop() {
    if (!summary.top) return;
    const item = { ...summary.top, status: 'accepted', owner: 'Sales Manager', deadline: '', decisionAt: new Date().toISOString() };
    writeLog([item, ...readLog().filter((x) => x.id !== summary.top.id)]);
    setAcceptedFlash(true);
    setTimeout(() => setAcceptedFlash(false), 2000);
  }

  const trendClass = trendPct == null ? 'trend-flat' : trendPct >= 0 ? 'trend-up' : 'trend-down';
  const trendText = trendPct == null ? 'No prior month to compare' : `${trendPct >= 0 ? 'up' : 'down'} ${Math.abs(trendPct).toFixed(0)}% vs last month`;
  const borderClass = summary.top?.priority === 'critical' ? '' : summary.top?.priority === 'high' ? 'priority-high-border' : 'priority-medium-border';

  return (
    <div className="page">
      <div className="di-home-header">
        <div>
          <h1>Decision Intelligence</h1>
          <p className="page-subtitle" style={{ marginBottom: 0 }}>Read this first. Everything else is here if you want to dig deeper.</p>
        </div>
        <div className="di-role-select">
          <span className="di-week-label">Viewing as</span>
          <select value={role} onChange={(e) => handleRoleChange(e.target.value)}>
            {Object.keys(ROLE_PRESETS).map((r) => <option key={r}>{r}</option>)}
          </select>
          <span className="di-week-label">&middot; {filters.month || '—'}</span>
        </div>
      </div>

      <div className="briefing-card">
        <div className="briefing-label">
          <span>Your briefing &middot; {timeSaved} saved vs digging manually</span>
          <span className={`briefing-source ${enhancedText ? 'enhanced' : ''}`}>
            {briefingLoading ? 'Writing…' : enhancedText ? 'Written for you' : 'Auto-generated summary'}
          </span>
        </div>
        <div className="briefing-text" dangerouslySetInnerHTML={{ __html: mdBold(enhancedText || templateText) }} />
        {summary.top && (
          <div className="briefing-actions">
            <button className="primary-btn" onClick={() => navigate(`/decision-center?focus=${encodeURIComponent(summary.top.id)}`)}>See today's priorities</button>
            <button className="ghost-btn" onClick={() => navigate('/root-cause')}>Why is this happening?</button>
          </div>
        )}
      </div>

      <div className="kpi-grid">
        <div className="kpi-card kpi-tone-success">
          <div className="kpi-label">Opportunity identified</div>
          <div className="kpi-value">{formatCurrency(summary.totalOpportunity)}</div>
          <div className={`kpi-subtext ${trendClass}`}>{trendText}</div>
        </div>
        <div className={`kpi-card ${summary.criticalCount ? 'kpi-tone-danger' : 'kpi-tone-success'}`}>
          <div className="kpi-label">Needs attention today</div>
          <div className="kpi-value">{formatNumber(summary.criticalCount)} critical</div>
          <div className="kpi-subtext">of {formatNumber(summary.openCount)} open items in your focus areas</div>
        </div>
        <div className="kpi-card">
          <div className="kpi-label">Time this would take manually</div>
          <div className="kpi-value">{timeSaved}</div>
          <div className="kpi-subtext">estimated, cross-referencing raw reports</div>
        </div>
      </div>

      <div className="tag-row">
        <span className="di-week-label">Tune this to what matters to you:</span>
        {TAG_OPTIONS.map((t) => (
          <button key={t.key} className={`chip ${tags.includes(t.key) ? 'active' : ''}`} onClick={() => toggleTag(t.key)}>{t.label}</button>
        ))}
        <button className="chip" onClick={saveView}>{savedFlash ? 'Saved ✓' : 'Save as my view'}</button>
      </div>

      {summary.top ? (
        <>
          <div className={`hero-card ${borderClass}`}>
            <div className="hero-top">
              <div>
                <span className={`priority-pill ${summary.top.priority}`}>{summary.top.priority.toUpperCase()}</span>
                <div style={{ fontSize: 18, fontWeight: 700, marginTop: 8 }}>{summary.top.title}</div>
                <div className="page-subtitle" style={{ margin: '2px 0 0' }}>{summary.top.entity}{summary.top.sku ? ` · ${summary.top.sku}` : ''}</div>
              </div>
              <div className="hero-impact">
                <div className="label">Est. impact</div>
                <div className="value">{formatCurrency(summary.top.impact)}</div>
              </div>
            </div>
            <div className="hero-mid">
              <div><small>WHY</small>{summary.top.why}</div>
              <div><small>RECOMMENDATION</small>{summary.top.recommendation} Confidence {summary.top.confidence}%.</div>
            </div>
            <div className="hero-actions">
              <button className="primary-btn" onClick={acceptTop}>{acceptedFlash ? '✓ Accepted' : 'Accept'}</button>
              <button className="secondary-btn" onClick={() => navigate(`/decision-center?focus=${encodeURIComponent(summary.top.id)}`)}>Modify in Decision Center</button>
              <button className="danger-btn" onClick={() => navigate(`/decision-center?focus=${encodeURIComponent(summary.top.id)}`)}>Reject</button>
            </div>
          </div>

          {summary.secondary.length > 0 && (
            <>
              <div className="di-week-label" style={{ margin: '4px 0 8px' }}>Also worth a look</div>
              <div className="secondary-grid">
                {summary.secondary.map((d) => (
                  <div className="secondary-card" key={d.id}>
                    <div className="secondary-card-top">
                      <span className={`priority-pill ${d.priority}`}>{d.priority.toUpperCase()}</span>
                      <strong>{formatCurrency(d.impact)}</strong>
                    </div>
                    <div style={{ fontSize: 14, fontWeight: 600 }}>{d.title}</div>
                    <div className="page-subtitle" style={{ margin: '2px 0 0', fontSize: '0.8rem' }}>{d.entity}</div>
                  </div>
                ))}
              </div>
            </>
          )}
        </>
      ) : (
        <div className="empty-state">No issues detected in your selected focus areas for this period.</div>
      )}

      <div className="di-footer-link">
        Want the full picture instead? <a href="#/executive">Switch to Data view</a> for every chart, table and filter —
        or open <a href="#/decision-center">Decision Center</a> for the complete priority list, root cause and what-if tools.
      </div>
    </div>
  );
}

// Briefing text may contain **bold** markers (from the LLM or the template) —
// render them as <strong>, nothing else. No other HTML is ever accepted here.
function mdBold(text) {
  return String(text || '')
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
}
