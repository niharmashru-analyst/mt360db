import React, { useMemo } from 'react';
import { useFilters } from '../context/FilterContext.jsx';
import DataTable from '../components/DataTable.jsx';
import TrendChart from '../components/TrendChart.jsx';
import BarChartBlock from '../components/BarChartBlock.jsx';
import {
  applyFilters, sumSalesValue, groupBy, getPriorYearMonth, formatCurrency, formatPct,
} from '../data/metrics.js';

export default function SalesAnalysis() {
  const { filteredRecords, allRecords, filters, months } = useFilters();

  const trendData = useMemo(() => {
    const last6 = months.slice(-6);
    return last6.map((m) => {
      const recs = applyFilters(allRecords, { ...filters, month: m });
      const lyRecs = applyFilters(allRecords, { ...filters, month: getPriorYearMonth(m) });
      return {
        label: m.slice(2),
        current: Math.round(sumSalesValue(recs) / 100000),
        ly: Math.round(sumSalesValue(lyRecs) / 100000),
      };
    });
  }, [months, allRecords, filters]);

  const growthMatrix = useMemo(() => {
    const groups = groupBy(filteredRecords, 'chainName');
    const totalSales = sumSalesValue(filteredRecords);
    return Object.entries(groups).map(([chain, recs]) => {
      const lyRecs = applyFilters(allRecords, { ...filters, chainName: chain, month: getPriorYearMonth(filters.month) });
      const mtd = sumSalesValue(recs);
      const ly = sumSalesValue(lyRecs);
      return {
        key: chain, chain, mtd, ly,
        growth: ly > 0 ? ((mtd - ly) / ly) * 100 : null,
        contribution: totalSales > 0 ? (mtd / totalSales) * 100 : 0,
      };
    });
  }, [filteredRecords, allRecords, filters]);

  const categoryContribution = useMemo(() => {
    const groups = groupBy(filteredRecords, 'category');
    return Object.entries(groups).map(([key, recs]) => ({ key, value: sumSalesValue(recs) }))
      .sort((a, b) => b.value - a.value);
  }, [filteredRecords]);

  const brandContribution = useMemo(() => {
    const groups = groupBy(filteredRecords, 'brand');
    return Object.entries(groups).map(([key, recs]) => ({ key, value: sumSalesValue(recs) }))
      .sort((a, b) => b.value - a.value);
  }, [filteredRecords]);

  const topSkus = useMemo(() => {
    const groups = groupBy(filteredRecords, 'sku');
    return Object.entries(groups).map(([key, recs]) => ({ key, value: sumSalesValue(recs) }))
      .sort((a, b) => b.value - a.value).slice(0, 10);
  }, [filteredRecords]);

  const bottomSkus = useMemo(() => {
    const groups = groupBy(filteredRecords, 'sku');
    return Object.entries(groups).map(([key, recs]) => ({ key, value: sumSalesValue(recs) }))
      .sort((a, b) => a.value - b.value).slice(0, 10);
  }, [filteredRecords]);

  return (
    <div className="page">
      <h1>Sales Analysis</h1>
      <p className="page-subtitle">Where are we growing, and where are we losing?</p>

      <div className="section">
        <h2>Sales Trend — MTD vs LY (₹ Lakh)</h2>
        <TrendChart
          data={trendData}
          series={[
            { dataKey: 'current', name: 'Current', color: '#6366f1' },
            { dataKey: 'ly', name: 'LY', color: '#9ca3af' },
          ]}
        />
      </div>

      <div className="section">
        <h2>Growth Matrix — by Chain</h2>
        <DataTable
          defaultSortKey="mtd"
          columns={[
            { key: 'chain', label: 'Chain' },
            { key: 'mtd', label: 'MTD Sales', align: 'right', format: formatCurrency },
            { key: 'ly', label: 'LY Sales', align: 'right', format: formatCurrency },
            { key: 'growth', label: 'Growth %', align: 'right', format: (v) => formatPct(v) },
            { key: 'contribution', label: 'Contribution %', align: 'right', format: (v) => formatPct(v) },
          ]}
          rows={growthMatrix}
        />
      </div>

      <div className="two-col">
        <div className="section">
          <h2>Top 10 SKUs</h2>
          <BarChartBlock data={topSkus} horizontal yFormat={formatCurrency} />
        </div>
        <div className="section">
          <h2>Bottom 10 SKUs</h2>
          <BarChartBlock data={bottomSkus} horizontal yFormat={formatCurrency} />
        </div>
      </div>

      <div className="two-col">
        <div className="section">
          <h2>Category Contribution</h2>
          <BarChartBlock data={categoryContribution} yFormat={formatCurrency} />
        </div>
        <div className="section">
          <h2>Brand Contribution</h2>
          <BarChartBlock data={brandContribution} yFormat={formatCurrency} />
        </div>
      </div>
    </div>
  );
}
