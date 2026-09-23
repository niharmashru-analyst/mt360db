import React, { useMemo, useState } from 'react';
import { useFilters } from '../context/FilterContext.jsx';
import KpiCard from '../components/KpiCard.jsx';
import DataTable from '../components/DataTable.jsx';
import Callout from '../components/Callout.jsx';
import { buildDecisionSet, buildRootCauses, buildScenario } from '../data/decisionEngine.js';
import { formatCurrency, formatNumber, formatPct, sumSalesValue, sum } from '../data/metrics.js';
import { buildDataConfidence } from '../data/decisionIntelligence.js';

const STORAGE_KEY = 'mt360_decision_log_v1';
function readLog(){ try{return JSON.parse(localStorage.getItem(STORAGE_KEY)||'[]')}catch{return[]}}
function writeLog(x){localStorage.setItem(STORAGE_KEY,JSON.stringify(x))}

export default function DecisionCenter(){
  const { filteredRecords, allRecords, listingMatrix, monthlyQtyIndex, filters } = useFilters();
  const [selected, setSelected] = useState(null);
  const [owner, setOwner] = useState('Sales Manager');
  const [deadline, setDeadline] = useState('');
  const [decisionStatus, setDecisionStatus] = useState('open');
  const [logTick,setLogTick]=useState(0);
  const decisions=useMemo(()=>buildDecisionSet(filteredRecords,allRecords,listingMatrix,filters.month,monthlyQtyIndex),[filteredRecords,allRecords,listingMatrix,filters.month,monthlyQtyIndex]);
  const causes=useMemo(()=>buildRootCauses(filteredRecords,allRecords,filters),[filteredRecords,allRecords,filters]);
  const confidence=useMemo(()=>buildDataConfidence(allRecords),[allRecords]);
  const log=useMemo(()=>readLog(),[logTick]);
  const open=decisions.filter(d=>d.status==='open');
  const critical=open.filter(d=>d.priority==='critical').length;
  const high=open.filter(d=>d.priority==='high').length;
  const totalImpact=open.reduce((a,d)=>a+d.impact,0);
  const sales=sumSalesValue(filteredRecords);
  const target=sum(filteredRecords,'targetValue');

  function act(status){
    if(!selected)return;
    const item={...selected,status,owner,deadline,decisionAt:new Date().toISOString()};
    const next=[item,...readLog().filter(x=>x.id!==selected.id)]; writeLog(next); setLogTick(x=>x+1); setDecisionStatus(status);
  }
  return <div className="page">
    <div className="page-header-row"><div><h1>🧠 Decision Center</h1><p className="page-subtitle">From dashboard metrics to decisions, actions and measurable outcomes.</p></div><span className="di-badge">DECISION INTELLIGENCE PILOT</span></div>
    <div className="kpi-grid">
      <KpiCard label="Decision Impact" value={formatCurrency(totalImpact)} tone="success" />
      <KpiCard label="Critical Decisions" value={formatNumber(critical)} tone={critical?'danger':'success'} />
      <KpiCard label="High Priority" value={formatNumber(high)} tone={high?'warning':'success'} />
      <KpiCard label="Target Gap" value={formatCurrency(Math.max(0,target-sales))} tone={target>sales?'warning':'success'} />
      <KpiCard label="Data Confidence" value={`${confidence.score}%`} tone={confidence.score>=85?'success':confidence.score>=70?'warning':'danger'} />
    </div>
    <Callout tone="info" title="What changed">This page is the new control layer. It detects a business issue, quantifies the potential impact, explains the evidence, recommends an action and records the manager's decision.</Callout>
    <div className="di-grid-2">
      <div className="section"><h2>Today's Decisions</h2><DataTable rows={decisions.slice(0,80)} defaultSortKey="impact" onRowClick={setSelected} columns={[
        {key:'priority',label:'Priority',format:v=><span className={`priority-pill ${v}`}>{v.toUpperCase()}</span>},{key:'type',label:'Type'},{key:'title',label:'Decision'},{key:'entity',label:'Scope'},{key:'impact',label:'₹ Impact',align:'right',format:formatCurrency},{key:'confidence',label:'Confidence',align:'right',format:v=>formatPct(v,0)}
      ]}/></div>
      <div className="section"><h2>Top Root Causes</h2><DataTable rows={causes} columns={[{key:'driver',label:'Driver'},{key:'evidence',label:'Evidence'},{key:'contribution',label:'Contribution',align:'right',format:v=>formatPct(v,1)},{key:'action',label:'Next check'}]}/><h2 style={{marginTop:24}}>Decision Quality Loop</h2><div className="decision-loop"><span>DETECT</span><b>→</b><span>DIAGNOSE</span><b>→</b><span>QUANTIFY</span><b>→</b><span>RECOMMEND</span><b>→</b><span>ACT</span><b>→</b><span>MEASURE</span></div></div>
    </div>
    {selected&&<div className="decision-drawer"><div className="drawer-card"><div className="page-header-row"><div><div className={`priority-pill ${selected.priority}`}>{selected.priority.toUpperCase()}</div><h2>{selected.title}</h2><p className="page-subtitle">{selected.entity}{selected.sku?` · ${selected.sku}`:''}</p></div><button className="ghost-btn" onClick={()=>setSelected(null)}>Close</button></div>
      <div className="decision-detail-grid"><div><small>WHY</small><p>{selected.why}</p></div><div><small>EST. IMPACT</small><p className="big-number">{formatCurrency(selected.impact)}</p></div><div><small>RECOMMENDATION</small><p>{selected.recommendation}</p></div><div><small>CONFIDENCE</small><p>{selected.confidence}% · {selected.source}</p></div></div>
      <div className="decision-controls"><label>Owner<select value={owner} onChange={e=>setOwner(e.target.value)}><option>Sales Manager</option><option>MT Manager</option><option>Area Manager</option><option>Category Manager</option><option>Supply Chain</option><option>Finance</option></select></label><label>Deadline<input type="date" value={deadline} onChange={e=>setDeadline(e.target.value)}/></label></div>
      <div className="decision-actions"><button className="primary-btn" onClick={()=>act('accepted')}>✓ Accept Recommendation</button><button className="secondary-btn" onClick={()=>act('modified')}>Modify & Accept</button><button className="danger-btn" onClick={()=>act('rejected')}>Reject</button></div>
      {decisionStatus!=='open'&&<Callout tone="success" title={`Decision ${decisionStatus}`}>Recorded locally for pilot validation. Add the actual outcome later from Decision History.</Callout>}
    </div></div>}
    <div className="section"><h2>What-If Quick Test</h2><Scenario records={filteredRecords}/></div>
    <div className="section"><h2>Decision Memory</h2><p className="page-subtitle">{log.length} decisions have been recorded on this browser. This is intentionally local for the pilot; a shared database can be added once the workflow is validated.</p><DataTable rows={log.slice(0,50)} columns={[{key:'status',label:'Status'},{key:'title',label:'Decision'},{key:'owner',label:'Owner'},{key:'deadline',label:'Deadline'},{key:'impact',label:'Impact',align:'right',format:formatCurrency},{key:'decisionAt',label:'Recorded',format:v=>new Date(v).toLocaleString()}]}/></div>
  </div>
}

