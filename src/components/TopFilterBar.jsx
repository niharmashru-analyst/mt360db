import React, { useState } from 'react';
import { useFilters } from '../context/FilterContext.jsx';

function Select({ label, value, onChange, options, disabled }) {
  return (
    <div className="filter-field">
      <label>{label}</label>
      <select value={value} onChange={(e) => onChange(e.target.value)} disabled={disabled}>
        <option value="">All</option>
        {options.map((o) => <option key={o} value={o}>{o}</option>)}
      </select>
    </div>
  );
}

export default function TopFilterBar() {
  const { filters, updateFilter, resetFilters, months, filterOptions, refresh } = useFilters();
  const [refreshing, setRefreshing] = useState(false);

  if (!filterOptions) return null;

  const stateOptions = filters.region ? (filterOptions.statesByRegion[filters.region] || []) : [];
  const cityOptions = filters.state ? (filterOptions.citiesByState[filters.state] || []) : [];
  const subCatOptions = filters.category ? (filterOptions.subCategoriesByCategory[filters.category] || []) : [];

  async function handleRefresh() {
    setRefreshing(true);
    try {
      await refresh();
    } finally {
      setRefreshing(false);
    }
  }

  return (
    <div className="top-filter-bar">
      <div className="filter-field">
        <label>Month</label>
        <select value={filters.month} onChange={(e) => updateFilter('month', e.target.value)}>
          {months.map((m) => <option key={m} value={m}>{m}</option>)}
        </select>
      </div>
      <Select label="Region" value={filters.region} onChange={(v) => updateFilter('region', v)} options={filterOptions.regions} />
      <Select label="State" value={filters.state} onChange={(v) => updateFilter('state', v)} options={stateOptions} disabled={!filters.region} />
      <Select label="City" value={filters.city} onChange={(v) => updateFilter('city', v)} options={cityOptions} disabled={!filters.state} />
      <Select label="Chain" value={filters.chainName} onChange={(v) => updateFilter('chainName', v)} options={filterOptions.chainNames} />
      <Select label="Chain Type" value={filters.chainType} onChange={(v) => updateFilter('chainType', v)} options={filterOptions.chainTypes} />
      <Select label="Category" value={filters.category} onChange={(v) => updateFilter('category', v)} options={filterOptions.categories} />
      <Select label="Sub-Category" value={filters.subCategory} onChange={(v) => updateFilter('subCategory', v)} options={subCatOptions} disabled={!filters.category} />
      <Select label="Brand" value={filters.brand} onChange={(v) => updateFilter('brand', v)} options={filterOptions.brands} />
      <Select label="Pareto" value={filters.pareto} onChange={(v) => updateFilter('pareto', v)} options={filterOptions.paretoTiers} />
      <button className="filter-reset-btn" onClick={resetFilters}>Reset</button>
      <button className="filter-refresh-btn" onClick={handleRefresh} disabled={refreshing}>
        {refreshing ? 'Refreshing…' : '⟳ Refresh Data'}
      </button>
    </div>
  );
}
