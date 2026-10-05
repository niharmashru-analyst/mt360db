import React, { useEffect, useState } from 'react';
import { NavLink, useLocation } from 'react-router-dom';
import { useFilters } from '../context/FilterContext.jsx';

const INTELLIGENCE_GROUPS = [
  {
    label: 'DATA SCIENCE',
    items: [{ path: '/intelligence', label: '🧠 Intelligence Hub' }],
  },
  {
    label: 'PERFORMANCE',
    items: [
      { path: '/', label: '🏠 Executive 360', end: true },
      { path: '/period', label: '🗓 Period Comparison' },
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
      { path: '/growth-simulator', label: '🚀 Growth Simulator' },
    ],
  },
  {
    label: 'ACTION & DATA',
    items: [
      { path: '/action-center', label: '⚡ Action Center' },
      { path: '/data-health', label: '🩺 Data Health' },
    ],
  },
];

const DASHBOARD_GROUPS = [
  {
    label: 'MANAGEMENT REVIEW',
    items: [{ path: '/business-review', label: '📋 Management Review' }],
  },
];

function NavItem({ item }) {
  return (
    <NavLink
      key={item.path}
      to={item.path}
      end={item.end}
      className={({ isActive }) => `sidebar-link${isActive ? ' active' : ''}`}
    >
      {item.label}
    </NavLink>
  );
}

function Section({ title, icon, groups, open, onToggle }) {
  const visible = open;

  return (
    <div className={`sidebar-section ${visible ? 'is-open' : 'is-collapsed'}`}>
      <button
        type="button"
        className="sidebar-section-toggle"
        onClick={onToggle}
        aria-expanded={visible}
        aria-controls={`sidebar-section-${title.replace(/\W+/g, '-').toLowerCase()}`}
      >
        <span className="sidebar-section-title"><span className="sidebar-section-icon">{icon}</span>{title}</span>
        <span className="sidebar-section-chevron">{visible ? '▾' : '▸'}</span>
      </button>

      {visible && (
        <div id={`sidebar-section-${title.replace(/\W+/g, '-').toLowerCase()}`} className="sidebar-section-content">
          {groups.map((group, gi) => (
            <div className="sidebar-group" key={`${title}-${gi}`}>
              {group.label && <div className="sidebar-group-label">{group.label}</div>}
              {group.items.map(item => <NavItem key={item.path} item={item} />)}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export default function Sidebar() {
  const { dataSource, dataError } = useFilters();
  const location = useLocation();
  const [intelligenceOpen, setIntelligenceOpen] = useState(() => localStorage.getItem('mt360-intelligence-open') !== 'false');
  const [dashboardOpen, setDashboardOpen] = useState(() => localStorage.getItem('mt360-dashboard-open') !== 'false');

  useEffect(() => localStorage.setItem('mt360-intelligence-open', String(intelligenceOpen)), [intelligenceOpen]);
  useEffect(() => localStorage.setItem('mt360-dashboard-open', String(dashboardOpen)), [dashboardOpen]);

  return (
    <nav className="sidebar">
      <div className="sidebar-header">
        <div className="sidebar-title">MT 360</div>
        <div className="sidebar-subtitle">Modern Trade Intelligence</div>
      </div>

      <div className={`data-source-badge ${dataSource}`}>
        {dataSource === 'live' ? '● LIVE DATA' : '● MOCK DATA'}
      </div>
      {dataSource !== 'live' && dataError && (
        <div style={{ margin: '6px 12px', padding: '8px 10px', borderRadius: 6, background: '#fef2f2', color: '#991b1b', fontSize: 11, lineHeight: 1.4 }}>
          <strong>Showing sample data.</strong> Your real data failed to load: {dataError}
        </div>
      )}

      <Section
        title="INTELLIGENCE"
        icon="🧠"
        groups={INTELLIGENCE_GROUPS}
        open={intelligenceOpen}
        onToggle={() => setIntelligenceOpen(v => !v)}
      />

      <Section
        title="BUSINESS DASHBOARD"
        icon="📊"
        groups={DASHBOARD_GROUPS}
        open={dashboardOpen}
        onToggle={() => setDashboardOpen(v => !v)}
      />

      <div className="sidebar-footer">Intelligence + Business Dashboard</div>
    </nav>
  );
}
