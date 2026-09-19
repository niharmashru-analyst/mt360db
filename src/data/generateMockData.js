// ============================================================================
// MOCK DATA GENERATOR
// Produces a realistic dataset shaped exactly like your real fields.
// ============================================================================
// TO SWITCH TO REAL DATA LATER:
//   Replace the call to generateMockData() in loadData.js with a function
//   that fetches/parses your OneDrive Excel export (via SheetJS `xlsx`) and
//   returns data in this exact same shape: { records, months, storeMaster,
//   skuMaster, listingMatrix }. Nothing else in the app needs to change —
//   every page reads from `records` via the metrics.js helper functions.
// ============================================================================

import {
  CATEGORIES, SUB_CATEGORIES, BRANDS, CHAINS, REGIONS, CITY_BY_STATE,
  PARETO_TIERS, STATUS_OPTIONS,
} from './schema.js';

function seededRandom(seed) {
  let s = seed % 2147483647;
  if (s <= 0) s += 2147483646;
  return function () {
    s = (s * 16807) % 2147483647;
    return (s - 1) / 2147483646;
  };
}

const rand = seededRandom(42);
function randRange(min, max) { return min + rand() * (max - min); }
function randInt(min, max) { return Math.floor(randRange(min, max + 1)); }
function pick(arr) { return arr[randInt(0, arr.length - 1)]; }
function round2(n) { return Math.round(n * 100) / 100; }

// ---------------------------------------------------------------------------
// 1. Build Store Master
// ---------------------------------------------------------------------------
function buildStoreMaster() {
  const stores = [];
  let outletCounter = 1;
  const regionNames = Object.keys(REGIONS);

  CHAINS.forEach((chain) => {
    const outletCount = randInt(8, 14);
    for (let i = 0; i < outletCount; i++) {
      const region = pick(regionNames);
      const state = pick(REGIONS[region].states);
      const city = pick(CITY_BY_STATE[state]);
      stores.push({
        outletCode: `OUT${String(outletCounter).padStart(4, '0')}`,
        outletName: `${chain.name} - ${city} ${i + 1}`,
        chainName: chain.name,
        chainType: chain.type,
        city,
        state,
        region,
      });
      outletCounter++;
    }
  });
  return stores;
}

// ---------------------------------------------------------------------------
// 2. Build SKU Master
// ---------------------------------------------------------------------------
function buildSkuMaster() {
  const skus = [];
  let skuCounter = 1;
  const marginByCategory = {
    Skincare: 0.45, Makeup: 0.50, Haircare: 0.35, Fragrance: 0.55, 'Bath & Body': 0.40,
  };

  CATEGORIES.forEach((category) => {
    const subCats = SUB_CATEGORIES[category];
    subCats.forEach((subCategory) => {
      const skuCount = randInt(2, 4);
      for (let i = 0; i < skuCount; i++) {
        const brand = pick(BRANDS);
        const mrp = round2(randRange(199, 2499));
        // assign pareto tier with realistic distribution: fewer Top10, more Others
        const paretoRoll = rand();
        const pareto = paretoRoll < 0.12 ? 'Top 10' : paretoRoll < 0.35 ? 'Top 25' : 'Others';
        // base monthly velocity per outlet — Top SKUs sell faster
        const baseVelocity = pareto === 'Top 10' ? randRange(8, 20)
          : pareto === 'Top 25' ? randRange(3, 9)
          : randRange(0.3, 3);
        const statusRoll = rand();
        const status = statusRoll < 0.88 ? 'Active' : statusRoll < 0.96 ? 'Inactive' : 'Delisted';

        skus.push({
          skuCode: `SKU${String(skuCounter).padStart(4, '0')}`,
          sku: `${brand} ${subCategory} ${String.fromCharCode(65 + i)}`,
          brand,
          category,
          subCategory,
          mrp,
          pareto,
          status,
          baseVelocity,
          marginPct: round2((marginByCategory[category] + randRange(-0.05, 0.05)) * 100),
        });
        skuCounter++;
      }
    });
  });
  return skus;
}

// ---------------------------------------------------------------------------
// 3. Build Listing Matrix (which SKUs are listed at which outlets)
// ---------------------------------------------------------------------------
function buildListingMatrix(stores, skus) {
  const matrix = [];
  stores.forEach((store) => {
    skus.forEach((sku) => {
      // Top SKUs more likely to be listed everywhere; tail SKUs more selective
      const listProb = sku.pareto === 'Top 10' ? 0.9 : sku.pareto === 'Top 25' ? 0.7 : 0.45;
      const listed = sku.status !== 'Delisted' && rand() < listProb;
      matrix.push({ outletCode: store.outletCode, skuCode: sku.skuCode, listed });
    });
  });
  return matrix;
}

