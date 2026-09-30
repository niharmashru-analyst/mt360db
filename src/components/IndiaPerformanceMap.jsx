import React, { useEffect, useMemo, useState } from 'react';
import { formatCurrency, formatNumber, formatPct, sumSalesValue, oosPct } from '../data/metrics.js';

const INDIA_GEOJSON_URL = 'https://cdn.jsdelivr.net/gh/udit-001/india-maps-data@2884453/geojson/india.geojson';

function normalizeStateName(value) {
  const s = String(value || '').trim().toLowerCase();
  const aliases = {
    'nct of delhi': 'Delhi', 'new delhi': 'Delhi', 'delhi nct': 'Delhi',
    'orissa': 'Odisha', 'pondicherry': 'Puducherry', 'uttaranchal': 'Uttarakhand',
    'jammu & kashmir': 'Jammu and Kashmir', 'jammu and kashmir': 'Jammu and Kashmir',
    'dadra and nagar haveli and daman and diu': 'Dadra & Nagar Haveli and Daman & Diu'
  };
  return aliases[s] || String(value || '').trim();
}

function getStateName(feature) {
  const p = feature?.properties || {};
  return normalizeStateName(p.ST_NM || p.STNAME || p.State_Name || p.state_name || p.NAME_1 || p.name || p.stname || p.STATE || 'Unknown');
}

function getCoordinates(geometry) {
  if (!geometry) return [];
  if (geometry.type === 'Polygon') return geometry.coordinates.flat();
  if (geometry.type === 'MultiPolygon') return geometry.coordinates.flat(2);
  return [];
}

function projectFeatures(features, width, height, pad = 16) {
  const pts = features.flatMap(f => getCoordinates(f.geometry));
  const lon = pts.map(p => p[0]).filter(Number.isFinite);
  const lat = pts.map(p => p[1]).filter(Number.isFinite);
  if (!lon.length || !lat.length) return { paths: [], stateBounds: {} };
  const minX = Math.min(...lon), maxX = Math.max(...lon), minY = Math.min(...lat), maxY = Math.max(...lat);
  const sx = (width - pad * 2) / Math.max(1, maxX - minX);
  const sy = (height - pad * 2) / Math.max(1, maxY - minY);
  const scale = Math.min(sx, sy);
  const mapW = (maxX - minX) * scale, mapH = (maxY - minY) * scale;
  const ox = (width - mapW) / 2, oy = (height - mapH) / 2;
  const point = ([x, y]) => [ox + (x - minX) * scale, oy + (maxY - y) * scale];
  const ringPath = ring => ring.map((p, i) => { const [x,y]=point(p); return `${i?'L':'M'}${x.toFixed(2)},${y.toFixed(2)}`; }).join(' ') + ' Z';
  const paths = features.map((feature, index) => {
    const g = feature.geometry;
    let d = '';
    if (g?.type === 'Polygon') d = g.coordinates.map(ringPath).join(' ');
    if (g?.type === 'MultiPolygon') d = g.coordinates.flatMap(poly => poly.map(ringPath)).join(' ');
    const name = getStateName(feature);
    const all = getCoordinates(g).map(point);
    const cx = all.reduce((a,p)=>a+p[0],0)/Math.max(1,all.length);
    const cy = all.reduce((a,p)=>a+p[1],0)/Math.max(1,all.length);
    return { index, name, d, cx, cy };
  });
  return { paths };
}

function metricValue(records, metric) {
  if (metric === 'qty') return records.reduce((a,r)=>a+Number(r.salesQty||0),0);
  if (metric === 'oos') return oosPct(records);
  if (metric === 'outlets') return new Set(records.map(r=>r.outletCode).filter(Boolean)).size;
  return sumSalesValue(records);
}

function displayMetric(value, metric) {
  if (metric === 'qty' || metric === 'outlets') return formatNumber(value);
  if (metric === 'oos') return formatPct(value);
  return formatCurrency(value);
}

