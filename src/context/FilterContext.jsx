import React, { createContext, useContext, useEffect, useMemo, useState, useCallback } from 'react';
import { loadData, refreshData, getDataSource } from '../data/loadData.js';
import { applyFilters, buildMonthlyQtyIndex } from '../data/metrics.js';

const FilterContext = createContext(null);
const SLOW_LOAD_WARNING_MS = 8000; // show "this is taking a while" after this long

export function FilterProvider({ children }) {
  const [data, setData] = useState(null);
  const [loadError, setLoadError] = useState(null);
  const [isSlow, setIsSlow] = useState(false);
  const [attempt, setAttempt] = useState(0);

  const runLoad = useCallback((loader) => {
    setLoadError(null);
    setIsSlow(false);
    setData(null);
    const slowTimer = setTimeout(() => setIsSlow(true), SLOW_LOAD_WARNING_MS);
    loader()
      .then((d) => { clearTimeout(slowTimer); setData(d); })
      .catch((err) => { clearTimeout(slowTimer); setLoadError(err.message || 'Failed to load data.'); })
      .finally(() => clearTimeout(slowTimer));
  }, []);

  useEffect(() => {
    runLoad(loadData);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [attempt]);

  function retry() { setAttempt((a) => a + 1); }

  function refresh() {
    runLoad(refreshData);
  }

  const latestMonth = data ? data.months[data.months.length - 1] : null;

  const [filters, setFilters] = useState({
    month: '', region: '', state: '', city: '', chainName: '', chainType: '',
    category: '', subCategory: '', brand: '', sku: '', pareto: '',
  });

  useEffect(() => {
    if (latestMonth && !filters.month) {
      setFilters((prev) => ({ ...prev, month: latestMonth }));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [latestMonth]);

  function updateFilter(field, value) {
    setFilters((prev) => {
      const next = { ...prev, [field]: value };
      if (field === 'region') { next.state = ''; next.city = ''; }
      if (field === 'state') { next.city = ''; }
      if (field === 'category') { next.subCategory = ''; }
      return next;
    });
  }

  function resetFilters() {
    setFilters({
      month: latestMonth || '', region: '', state: '', city: '', chainName: '',
      chainType: '', category: '', subCategory: '', brand: '', sku: '', pareto: '',
    });
  }

  const filteredRecords = useMemo(
    () => (data ? applyFilters(data.records, filters) : []),
    [data, filters]
  );

  // Built once per data load — every NOD calculation across every page uses
  // this same trailing-3-month index, so the number is consistent everywhere.
  const monthlyQtyIndex = useMemo(
    () => (data ? buildMonthlyQtyIndex(data.records) : {}),
    [data]
  );

  // Dropdown options built from the loaded data itself, not hard-coded lists —
  // real chain names, cities, categories etc. will never match schema.js's
  // placeholder constants once you're on live data.
  const filterOptions = useMemo(() => {
    if (!data) return null;
    const uniqueSorted = (field) => [...new Set(data.records.map((r) => r[field]).filter(Boolean))].sort();
    const regions = uniqueSorted('region');
    const statesByRegion = {};
    const citiesByState = {};
    data.records.forEach((r) => {
      if (r.region && r.state) {
        statesByRegion[r.region] = statesByRegion[r.region] || new Set();
        statesByRegion[r.region].add(r.state);
      }
      if (r.state && r.city) {
        citiesByState[r.state] = citiesByState[r.state] || new Set();
        citiesByState[r.state].add(r.city);
      }
    });
    Object.keys(statesByRegion).forEach((k) => { statesByRegion[k] = [...statesByRegion[k]].sort(); });
    Object.keys(citiesByState).forEach((k) => { citiesByState[k] = [...citiesByState[k]].sort(); });

    const categories = uniqueSorted('category');
    const subCategoriesByCategory = {};
    data.records.forEach((r) => {
      if (r.category && r.subCategory) {
        subCategoriesByCategory[r.category] = subCategoriesByCategory[r.category] || new Set();
        subCategoriesByCategory[r.category].add(r.subCategory);
      }
    });
    Object.keys(subCategoriesByCategory).forEach((k) => {
      subCategoriesByCategory[k] = [...subCategoriesByCategory[k]].sort();
    });

    return {
      regions,
      statesByRegion,
      citiesByState,
      chainNames: uniqueSorted('chainName'),
      chainTypes: uniqueSorted('chainType'),
      categories,
      subCategoriesByCategory,
      brands: uniqueSorted('brand'),
      paretoTiers: uniqueSorted('pareto'),
      skus: uniqueSorted('sku'),
    };
  }, [data]);

  if (loadError) {
    return (
      <div className="load-error-screen">
        <h2>Couldn't load data</h2>
        <p>{loadError}</p>
        <button className="retry-btn" onClick={retry}>Retry</button>
      </div>
    );
  }

  if (!data) {
    return (
      <div className="load-loading-screen">
        <div className="spinner" />
        <p>{isSlow ? "Still loading — the source file may be large or slow to fetch…" : 'Loading data…'}</p>
        {isSlow && <button className="retry-btn" onClick={retry}>Retry</button>}
      </div>
    );
  }

  const value = {
    allRecords: data.records,
    months: data.months,
    storeMaster: data.storeMaster,
    skuMaster: data.skuMaster,
    listingMatrix: data.listingMatrix,
    dataSource: getDataSource(),
    filters,
    filterOptions,
    updateFilter,
    resetFilters,
    filteredRecords,
    monthlyQtyIndex,
    refresh,
  };

  return <FilterContext.Provider value={value}>{children}</FilterContext.Provider>;
}

export function useFilters() {
  const ctx = useContext(FilterContext);
  if (!ctx) throw new Error('useFilters must be used within FilterProvider');
  return ctx;
}

export { FilterContext };
