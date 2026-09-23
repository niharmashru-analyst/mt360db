import React from 'react';
import { NavLink } from 'react-router-dom';
import { useFilters } from '../context/FilterContext.jsx';

const NAV_GROUPS = [
  {
    label: null,
    items: [{ path: '/', label: '🧠 Decision Center', end: true }, { path: '/executive', label: '🏠 Executive 360' }, { path: '/analyst', label: '🤖 Analyst' }, { path: '/root-cause', label: '🔍 Root Cause Analytics' }],
  },
  {
    label: 'PERFORMANCE',
    items: [
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
    label: null,
    items: [
      { path: '/action-center', label: '⚡ Action Center' },
      { path: '/decision-history', label: '🧾 Decision History' },
      { path: '/data-health', label: '🩺 Data Health' },
    ],
  },
];

export default function Sidebar() {
  const { dataSource } = useFilters();
  return (
    <nav className="sidebar">
      <div className="sidebar-header">
        <div className="sidebar-title">MT 360</div>
        <div className="sidebar-subtitle">Modern Trade Intelligence</div>
      </div>
      <div className={`data-source-badge ${dataSource}`}>
        {dataSource === 'live' ? '● LIVE DATA' : '● MOCK DATA'}
      </div>
      {NAV_GROUPS.map((group, gi) => (
        <div className="sidebar-group" key={gi}>
          {group.label && <div className="sidebar-group-label">{group.label}</div>}
          {group.items.map((item) => (
            <NavLink
              key={item.path}
              to={item.path}
              end={item.end}
              className={({ isActive }) => `sidebar-link${isActive ? ' active' : ''}`}
            >
              {item.label}
            </NavLink>
          ))}
        </div>
      ))}
      <div className="sidebar-footer">Last refreshed: mock data</div>
    </nav>
  );
}
