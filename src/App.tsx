import React from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { AnimatePresence } from 'motion/react';

// Pages
import Login from './pages/Login';
import ForgotPassword from './pages/ForgotPassword';
import Dashboard from './pages/Dashboard';
import Pessoas from './pages/Pessoas';
import Inventory from './pages/Inventory';
import Sales from './pages/Sales';
import Finance from './pages/Finance';
import Settings from './pages/Settings';
import SuperAdmin from './pages/SuperAdmin';
import UserProfile from './pages/UserProfile';
import PDV from './pages/PDV';
import Mesas from './pages/Mesas';
import { DRE } from './pages/DRE';
import Reports from './pages/Reports';
import ReportPrint from './pages/ReportPrint';
import VendaPrint from './pages/VendaPrint';
import Subscription from './pages/Subscription';
import { StripeSuccess, StripePortalReturn } from './pages/StripeCallbacks';

// Components
import Layout from './components/Layout/Layout';
import ProtectedRoute from './components/Auth/ProtectedRoute';

const App = () => {
  return (
    <Router>
      <AnimatePresence mode="wait">
        <Routes>
          {/* Public Routes */}
          <Route path="/login" element={<Login />} />
          <Route path="/forgot-password" element={<ForgotPassword />} />
          
          {/* External Callbacks */}
          <Route path="/stripe/success" element={<StripeSuccess />} />
          <Route path="/stripe/portal/return" element={<StripePortalReturn />} />

          {/* Protected Routes */}
          <Route path="/" element={
            <ProtectedRoute>
              <Layout />
            </ProtectedRoute>
          }>
            <Route index element={<Navigate to="/dashboard" replace />} />
            <Route path="dashboard" element={<Dashboard />} />
            <Route path="pessoas" element={<Pessoas />} />
            <Route path="estoque" element={<Inventory />} />
            <Route path="vendas" element={<Sales mode="venda" />} />
            <Route path="os" element={<Sales mode="os" />} />
            <Route path="financeiro" element={<Finance />} />
            <Route path="pdv" element={<PDV />} />
            <Route path="mesas" element={<Mesas />} />
            <Route path="dre" element={<DRE />} />
            <Route path="reports/:type" element={<Reports />} />
            <Route path="settings" element={<Settings />} />
            <Route path="profile" element={<UserProfile />} />
            
            {/* SuperAdmin Routes */}
            <Route path="admin" element={
              <ProtectedRoute requireSuperAdmin>
                <SuperAdmin />
              </ProtectedRoute>
            } />
          </Route>

          {/* Special Pages (Subscription/Print) */}
          <Route path="/subscription" element={
            <ProtectedRoute>
              <Subscription />
            </ProtectedRoute>
          } />
          <Route path="/print/report/:type" element={<ReportPrint />} />
          <Route path="/print/venda/:id" element={<VendaPrint />} />

          {/* Fallback */}
          <Route path="*" element={<Navigate to="/dashboard" replace />} />
        </Routes>
      </AnimatePresence>
    </Router>
  );
};

export default App;
