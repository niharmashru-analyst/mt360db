import React, { useMemo, useState } from 'react';
import { useFilters } from '../context/FilterContext.jsx';
import { buildDecisionSet, buildRootCauses } from '../data/decisionEngine.js';
import { formatCurrency, formatNumber, sumSalesValue, sum } from '../data/metrics.js';

// ============================================================================
// Analyst — a guided, rule-based Q&A layer over the Decision Engine.
//
// Calling this a "natural-language interface" oversold it: it's keyword
// matching against a fixed set of business questions, not a language model.
// It's kept deliberately deterministic (same engine, same numbers as Decision
// Center) rather than routed through an LLM, so every answer is reproducible
// and auditable during the pilot. The quick prompts below are the questions
// it's actually built to answer well — free-typed variations on those themes
// will usually match too, but very different phrasing falls through to the
// general summary at the bottom.
// ============================================================================

const quick = [
  'What are my biggest decisions today?',
  'Why is performance weak?',
  'Where is the biggest sales opportunity?',
  'Where is inventory risky?',
  'Where is stock variance a problem?',
  'How is margin and promo spend looking?',
  'Which chains have the biggest target gap?',
  'Which issues should I fix first?',
];

export default function Analyst() {
  const { filteredRecords, allRecords, listingMatrix, monthlyQtyIndex, filters } = useFilters();
  const [q, setQ] = useState('');

  const decisions = useMemo(
    () => buildDecisionSet(filteredRecords, allRecords, listingMatrix, filters.month, monthlyQtyIndex),
    [filteredRecords, allRecords, listingMatrix, filters.month, monthlyQtyIndex]
  );

  // Pass the same (filteredRecords, allRecords, filters) triple that
  // Decision Center and Root Cause Analytics use. The previous version only
  // passed filteredRecords, which — since filteredRecords is already scoped
  // to a single month — meant the engine had no prior-month data to compare
  // against and would silently under-report root causes.
  const causes = useMemo(() => buildRootCauses(filteredRecords, allRecords, filters), [filteredRecords, allRecords, filters]);

  const answer = useMemo(() => {
    const x = q.toLowerCase();
    const top = decisions.slice(0, 5);
    const sumByType = (type) => decisions.filter((d) => d.type === type).reduce((a, d) => a + d.impact, 0);
    const countByType = (type) => decisions.filter((d) => d.type === type).length;

    if (!q) {
      return "Ask a business question, or tap one of the prompts below. The Analyst uses the same deterministic Decision Engine as Decision Center — every number here can be cross-checked there.";
    }
    if (x.includes('decision') || x.includes('fix') || x.includes('today')) {
      return top.length
        ? `I found ${formatNumber(decisions.length)} decision candidates. The top priorities are: ${top.map((d) => `${d.title} (${formatCurrency(d.impact)})`).join('; ')}.`
        : 'No open decisions were detected in the current filtered data.';
    }
    if (x.includes('why') || x.includes('weak') || x.includes('decline') || x.includes('driver')) {
      return causes.length
        ? `The strongest detected drivers are ${causes.slice(0, 4).map((c) => `${c.driver} (${c.contribution.toFixed(1)}%)`).join(', ')}. Open Root Cause Analytics or Decision Center for the full evidence and recommended next checks.`
        : 'There is not enough evidence in the current filtered data to identify a root cause (usually because no prior-month data exists yet for comparison).';
    }
    if (x.includes('opportunity') || x.includes('distribution') || x.includes('whitespace') || x.includes('expand')) {
      const v = sumByType('Distribution') + sumByType('Availability');
      return `The current availability/distribution opportunity pool is approximately ${formatCurrency(v)}, across ${formatNumber(countByType('Distribution') + countByType('Availability'))} candidate items, based on the current heuristics.`;
    }
    if (x.includes('inventory') || x.includes('excess') || (x.includes('stock') && !x.includes('varianc'))) {
      return `I found ${formatNumber(countByType('Inventory'))} inventory decisions with an estimated working-capital / recovery impact of ${formatCurrency(sumByType('Inventory'))}.`;
    }
    if (x.includes('varianc') || x.includes('reconcil') || x.includes('discrepanc')) {
      return `I found ${formatNumber(countByType('Control'))} stock variance items flagged for investigation, worth ${formatCurrency(sumByType('Control'))} in stock value at stake. These need reconciliation, not a sales action.`;
    }
    if (x.includes('margin') || x.includes('promo') || x.includes('discount') || x.includes('pricing')) {
      return countByType('Margin')
        ? `${formatNumber(countByType('Margin'))} chains show high promo intensity alongside compressed margin, worth reviewing — approximately ${formatCurrency(sumByType('Margin'))} in margin at risk.`
        : 'No chains currently combine high promo intensity with low blended margin in the filtered data — margin/promo economics look reasonable right now.';
    }
    if (x.includes('target') || x.includes('gap') || x.includes('recover') || x.includes('behind')) {
      const items = decisions.filter((d) => d.type === 'Target Recovery');
      return items.length
        ? `The largest target gaps are in ${items.slice(0, 3).map((d) => `${d.entity} (${formatCurrency(d.impact)})`).join(', ')}. Fix availability and distribution gaps before adding broad discounting.`
        : 'No chain currently has a material gap between sales and target in the filtered data.';
    }
    return `Current filtered sales are ${formatCurrency(sumSalesValue(filteredRecords))} against target ${formatCurrency(sum(filteredRecords, 'targetValue'))}. I can answer questions about risks, opportunities, inventory, variance, margin/promo, target recovery and recommended actions — try one of the quick prompts below for the best results.`;
  }, [q, decisions, causes, filteredRecords]);

  return (
    <div className="page">
      <h1>🤖 Analyst</h1>
      <p className="page-subtitle">
        Guided Q&amp;A over the Decision Intelligence layer — rule-based keyword matching against the same
        deterministic engine as Decision Center, not a free-form language model. Try a quick prompt below for
        the most reliable answers.
      </p>
      <div className="analyst-box">
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Ask: Which decisions should I take today?"
          onKeyDown={(e) => { if (e.key === 'Enter') setQ(q.trim()); }}
        />
        <button className="primary-btn" onClick={() => setQ(q.trim())}>Analyse</button>
        <div className="quick-prompts">
          {quick.map((x) => <button key={x} className="chip" onClick={() => setQ(x)}>{x}</button>)}
        </div>
      </div>
      <div className="section analyst-answer">
        <h2>Analysis</h2>
        <p>{answer}</p>
      </div>
    </div>
  );
}
