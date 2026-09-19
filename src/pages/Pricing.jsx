import React, { useMemo } from 'react';
import { useFilters } from '../context/FilterContext.jsx';
import KpiCard from '../components/KpiCard.jsx';
import DataTable from '../components/DataTable.jsx';
import Callout from '../components/Callout.jsx';
import {
  realizedASP, discountPct, promoSpendEstimate, groupBy, sumSalesValue, sum,
  formatCurrency, formatPct,
} from '../data/metrics.js';
import { THRESHOLDS as T } from '../data/schema.js';

export default function Pricing() {
  const { filteredRecords } = useFilters();

  const asp = realizedASP(filteredRecords);
  const disc = discountPct(filteredRecords);
  const promoSpend = promoSpendEstimate(filteredRecords);

  const byChain = useMemo(() => {
    const groups = groupBy(filteredRecords, 'chainName');
    return Object.entries(groups).map(([chain, recs]) => {
      const avgPromo = recs.length > 0 ? sum(recs, 'promoPct') / recs.length : 0;
      return {
        key: chain, chain,
        avgPromo,
        sales: sumSalesValue(recs),
        estSpend: promoSpendEstimate(recs),
        highDiscount: avgPromo > T.HIGH_DISCOUNT_PCT,
      };
    }).sort((a, b) => b.avgPromo - a.avgPromo);
  }, [filteredRecords]);

  const highDiscountChains = byChain.filter((c) => c.highDiscount);
  const companyAvgPromo = byChain.length > 0 ? byChain.reduce((a, c) => a + c.avgPromo, 0) / byChain.length : 0;

  return (
    <div className="page">
      <h1>Pricing & Promotion</h1>
      <p className="page-subtitle">
        Note: without ₹ trade spend data, promo spend below is <strong>estimated</strong> as Sales Value × Promo %.
        Treat as directional, not a precise ROI figure.
      </p>

      <div className="kpi-grid">
        <KpiCard label="Realized ASP" value={formatCurrency(asp)} />
        <KpiCard label="Discount % vs MRP" value={formatPct(disc)} />
        <KpiCard label="Est. Promo Spend" value={formatCurrency(promoSpend)} />
        <KpiCard label="Company Avg Promo %" value={formatPct(companyAvgPromo)} />
      </div>

      {highDiscountChains.length > 0 && (
        <Callout tone="warning" title="High Discount Alert">
          {highDiscountChains.map((c) => c.chain).join(', ')} run promo levels above{' '}
          {T.HIGH_DISCOUNT_PCT}% — worth checking if this is earning proportionate incremental sales.
        </Callout>
      )}

      <div className="section">
        <h2>Promotion by Chain</h2>
        <DataTable
          defaultSortKey="avgPromo"
          columns={[
            { key: 'chain', label: 'Chain' },
            { key: 'avgPromo', label: 'Avg Promo %', align: 'right', format: formatPct },
            { key: 'sales', label: 'Sales', align: 'right', format: formatCurrency },
            { key: 'estSpend', label: 'Est. Promo Spend', align: 'right', format: formatCurrency },
          ]}
          rows={byChain}
        />
      </div>
    </div>
  );
}