export default function IndiaPerformanceMap({ records = [], onStateSelect, title = 'India geography performance' }) {
  const [features, setFeatures] = useState([]);
  const [status, setStatus] = useState('loading');
  const [metric, setMetric] = useState('sales');
  const [selectedState, setSelectedState] = useState('');

  useEffect(() => {
    let alive = true;
    setStatus('loading');
    fetch(INDIA_GEOJSON_URL)
      .then(r => { if (!r.ok) throw new Error('Map request failed'); return r.json(); })
      .then(g => { if (alive) { setFeatures(Array.isArray(g.features) ? g.features : []); setStatus('ready'); } })
      .catch(() => { if (alive) setStatus('error'); });
    return () => { alive = false; };
  }, []);

  const stateData = useMemo(() => {
    const map = new Map();
    records.forEach(r => {
      const state = normalizeStateName(r.state);
      if (!state) return;
      if (!map.has(state)) map.set(state, []);
      map.get(state).push(r);
    });
    return map;
  }, [records]);

  const projected = useMemo(() => projectFeatures(features, 700, 470), [features]);
  const values = useMemo(() => [...stateData.values()].map(rs => metricValue(rs, metric)).filter(Number.isFinite), [stateData, metric]);
  const min = values.length ? Math.min(...values) : 0;
  const max = values.length ? Math.max(...values) : 1;
  const color = value => {
    if (!Number.isFinite(value)) return '#e5e7eb';
    const t = max === min ? 0.55 : (value-min)/(max-min);
    const alpha = 0.12 + t*0.72;
    return `rgba(236, 72, 153, ${alpha.toFixed(2)})`;
  };

  const selectedRecords = selectedState ? (stateData.get(selectedState) || []) : [];
  const selectedDetails = selectedState ? {
    sales: sumSalesValue(selectedRecords), qty: selectedRecords.reduce((a,r)=>a+Number(r.salesQty||0),0),
    oos: oosPct(selectedRecords), outlets: new Set(selectedRecords.map(r=>r.outletCode).filter(Boolean)).size,
    chains: new Set(selectedRecords.map(r=>r.chainName).filter(Boolean)).size,
    skus: new Set(selectedRecords.map(r=>r.skuCode||r.sku).filter(Boolean)).size,
  } : null;

  function select(name) {
    setSelectedState(name);
    onStateSelect?.(name);
  }

  return <div className="india-map-panel">
    <div className="india-map-head">
      <div><h3>{title}</h3><p>Click a state to inspect sales, outlets, SKUs, chains and OOS details.</p></div>
      <div className="review-toggle">
        {[['sales','Sales'],['qty','Sales Qty'],['oos','OOS %'],['outlets','Outlets']].map(([v,l])=><button key={v} type="button" className={metric===v?'active':''} onClick={()=>setMetric(v)}>{l}</button>)}
      </div>
    </div>
    {status === 'error' && <div className="review-missing"><strong>India map unavailable</strong><span>The dashboard could not load the state boundary file. The state tables below remain fully available.</span></div>}
    {status === 'loading' && <div className="map-loading">Loading India map…</div>}
    {status === 'ready' && <div className="india-map-layout">
      <div className="india-map-svg-wrap">
        <svg className="india-map-svg" viewBox="0 0 700 470" role="img" aria-label="India state performance map">
          {projected.paths.map(p => {
            const recs = stateData.get(normalizeStateName(p.name)) || stateData.get(p.name) || [];
            const value = recs.length ? metricValue(recs, metric) : null;
            const selected = selectedState && p.name === selectedState;
            return <path key={`${p.name}-${p.index}`} d={p.d} fill={selected ? '#ec4899' : color(value)} stroke={selected ? '#111827' : '#9ca3af'} strokeWidth={selected ? 2.4 : 0.7} onClick={()=>select(p.name)} className="india-state-shape"><title>{p.name}: {value == null ? 'No data' : displayMetric(value,metric)}</title></path>;
          })}
        </svg>
      </div>
      <div className="india-map-details">
        {selectedDetails ? <>
          <div className="map-selected-title">{selectedState}</div>
          <div className="map-detail-grid">
            <div><span>Sales</span><strong>{formatCurrency(selectedDetails.sales)}</strong></div>
            <div><span>Sales Qty</span><strong>{formatNumber(selectedDetails.qty)}</strong></div>
            <div><span>OOS</span><strong>{formatPct(selectedDetails.oos)}</strong></div>
            <div><span>Outlets</span><strong>{formatNumber(selectedDetails.outlets)}</strong></div>
            <div><span>Chains</span><strong>{formatNumber(selectedDetails.chains)}</strong></div>
            <div><span>SKUs</span><strong>{formatNumber(selectedDetails.skus)}</strong></div>
          </div>
        </> : <div className="map-empty-detail">Select any state on the map for details.</div>}
      </div>
    </div>}
  </div>;
}