function Scenario({records}){
  const [distributionLift,setDistributionLift]=useState(10),[oosTarget,setOosTarget]=useState(3),[velocityLift,setVelocityLift]=useState(5),[assortmentLift,setAssortmentLift]=useState(5);
  const s=buildScenario(records,{distributionLift,oosTarget,velocityLift,assortmentLift});
  return <div className="scenario-box"><div className="scenario-controls"><label>Distribution +{distributionLift}%<input type="range" min="0" max="30" value={distributionLift} onChange={e=>setDistributionLift(+e.target.value)}/></label><label>OOS target {oosTarget}%<input type="range" min="0" max="10" value={oosTarget} onChange={e=>setOosTarget(+e.target.value)}/></label><label>Velocity +{velocityLift}%<input type="range" min="0" max="20" value={velocityLift} onChange={e=>setVelocityLift(+e.target.value)}/></label><label>Assortment +{assortmentLift}%<input type="range" min="0" max="20" value={assortmentLift} onChange={e=>setAssortmentLift(+e.target.value)}/></label></div><div className="scenario-results"><div><small>Incremental Sales</small><strong>{formatCurrency(s.incrementalSales)}</strong></div><div><small>Estimated Margin</small><strong>{formatCurrency(s.margin)}</strong></div><div><small>Risk-adjusted</small><strong>{formatCurrency(s.riskAdjusted)}</strong></div></div></div>
}
