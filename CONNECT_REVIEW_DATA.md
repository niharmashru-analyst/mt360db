# Connecting `review_data.xlsx` to MT 360

Your file has **one tab per retailer** (Health & Glow, Shoppers Stop, Dabur, Lifestyle) with
transaction-level sales and different column names in each tab. The dashboard reads one clean
monthly file per month. `tools/review_to_monthly.mjs` is the bridge. It is free and runs on your PC.

```
review_data.xlsx  (4 retailer tabs, raw lines)  ─┐
masters.xlsx      (outlets, SKUs, targets, stock) ├─► npm run convert ─► data/2025-04.csv … ─► dashboard
                                                 ─┘
```

## One-time setup
1. Install Node 18+ and run `npm install` in this folder.
2. Try it with the included dummy files (nothing else needed):
   ```
   npm run convert -- tools/sample/review_data.xlsx --masters tools/sample/masters.xlsx --out data
   npm run build
   npm start          # open http://localhost:3000
   ```

## Every month (about 2 minutes)
1. Add the new month's rows to each tab of your **real** `review_data.xlsx` (keep it cumulative, because every run rebuilds all months).
2. Run
   ```
   npm run convert -- review_data.xlsx --masters masters.xlsx --out data
   ```
3. Read the summary it prints. Then open **`unmapped_outlets.csv`** and **`unmapped_skus.csv`** (biggest sales first).
   They use the same column names as `masters.xlsx`, so fill State / Region / Category and paste the rows into the
   matching tab of `masters.xlsx`. Run step 2 again. Repeat until the lists are empty (or short enough to ignore).
4. `npm run build` then `npm start`. For a hosted copy, commit the new `data/*.csv` and redeploy, then press **Refresh Data**.

## What the converter does to your sheets
| Retailer tab | Month | Outlet code | Qty | MRP |
|---|---|---|---|---|
| Health & Glow | `Month` | `Outlet Code` | `Sales Qty` | `MRP` |
| Shoppers Stop | `Mnth & Year` | `Outlet Code` | `Qty in unit of entry` | `MRP` |
| Dabur | `Mnth & Year` | `OL Code` | `Qty in unit of entry` | `MRP` |
| Lifestyle | `Month` (text like `April'25`) | `Ol Code` | `QTY` | `SALMRP` |

Columns are matched by name, so reordered columns or a new tab with similar headers also work. If a tab is skipped,
the script prints the headers it saw. Add the new spelling to `ALIAS` at the top of the script.

* **Sales value is recomputed** as Qty × MRP (same rule as the dashboard). Lifestyle's `SALNOT/SALRRP` are not used.
* Transaction lines are **summed per month × outlet × EAN**. Returns (negative qty) net off; if the net is ≤ 0 the row is dropped.
* **Blank outlet codes** are filled from the site / location code seen on other rows of the same tab.
  If there is none, a code like `DAB-1906` is created, so the sales are kept.
* **MRP = 0 or blank** uses the most common MRP for that EAN.
* **SKU name** per EAN is the most common description across retailers, cleaned to Title Case.
* **Pareto** is computed automatically from the last 12 months: Top 10, Top 25, Others.
* **State / Region** come from `masters.xlsx`. Otherwise they are guessed from the City column or from the outlet name
  (`HG-ADYAR-CHE` → Chennai). **Category** is guessed from the product name. Guesses are only a fallback.

## `masters.xlsx` tabs (all optional, but the dashboard is much richer with them)
| Tab | Columns | Needed for |
|---|---|---|
| Outlet Master | Outlet Code, Outlet Name, Chain Name, Chain Type, City, State, Region, BGR, Manpower, Visibility % | Geography, Retailer, BGR, Manpower, Visibility |
| SKU Master | EAN, SKU Code, SKU, Brand, Category, Sub Category, Status, MRP, Launch Date, Margin % | Category/Pareto views, Launch tracker, Margin |
| Targets | Month, Outlet Code, Target Value | Achievement %, Variance (spread over that outlet's SKUs by sales) |
| Stock & Orders | Month, Outlet Code, EAN, OP Stock, CL Stock, Order Qty, Filled Qty | Availability / OOS, Inventory, NOD, Fill rate |

**Your current `review_data.xlsx` has no stock, target or order data.** Without those tabs the Availability, Inventory and
Variance pages cannot be meaningful (the script warns you). Sales pages work from the review file alone.

## Test on your real file (done during build)
* 4 tabs, about 418k transaction lines → **230,191** monthly rows, about 33 seconds, under 1 GB RAM.
* Months present: **Apr–Sep 2025 and Apr–Jun 2026** (Jul–Sep 2026 are missing; Lifestyle also has no Aug-2025).
  YoY, QTD and YTD comparisons only exist for Apr–Jun 2026 until those months are added.
* Without masters about 80% of sales got a State and 95% a Category from the fallbacks. The rest are in the unmapped lists.

## Size warning (important for free hosting)
230k rows load into the server as about **1.6 GB RAM** and about 150 MB of JSON for the browser (7 MB compressed).
That is fine on your own PC or an office machine. It will **not fit a free 512 MB host** (Render free).
Options: run it on a PC and share on your network, or reduce the rows (keep only the latest 12–13 months), or move to
server-side summaries. Say the word and I will build that next.