// ---------------------------------------------------------------------------
// 4. Build monthly transactions for listed combos
// ---------------------------------------------------------------------------
function buildMonths(count) {
  const months = [];
  const now = new Date(2026, 8, 1); // Sep 2026, matches "current date" context
  for (let i = count - 1; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    months.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`);
  }
  return months;
}

function seasonalFactor(monthIndex) {
  // simple festive/season bump around Oct-Nov (index depends on position), softened
  const m = monthIndex % 12;
  if (m === 9 || m === 10) return 1.35; // Oct/Nov festive bump
  if (m === 0) return 0.85; // Jan dip
  return 1 + Math.sin((m / 12) * Math.PI * 2) * 0.08;
}

function buildTransactions(stores, skus, listingMatrix, months) {
  const records = [];
  // running stock state per outlet-sku
  const stockState = {};
  const TARGET_NOD_DAYS = 25; // replenishment aims to keep ~25 days of cover

  const listedSet = new Set();
  listingMatrix.forEach((l) => {
    if (l.listed) listedSet.add(`${l.outletCode}|${l.skuCode}`);
  });

  const storeMultiplier = {};
  stores.forEach((s) => { storeMultiplier[s.outletCode] = randRange(0.6, 1.8); });

  months.forEach((month, mIdx) => {
    const monthGrowthDrift = 1 + (mIdx / months.length) * 0.15; // slow overall growth over time

    stores.forEach((store) => {
      skus.forEach((sku) => {
        const key = `${store.outletCode}|${sku.skuCode}`;
        if (!listedSet.has(key)) return; // not listed here — shows up as distribution gap instead

        if (!stockState[key]) {
          stockState[key] = { opStock: Math.round(sku.baseVelocity * (TARGET_NOD_DAYS / 30)) };
        }

        const seasonal = seasonalFactor(mIdx);
        const noise = randRange(0.55, 1.45);
        const stockoutEvent = rand() < 0.09; // ~9% of combos hit a genuine supply failure this month
        const excessEvent = rand() < 0.06; // ~6% get deliberately over-supplied

        const opStock = stockState[key].opStock;
        const expectedSalesQty = Math.max(
          0, Math.round(sku.baseVelocity * storeMultiplier[store.outletCode] * seasonal * noise * monthGrowthDrift)
        );

        // Order-up-to replenishment: order enough to cover this month's expected demand
        // plus leave a target closing cover, adjusted for what's already on hand.
        const desiredClosing = expectedSalesQty * (TARGET_NOD_DAYS / 30);
        let primaryQty = Math.round(Math.max(0, desiredClosing + expectedSalesQty - opStock));

        if (excessEvent) primaryQty = Math.round(primaryQty * randRange(2.5, 4)); // deliberate over-supply
        if (stockoutEvent) primaryQty = Math.round(primaryQty * randRange(0.02, 0.15)); // supply failure

        const available = opStock + primaryQty;
        const salesQty = Math.min(expectedSalesQty, available); // can't sell what isn't there
        const trueClose = available - salesQty; // physical stock — used to carry forward to next month

        // ~4% of combos have a reporting/count discrepancy (shrinkage, miscount, etc.)
        // — this is what the Variance Analysis page is designed to catch.
        const hasVarianceEvent = rand() < 0.04;
        const clStock = hasVarianceEvent ? Math.max(0, Math.round(trueClose * randRange(0.85, 1.15))) : trueClose;

        const promoPct = round2(randRange(5, 28));
        const discountFactor = 1 - promoPct / 100 * 0.4; // promo doesn't fully hit realized price
        const realizedAsp = round2(sku.mrp * discountFactor * randRange(0.97, 1.02));
        const salesValue = round2(salesQty * realizedAsp);

        // Primary value uses MRP-based costing proxy
        const primaryValue = round2(primaryQty * sku.mrp * 0.55); // approx trade price

        // Target: roughly historical-ish, some months over/under
        const targetValue = round2(salesValue * randRange(0.82, 1.18) / (excessEvent || stockoutEvent ? 1.1 : 1));

        records.push({
          month,
          outletCode: store.outletCode,
          outletName: store.outletName,
          chainName: store.chainName,
          chainType: store.chainType,
          city: store.city,
          state: store.state,
          region: store.region,
          skuCode: sku.skuCode,
          sku: sku.sku,
          brand: sku.brand,
          category: sku.category,
          subCategory: sku.subCategory,
          pareto: sku.pareto,
          status: sku.status,
          mrp: sku.mrp,
          salesQty,
          salesValue,
          opStock,
          clStock,
          primaryQty,
          primaryValue,
          tertiaryQty: salesQty,
          tertiaryValue: salesValue,
          stockQty: clStock,
          targetValue,
          marginPct: sku.marginPct,
          promoPct,
          listed: true,
        });

        stockState[key].opStock = trueClose;
      });
    });
  });

  return records;
}

// ---------------------------------------------------------------------------
// Main export
// ---------------------------------------------------------------------------
export function generateMockData() {
  const stores = buildStoreMaster();
  const skus = buildSkuMaster();
  const listingMatrix = buildListingMatrix(stores, skus);
  const months = buildMonths(24); // 2 years so every current month has an LY comparison
  const records = buildTransactions(stores, skus, listingMatrix, months);

  return {
    records,
    months,
    storeMaster: stores,
    skuMaster: skus,
    listingMatrix,
  };
}
