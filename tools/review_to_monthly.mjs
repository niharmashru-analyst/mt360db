#!/usr/bin/env node
// ============================================================================
// review_data.xlsx  ->  data/YYYY-MM.csv   (what the MT 360 server reads)
//
//   node tools/review_to_monthly.mjs <review_data.xlsx> [--masters masters.xlsx] [--out data] [--keep-zero]
//
// * One sheet per retailer (Health & Glow, Shoppers Stop, Dabur, Lifestyle ...).
//   Columns are matched by NAME, not position, so small header changes are fine.
// * Transaction lines are summed to  Month x Outlet x SKU(EAN).
// * Sales value is NOT taken from the sheet: the dashboard uses Tertiary Qty x MRP.
// * Streams the workbook row by row, so a 30 MB / 400k-row file needs ~300 MB RAM.
// * Anything it cannot map (outlet / SKU not in masters) is still loaded, and listed in
//   unmapped_outlets.csv / unmapped_skus.csv so you can fix masters.xlsx and re-run.
// ============================================================================
import fs from 'fs';
import path from 'path';
import ExcelJS from 'exceljs';
import unzipper from 'unzipper';

// ---------------------------------------------------------------- arguments
const args = process.argv.slice(2);
const flag = (n, d) => { const i = args.indexOf(n); return i >= 0 ? args[i + 1] : d; };
const inputFile = args.find((a, i) => !a.startsWith('--') && !(i > 0 && args[i - 1].startsWith('--') && args[i - 1] !== '--keep-zero'));
const mastersFile = flag('--masters', null);
const outDir = flag('--out', 'data');
const keepZero = args.includes('--keep-zero');
if (!inputFile || !fs.existsSync(inputFile)) {
  console.error('Usage: node tools/review_to_monthly.mjs <review_data.xlsx> [--masters masters.xlsx] [--out data] [--keep-zero]');
  process.exit(1);
}

