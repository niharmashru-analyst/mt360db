import React, { lazy, Suspense } from 'react';
import { HashRouter, Routes, Route } from 'react-router-dom';
import { FilterProvider } from './context/FilterContext.jsx';
import Sidebar from './components/Sidebar.jsx';
import TopFilterBar from './components/TopFilterBar.jsx';

const ExecutiveOverview = lazy(() => import('./pages/ExecutiveOverview.jsx'));
const SalesAnalysis = lazy(() => import('./pages/SalesAnalysis.jsx'));
const RetailerProfile = lazy(() => import('./pages/RetailerProfile.jsx'));
const Geography = lazy(() => import('./pages/Geography.jsx'));
const StoreProfile = lazy(() => import('./pages/StoreProfile.jsx'));
const SkuProfile = lazy(() => import('./pages/SkuProfile.jsx'));
const Availability = lazy(() => import('./pages/Availability.jsx'));
const Inventory = lazy(() => import('./pages/Inventory.jsx'));
const Distribution = lazy(() => import('./pages/Distribution.jsx'));
const Assortment = lazy(() => import('./pages/Assortment.jsx'));
const Pricing = lazy(() => import('./pages/Pricing.jsx'));
const Variance = lazy(() => import('./pages/Variance.jsx'));
const Pareto = lazy(() => import('./pages/Pareto.jsx'));
const StorePerformanceMatrix = lazy(() => import('./pages/StorePerformanceMatrix.jsx'));
const OpportunityEngine = lazy(() => import('./pages/OpportunityEngine.jsx'));
const GrowthSimulator = lazy(() => import('./pages/GrowthSimulator.jsx'));
const ActionCenter = lazy(() => import('./pages/ActionCenter.jsx'));
const DataHealth = lazy(() => import('./pages/DataHealth.jsx'));
const BusinessReview = lazy(() => import('./pages/BusinessReview.jsx'));
const PeriodComparison = lazy(() => import('./pages/PeriodComparison.jsx'));
const IntelligenceHub = lazy(() => import('./pages/IntelligenceHub.jsx'));

export default function App() {
  return (
    <FilterProvider>
      <HashRouter>
        <div className="app-shell">
          <Sidebar />
          <div className="main-area">
            <TopFilterBar />
            <div className="page-content">
              <Suspense fallback={<div className="page-route-loading"><div className="spinner"/><p>Loading view…</p></div>}>
                <Routes>
                <Route path="/" element={<ExecutiveOverview />} />
                <Route path="/period" element={<PeriodComparison />} />
                <Route path="/intelligence" element={<IntelligenceHub />} />
                <Route path="/business-review" element={<BusinessReview />} />
                <Route path="/sales" element={<SalesAnalysis />} />
                <Route path="/retailer" element={<RetailerProfile />} />
                <Route path="/geography" element={<Geography />} />
                <Route path="/store" element={<StoreProfile />} />
                <Route path="/sku" element={<SkuProfile />} />
                <Route path="/availability" element={<Availability />} />
                <Route path="/inventory" element={<Inventory />} />
                <Route path="/distribution" element={<Distribution />} />
                <Route path="/assortment" element={<Assortment />} />
                <Route path="/pricing" element={<Pricing />} />
                <Route path="/variance" element={<Variance />} />
                <Route path="/pareto" element={<Pareto />} />
                <Route path="/store-matrix" element={<StorePerformanceMatrix />} />
                <Route path="/opportunity-engine" element={<OpportunityEngine />} />
                <Route path="/growth-simulator" element={<GrowthSimulator />} />
                <Route path="/action-center" element={<ActionCenter />} />
                <Route path="/data-health" element={<DataHealth />} />
                </Routes>
              </Suspense>
            </div>
          </div>
        </div>
      </HashRouter>
    </FilterProvider>
  );
}
