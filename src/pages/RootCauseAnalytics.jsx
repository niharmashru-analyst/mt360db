import React, { useMemo } from 'react';
import { useFilters } from '../context/FilterContext.jsx';
import KpiCard from '../components/KpiCard.jsx';
import DataTable from '../components/DataTable.jsx';
import Callout from '../components/Callout.jsx';
import { buildRootCauseAnalysis } from '../data/decisionIntelligence.js';
import { formatCurrency, formatPct } from '../data/metrics.js';

export default function RootCauseAnalytics(){
  const {allRecords,filters}=useFilters();
  const a=useMemo(()=>buildRootCauseAnalysis(allRecords,filters),[allRecords,filters]);
  const declines=a.drivers.filter(d=>d.change<0).slice(0,20);
  const growth=a.drivers.filter(d=>d.change>0).slice(-20).reverse();
  return <div className="page">
    <div className="page-header-row"><div><h1>🔍 Root Cause Analytics</h1><p className="page-subtitle">Move from “what changed?” to the dimensions and operational drivers most associated with the change.</p></div><span className="di-badge">DI DIAGNOSTIC ENGINE</span></div>
    <div className="kpi-grid">
      <KpiCard label="Current Sales" value={formatCurrency(a.currentSales)} />
      <KpiCard label={`Previous Month (${a.priorMonth||'—'})`} value={formatCurrency(a.priorSales)} />
      <KpiCard label="Sales Change" value={formatCurrency(a.totalChange)} tone={a.totalChange<0?'danger':'success'} />
      <KpiCard label="Change %" value={a.totalChangePct==null?'—':formatPct(a.totalChangePct,1)} tone={a.totalChange<0?'danger':'success'} />
    </div>
    <Callout tone={a.totalChange<0?'warning':'success'} title={a.totalChange<0?'Sales decline investigation':'Growth driver investigation'}>
      The engine compares the selected month with the prior month and ranks chains, categories, SKUs and outlets by their contribution to the movement.
    </Callout>
    <div className="di-grid-2">
      <div className="section"><h2>Largest Negative Drivers</h2><DataTable rows={declines} columns={[{key:'dimension',label:'Dimension'},{key:'key',label:'Driver'},{key:'current',label:'Current',align:'right',format:formatCurrency},{key:'prior',label:'Prior',align:'right',format:formatCurrency},{key:'change',label:'Change',align:'right',format:formatCurrency},{key:'changePct',label:'Change %',align:'right',format:v=>v==null?'—':formatPct(v,1)}]}/></div>
      <div className="section"><h2>Growth Drivers</h2><DataTable rows={growth} columns={[{key:'dimension',label:'Dimension'},{key:'key',label:'Driver'},{key:'current',label:'Current',align:'right',format:formatCurrency},{key:'prior',label:'Prior',align:'right',format:formatCurrency},{key:'change',label:'Change',align:'right',format:formatCurrency},{key:'changePct',label:'Change %',align:'right',format:v=>v==null?'—':formatPct(v,1)}]}/></div>
    </div>
    <div className="section"><h2>Operational Drivers</h2><DataTable rows={a.operationalDrivers} columns={[{key:'driver',label:'Driver'},{key:'detail',label:'Evidence'},{key:'change',label:'Movement',align:'right',format:v=>Number(v).toLocaleString('en-IN')}]}/></div>
  </div>
}