// ---------------------------------------------------------------- column aliases
// First alias that exists in the sheet wins, so order = priority.
const ALIAS = {
  month:      ['mnth & year', 'month', 'saledate', 'sale date', 'posting date', 'date'],
  outletCode: ['outlet code', 'ol code', 'store code'],
  siteCode:   ['location code', 'site', 'loc_num', 'loc num', 'site code'],
  outletName: ['location name', 'site name', 'location_name', 'outlet name', 'store name'],
  city:       ['city'],
  region:     ['region'],
  ean:        ['ean', 'ean code', 'ean_code'],
  sku:        ['sku name', 'description', 'item_desc_secondary', 'item desc'],
  qty:        ['sales qty', 'qty in unit of entry', 'qty', 'quantity'],
  mrp:        ['mrp', 'salmrp'],
};
// Chain / format per sheet name. Anything not listed becomes chain = sheet name, type = MBO.
const CHAIN_TYPE = { 'health & glow': 'MBO', 'shoppers stop': 'Department Store', dabur: 'MBO', lifestyle: 'Department Store' };
const CITY_STATE = { // fallback only; masters.xlsx wins
  chennai: ['Tamil Nadu', 'South'], coimbatore: ['Tamil Nadu', 'South'], hyderabad: ['Telangana', 'South'], bangalore: ['Karnataka', 'South'], bengaluru: ['Karnataka', 'South'],
  mysore: ['Karnataka', 'South'], kochi: ['Kerala', 'South'], mumbai: ['Maharashtra', 'West'], pune: ['Maharashtra', 'West'], nagpur: ['Maharashtra', 'West'],
  ahmedabad: ['Gujarat', 'West'], surat: ['Gujarat', 'West'], vadodara: ['Gujarat', 'West'], 'new delhi': ['Delhi', 'North'], delhi: ['Delhi', 'North'],
  noida: ['Uttar Pradesh', 'North'], gurgaon: ['Haryana', 'North'], gurugram: ['Haryana', 'North'], lucknow: ['Uttar Pradesh', 'North'], chandigarh: ['Punjab', 'North'],
  ludhiana: ['Punjab', 'North'], jaipur: ['Rajasthan', 'North'], jammu: ['Jammu & Kashmir', 'North'], kolkata: ['West Bengal', 'East'], bhubaneswar: ['Odisha', 'East'],
  bhubaneshwar: ['Odisha', 'East'], cuttack: ['Odisha', 'East'], mangalore: ['Karnataka', 'South'], durgapur: ['West Bengal', 'East'], siliguri: ['West Bengal', 'East'],
  varanasi: ['Uttar Pradesh', 'North'], ghaziabad: ['Uttar Pradesh', 'North'], kanpur: ['Uttar Pradesh', 'North'], agra: ['Uttar Pradesh', 'North'], meerut: ['Uttar Pradesh', 'North'],
  dehradun: ['Uttarakhand', 'North'], amritsar: ['Punjab', 'North'], jalandhar: ['Punjab', 'North'], mohali: ['Punjab', 'North'], faridabad: ['Haryana', 'North'], jodhpur: ['Rajasthan', 'North'], udaipur: ['Rajasthan', 'North'],
  vijayawada: ['Andhra Pradesh', 'South'], visakhapatnam: ['Andhra Pradesh', 'South'], vizag: ['Andhra Pradesh', 'South'], waltair: ['Andhra Pradesh', 'South'], madurai: ['Tamil Nadu', 'South'], trichy: ['Tamil Nadu', 'South'],
  trivandrum: ['Kerala', 'South'], thiruvananthapuram: ['Kerala', 'South'], kozhikode: ['Kerala', 'South'], thane: ['Maharashtra', 'West'], nashik: ['Maharashtra', 'West'], raipur: ['Chhattisgarh', 'East'],
  jamshedpur: ['Jharkhand', 'East'], dhanbad: ['Jharkhand', 'East'], gwalior: ['Madhya Pradesh', 'West'], jabalpur: ['Madhya Pradesh', 'West'], guwahati: ['Assam', 'East'], patna: ['Bihar', 'East'], ranchi: ['Jharkhand', 'East'], indore: ['Madhya Pradesh', 'West'], bhopal: ['Madhya Pradesh', 'West'],
};
const NAME_CODES = { che: 'chennai', hyd: 'hyderabad', blr: 'bangalore', vjw: 'vijayawada', vzg: 'vizag', mum: 'mumbai', pun: 'pune', del: 'new delhi', kol: 'kolkata', ahd: 'ahmedabad' }; // outlet-name suffixes like "HG-ADYAR-CHE"
function cityFromName(name) {
  const n = String(name || '').toLowerCase(); const tail = n.match(/[-\s]([a-z]{3})\s*$/)?.[1];
  if (tail && NAME_CODES[tail]) return NAME_CODES[tail];
  for (const c of Object.keys(CITY_STATE)) if (c.length >= 5 && n.includes(c)) return c;
  return '';
}
const KEYWORDS = [ // fallback category inference from the SKU text; masters.xlsx wins. First match wins.
  [/nail|enamel|metali|nlpnt|top coat|remover/i, 'Makeup', 'Nails'],
  [/sunscreen|spf/i, 'Skincare', 'Sunscreen'], [/serum|moistur|face wash|cleanser|toner|mask|masque|peptide|collg|collagen|thrpy|therapy|hydrly|retinol|niacin|jelly|jely|gel cream|wrapping|night cream|lotion/i, 'Skincare', 'Skincare'],
  [/perfume|edp|edt|mist|fragrance|deo|desire|eau/i, 'Fragrance', 'Fragrance'], [/hair|shampoo|conditioner/i, 'Haircare', 'Haircare'],
  [/brush|sponge|blender|puff/i, 'Makeup', 'Brushes'],
  [/lip|gloss|mattel|lpclr|\bls\b|\blc\b|swm mat|stunner|stywthme|staywithme|tint|crayon/i, 'Makeup', 'Lipstick'],
  [/kohl|kajal|liner|brow|mascara|lash|pencil|kjl/i, 'Makeup', 'Eye'],
  [/foundation|fndation|bb cream|compact|powder|primer|concealer|filter|setting|banana|blush|highlight|bronzer|3-in-1|ph stick|pre make|make up oil|makeup|fix|wipes|kit|\bhd\b/i, 'Makeup', 'Face'],
  [/body|bath|soap|scrub/i, 'Bath & Body', 'Bath & Body'],
];

