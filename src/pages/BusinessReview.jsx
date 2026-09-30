import React, { useMemo } from 'react';
import { useFilters } from '../context/FilterContext.jsx';
import KpiCard from '../components/KpiCard.jsx';
import DataTable from '../components/DataTable.jsx';
import BarChartBlock from '../components/BarChartBlock.jsx';
import TrendChart from '../components/TrendChart.jsx';
import Callout from '../components/Callout.jsx';
import {
  applyFilters, sum, sumSalesValue, sumSalesQty, sumTargetValue,
  growthPct, achievementPct, contributionPct, marginPctBlended,
  avgNOD, formatCurrency, formatPct, formatNumber, getPriorYearMonth,
  groupBy,
} from '../data/metrics.js';

const money = (v) => formatCurrency(v);
const pct = (v) => formatPct(v);
const qty = (v) => formatNumber(v);

function firstExisting(records, fields) {
  for (const field of fields) {
    if (records.some((r) => r[field] !== undefined && r[field] !== null && r[field] !== '')) return field;
  }
  return null;
}
function uniqueValues(records, field) {
  return [...new Set(records.map((r) => r[field]).filter((v) => v !== undefined && v !== null && v !== ''))];
}
function aggregate(records, keyField) {
  const groups = groupBy(records, keyField);
  return Object.entries(groups).map(([key, recs]) => ({
    key,
    sales: sumSalesValue(recs),
    qty: sumSalesQty(recs),
    target: sumTargetValue(recs),
    achievement: achievementPct(recs),
    margin: marginPctBlended(recs),
    outlets: new Set(recs.map((r) => r.outletCode)).size,
    records: recs,
  }));
}
function Section({ number, title, subtitle, children, id }) {
  return (
    <section className="review-section" id={id}>
      <div className="review-section-head">
        <div className="review-number">{number}</div>
        <div><h2>{title}</h2>{subtitle && <p>{subtitle}</p>}</div>
      </div>
      {children}
    </section>
  );
}
function MissingData({ fields, message }) {
  return (
    <div className="review-missing">
      <strong>Data not available in the current Excel feed</strong>
      <span>{message || 'This section is ready; add the required field(s) to the source file and Sync Data.'}</span>
      <small>Expected: {fields.join(', ')}</small>
    </div>
  );
}

