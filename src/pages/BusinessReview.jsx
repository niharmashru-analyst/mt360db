import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useFilters } from '../context/FilterContext.jsx';
import KpiCard from '../components/KpiCard.jsx';
import DataTable from '../components/DataTable.jsx';
import BarChartBlock from '../components/BarChartBlock.jsx';
import TrendChart from '../components/TrendChart.jsx';
import Callout from '../components/Callout.jsx';
import {
  applyFilters, sum, sumSalesValue, sumSalesQty, sumTargetValue,
  achievementPct, marginPctBlended, avgNOD, formatCurrency, formatPct,
  formatNumber, getPriorYearMonth, groupBy, salesByMonth,
} from '../data/metrics.js';

const money = v => formatCurrency(v);
const pct = v => formatPct(v);
const qty = v => formatNumber(v);

function firstExisting(records, fields) {
  for (const field of fields) if (records.some(r => r[field] !== undefined && r[field] !== null && r[field] !== '')) return field;
  return null;
}
function aggregate(records, keyField) {
  return Object.entries(groupBy(records, keyField)).map(([key, recs]) => ({
    key, sales: sumSalesValue(recs), qty: sumSalesQty(recs), target: sumTargetValue(recs),
    achievement: achievementPct(recs), margin: marginPctBlended(recs),
    outlets: new Set(recs.map(r => r.outletCode).filter(Boolean)).size, records: recs,
  }));
}
function Section({ number, title, subtitle, children, id }) {
  return <section className="review-section" id={id}>
    <div className="review-section-head"><div className="review-number">{number}</div><div><h2>{title}</h2>{subtitle && <p>{subtitle}</p>}</div></div>
    {children}
  </section>;
}
function MissingData({ fields, message }) {
  return <div className="review-missing"><strong>Data not available in the current Excel feed</strong><span>{message || 'Add the required field(s) to the source file and Sync Data.'}</span><small>Expected: {fields.join(', ')}</small></div>;
}
function Toggle({ value, onChange, options }) {
  return <div className="review-toggle">{options.map(o => <button key={o.value} type="button" className={value === o.value ? 'active' : ''} onClick={() => onChange(o.value)}>{o.label}</button>)}</div>;
}

