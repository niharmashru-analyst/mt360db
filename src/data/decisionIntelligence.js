import { applyFilters, getPriorMonth, groupBy, isOOS, sumSalesValue, sum } from './metrics.js';

const REQUIRED = ['month','outletCode','skuCode','salesValue','salesQty','stockQty','mrp','targetValue'];

function pct(n,d){ return d ? (n/d)*100 : 0; }
function clamp(v,a=0,b=100){ return Math.max(a,Math.min(b,v)); }
function num(v){ return Number.isFinite(Number(v)) ? Number(v) : 0; }

export function buildDataConfidence(records, diagnostics={}) {
  const n = records.length;
  if (!n) return { score:0, grade:'Poor', components:[], issues:['No records loaded'] };
  const issues=[];
  const components=[];
  const add=(name,score,detail)=>components.push({name,score:Math.round(clamp(score)),detail});

  const blankCodes = records.filter(r=>!String(r.outletCode||'').trim() || !String(r.skuCode||'').trim()).length;
  add('Completeness', 100-pct(blankCodes,n), `${blankCodes.toLocaleString('en-IN')} rows have blank outlet/SKU codes`);
  if(blankCodes) issues.push(`${blankCodes.toLocaleString('en-IN')} rows have blank outlet or SKU codes`);

  const missingRequired = REQUIRED.filter(f=>records.every(r=>r[f]===undefined || r[f]===null || r[f]===''));
  const fieldBlank = records.reduce((a,r)=>a+REQUIRED.filter(f=>r[f]===undefined || r[f]===null || r[f]==='').length,0);
  const fieldScore = 100-pct(fieldBlank, n*REQUIRED.length);
  add('Field validity', fieldScore, `${missingRequired.length} required fields are completely missing`);
  if(missingRequired.length) issues.push(`Missing required fields: ${missingRequired.join(', ')}`);

  const duplicateKeys = n-new Set(records.map(r=>`${r.month}|${r.outletCode}|${r.skuCode}`)).size;
  add('Uniqueness',100-pct(duplicateKeys,n),`${duplicateKeys.toLocaleString('en-IN')} duplicate month-outlet-SKU rows`);
  if(duplicateKeys) issues.push(`${duplicateKeys.toLocaleString('en-IN')} duplicate month-outlet-SKU rows`);

  const badNumeric = records.filter(r=>['salesValue','salesQty','stockQty','mrp','targetValue'].some(f=>r[f]!==undefined && r[f]!==null && !Number.isFinite(Number(r[f])))).length;
  add('Numeric validity',100-pct(badNumeric,n),`${badNumeric.toLocaleString('en-IN')} rows contain invalid numeric values`);
  if(badNumeric) issues.push(`${badNumeric.toLocaleString('en-IN')} rows contain invalid numeric values`);

  const zeroValue = records.filter(r=>num(r.salesValue)===0 && num(r.salesQty)===0 && num(r.stockQty)===0).length;
  add('Business coverage',100-pct(zeroValue,n),`${zeroValue.toLocaleString('en-IN')} rows have zero sales, stock and quantity`);
  if(zeroValue) issues.push(`${zeroValue.toLocaleString('en-IN')} fully-zero rows may be noise`);

  const monthValues = new Set(records.map(r=>r.month).filter(Boolean));
  add('Time coverage', monthValues.size ? 100 : 0, `${monthValues.size} month values detected`);
  if(!monthValues.size) issues.push('No valid month values detected');

  const score=Math.round(components.reduce((a,c)=>a+c.score,0)/components.length);
  const grade=score>=95?'Excellent':score>=85?'Good':score>=70?'Watch':score>=50?'At Risk':'Poor';
  return {score,grade,components,issues,diagnostics};
}

export function buildRootCauseAnalysis(allRecords, filters={}) {
  const currentMonth=filters.month || [...new Set(allRecords.map(r=>r.month).filter(Boolean))].sort().pop();
  if(!currentMonth) return {currentMonth:null, priorMonth:null, totalChange:0, drivers:[], operationalDrivers:[]};
  const current=applyFilters(allRecords,{...filters,month:currentMonth});
  const priorMonth=getPriorMonth(currentMonth,1);
  const prior=applyFilters(allRecords,{...filters,month:priorMonth});
  const currentSales=sumSalesValue(current), priorSales=sumSalesValue(prior), totalChange=currentSales-priorSales;

  const dimension=(field,label)=>{
    const c=groupBy(current,field), p=groupBy(prior,field);
    const keys=[...new Set([...Object.keys(c),...Object.keys(p)])].filter(Boolean);
    return keys.map(k=>{
      const cv=sumSalesValue(c[k]||[]), pv=sumSalesValue(p[k]||[]), change=cv-pv;
      return {dimension:label,key:k,current:cv,prior:pv,change,changePct:pv?change/pv*100:null,contribution:Math.abs(totalChange)?change/Math.abs(totalChange)*100:0};
    }).filter(x=>x.change!==0).sort((a,b)=>a.change-b.change);
  };

  const drivers=[...dimension('chainName','Chain'),...dimension('category','Category'),...dimension('skuCode','SKU'),...dimension('outletCode','Outlet')]
    .sort((a,b)=>a.change-b.change).slice(0,25);

  const oosCurrent=current.filter(isOOS).length, oosPrior=prior.filter(isOOS).length;
  const stockCurrent=sum(current,'stockQty'), stockPrior=sum(prior,'stockQty');
  const targetGapCurrent=Math.max(0,sum(current,'targetValue')-currentSales), targetGapPrior=Math.max(0,sum(prior,'targetValue')-priorSales);
  const operationalDrivers=[
    {driver:'Sales movement',change:totalChange,detail:`Sales moved ${totalChange>=0?'+':''}${totalChange.toLocaleString('en-IN')} versus ${priorMonth}`,severity:Math.abs(totalChange)},
    {driver:'OOS pressure',change:oosCurrent-oosPrior,detail:`OOS rows ${oosPrior} → ${oosCurrent}`,severity:Math.abs(oosCurrent-oosPrior)},
    {driver:'Stock position',change:stockCurrent-stockPrior,detail:`Stock qty ${stockPrior.toLocaleString('en-IN')} → ${stockCurrent.toLocaleString('en-IN')}`,severity:Math.abs(stockCurrent-stockPrior)},
    {driver:'Target gap',change:targetGapCurrent-targetGapPrior,detail:`Gap ${targetGapPrior.toLocaleString('en-IN')} → ${targetGapCurrent.toLocaleString('en-IN')}`,severity:Math.abs(targetGapCurrent-targetGapPrior)}
  ].sort((a,b)=>b.severity-a.severity);
  return {currentMonth,priorMonth,currentSales,priorSales,totalChange,totalChangePct:priorSales?totalChange/priorSales*100:null,drivers,operationalDrivers};
}