// ---------------------------------------------------------------- helpers
const norm = (h) => String(h ?? '').toLowerCase().replace(/\s+/g, ' ').trim();
const cellVal = (c) => { let v = c?.value; if (v && typeof v === 'object' && !(v instanceof Date)) v = v.result ?? v.text ?? (v.richText ? v.richText.map((t) => t.text).join('') : null); return v ?? null; };
const num = (v) => { const n = Number(String(v ?? '').replace(/[, ₹]/g, '')); return Number.isFinite(n) ? n : 0; };
const txt = (v) => String(v ?? '').replace(/\s+/g, ' ').trim();
const MON = { jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6, jul: 7, aug: 8, sep: 9, oct: 10, nov: 11, dec: 12 };
function toMonth(v) {
  if (v instanceof Date && !isNaN(v)) return `${v.getUTCFullYear()}-${String(v.getUTCMonth() + 1).padStart(2, '0')}`;
  if (typeof v === 'number' && v > 20000 && v < 80000) return toMonth(new Date(Math.round((v - 25569) * 864e5)));
  const s = txt(v); if (!s) return null;
  let m = s.match(/^(\d{4})[-/](\d{1,2})/); if (m) return `${m[1]}-${m[2].padStart(2, '0')}`;
  m = s.match(/^([A-Za-z]{3})[a-z]*[\s'’\-\/]*(\d{2,4})$/); if (m && MON[m[1].toLowerCase()]) { const y = m[2].length === 2 ? 2000 + +m[2] : +m[2]; return `${y}-${String(MON[m[1].toLowerCase()]).padStart(2, '0')}`; }
  return null;
}
const eanOf = (v) => { const s = String(v ?? '').replace(/\.0+$/, '').replace(/\D/g, ''); return s || null; };
const csvCell = (v) => { const s = String(v ?? ''); return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };
const titleCase = (s) => s.toLowerCase().replace(/\b([a-z])/g, (x) => x.toUpperCase()).replace(/\b(Spf|Edp|Edt|Bb|Ml|Gm)\b/g, (x) => x.toUpperCase());
const mode = (m) => { let best = null, bc = -1; for (const [k, c] of m) if (c > bc) { best = k; bc = c; } return best; };
const bump = (map, k, w = 1) => map.set(k, (map.get(k) || 0) + w);


// The streaming reader does not expose real sheet names, so read them from the xlsx package itself.
async function sheetNames(file) {
  const zip = await unzipper.Open.file(file);
  const read = async (p) => { const f = zip.files.find((x) => x.path === p); return f ? (await f.buffer()).toString('utf8') : ''; };
  const wbx = await read('xl/workbook.xml'), rels = await read('xl/_rels/workbook.xml.rels');
  const target = {}; for (const m of rels.matchAll(/<Relationship\b[^>]*>/g)) { const id = m[0].match(/\bId="([^"]+)"/)?.[1], t = m[0].match(/\bTarget="([^"]+)"/)?.[1]; if (id && t) target[id] = t; }
  const out = []; // [{n: worksheet file number, name}]
  for (const m of wbx.matchAll(/<sheet\b[^>]*>/g)) {
    const name = m[0].match(/\bname="([^"]*)"/)?.[1], rid = m[0].match(/\br:id="([^"]+)"/)?.[1]; const n = target[rid]?.match(/sheet(\d+)\.xml/)?.[1];
    if (name && n) out.push({ n: +n, name: name.replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&apos;/g, "'") });
  }
  // The streaming reader emits worksheets in package order (sheet1.xml, sheet2.xml, ...), which is NOT
  // the tab order or the sheetId, so names are matched by worksheet file number.
  return out.sort((a, b) => a.n - b.n).map((x) => x.name);
}

// ---------------------------------------------------------------- masters (optional)
const M = { outlet: new Map(), sku: new Map(), target: new Map(), stock: new Map() };
async function loadMasters(file) {
  const wb = new ExcelJS.stream.xlsx.WorkbookReader(file, { sharedStrings: 'cache', styles: 'ignore', hyperlinks: 'ignore', worksheets: 'emit' });
  const names = await sheetNames(file); let idx = 0;
  for await (const ws of wb) {
    const name = norm(names[idx++] || ws.name); let H = null;
    for await (const row of ws) {
      const vals = row.values.slice(1).map((c) => (c && typeof c === 'object' && !(c instanceof Date) ? (c.result ?? c.text ?? null) : c));
      if (!H) { H = vals.map(norm); continue; }
      const r = {}; H.forEach((h, i) => { r[h] = vals[i]; });
      if (name === 'outlet master') { const c = txt(r['outlet code']); if (c) M.outlet.set(c, r); }
      else if (name === 'sku master') { const e = eanOf(r['ean']); if (e) M.sku.set(e, r); }
      else if (name === 'targets') { const mo = toMonth(r['month']), c = txt(r['outlet code']); if (mo && c) M.target.set(`${mo}|${c}`, num(r['target value'])); }
      else if (name.startsWith('stock')) { const mo = toMonth(r['month']), c = txt(r['outlet code']), e = eanOf(r['ean']); if (mo && c && e) M.stock.set(`${mo}|${c}|${e}`, r); }
    }
  }
  console.log(`masters: ${M.outlet.size} outlets, ${M.sku.size} SKUs, ${M.target.size} targets, ${M.stock.size} stock rows`);
}

// ---------------------------------------------------------------- main
const AGG = new Map();                 // month|outlet|ean -> {qty, mrp:Map, sheet}
const outletInfo = new Map();          // outlet -> {sheet,name,city,region,siteCodes}
const skuNames = new Map();            // ean -> Map(name->count)
const skuMrp = new Map();              // ean -> Map(mrp->count)
const skuValue = new Map();            // ean -> value (for pareto, filled later)
const stats = {};                      // per sheet counters
const siteToOutlet = new Map();        // sheet|site -> outlet code (learned)

async function main() {
  if (mastersFile) await loadMasters(mastersFile);
  const wb = new ExcelJS.stream.xlsx.WorkbookReader(inputFile, { sharedStrings: 'cache', styles: 'ignore', hyperlinks: 'ignore', worksheets: 'emit' });
  // Pass 1 needs site->outlet learning before nulls can be filled, so rows with no outlet are parked.
  const parked = [];
  const names = await sheetNames(inputFile); let idx = 0;
  for await (const ws of wb) {
    const sheet = names[idx++] || ws.name; const key = norm(sheet); let col = null; const S = (stats[sheet] = { rows: 0, used: 0, noMonth: 0, noEan: 0, noOutlet: 0, returns: 0, zeroMrpFixed: 0 });
    for await (const row of ws) {
      const vals = row.values.slice(1);
      if (!col) { // header row -> field index
        const H = vals.map((v) => norm(cellVal({ value: v }))); col = {};
        for (const [f, list] of Object.entries(ALIAS)) { for (const a of list) { const i = H.indexOf(a); if (i >= 0) { col[f] = i; break; } } }
        const missing = ['month', 'ean', 'qty'].filter((f) => col[f] === undefined);
        if (missing.length || (col.outletCode === undefined && col.siteCode === undefined)) { console.warn(`! sheet "${sheet}" skipped - cannot find: ${missing.join(', ') || 'an outlet/site column'}  (headers: ${H.join(' | ')})`); col = null; break; }
        console.log(`sheet "${sheet}": ` + Object.entries(col).map(([f, i]) => `${f}=${H[i]}`).join(', '));
        continue;
      }
      S.rows++;
      const g = (f) => (col[f] === undefined ? null : cellVal({ value: vals[col[f]] }));
      const month = toMonth(g('month')); if (!month) { S.noMonth++; continue; }
      const ean = eanOf(g('ean')); if (!ean) { S.noEan++; continue; }
      const q = num(g('qty')); if (q < 0) S.returns++;
      let mrp = num(g('mrp'));
      const rec = { sheet, month, ean, q, mrp, code: txt(g('outletCode')), site: txt(g('siteCode')), name: txt(g('outletName')), city: txt(g('city')), region: txt(g('region')), sku: txt(g('sku')) };
      if (rec.code && rec.site) siteToOutlet.set(`${sheet}|${rec.site}`, rec.code);
      if (!rec.code) { parked.push(rec); continue; }
      add(rec, S);
    }
  }
  // parked rows: resolve the outlet through the site code learned from other rows
  for (const rec of parked) {
    const S = stats[rec.sheet];
    rec.code = siteToOutlet.get(`${rec.sheet}|${rec.site}`) || (rec.site ? `${rec.sheet.replace(/[^A-Z]/gi, '').slice(0, 3).toUpperCase()}-${rec.site}` : '');
    if (!rec.code) { S.noOutlet++; continue; }
    add(rec, S);
  }
  finish();
}

function add(rec, S) {
  const k = `${rec.month}|${rec.code}|${rec.ean}`;
  let a = AGG.get(k); if (!a) { a = { qty: 0, mrp: new Map(), sheet: rec.sheet }; AGG.set(k, a); }
  a.qty += rec.q; if (rec.mrp > 0) bump(a.mrp, rec.mrp, Math.max(1, Math.abs(rec.q)));
  if (rec.mrp > 0) { let m = skuMrp.get(rec.ean); if (!m) skuMrp.set(rec.ean, (m = new Map())); bump(m, rec.mrp, Math.max(1, Math.abs(rec.q))); }
  if (rec.sku) { let m = skuNames.get(rec.ean); if (!m) skuNames.set(rec.ean, (m = new Map())); bump(m, rec.sku); }
  let o = outletInfo.get(rec.code); if (!o) outletInfo.set(rec.code, (o = { sheet: rec.sheet, names: new Map(), cities: new Map(), regions: new Map() }));
  if (rec.name) bump(o.names, rec.name); if (rec.city) bump(o.cities, rec.city); if (rec.region) bump(o.regions, rec.region);
  S.used++;
}

function finish() {
  // ---- resolve masters / fallbacks -------------------------------------------------------
  const outlet = {}; const unmappedO = [];
  for (const [code, o] of outletInfo) {
    const m = M.outlet.get(code);
    const city = txt(m?.['city']) || mode(o.cities) || (cityFromName(mode(o.names)) ? titleCase(cityFromName(mode(o.names))) : '');
    const fb = CITY_STATE[city.toLowerCase()];
    const region = txt(m?.['region']) || mode(o.regions) || fb?.[1] || 'Unmapped';
    const state = txt(m?.['state']) || fb?.[0] || 'Unmapped';
    const chain = txt(m?.['chain name']) || o.sheet;
    outlet[code] = {
      code, name: txt(m?.['outlet name']) || mode(o.names) || code, chain, type: txt(m?.['chain type']) || CHAIN_TYPE[norm(o.sheet)] || 'MBO',
      city: city || 'Unmapped', state, region, bgr: txt(m?.['bgr']) || (region !== 'Unmapped' ? `BGR ${region}` : ''), manpower: m?.['manpower'] ?? '', vis: m?.['visibility %'] ?? '',
    };
    if (!m || state === 'Unmapped') unmappedO.push(outlet[code]);
  }
  // pareto by sales value over the latest 12 months present
  const months = [...new Set([...AGG.keys()].map((k) => k.slice(0, 7)))].sort(); const last12 = new Set(months.slice(-12));
  for (const [k, a] of AGG) { const [mo, , e] = k.split('|'); if (!last12.has(mo)) continue; const mrp = mode(a.mrp) || mode(skuMrp.get(e) || new Map()) || 0; skuValue.set(e, (skuValue.get(e) || 0) + Math.max(0, a.qty) * mrp); }
  const rank = [...skuValue.entries()].sort((x, y) => y[1] - x[1]).map(([e]) => e);
  const sku = {}; const unmappedS = [];
  const allEans = new Set([...skuNames.keys(), ...M.sku.keys()]);
  for (const e of allEans) {
    const m = M.sku.get(e); const nm = txt(m?.['sku']) || titleCase(mode(skuNames.get(e) || new Map()) || e);
    const kw = KEYWORDS.find(([re]) => re.test(nm));
    const r = rank.indexOf(e);
    sku[e] = {
      ean: e, code: txt(m?.['sku code']) || e, name: nm, brand: txt(m?.['brand']) || 'Renee',
      cat: txt(m?.['category']) || kw?.[1] || 'Unmapped', sub: txt(m?.['sub category']) || kw?.[2] || 'Unmapped',
      pareto: txt(m?.['pareto']) || (r < 0 ? 'Others' : r < 10 ? 'Top 10' : r < 25 ? 'Top 25' : 'Others'), status: txt(m?.['status']) || 'Active',
      mrp: num(m?.['mrp']) || mode(skuMrp.get(e) || new Map()) || 0, launch: m?.['launch date'] ? (toMonth(m['launch date']) || '') : '', margin: m?.['margin %'] ?? '',
    };
    if (!m || sku[e].cat === 'Unmapped') unmappedS.push(sku[e]);
  }

  // ---- build rows (sales rows + stock-only rows) -------------------------------------------
  const rows = new Map();
  for (const [k, a] of AGG) {
    const [mo, oc, e] = k.split('|'); const qty = Math.max(0, a.qty);
    if (!keepZero && qty === 0 && !M.stock.has(k)) continue;
    rows.set(k, { mo, oc, e, qty, mrp: mode(a.mrp) || sku[e].mrp });
  }
  for (const k of M.stock.keys()) if (!rows.has(k)) { const [mo, oc, e] = k.split('|'); if (outlet[oc] && sku[e]) rows.set(k, { mo, oc, e, qty: 0, mrp: sku[e].mrp }); }
  // targets are per outlet-month: spread pro-rata over that outlet's sales value
  const ovalue = new Map(); for (const r of rows.values()) bump(ovalue, `${r.mo}|${r.oc}`, r.qty * r.mrp);
  const rowsByCount = new Map(); for (const r of rows.values()) bump(rowsByCount, `${r.mo}|${r.oc}`);

  const HEADER = ['Month', 'Outlet Code', 'Outlet Name', 'Chain Name', 'Chain Type', 'City', 'State', 'Region', 'SKU Code', 'SKU', 'Brand', 'Category', 'Sub Category', 'Pareto', 'Status',
    'MRP', 'OP Stock', 'CL Stock', 'Stock Qty', 'Tertiary Qty', 'Target Value', 'BGR', 'Order Qty', 'Filled Qty', 'Fill Rate %', 'Margin %', 'Manpower', 'Visibility %', 'Launch Date', 'Promo %'];
  fs.mkdirSync(outDir, { recursive: true });
  for (const f of fs.readdirSync(outDir)) if (/^\d{4}-\d{2}\.csv$/.test(f)) fs.unlinkSync(path.join(outDir, f));
  const byMonth = {};
  for (const r of rows.values()) (byMonth[r.mo] ||= []).push(r);
  let total = 0;
  for (const mo of Object.keys(byMonth).sort()) {
    const lines = [HEADER.join(',')];
    for (const r of byMonth[mo].sort((x, y) => x.oc.localeCompare(y.oc) || x.e.localeCompare(y.e))) {
      const o = outlet[r.oc], s = sku[r.e], st = M.stock.get(`${r.mo}|${r.oc}|${r.e}`);
      const tk = `${r.mo}|${r.oc}`; const tg = M.target.get(tk);
      const share = tg ? (ovalue.get(tk) > 0 ? (r.qty * r.mrp) / ovalue.get(tk) : 1 / rowsByCount.get(tk)) : null;
      lines.push([r.mo, o.code, o.name, o.chain, o.type, o.city, o.state, o.region, s.code, s.name, s.brand, s.cat, s.sub, s.pareto, s.status, r.mrp,
        st?.['op stock'] ?? '', st?.['cl stock'] ?? '', '', r.qty, share === null ? '' : Math.round(tg * share), o.bgr, st?.['order qty'] ?? '', st?.['filled qty'] ?? '', '',
        s.margin, o.manpower, o.vis, s.launch, ''].map(csvCell).join(','));
    }
    fs.writeFileSync(path.join(outDir, `${mo}.csv`), lines.join('\n') + '\n'); total += byMonth[mo].length;
  }

  // ---- reports -----------------------------------------------------------------------------
  // reports, biggest sales first, with the same column names masters.xlsx uses -> paste straight in
  const oSales = new Map(), sSales = new Map();
  for (const r of rows.values()) { bump(oSales, r.oc, r.qty * r.mrp); bump(sSales, r.e, r.qty * r.mrp); }
  const rep = (file, head, list) => fs.writeFileSync(path.join(outDir, '..', file), [head.map((h) => h[0]).join(','), ...list.map((x) => head.map((h) => csvCell(x[h[1]])).join(','))].join('\n') + '\n');
  rep('unmapped_outlets.csv', [['Outlet Code', 'code'], ['Outlet Name', 'name'], ['Chain Name', 'chain'], ['Chain Type', 'type'], ['City', 'city'], ['State', 'state'], ['Region', 'region'], ['Sales (MRP value)', 'sales']],
    unmappedO.map((o) => ({ ...o, sales: Math.round(oSales.get(o.code) || 0) })).sort((a, b) => b.sales - a.sales));
  rep('unmapped_skus.csv', [['EAN', 'ean'], ['SKU', 'name'], ['Category', 'cat'], ['Sub Category', 'sub'], ['MRP', 'mrp'], ['Sales (MRP value)', 'sales']],
    unmappedS.map((x) => ({ ...x, sales: Math.round(sSales.get(x.ean) || 0) })).sort((a, b) => b.sales - a.sales));

  console.log('\n--- per sheet -------------------------------------------------------------');
  for (const [s, v] of Object.entries(stats)) console.log(`${s.padEnd(16)} rows ${v.rows}  used ${v.used}  returns(neg qty) ${v.returns}  no-month ${v.noMonth}  no-EAN ${v.noEan}  no-outlet ${v.noOutlet}`);
  console.log(`\nwrote ${Object.keys(byMonth).length} monthly files (${months[0]} .. ${months[months.length - 1]}), ${total} rows -> ${outDir}/`);
  console.log(`outlets ${Object.keys(outlet).length} (${unmappedO.length} need a master entry)  |  SKUs ${Object.keys(sku).length} (${unmappedS.length} need a master entry)`);
  if (!M.stock.size) console.log('NOTE: no Stock & Orders sheet supplied -> CL Stock is blank, so Availability / Inventory pages will show every SKU as out of stock.');
  if (!M.target.size) console.log('NOTE: no Targets sheet supplied -> Target / Achievement stay empty.');
  if (total > 300000) console.log(`WARNING: ${total} rows is heavy for a free host. Set MAX_ROWS higher (default 400000) or keep only the last ~14 months.`);
  const gaps = []; for (let i = 1; i < months.length; i++) { const [y1, m1] = months[i - 1].split('-').map(Number), [y2, m2] = months[i].split('-').map(Number); if ((y2 - y1) * 12 + m2 - m1 > 1) gaps.push(`${months[i - 1]} -> ${months[i]}`); }
  if (gaps.length) console.log(`NOTE: months missing between: ${gaps.join(', ')}  (YoY / trend need continuous months)`);
}

main().catch((e) => { console.error(e); process.exit(1); });
