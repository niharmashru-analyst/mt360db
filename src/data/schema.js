// ============================================================================
// CANONICAL SCHEMA & THRESHOLDS
// This is the single source of truth for field names and business rules.
// Change thresholds here and every page updates automatically.
// ============================================================================

export const CATEGORIES = ['Skincare', 'Makeup', 'Haircare', 'Fragrance', 'Bath & Body'];

export const SUB_CATEGORIES = {
  Skincare: ['Moisturizer', 'Serum', 'Cleanser', 'Sunscreen'],
  Makeup: ['Foundation', 'Lipstick', 'Mascara', 'Eyeliner'],
  Haircare: ['Shampoo', 'Conditioner', 'Hair Oil'],
  Fragrance: ['EDP', 'EDT', 'Body Mist'],
  'Bath & Body': ['Body Lotion', 'Body Wash', 'Hand Cream'],
};

export const BRANDS = ['Lumina', 'Verde', 'Blush & Co', 'Northline'];

export const CHAIN_TYPES = ['EBO', 'MBO', 'Department Store', 'Airport', 'Kiosk'];

export const CHAINS = [
  { name: 'Shoppers Stop', type: 'Department Store' },
  { name: 'Nykaa Luxe', type: 'MBO' },
  { name: 'Reliance Beauty', type: 'Department Store' },
  { name: 'Sephora', type: 'MBO' },
  { name: 'Renee EBO', type: 'EBO' },
  { name: 'Airport Retail Co', type: 'Airport' },
];

export const REGIONS = {
  North: { states: ['Delhi', 'Punjab', 'UP'] },
  West: { states: ['Maharashtra', 'Gujarat'] },
  South: { states: ['Karnataka', 'Tamil Nadu', 'Telangana'] },
  East: { states: ['West Bengal', 'Odisha'] },
};

export const CITY_BY_STATE = {
  Delhi: ['New Delhi'],
  Punjab: ['Chandigarh', 'Ludhiana'],
  UP: ['Lucknow', 'Noida'],
  Maharashtra: ['Mumbai', 'Pune'],
  Gujarat: ['Ahmedabad', 'Surat'],
  Karnataka: ['Bangalore', 'Mysore'],
  'Tamil Nadu': ['Chennai', 'Coimbatore'],
  Telangana: ['Hyderabad'],
  'West Bengal': ['Kolkata'],
  Odisha: ['Bhubaneswar'],
};

export const PARETO_TIERS = ['Top 10', 'Top 25', 'Others'];

export const STATUS_OPTIONS = ['Active', 'Inactive', 'Delisted'];

// Business thresholds — tune these based on your category norms
export const THRESHOLDS = {
  NOD_LOW: 10, // below this = Low Stock / risk of OOS
  NOD_HIGH: 60, // above this = Excess Stock
  OOS_STOCK_QTY: 0, // stock qty at/below this while listed = OOS
  VARIANCE_ALERT_PCT: 5, // |variance %| above this shows in exception list
  HIGH_DISCOUNT_PCT: 20, // promo % above this flagged as "high discount"
};

export const FILTER_FIELDS = [
  'month', 'region', 'state', 'city', 'chainName', 'chainType',
  'category', 'subCategory', 'brand', 'sku', 'pareto',
];
