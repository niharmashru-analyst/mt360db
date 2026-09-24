import React from 'react';
import { HashRouter, Routes, Route } from 'react-router-dom';
import { FilterProvider } from './context/FilterContext.jsx';
import Sidebar from './components/Sidebar.jsx';
import TopFilterBar from './components/TopFilterBar.jsx';

import ExecutiveOverview from './pages/ExecutiveOverview.jsx';
import SalesAnalysis from './pages/SalesAnalysis.jsx';
import RetailerProfile from './pages/RetailerProfile.jsx';
import Geography from './pages/Geography.jsx';
import StoreProfile from './pages/StoreProfile.jsx';
import SkuProfile from './pages/SkuProfile.jsx';
import Availability from './pages/Availability.jsx';
import Inventory from './pages/Inventory.jsx';
import Distribution from './pages/Distribution.jsx';
import Assortment from './pages/Assortment.jsx';
import Pricing from './pages/Pricing.jsx';
import Variance from './pages/Variance.jsx';
import Pareto from './pages/Pareto.jsx';
import StorePerformanceMatrix from './pages/StorePerformanceMatrix.jsx';
import OpportunityEngine from './pages/OpportunityEngine.jsx';
import GrowthSimulator from './pages/GrowthSimulator.jsx';
import ActionCenter from './pages/ActionCenter.jsx';
import DataHealth from './pages/DataHealth.jsx';
import DecisionCenter from './pages/DecisionCenter.jsx';
import DecisionHistory from './pages/DecisionHistory.jsx';
import Analyst from './pages/Analyst.jsx';
import RootCauseAnalytics from './pages/RootCauseAnalytics.jsx';
import DecisionIntelligenceHome from './pages/DecisionIntelligenceHome.jsx';

export default function App() {
  return (
    <FilterProvider>
      <HashRouter>
        <div className="app-shell">
          <Sidebar />
          <div className="main-area">
            <TopFilterBar />
            <div className="page-content">
              <Routes>
                <Route path="/" element={<DecisionIntelligenceHome />} />
                <Route path="/decision-center" element={<DecisionCenter />} />
                <Route path="/executive" element={<ExecutiveOverview />} />
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
                <Route path="/decision-history" element={<DecisionHistory />} />
                <Route path="/analyst" element={<Analyst />} />
                <Route path="/root-cause" element={<RootCauseAnalytics />} />
                <Route path="/data-health" element={<DataHealth />} />
              </Routes>
            </div>
          </div>
        </div>
      </HashRouter>
    </FilterProvider>
  );
}
