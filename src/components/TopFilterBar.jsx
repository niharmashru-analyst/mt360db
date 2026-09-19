import React, { useMemo } from 'react';
import { useFilters } from '../context/FilterContext.jsx';
import { REGIONS, CITY_BY_STATE, CATEGORIES, SUB_CATEGORIES, BRANDS, PARETO_TIERS, CHAIN_TYPES } from '../data/schema.js';

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
  const { filters, updateFilter, resetFilters, months, allRecords } = useFilters();

  const stateOptions = useMemo(() => (filters.region ? REGIONS[filters.region].states : []), [filters.region]);
  const cityOptions = useMemo(() => (filters.state ? CITY_BY_STATE[filters.state] : []), [filters.state]);
  const chainOptions = useMemo(() => [...new Set(allRecords.map((r) => r.chainName))].sort(), [allRecords]);
  const subCatOptions = useMemo(() => (filters.category ? SUB_CATEGORIES[filters.category] : []), [filters.category]);
  const skuOptions = useMemo(() => {
    let pool = allRecords;
    if (filters.category) pool = pool.filter((r) => r.category === filters.category);
    if (filters.brand) pool = pool.filter((r) => r.brand === filters.brand);
    return [...new Set(pool.map((r) => r.sku))].sort().slice(0, 500);
  }, [allRecords, filters.category, filters.brand]);

  return (
    <div className="top-filter-bar">
      <div className="filter-field">
        <label>Month</label>
        <select value={filters.month} onChange={(e) => updateFilter('month', e.target.value)}>
          {months.map((m) => <option key={m} value={m}>{m}</option>)}
        </select>
      </div>
      <Select label="Region" value={filters.region} onChange={(v) => updateFilter('region', v)} options={Object.keys(REGIONS)} />
      <Select label="State" value={filters.state} onChange={(v) => updateFilter('state', v)} options={stateOptions} disabled={!filters.region} />
      <Select label="City" value={filters.city} onChange={(v) => updateFilter('city', v)} options={cityOptions} disabled={!filters.state} />
      <Select label="Chain" value={filters.chainName} onChange={(v) => updateFilter('chainName', v)} options={chainOptions} />
      <Select label="Chain Type" value={filters.chainType} onChange={(v) => updateFilter('chainType', v)} options={CHAIN_TYPES} />
      <Select label="Category" value={filters.category} onChange={(v) => updateFilter('category', v)} options={CATEGORIES} />
      <Select label="Sub-Category" value={filters.subCategory} onChange={(v) => updateFilter('subCategory', v)} options={subCatOptions} disabled={!filters.category} />
      <Select label="Brand" value={filters.brand} onChange={(v) => updateFilter('brand', v)} options={BRANDS} />
      <Select label="Pareto" value={filters.pareto} onChange={(v) => updateFilter('pareto', v)} options={PARETO_TIERS} />
      <button className="filter-reset-btn" onClick={resetFilters}>Reset</button>
    </div>
  );
}
