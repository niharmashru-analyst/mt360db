import React, { useState } from 'react';
import { NavLink, useLocation } from 'react-router-dom';
import { useFilters } from '../context/FilterContext.jsx';

const INTELLIGENCE_ITEMS = [
  { path: '/', label: '🧭 Briefing', end: true },
  { path: '/decision-center', label: '🧠 Decision Center' },
  { path: '/root-cause', label: '🔍 Root Cause Analytics' },
  { path: '/growth-simulator', label: '🚀 Growth Simulator' },
  { path: '/action-center', label: '⚡ Action Center' },
  { path: '/decision-history', label: '🧾 Decision History' },
  { path: '/analyst', label: '🤖 Analyst' },
];

const DATA_GROUPS = [
  {
    label: 'PERFORMANCE',
    items: [
      { path: '/executive', label: '🏠 Executive 360' },
      { path: '/sales', label: '📈 Sales Analysis' },
      { path: '/retailer', label: '🏪 Retailer 360' },
      { path: '/geography', label: '🗺 Geography 360' },
      { path: '/store', label: '🏬 Store 360' },
      { path: '/sku', label: '🎯 SKU 360' },
    ],
  },
  {
    label: 'DIAGNOSTICS',
    items: [
      { path: '/availability', label: '🚨 Availability / OOS' },
      { path: '/inventory', label: '📦 Inventory 360' },
      { path: '/distribution', label: '📦 Distribution 360' },
      { path: '/assortment', label: '🧴 Assortment Analytics' },
      { path: '/pricing', label: '💰 Pricing & Promotion' },
      { path: '/variance', label: '⚠️ Variance Analysis' },
    ],
  },
  {
    label: 'OPPORTUNITY',
    items: [
      { path: '/pareto', label: '🔥 Pareto Analysis' },
      { path: '/store-matrix', label: '🏆 Store Performance Matrix' },
      { path: '/opportunity-engine', label: '🧩 SKU × Store Opportunity' },
    ],
  },
  {
    label: null,
    items: [{ path: '/data-health', label: '🩺 Data Health' }],
  },
];

const INTELLIGENCE_PATHS = new Set(INTELLIGENCE_ITEMS.map((i) => i.path));
const DATA_PATHS = new Set(DATA_GROUPS.flatMap((g) => g.items.map((i) => i.path)));
const MODE_KEY = 'mt360_nav_mode_v1';

export default function Sidebar() {
  const { dataSource } = useFilters();
  const location = useLocation();
  const [storedMode, setStoredMode] = useState(() => localStorage.getItem(MODE_KEY) || 'intelligence');

  // The current URL always wins over the stored preference — following a
  // link (e.g. the "Switch to Data view" footer link on the briefing page)
  // should visibly flip the sidebar, not leave it pointing at the old mode.
  const mode = DATA_PATHS.has(location.pathname) ? 'data'
    : INTELLIGENCE_PATHS.has(location.pathname) ? 'intelligence'
    : storedMode;

  function setMode(next) {
    localStorage.setItem(MODE_KEY, next);
    setStoredMode(next);
  }

  return (
    <nav className="sidebar">
      <div className="sidebar-header">
        <div className="sidebar-title">MT 360</div>
        <div className="sidebar-subtitle">Modern Trade Intelligence</div>
      </div>
      <div className={`data-source-badge ${dataSource}`}>
        {dataSource === 'live' ? '● LIVE DATA' : '● MOCK DATA'}
      </div>

      <div className="mode-switch">
        <button className={mode === 'intelligence' ? 'active' : ''} onClick={() => setMode('intelligence')}>DECISION INTELLIGENCE</button>
        <button className={mode === 'data' ? 'active' : ''} onClick={() => setMode('data')}>DATA</button>
      </div>

      {mode === 'intelligence' ? (
        <div className="sidebar-group">
          {INTELLIGENCE_ITEMS.map((item) => (
            <NavLink key={item.path} to={item.path} end={item.end} className={({ isActive }) => `sidebar-link${isActive ? ' active' : ''}`}>
              {item.label}
            </NavLink>
          ))}
        </div>
      ) : (
        DATA_GROUPS.map((group, gi) => (
          <div className="sidebar-group" key={gi}>
            {group.label && <div className="sidebar-group-label">{group.label}</div>}
            {group.items.map((item) => (
              <NavLink key={item.path} to={item.path} className={({ isActive }) => `sidebar-link${isActive ? ' active' : ''}`}>
                {item.label}
              </NavLink>
            ))}
          </div>
        ))
      )}

      <div className="sidebar-footer">Last refreshed: mock data</div>
    </nav>
  );
}
