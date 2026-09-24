import { formatCurrency } from './metrics.js';

// ============================================================================
// Briefing layer — turns a list of decisions into the two-minute narrative
// shown on the Decision Intelligence home page.
//
// Two things live here on purpose, kept separate from decisionEngine.js:
//  1. Personalization: mapping a manager's role / chosen focus areas onto the
//     decision `type` values the engine already produces (Availability,
//     Inventory, Control, Target Recovery, Margin, Distribution).
//  2. A deterministic, template-based narrative builder. This is the
//     always-on fallback — server.js will try to have an LLM rewrite it into
//     something that reads more naturally, but if there's no API key
//     configured, or the API call fails, this is what the manager sees. It
//     should never be blank and never require the network to work.
// ============================================================================

export const TAG_OPTIONS = [
  { key: 'availability', label: 'Availability', types: ['Availability'] },
  { key: 'inventory', label: 'Inventory', types: ['Inventory'] },
  { key: 'margin', label: 'Margin & promo', types: ['Margin'] },
  { key: 'distribution', label: 'Distribution', types: ['Distribution'] },
  { key: 'target', label: 'Target recovery', types: ['Target Recovery'] },
  { key: 'control', label: 'Stock variance', types: ['Control'] },
];

export const ROLE_PRESETS = {
  'Sales Head': ['availability', 'target', 'inventory'],
  'Category Head': ['margin', 'distribution', 'inventory'],
  'Regional Manager': ['availability', 'control', 'target'],
  'All areas': TAG_OPTIONS.map((t) => t.key),
};

export function typesForTags(tagKeys) {
  const set = new Set();
  TAG_OPTIONS.forEach((t) => { if (tagKeys.includes(t.key)) t.types.forEach((x) => set.add(x)); });
  return set;
}

export function filterDecisionsByTags(decisions, tagKeys) {
  if (!tagKeys || tagKeys.length === 0) return decisions;
  const types = typesForTags(tagKeys);
  return decisions.filter((d) => types.has(d.type));
}

export function pctChange(current, prior) {
  if (!prior) return null;
  return ((current - prior) / prior) * 100;
}

// A rough, clearly-labeled estimate — not a measured number. The point is to
// make "this saves time" a visible, honest claim rather than an assumed one:
// roughly how long finding the same picture manually (across several pages,
// filtering, cross-referencing) tends to take vs. reading one paragraph.
export function estimateTimeSaved(openCount, causeCount) {
  const minutes = Math.min(45, 8 + Math.round(openCount * 0.4) + causeCount * 2);
  return `~${minutes} min`;
}

export function buildBriefingSummary({ decisions, causes, trendPct, tagKeys }) {
  const filtered = filterDecisionsByTags(decisions, tagKeys);
  const top = filtered[0] || null;
  const secondary = filtered.slice(1, 3);
  const totalOpportunity = filtered.reduce((a, d) => a + d.impact, 0);
  const criticalCount = filtered.filter((d) => d.priority === 'critical').length;
  const openCount = filtered.length;
  const topCauses = causes.slice(0, 2);
  return { top, secondary, totalOpportunity, criticalCount, openCount, topCauses, trendPct, filtered };
}

// The always-on narrative. Kept short (3-4 sentences), plain business
// English, only ever states numbers already computed elsewhere — nothing
// here is invented or estimated beyond what estimateTimeSaved() admits to.
export function buildTemplateBriefing(summary) {
  const { top, secondary, totalOpportunity, criticalCount, openCount } = summary;
  if (!top) {
    return 'No significant issues were detected for the areas you have selected in the current period. Widen your focus areas above, or check back after the next data refresh.';
  }
  const parts = [];
  parts.push(`Your biggest issue this week is at ${top.entity} \u2014 ${top.why.toLowerCase()} Fixing "${top.title}" is worth ${formatCurrency(top.impact)}.`);
  if (secondary.length) {
    parts.push(`Also worth attention: ${secondary.map((d) => `${d.title} (${formatCurrency(d.impact)})`).join(' and ')}.`);
  }
  const urgency = criticalCount > 0 ? `${criticalCount} of them urgent` : 'none urgent right now';
  parts.push(`Net: ${formatCurrency(totalOpportunity)} in identified opportunity across ${openCount} items, ${urgency}.`);
  return parts.join(' ');
}
