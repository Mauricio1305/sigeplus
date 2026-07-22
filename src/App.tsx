import React from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { AnimatePresence } from 'motion/react';
import { Package } from 'lucide-react';

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
import Agenda from './pages/Agenda';
import PDV from './pages/PDV';
import Mesas from './pages/Mesas';
import { DRE } from './pages/DRE';
import Reports from './pages/Reports';
import ReportPrint from './pages/ReportPrint';
import VendaPrint from './pages/VendaPrint';
import Subscription from './pages/Subscription';
import { StripeSuccess, StripePortalReturn } from './pages/StripeCallbacks';
import Home from './pages/Home';

// Components
import Layout from './components/Layout/Layout';
import ProtectedRoute from './components/Auth/ProtectedRoute';
import { useAuthStore } from './store/authStore';

const ModuleGuard = ({ module, children }: { module: string, children: React.ReactNode }) => {
  const user = useAuthStore(state => state.user);
  if (!user) return <Navigate to="/login" replace />;
  if (user.perfil === 'superadmin') return <>{children}</>;
  
  // Base modules always accessible
  if (module === 'home' || module === 'inicio' || module === 'meuplano') {
    return <>{children}</>;
  }

  // Tier 1: Check Company Plan Modules
  let planHasModule = false;
  if (user.tenant_id === 'system' || user.tenant_id === 'System' || !user.modulos || user.modulos.length === 0) {
    planHasModule = true; // system tenant or fallback if no plan modules array specified
  } else {
    planHasModule = user.modulos.includes(module);
  }
  
  if (!planHasModule) {
    return (
      <div className="flex flex-col items-center justify-center p-12 bg-white rounded-3xl border border-slate-100 shadow-sm text-center">
        <div className="bg-rose-50 p-4 rounded-full mb-6">
          <Package className="w-12 h-12 text-rose-500" />
        </div>
        <h2 className="text-2xl font-black text-slate-900 mb-2">Módulo Não Contratado</h2>
        <p className="text-slate-500 max-w-md mx-auto mb-8">
          O plano da sua empresa não inclui o módulo <strong>{module}</strong>. 
          Altere ou atualize a assinatura para liberar este recurso.
        </p>
        <button 
          onClick={() => window.history.back()}
          className="bg-slate-900 text-white px-8 py-3 rounded-2xl font-bold hover:bg-slate-800 transition-all"
        >
          Voltar
        </button>
      </div>
    );
  }

  // Tier 2: Check User Group Permissions
  let hasGroupAccess = false;
  if (user.perfil === 'admin') {
    hasGroupAccess = true; // Admin/Master group has access to all contracted modules
  } else if (user.permissoes && typeof user.permissoes[module] === 'object') {
    hasGroupAccess = user.permissoes[module].acessar === true;
  }

  if (!hasGroupAccess) {
    return (
      <div className="flex flex-col items-center justify-center p-12 bg-white rounded-3xl border border-slate-100 shadow-sm text-center">
        <div className="bg-rose-50 p-4 rounded-full mb-6">
          <Package className="w-12 h-12 text-rose-500" />
        </div>
        <h2 className="text-2xl font-black text-slate-900 mb-2">Acesso Negado</h2>
        <p className="text-slate-500 max-w-md mx-auto mb-8">
          Seu grupo de usuário não possui permissão para acessar o módulo <strong>{module}</strong>. 
          Entre em contato com o administrador do sistema.
        </p>
        <button 
          onClick={() => window.history.back()}
          className="bg-slate-900 text-white px-8 py-3 rounded-2xl font-bold hover:bg-slate-800 transition-all"
        >
          Voltar
        </button>
      </div>
    );
  }

  return <>{children}</>;
};

const App = () => {
  React.useEffect(() => {
    const token = useAuthStore.getState().token;
    if (token) {
      fetch('/api/auth/me', {
        headers: { Authorization: `Bearer ${token}` }
      })
        .then(res => (res.ok && res.headers.get('content-type')?.includes('application/json')) ? res.json() : null)
        .then(data => {
          if (data && data.user) {
            useAuthStore.getState().setAuth(data.user, token);
          }
        })
        .catch(() => {});
    }
  }, []);

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
            <Route index element={<Navigate to="/home" replace />} />
            <Route path="home" element={<ModuleGuard module="home"><Home /></ModuleGuard>} />
            <Route path="dashboard" element={<ModuleGuard module="dashboard"><Dashboard /></ModuleGuard>} />
            <Route path="agenda" element={<ModuleGuard module="agenda"><Agenda /></ModuleGuard>} />
            <Route path="pessoas" element={<ModuleGuard module="cadastros"><Pessoas /></ModuleGuard>} />
            <Route path="estoque" element={<ModuleGuard module="estoque"><Inventory /></ModuleGuard>} />
            <Route path="vendas" element={<ModuleGuard module="vendas"><Sales mode="venda" /></ModuleGuard>} />
            <Route path="os" element={<ModuleGuard module="os"><Sales mode="os" /></ModuleGuard>} />
            <Route path="financeiro" element={<ModuleGuard module="financeiro"><Finance /></ModuleGuard>} />
            <Route path="pdv" element={<ModuleGuard module="pdv"><PDV /></ModuleGuard>} />
            <Route path="mesas" element={<ModuleGuard module="mesas"><Mesas /></ModuleGuard>} />
            <Route path="dre" element={<ModuleGuard module="financeiro"><DRE /></ModuleGuard>} />
            <Route path="reports/:type" element={<Reports />} />
            <Route path="settings" element={<ModuleGuard module="configuracoes"><Settings /></ModuleGuard>} />
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
          <Route path="*" element={<Navigate to="/home" replace />} />
        </Routes>
      </AnimatePresence>
    </Router>
  );
};

export default App;