export default function BusinessReview() {
  const { allRecords, filters, months } = useFilters();
  const currentMonth = filters.month || months[months.length - 1];
  const current = useMemo(() => applyFilters(allRecords, { ...filters, month: currentMonth }), [allRecords, filters, currentMonth]);
  const ly = useMemo(() => applyFilters(allRecords, { ...filters, month: getPriorYearMonth(currentMonth) }), [allRecords, filters, currentMonth]);
  const [selectedChain, setSelectedChain] = useState('');
  const [selectedSku, setSelectedSku] = useState('');
  const [selectedOutlet, setSelectedOutlet] = useState('');
  const [chartMetric, setChartMetric] = useState('sales');
  const [chartRank, setChartRank] = useState('top');

  const selectChain = chain => { setSelectedChain(chain || ''); setSelectedSku(''); setSelectedOutlet(''); };
  const selectSku = sku => { setSelectedSku(sku || ''); setSelectedOutlet(''); };
  const selectOutlet = outlet => setSelectedOutlet(outlet || '');
  const clearDrill = () => { setSelectedChain(''); setSelectedSku(''); setSelectedOutlet(''); };

  const totalSales = sumSalesValue(current);
  const lySales = sumSalesValue(ly);
  const growth = lySales > 0 ? ((totalSales - lySales) / lySales) * 100 : null;
  const achievement = achievementPct(current);
  const margin = marginPctBlended(current);
  const listedField = firstExisting(current, ['listed', 'distribution']);
  const dist = listedField ? current.length ? current.filter(r => r[listedField] !== false && String(r[listedField]).toLowerCase() !== 'not listed').length / current.length * 100 : 0 : null;
  const nod = avgNOD(current, allRecords, { ...filters, month: currentMonth });
  const stockValue = sum(current.map(r => ({ stockValue: Number(r.stockQty ?? r.clStock ?? 0) * Number(r.mrp || 0) })), 'stockValue');

  const lyChainSales = useMemo(() => {
    const out = {};
    ly.forEach(r => { out[r.chainName] = (out[r.chainName] || 0) + Number(r.salesValue || 0); });
    return out;
  }, [ly]);

  const chainRows = useMemo(() => aggregate(current, 'chainName').map(r => {
    const lyValue = lyChainSales[r.key] || 0;
    return { ...r, growth: lyValue > 0 ? (r.sales - lyValue) / lyValue * 100 : null, share: totalSales > 0 ? r.sales / totalSales * 100 : 0 };
  }), [current, lyChainSales, totalSales]);

  const drillRecords = useMemo(() => {
    let rows = current;
    if (selectedChain) rows = rows.filter(r => r.chainName === selectedChain);
    if (selectedSku) rows = rows.filter(r => r.sku === selectedSku || r.skuCode === selectedSku);
    if (selectedOutlet) rows = rows.filter(r => r.outletCode === selectedOutlet || r.outletName === selectedOutlet);
    return rows;
  }, [current, selectedChain, selectedSku, selectedOutlet]);

  const drillSkuRows = useMemo(() => aggregate(drillRecords, 'skuCode').map(r => ({ ...r, sku: r.records[0]?.sku, category: r.records[0]?.category, pareto: r.records[0]?.pareto })).sort((a,b)=>b.sales-a.sales), [drillRecords]);
  const drillShopRows = useMemo(() => aggregate(drillRecords, 'outletCode').map(r => ({ ...r, outlet: r.records[0]?.outletName, city: r.records[0]?.city, state: r.records[0]?.state })).sort((a,b)=>b.sales-a.sales), [drillRecords]);
  const drillCategoryRows = useMemo(() => aggregate(drillRecords, 'category').sort((a,b)=>b.sales-a.sales), [drillRecords]);
  const drillParetoRows = useMemo(() => aggregate(drillRecords, 'pareto').sort((a,b)=>b.sales-a.sales), [drillRecords]);
  const drillSkuShopGroups = useMemo(() => drillRecords.reduce((acc, r) => { const key = `${r.skuCode || r.sku}||${r.outletCode || r.outletName}`; (acc[key] ||= []).push(r); return acc; }, {}), [drillRecords]);
  const drillSkuShopRows = useMemo(() => Object.entries(drillSkuShopGroups).map(([key,recs]) => ({
    key, sku: recs[0]?.sku, skuCode: recs[0]?.skuCode, outlet: recs[0]?.outletName, outletCode: recs[0]?.outletCode,
    category: recs[0]?.category, pareto: recs[0]?.pareto, sales: sumSalesValue(recs), qty: sumSalesQty(recs), stock: sum(recs.map(r=>Number(r.stockQty ?? r.clStock ?? 0))),
  })).sort((a,b)=>b.sales-a.sales), [drillSkuShopGroups]);

  const chartRows = useMemo(() => {
    const rows = chartMetric === 'sales' ? chainRows.map(r=>({key:r.key,value:r.sales})) : chainRows.map(r=>({key:r.key,value:r.qty}));
    const sorted = [...rows].sort((a,b)=>b.value-a.value);
    return chartRank === 'top' ? sorted.slice(0,10) : sorted.slice(-10).reverse();
  }, [chainRows, chartMetric, chartRank]);

  const regionRows = useMemo(() => aggregate(current, 'region').sort((a,b)=>b.sales-a.sales), [current]);
  const bgrField = firstExisting(current, ['bgr','businessGrowthRegion','businessRegion','region']);
  const bgrRows = useMemo(() => aggregate(current, bgrField || 'region').sort((a,b)=>b.sales-a.sales), [current,bgrField]);
  const stateRows = useMemo(() => aggregate(current, 'state').sort((a,b)=>b.sales-a.sales).slice(0,10), [current]);
  const cityRows = useMemo(() => aggregate(current, 'city').sort((a,b)=>b.sales-a.sales).slice(0,10), [current]);
  // Open the drill-down on the top chain once so the section is populated on first view.
  const autoPicked = useRef(false);
  useEffect(() => {
    if (!autoPicked.current && !selectedChain && chainRows.length) { autoPicked.current = true; selectChain(chainRows[0].key); }
  }, [chainRows]);
  const keyAccountRows = useMemo(() => chainRows.map(r=>({...r})).sort((a,b)=>b.share-a.share), [chainRows]);

  const launchRows = useMemo(() => Object.entries(groupBy(allRecords,'skuCode')).map(([skuCode,recs])=>{
    const first=recs[0], launch=recs.map(r=>r.launchDate).filter(Boolean).sort()[0] || [...new Set(recs.map(r=>r.month).filter(Boolean))].sort()[0];
    const cm=recs.filter(r=>r.month===currentMonth);
    return {key:skuCode,sku:first?.sku,skuCode,brand:first?.brand,category:first?.category,launchMonth:launch,currentSales:sumSalesValue(cm),currentQty:sumSalesQty(cm),outlets:new Set(cm.map(r=>r.outletCode)).size,status:first?.status};
  }).filter(r=>r.launchMonth).sort((a,b)=>String(b.launchMonth).localeCompare(String(a.launchMonth)) || b.currentSales-a.currentSales).slice(0,50), [allRecords,currentMonth]);

  const manpowerField=firstExisting(current,['manpower','headcount','salesManpower','fieldForce','foCount','salesExecCount']);
  const visibilityField=firstExisting(current,['visibility','visibilityPct','visibilityPercent','facings','displayCompliance','shelfShare']);
  const orderField=firstExisting(current,['orderQty','orderedQty']);
  const filledField=firstExisting(current,['filledQty','fillQty','fulfilledQty']);
  const fillRateField=firstExisting(current,['fillRate','fillRatePct','fillRatePercent']);
  const fillRows=useMemo(()=>chainRows.map(r=>{const recs=r.records;const ordered=orderField?sum(recs,orderField):null;const filled=filledField?sum(recs,filledField):null;const vals=fillRateField?recs.map(x=>Number(x[fillRateField])).filter(Number.isFinite):[];const fill=vals.length?vals.reduce((a,b)=>a+b,0)/vals.length:(ordered>0?filled/ordered*100:null);return{...r,ordered,filled,fill};}),[chainRows,orderField,filledField,fillRateField]);
  const visibilityValue=visibilityField?current.reduce((a,r)=>a+Number(r[visibilityField]||0),0)/Math.max(1,current.length):null;
  const headStats=useMemo(()=>{
    const byOutlet={};current.forEach(r=>{const o=(byOutlet[r.outletCode] ||= {chain:r.chainName,store:r.outletName,region:r.region,mp:0,sales:0,visSum:0,visN:0});o.mp=Math.max(o.mp,Number(r.manpower)||0);o.sales+=Number(r.salesValue)||0;const v=Number(r.visibility);if(v>0){o.visSum+=v;o.visN++;}});
    const outlets=Object.entries(byOutlet).map(([code,o])=>({key:code,...o,vis:o.visN?o.visSum/o.visN:null}));
    const group=(f)=>{const m={};outlets.forEach(o=>{const g=(m[o[f]] ||= {key:o[f],shops:0,mp:0,sales:0,visSum:0,visN:0});g.shops++;g.mp+=o.mp;g.sales+=o.sales;if(o.vis!==null){g.visSum+=o.vis;g.visN++;}});return Object.values(m).map(g=>({...g,perHead:g.mp>0?g.sales/g.mp:0,shopsPerHead:g.mp>0?g.shops/g.mp:0,vis:g.visN?g.visSum/g.visN:null}));};
    const tot=outlets.reduce((a,o)=>a+o.mp,0), sales=outlets.reduce((a,o)=>a+o.sales,0);
    const vs=outlets.filter(o=>o.vis!==null);
    const buckets=[['< 50%',x=>x<50],['50–70%',x=>x>=50&&x<70],['70–85%',x=>x>=70&&x<85],['≥ 85%',x=>x>=85]].map(([key,fn])=>({key,value:vs.filter(o=>fn(o.vis)).length}));
    return {outlets,tot,sales,byChain:group('chain').sort((a,b)=>b.perHead-a.perHead),byRegion:group('region').sort((a,b)=>b.perHead-a.perHead),buckets,
      lowVis:[...vs].sort((a,b)=>a.vis-b.vis).slice(0,10),avgVis:vs.length?vs.reduce((a,o)=>a+o.vis,0)/vs.length:null};
  },[current]);
  const planRows=useMemo(()=>{
    const plans=[]; const below=chainRows.filter(r=>r.achievement<90).sort((a,b)=>a.achievement-b.achievement).slice(0,3); const oos=current.filter(r=>Number(r.stockQty??r.clStock??0)<=0); const excess=current.filter(r=>{const s=Number(r.salesQty||0),st=Number(r.stockQty??r.clStock??0);return s>0&&st/(s/30)>60;});
    below.forEach(r=>plans.push({key:`30-${r.key}`,horizon:'0–30 Days',priority:'Immediate',owner:'Sales',action:`Recover ${r.key}: review outlet, SKU and target gaps (${pct(r.achievement)} achievement).`}));
    if(oos.length) plans.push({key:'30-oos',horizon:'0–30 Days',priority:'Immediate',owner:'Supply + Sales',action:`Close ${oos.length.toLocaleString('en-IN')} OOS SKU-store gaps, prioritising Top 10 / Top 25.`});
    plans.push({key:'60-distribution',horizon:'31–60 Days',priority:'Build',owner:'Sales',action:'Expand distribution for high-selling SKUs into under-covered chains, shops and towns.'});
    if(excess.length) plans.push({key:'60-excess',horizon:'31–60 Days',priority:'Build',owner:'Supply + Trade',action:`Reduce excess inventory across ${excess.length.toLocaleString('en-IN')} SKU-store combinations.`});
    plans.push({key:'90-growth',horizon:'61–90 Days',priority:'Scale',owner:'Sales + Trade Marketing',action:'Scale winning chains, categories and Pareto tiers; convert distribution and visibility gains into repeat sales.'});
    return plans;
  },[chainRows,current]);
  const trend=useMemo(()=>{
    const currentMonths = months.slice(-6);
    const lyMonths = currentMonths.map(getPriorYearMonth);
    const currentTotals = salesByMonth(allRecords, filters, currentMonths);
    const lyTotals = salesByMonth(allRecords, filters, lyMonths);
    return currentMonths.map((m,i)=>({label:m,current:Math.round(currentTotals[i]/100000),ly:Math.round(lyTotals[i]/100000)}));
  },[months,allRecords,filters]);

  const chainColumns=[
    {key:'key',label:'Chain'}, {key:'sales',label:'Sales',align:'right',format:money}, {key:'qty',label:'Qty',align:'right',format:qty},
    {key:'target',label:'Target',align:'right',format:money}, {key:'achievement',label:'Achv.',align:'right',format:pct},
    {key:'growth',label:'YoY',align:'right',format:pct}, {key:'margin',label:'Margin',align:'right',format:pct}, {key:'share',label:'Share',align:'right',format:pct}, {key:'outlets',label:'Outlets',align:'right',format:qty}
  ];
  const skuColumns=[{key:'sku',label:'SKU'},{key:'skuCode',label:'Code'},{key:'category',label:'Category'},{key:'pareto',label:'Pareto'},{key:'sales',label:'Sales',align:'right',format:money},{key:'qty',label:'Qty',align:'right',format:qty},{key:'margin',label:'Margin',align:'right',format:pct},{key:'outlets',label:'Shops',align:'right',format:qty}];
  const shopColumns=[{key:'outlet',label:'Shop'},{key:'outletCode',label:'Code'},{key:'city',label:'City'},{key:'state',label:'State'},{key:'sales',label:'Sales',align:'right',format:money},{key:'qty',label:'Qty',align:'right',format:qty},{key:'outlets',label:'SKU Count',align:'right',format:qty}];
  const categoryColumns=[{key:'key',label:'Category'},{key:'sales',label:'Sales',align:'right',format:money},{key:'qty',label:'Qty',align:'right',format:qty},{key:'achievement',label:'Achievement',align:'right',format:pct},{key:'margin',label:'Margin',align:'right',format:pct}];
  const paretoColumns=[{key:'key',label:'Pareto'},{key:'sales',label:'Sales',align:'right',format:money},{key:'qty',label:'Qty',align:'right',format:qty},{key:'outlets',label:'Shops',align:'right',format:qty}];
  const skuShopColumns=[{key:'sku',label:'SKU'},{key:'skuCode',label:'SKU Code'},{key:'outlet',label:'Shop'},{key:'outletCode',label:'Shop Code'},{key:'category',label:'Category'},{key:'pareto',label:'Pareto'},{key:'sales',label:'Sales',align:'right',format:money},{key:'qty',label:'Qty',align:'right',format:qty},{key:'stock',label:'Stock',align:'right',format:qty}];

  return <div className="page business-review">
    <div className="review-hero"><div><div className="eyebrow">MANAGEMENT REVIEW</div><h1>MT Business Review</h1><p className="page-subtitle">Interactive management view — every major table can drill into the next business dimension.</p></div><div className="review-period">Period: <strong>{currentMonth}</strong></div></div>
    <div className="review-jumpbar">{[['1','Toplines'],['2','Chain Performance'],['3','BGR Performance & Plan'],['4','Region Performance'],['6','Top State / Town'],['7','Launch Tracker'],['8','Manpower'],['9','Visibility'],['10','30 / 60 / 90'],['12','Key Account Share'],['13','Fill Rate']].map(([n,t])=><a key={n} href={`#review-${n}`}>{n}. {t}</a>)}</div>

    <Section number="1" title="Toplines" subtitle="Executive scorecard for the selected month and global filters." id="review-1">
      <div className="kpi-grid"><KpiCard label="MTD Sales" value={money(totalSales)}/><KpiCard label="YoY Growth" value={growth===null?'—':pct(growth)} tone={growth!==null&&growth<0?'danger':'success'}/><KpiCard label="Target Achievement" value={pct(achievement)} tone={achievement<90?'danger':achievement<100?'warning':'success'}/><KpiCard label="Margin %" value={pct(margin)}/><KpiCard label="Stock Value" value={money(stockValue)}/><KpiCard label="Avg NOD" value={`${nod.toFixed(0)} days`}/><KpiCard label="Distribution" value={dist===null?'—':pct(dist)}/><KpiCard label="SKU × Shop" value={qty(current.length)}/></div>
      <div className="chart-panel"><div className="chart-panel-head"><div><h3>Sales Trend</h3><span>Current vs prior-year month</span></div></div><TrendChart data={trend} series={[{dataKey:'current',name:'Sales ₹L',color:'#6366f1'},{dataKey:'ly',name:'LY ₹L',color:'#9ca3af'}]}/></div>
    </Section>

    <Section number="2" title="Chain wise Performance" subtitle="Click any chain to open SKU, shop, category, Pareto and SKU × shop analysis for that chain." id="review-2">
      <div className="chart-toolbar"><div><strong>Chain sales ranking</strong><span>Click a bar or row to drill down</span></div><div className="toolbar-controls"><Toggle value={chartMetric} onChange={setChartMetric} options={[{value:'sales',label:'Value'},{value:'qty',label:'Qty'}]}/><Toggle value={chartRank} onChange={setChartRank} options={[{value:'top',label:'Top'},{value:'bottom',label:'Bottom'}]}/></div></div>
      <div className="two-col"><div className="chart-panel"><BarChartBlock data={chartRows} horizontal yFormat={chartMetric==='sales'?money:qty} onBarClick={d=>selectChain(d?.key)}/></div><DataTable defaultSortKey="sales" columns={chainColumns} rows={chainRows} onRowClick={r=>selectChain(r.key)}/></div>

      <div className="drilldown-shell">
        <div className="drilldown-head"><div><div className="eyebrow">LIVE DRILL-DOWN</div><h3>{selectedChain ? selectedChain : 'Select a chain'}{selectedSku ? ` → ${selectedSku}` : ''}{selectedOutlet ? ` → ${selectedOutlet}` : ''}</h3><p>{selectedChain ? `${drillRecords.length.toLocaleString('en-IN')} records in the selected path.` : 'Start by clicking a chain in the chart or table.'}</p></div><button type="button" className="clear-drill" onClick={clearDrill} disabled={!selectedChain&&!selectedSku&&!selectedOutlet}>Reset drill-down</button></div>
        {selectedChain ? <>
          <div className="kpi-grid drill-kpis"><KpiCard label="Selected Sales" value={money(sumSalesValue(drillRecords))}/><KpiCard label="Selected Qty" value={qty(sumSalesQty(drillRecords))}/><KpiCard label="SKU Count" value={qty(new Set(drillRecords.map(r=>r.skuCode||r.sku)).size)}/><KpiCard label="Shop Count" value={qty(new Set(drillRecords.map(r=>r.outletCode||r.outletName)).size)}/></div>
          <div className="drill-grid">
            <div><h4>SKU-wise Performance <span>click SKU</span></h4><DataTable columns={skuColumns} rows={drillSkuRows} onRowClick={r=>selectSku(r.skuCode||r.sku)} pageSize={12}/></div>
            <div><h4>Shop-wise Analysis <span>click shop</span></h4><DataTable columns={shopColumns} rows={drillShopRows} onRowClick={r=>selectOutlet(r.outletCode||r.outlet)} pageSize={12}/></div>
            <div><h4>Category-wise Sales</h4><BarChartBlock data={drillCategoryRows.slice(0,10).map(r=>({key:r.key,value:r.sales}))} horizontal yFormat={money}/></div>
            <div><h4>Pareto-wise Sales</h4><BarChartBlock data={drillParetoRows.map(r=>({key:r.key,value:r.sales}))} yFormat={money}/></div>
          </div>
          <div className="drill-full"><h4>SKU × Shop Analysis <span>click a row to focus the shop</span></h4><DataTable columns={skuShopColumns} rows={drillSkuShopRows} onRowClick={r=>selectOutlet(r.outletCode||r.outlet)} pageSize={20}/></div>
        </> : <div className="drill-empty">Choose a chain above. The selected chain becomes the context for every drill-down table and chart.</div>}
      </div>
    </Section>

    <Section number="3" title="BGR wise Performance and Plan" subtitle={bgrField==='region'?'BGR field not present — Region is used as the current proxy.':'Grouped using the BGR field from Excel.'} id="review-3"><DataTable defaultSortKey="sales" columns={[{key:'key',label:'BGR'},{key:'sales',label:'Sales',align:'right',format:money},{key:'target',label:'Target',align:'right',format:money},{key:'achievement',label:'Achievement',align:'right',format:pct},{key:'margin',label:'Margin',align:'right',format:pct},{key:'outlets',label:'Shops',align:'right',format:qty}]} rows={bgrRows}/><div className="plan-strip"><strong>Planning lens:</strong> below-target BGRs are recovery candidates; high-sales BGRs are scale candidates; OOS, distribution and visibility gaps determine execution actions.</div></Section>
    <Section number="4" title="REGION Performance" subtitle="Regional contribution and target delivery." id="review-4"><DataTable defaultSortKey="sales" columns={[{key:'key',label:'Region'},{key:'sales',label:'Sales',align:'right',format:money},{key:'target',label:'Target',align:'right',format:money},{key:'achievement',label:'Achievement',align:'right',format:pct},{key:'margin',label:'Margin',align:'right',format:pct},{key:'outlets',label:'Shops',align:'right',format:qty}]} rows={regionRows}/></Section>
    <Section number="6" title="Top 10 State / Town Performance" subtitle="Top states and towns by sales." id="review-6"><div className="two-col"><div className="chart-panel"><h3>Top States</h3><BarChartBlock data={stateRows.map(r=>({key:r.key,value:r.sales}))} horizontal yFormat={money}/></div><div className="chart-panel"><h3>Top Towns</h3><BarChartBlock data={cityRows.map(r=>({key:r.key,value:r.sales}))} horizontal yFormat={money}/></div></div></Section>
    <Section number="7" title="New Product Launch Tracker" subtitle="Uses Launch Date when supplied; otherwise first appearance in the data." id="review-7">{launchRows.length?<DataTable defaultSortKey="launchMonth" columns={[{key:'sku',label:'Product'},{key:'skuCode',label:'SKU Code'},{key:'brand',label:'Brand'},{key:'category',label:'Category'},{key:'launchMonth',label:'Launch'},{key:'currentSales',label:'Current Sales',align:'right',format:money},{key:'currentQty',label:'Qty',align:'right',format:qty},{key:'outlets',label:'Shops',align:'right',format:qty},{key:'status',label:'Status'}]} rows={launchRows}/>:<MissingData fields={['SKU','Month']}/>}</Section>
    <Section number="8" title="Manpower Summary" subtitle="Field force productivity — sales and coverage per head." id="review-8">{manpowerField?<><div className="kpi-grid"><KpiCard label="Total Manpower" value={qty(headStats.tot)}/><KpiCard label="Sales / Head" value={money(headStats.tot?headStats.sales/headStats.tot:0)}/><KpiCard label="Shops / Head" value={(headStats.tot?headStats.outlets.length/headStats.tot:0).toFixed(1)}/><KpiCard label="Total Shops" value={qty(headStats.outlets.length)}/></div><div className="two-col"><div className="chart-panel"><h4>Sales per head — by chain</h4><BarChartBlock data={headStats.byChain.map(r=>({key:r.key,value:r.perHead}))} horizontal yFormat={money}/></div><DataTable defaultSortKey="perHead" columns={[{key:'key',label:'Region'},{key:'shops',label:'Shops',align:'right',format:qty},{key:'mp',label:'Manpower',align:'right',format:qty},{key:'sales',label:'Sales',align:'right',format:money},{key:'perHead',label:'Sales / Head',align:'right',format:money},{key:'shopsPerHead',label:'Shops / Head',align:'right',format:v=>v.toFixed(1)}]} rows={headStats.byRegion}/></div></>:<MissingData fields={['Manpower / Headcount / FO Count']}/>}</Section>
    <Section number="9" title="Visibility Summary" subtitle="Shelf visibility / display compliance across shops." id="review-9">{visibilityField?<><div className="kpi-grid"><KpiCard label="Average Visibility" value={pct(headStats.avgVis)} tone={headStats.avgVis<60?'danger':headStats.avgVis<75?'warning':'success'}/><KpiCard label="Shops Covered" value={qty(headStats.outlets.length)}/><KpiCard label="Shops below 50%" value={qty(headStats.buckets[0].value)} tone={headStats.buckets[0].value>0?'danger':'success'}/></div><div className="two-col"><div className="chart-panel"><h4>Visibility by chain (avg %)</h4><BarChartBlock data={[...headStats.byChain].filter(r=>r.vis!==null).sort((a,b)=>b.vis-a.vis).map(r=>({key:r.key,value:r.vis}))} horizontal yFormat={v=>`${Number(v).toFixed(0)}%`}/></div><div className="chart-panel"><h4>Shops by visibility band</h4><BarChartBlock data={headStats.buckets}/></div></div><h4>Lowest-visibility shops</h4><DataTable defaultSortKey="vis" defaultSortDesc={false} pageSize={10} columns={[{key:'store',label:'Store'},{key:'chain',label:'Chain'},{key:'region',label:'Region'},{key:'vis',label:'Visibility %',align:'right',format:pct},{key:'sales',label:'Sales',align:'right',format:money}]} rows={headStats.lowVis}/></>:<MissingData fields={['Visibility % / Facings / Display Compliance / Shelf Share']}/>}</Section>
    <Section number="10" title="30 / 60 / 90 – Plan" subtitle="Action plan generated from current performance and execution gaps." id="review-10"><DataTable defaultSortKey="horizon" defaultSortDesc={false} columns={[{key:'horizon',label:'Horizon'},{key:'priority',label:'Priority'},{key:'owner',label:'Owner'},{key:'action',label:'Action'}]} rows={planRows} pageSize={20}/></Section>
    <Section number="12" title="Key Accounts Shares" subtitle="Chain contribution to total MT sales." id="review-12"><div className="two-col"><div className="chart-panel"><BarChartBlock data={keyAccountRows.map(r=>({key:r.key,value:r.share}))} yFormat={pct}/></div><DataTable defaultSortKey="share" columns={[{key:'key',label:'Key Account'},{key:'sales',label:'Sales',align:'right',format:money},{key:'share',label:'Share',align:'right',format:pct},{key:'growth',label:'YoY',align:'right',format:pct}]} rows={keyAccountRows}/></div></Section>
    <Section number="13" title="Fill rates – Chain wise" subtitle="Only calculated from true fill-rate or order/fill fields." id="review-13">{fillRateField||(orderField&&filledField)?<DataTable defaultSortKey="fill" columns={[{key:'key',label:'Chain'},{key:'ordered',label:'Ordered Qty',align:'right',format:qty},{key:'filled',label:'Filled Qty',align:'right',format:qty},{key:'fill',label:'Fill Rate',align:'right',format:pct}]} rows={fillRows}/>:<MissingData fields={['Fill Rate % OR Ordered Qty + Filled Qty']}/>}</Section>
    <Callout tone="info" title="Interactive design">Clicking a chain opens the chain context. Clicking a SKU or shop continues the drill-down. Table headers cycle Ascending → Descending → Normal, and the ⚙ Columns control lets users hide and reorder columns.</Callout>
  </div>;
}