export default function BusinessReview() {
  const { filteredRecords, allRecords, filters, months } = useFilters();
  const currentMonth = filters.month || months[months.length - 1];
  const current = applyFilters(allRecords, { ...filters, month: currentMonth });
  const ly = applyFilters(allRecords, { ...filters, month: getPriorYearMonth(currentMonth) });
  const totalSales = sumSalesValue(current);
  const growth = sumSalesValue(ly) > 0 ? ((totalSales - sumSalesValue(ly)) / sumSalesValue(ly)) * 100 : null;
  const achievement = achievementPct(current);
  const margin = marginPctBlended(current);
  const distributionField = firstExisting(current, ['listed']);
  const dist = distributionField ? (current.length ? (current.filter(r => r.listed !== false).length / current.length) * 100 : 0) : null;
  const nod = avgNOD(current, allRecords, { ...filters, month: currentMonth });
  const stockValue = sum(current.map(r => ({ ...r, stockQty: (r.stockQty || r.clStock || 0) * (r.mrp || 0) })), 'stockQty');

  const chainRows = useMemo(() => {
    const base = aggregate(current, 'chainName');
    return base.map((r) => {
      const lyChain = applyFilters(allRecords, { ...filters, month: getPriorYearMonth(currentMonth), chainName: r.key });
      const lySales = sumSalesValue(lyChain);
      return { ...r, ly: lySales, growth: lySales > 0 ? ((r.sales - lySales) / lySales) * 100 : null };
    }).sort((a,b) => b.sales-a.sales);
  }, [current, allRecords, filters, currentMonth]);

  const regionRows = useMemo(() => {
    const base = aggregate(current, 'region');
    return base.sort((a,b) => b.sales-a.sales);
  }, [current]);

  const bgrField = firstExisting(current, ['bgr', 'businessGrowthRegion', 'businessRegion', 'region']);
  const bgrRows = useMemo(() => bgrField ? aggregate(current, bgrField).sort((a,b) => b.sales-a.sales) : [], [current,bgrField]);

  const stateRows = useMemo(() => aggregate(current, 'state').sort((a,b) => b.sales-a.sales).slice(0,10), [current]);
  const cityRows = useMemo(() => aggregate(current, 'city').sort((a,b) => b.sales-a.sales).slice(0,10), [current]);

  const keyAccountRows = useMemo(() => {
    const total = totalSales;
    return chainRows.map(r => ({ ...r, share: total > 0 ? r.sales / total * 100 : 0 })).sort((a,b)=>b.share-a.share);
  }, [chainRows,totalSales]);

  const launchRows = useMemo(() => {
    const bySku = groupBy(allRecords, 'skuCode');
    return Object.entries(bySku).map(([skuCode,recs]) => {
      const sku = recs[0];
      const suppliedLaunch = recs.map(r=>r.launchDate).filter(Boolean).sort()[0];
      const firstMonth = suppliedLaunch || [...new Set(recs.map(r=>r.month).filter(Boolean))].sort()[0];
      const thisMonth = recs.filter(r=>r.month===currentMonth);
      return {
        key: skuCode,
        sku: sku.sku,
        skuCode,
        brand: sku.brand,
        category: sku.category,
        launchMonth: firstMonth,
        currentSales: sumSalesValue(thisMonth),
        currentQty: sumSalesQty(thisMonth),
        outlets: new Set(thisMonth.map(r=>r.outletCode)).size,
        status: sku.status,
      };
    }).filter(r=>r.launchMonth && months.indexOf(r.launchMonth) >= Math.max(0, months.indexOf(currentMonth)-3))
      .sort((a,b)=>a.launchMonth.localeCompare(b.launchMonth) || b.currentSales-a.currentSales);
  }, [allRecords,currentMonth,months]);

  const manpowerField = firstExisting(current, ['manpower','headcount','salesManpower','fieldForce','foCount','salesExecCount']);
  const visibilityField = firstExisting(current, ['visibility','visibilityPct','visibilityPercent','facings','displayCompliance','shelfShare']);
  const orderField = firstExisting(current, ['orderQty','orderedQty']);
  const filledField = firstExisting(current, ['filledQty','fillQty','fulfilledQty']);
  const fillRateField = firstExisting(current, ['fillRate','fillRatePct','fillRatePercent']);

  const manpowerRows = manpowerField ? uniqueValues(current, manpowerField).map(v=>({key:String(v), value:v})) : [];
  const visibilityValue = visibilityField ? (
    current.reduce((a,r)=>a + Number(r[visibilityField] || 0),0) / Math.max(1,current.length)
  ) : null;

  const fillRows = useMemo(() => {
    return chainRows.map(r => {
      const recs = r.records;
      let fill = null;
      if (fillRateField) {
        const vals = recs.map(x=>Number(x[fillRateField])).filter(Number.isFinite);
        fill = vals.length ? vals.reduce((a,b)=>a+b,0)/vals.length : null;
      } else if (orderField && filledField) {
        const ordered=sum(recs,orderField), filled=sum(recs,filledField);
        fill = ordered > 0 ? filled/ordered*100 : null;
      }
      return { key:r.key, ordered: orderField ? sum(recs,orderField) : null, filled: filledField ? sum(recs,filledField) : null, fill };
    });
  }, [chainRows,fillRateField,orderField,filledField]);

  const planRows = useMemo(() => {
    const plans = [];
    const belowTarget = chainRows.filter(r=>r.achievement < 90).sort((a,b)=>a.achievement-b.achievement).slice(0,3);
    const oos = current.filter(r => Number(r.stockQty ?? r.clStock ?? 0) <= 0);
    const excess = current.filter(r => {
      const sales = Number(r.salesQty || 0);
      const stock = Number(r.stockQty ?? r.clStock ?? 0);
      return sales > 0 && stock / (sales/30) > 60;
    });
    belowTarget.forEach(r => plans.push({key:`30-${r.key}`, horizon:'0–30 Days', priority:'Immediate', owner:'Sales', action:`Recover ${r.key}: review outlet-level gaps, target leakage and low-performing SKUs. Current achievement ${pct(r.achievement)}.`}));
    if (oos.length) plans.push({key:'30-oos',horizon:'0–30 Days',priority:'Immediate',owner:'Supply + Sales',action:`Close ${oos.length.toLocaleString('en-IN')} OOS SKU-store gaps, prioritising Top 10 / Top 25 SKUs and key accounts.`});
    plans.push({key:'60-distribution',horizon:'31–60 Days',priority:'Build',owner:'Sales',action:'Expand distribution for high-selling SKUs into under-covered outlets and cities; use chain and state gaps from this review.'});
    if (excess.length) plans.push({key:'60-excess',horizon:'31–60 Days',priority:'Build',owner:'Supply + Trade',action:`Reduce excess inventory across ${excess.length.toLocaleString('en-IN')} SKU-store combinations through redistribution, replenishment controls and focused promos.`});
    plans.push({key:'90-growth',horizon:'61–90 Days',priority:'Scale',owner:'Sales + Trade Marketing',action:'Scale winning chains/states, strengthen visibility, and convert new-product distribution into repeat sales.'});
    return plans;
  }, [chainRows,current]);

  const trend = useMemo(() => months.slice(-6).map(m => ({
    label:m.slice(2),
    current:Math.round(sumSalesValue(applyFilters(allRecords,{...filters,month:m}))/100000),
    ly:Math.round(sumSalesValue(applyFilters(allRecords,{...filters,month:getPriorYearMonth(m)}))/100000)
  })),[months,allRecords,filters]);

  return (
    <div className="page business-review">
      <div className="review-hero">
        <div>
          <div className="eyebrow">MANAGEMENT REVIEW</div>
          <h1>MT Business Review</h1>
          <p className="page-subtitle">A management-ready view of toplines, chain performance, geography, launches, execution gaps and the 30 / 60 / 90 action plan.</p>
        </div>
        <div className="review-period">Period: <strong>{currentMonth}</strong></div>
      </div>

      <div className="review-jumpbar">
        {[['1','Toplines'],['2','Chain Performance'],['3','BGR Performance & Plan'],['4','Region Performance'],['6','Top State / Town'],['7','Launch Tracker'],['8','Manpower'],['9','Visibility'],['10','30 / 60 / 90 Plan'],['12','Key Account Share'],['13','Fill Rate']].map(([n,t])=><a key={n} href={`#review-${n}`}>{n}. {t}</a>)}
      </div>

      <Section number="1" title="Toplines" subtitle="Executive scorecard for the selected month and filters." id="review-1">
        <div className="kpi-grid">
          <KpiCard label="MTD Sales" value={money(totalSales)} />
          <KpiCard label="YoY Growth" value={growth === null ? 'Not Active LY' : pct(growth)} tone={growth !== null && growth < 0 ? 'danger' : 'success'} />
          <KpiCard label="Target Achievement" value={pct(achievement)} tone={achievement < 90 ? 'danger' : achievement < 100 ? 'warning' : 'success'} />
          <KpiCard label="Margin %" value={pct(margin)} />
          <KpiCard label="Stock Value" value={money(stockValue)} />
          <KpiCard label="Avg NOD" value={`${nod.toFixed(0)} days`} />
          <KpiCard label="Distribution" value={dist === null ? '—' : pct(dist)} />
          <KpiCard label="Active SKU × Outlet" value={qty(current.length)} />
        </div>
        <TrendChart data={trend} series={[{dataKey:'current',name:'Sales ₹L',color:'#6366f1'},{dataKey:'ly',name:'LY ₹L',color:'#9ca3af'}]} />
      </Section>

      <Section number="2" title="Chain wise Performance" subtitle="Sales, target delivery, growth, margin and outlet footprint by chain." id="review-2">
        <div className="two-col">
          <BarChartBlock data={chainRows.slice(0,10).map(r=>({key:r.key,value:r.sales}))} horizontal yFormat={money} />
          <DataTable defaultSortKey="sales" columns={[
            {key:'chain',label:'Chain',format:(_,r)=>r.key},{key:'sales',label:'Sales',align:'right',format:money},
            {key:'growth',label:'YoY',align:'right',format:pct},{key:'achievement',label:'Achv.',align:'right',format:pct},
            {key:'margin',label:'Margin',align:'right',format:pct},{key:'outlets',label:'Outlets',align:'right',format:qty}
          ]} rows={chainRows} />
        </div>
      </Section>

      <Section number="3" title="BGR wise Performance and Plan" subtitle={bgrField === 'region' ? 'BGR field is not present, so Region is used as the current planning proxy.' : 'Performance is grouped by the BGR field from the Excel feed.'} id="review-3">
        {bgrRows.length ? <DataTable defaultSortKey="sales" columns={[
          {key:'bgr',label:'BGR',format:(_,r)=>r.key},{key:'sales',label:'Sales',align:'right',format:money},
          {key:'growth',label:'Target Achv.',align:'right',format:pct,}, {key:'margin',label:'Margin',align:'right',format:pct},
          {key:'outlets',label:'Outlets',align:'right',format:qty}
        ]} rows={bgrRows} /> : <MissingData fields={['BGR / Business Growth Region']} />}
        <div className="plan-strip">
          <strong>Planning lens:</strong> Use below-target BGRs for immediate recovery, high-sales BGRs for scale, and distribution/OOS gaps for execution plans.
        </div>
      </Section>

      <Section number="4" title="REGION Performance" subtitle="Regional contribution and delivery against target." id="review-4">
        <DataTable defaultSortKey="sales" columns={[
          {key:'region',label:'Region',format:(_,r)=>r.key},{key:'sales',label:'Sales',align:'right',format:money},
          {key:'target',label:'Target',align:'right',format:money},{key:'achievement',label:'Achievement',align:'right',format:pct},
          {key:'margin',label:'Margin',align:'right',format:pct},{key:'outlets',label:'Outlets',align:'right',format:qty}
        ]} rows={regionRows} />
      </Section>

      <Section number="6" title="Top 10 State / Town Performance" subtitle="State and town leaders by current sales value." id="review-6">
        <div className="two-col">
          <div><h3 className="review-subhead">Top 10 States</h3><BarChartBlock data={stateRows.map(r=>({key:r.key,value:r.sales}))} horizontal yFormat={money} /></div>
          <div><h3 className="review-subhead">Top 10 Towns / Cities</h3><BarChartBlock data={cityRows.map(r=>({key:r.key,value:r.sales}))} horizontal yFormat={money} /></div>
        </div>
      </Section>

      <Section number="7" title="New Product Launch Tracker" subtitle="Uses Launch Date/Launch Month when supplied; otherwise it infers launch month from the first appearance of the SKU in the source data." id="review-7">
        {launchRows.length ? <DataTable defaultSortKey="launchMonth" defaultSortDesc={false} columns={[
          {key:'sku',label:'Product'},{key:'skuCode',label:'SKU Code'},{key:'brand',label:'Brand'},
          {key:'launchMonth',label:'Launch Month'},{key:'currentSales',label:'Current Sales',align:'right',format:money},
          {key:'currentQty',label:'Qty',align:'right',format:qty},{key:'outlets',label:'Outlets',align:'right',format:qty},{key:'status',label:'Status'}
        ]} rows={launchRows} /> : <MissingData fields={['SKU / Product', 'Month']} message="No SKU appeared for the first time within the last 3 months of the current dataset." />}
      </Section>

      <Section number="8" title="Manpower Summary" subtitle="Reads manpower/headcount fields when supplied in the Excel feed." id="review-8">
        {manpowerField ? <div className="kpi-grid">
          <KpiCard label="Manpower Records" value={qty(manpowerRows.length)} />
          <KpiCard label="Manpower Field" value={manpowerField} />
          <KpiCard label="Outlet Coverage" value={qty(new Set(current.map(r=>r.outletCode)).size)} />
          <KpiCard label="SKU Coverage" value={qty(new Set(current.map(r=>r.skuCode)).size)} />
        </div> : <MissingData fields={['Manpower / Headcount / FO Count']} message="Manpower is not part of the current MT sales dataset, so the dashboard will not invent a headcount. Add a manpower field or separate manpower feed when available." />}
      </Section>

      <Section number="9" title="Visibility Summary" subtitle="Reads visibility, facings, display compliance or shelf-share data when supplied." id="review-9">
        {visibilityField ? <div className="kpi-grid">
          <KpiCard label="Visibility Metric" value={visibilityField} />
          <KpiCard label="Average Visibility" value={pct(visibilityValue)} />
          <KpiCard label="Stores Covered" value={qty(new Set(current.map(r=>r.outletCode)).size)} />
        </div> : <MissingData fields={['Visibility % / Facings / Display Compliance / Shelf Share']} message="No visibility measure exists in the current Excel feed. The section is wired to consume it as soon as it is added." />}
      </Section>

      <Section number="10" title="30 / 60 / 90 – Plan" subtitle="Action plan generated from the current performance and execution gaps; owners can be edited later." id="review-10">
        <DataTable defaultSortKey="horizon" defaultSortDesc={false} columns={[
          {key:'horizon',label:'Horizon'},{key:'priority',label:'Priority'},{key:'owner',label:'Owner'},{key:'action',label:'Action'}
        ]} rows={planRows} pageSize={20} />
      </Section>

      <Section number="12" title="Key Accounts Shares" subtitle="Chain contribution to total MT sales." id="review-12">
        <div className="two-col">
          <BarChartBlock data={keyAccountRows.map(r=>({key:r.key,value:r.share}))} yFormat={pct} />
          <DataTable defaultSortKey="share" columns={[
            {key:'account',label:'Key Account',format:(_,r)=>r.key},{key:'sales',label:'Sales',align:'right',format:money},
            {key:'share',label:'Share',align:'right',format:pct},{key:'growth',label:'YoY',align:'right',format:pct}
          ]} rows={keyAccountRows} />
        </div>
      </Section>

      <Section number="13" title="Fill rates – Chain wise" subtitle="Calculated only when order/filled or fill-rate fields exist; no proxy is presented as a true fill rate." id="review-13">
        {fillRateField || (orderField && filledField) ? <DataTable defaultSortKey="fill" columns={[
          {key:'chain',label:'Chain',format:(_,r)=>r.key},{key:'ordered',label:'Ordered Qty',align:'right',format:qty},
          {key:'filled',label:'Filled Qty',align:'right',format:qty},{key:'fill',label:'Fill Rate',align:'right',format:pct}
        ]} rows={fillRows} /> : <MissingData fields={['Fill Rate % OR Ordered Qty + Filled Qty']} message="The current source has no order/fill fields, so a fill rate cannot be calculated reliably. Add these fields to activate the chain-wise table." />}
      </Section>

      <Callout tone="info" title="Data readiness">
        The review uses the same global filters and live Excel feed as the rest of MT 360. Sections that require fields not currently present remain visible but explicitly show what is missing rather than creating synthetic numbers.
      </Callout>
    </div>
  );
}
