import React, { createContext, useContext, useMemo, useState } from 'react';
import { loadData } from '../data/loadData.js';
import { applyFilters } from '../data/metrics.js';

const FilterContext = createContext(null);

export function FilterProvider({ children }) {
  const data = useMemo(() => loadData(), []);
  const latestMonth = data.months[data.months.length - 1];

  const [filters, setFilters] = useState({
    month: latestMonth,
    region: '',
    state: '',
    city: '',
    chainName: '',
    chainType: '',
    category: '',
    subCategory: '',
    brand: '',
    sku: '',
    pareto: '',
  });

  function updateFilter(field, value) {
    setFilters((prev) => {
      const next = { ...prev, [field]: value };
      // cascade resets: changing region clears state/city, etc.
      if (field === 'region') { next.state = ''; next.city = ''; }
      if (field === 'state') { next.city = ''; }
      if (field === 'category') { next.subCategory = ''; }
      return next;
    });
  }

  function resetFilters() {
    setFilters({
      month: latestMonth, region: '', state: '', city: '', chainName: '',
      chainType: '', category: '', subCategory: '', brand: '', sku: '', pareto: '',
    });
  }

  const filteredRecords = useMemo(() => applyFilters(data.records, filters), [data.records, filters]);

  const value = {
    allRecords: data.records,
    months: data.months,
    storeMaster: data.storeMaster,
    skuMaster: data.skuMaster,
    listingMatrix: data.listingMatrix,
    filters,
    updateFilter,
    resetFilters,
    filteredRecords,
  };

  return <FilterContext.Provider value={value}>{children}</FilterContext.Provider>;
}

export function useFilters() {
  const ctx = useContext(FilterContext);
  if (!ctx) throw new Error('useFilters must be used within FilterProvider');
  return ctx;
}
