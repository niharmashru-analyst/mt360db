// ============================================================================
// DATA LOADER — THE ONE FILE YOU EDIT TO GO LIVE WITH REAL DATA
// ============================================================================
// Right now this returns generated mock data shaped exactly like your real
// fields (Month, Outlet Code, Chain Name, SKU, Sales Qty, Stock Qty, etc.)
//
// TO SWITCH TO YOUR REAL ONEDRIVE EXCEL FILE:
//   1. Get a direct-download / embed link for your OneDrive Excel file
//      (Share > Copy Link, then convert to a direct-download link, or use
//      the Microsoft Graph API if you want it fully live).
//   2. Install SheetJS:  npm install xlsx
//   3. Replace the body of loadData() below with something like:
//
//      import * as XLSX from 'xlsx';
//
//      export async function loadData() {
//        const res = await fetch(import.meta.env.VITE_ONEDRIVE_EXCEL_URL);
//        const buf = await res.arrayBuffer();
//        const wb = XLSX.read(buf, { type: 'array' });
//        const sheet = wb.Sheets[wb.SheetNames[0]];
//        const rows = XLSX.utils.sheet_to_json(sheet);
//        // Map your Excel column headers to the field names metrics.js expects:
//        const records = rows.map((row) => ({
//          month: row['Month'],
//          outletCode: row['Outlet Code'],
//          outletName: row['Outlet Name'],
//          chainName: row['Chain Name'],
//          chainType: row['Chain Type'],
//          city: row['City'],
//          state: row['State'],
//          region: row['Region'],
//          skuCode: row['SKU Code'],
//          sku: row['SKU'],
//          brand: row['Brand'],
//          category: row['Category'],
//          subCategory: row['Sub Category'],
//          pareto: row['Pareto'],
//          status: row['Status'],
//          mrp: Number(row['MRP']),
//          salesQty: Number(row['Sales Qty']),
//          salesValue: Number(row['Sales Value']),
//          opStock: Number(row['OP Stock']),
//          clStock: Number(row['CL Stock']),
//          stockQty: Number(row['Stock Qty'] ?? row['CL Stock']),
//          primaryQty: Number(row['Primary Qty']),
//          primaryValue: Number(row['Primary Value']),
//          tertiaryQty: Number(row['Tertiary Qty'] ?? row['Sales Qty']),
//          tertiaryValue: Number(row['Tertiary Value'] ?? row['Sales Value']),
//          targetValue: Number(row['Targets']),
//          marginPct: Number(row['Margins']),
//          promoPct: Number(row['Promos %']),
//          listed: row['Distribution'] === 'Listed' || row['Distribution'] === 'Y',
//        }));
//        const months = [...new Set(records.map((r) => r.month))].sort();
//        return { records, months, storeMaster: [], skuMaster: [], listingMatrix: [] };
//      }
//
//   4. Nothing else in the app changes — every page reads from `records`
//      via the functions in metrics.js.
// ============================================================================

import { generateMockData } from './generateMockData.js';

let cachedData = null;

export function loadData() {
  if (!cachedData) {
    cachedData = generateMockData();
  }
  return cachedData;
}
