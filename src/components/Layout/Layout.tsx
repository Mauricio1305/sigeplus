import React, { useState, useEffect } from 'react';
import { 
  TrendingUp, 
  LogOut, 
  Menu, 
  X,
  ChevronRight,
  ChevronDown,
  LayoutDashboard,
  Package,
  Users,
  DollarSign,
  ShoppingCart,
  Wrench,
  Coffee,
  MonitorPlay,
  FileText,
  Settings as SettingsIcon,
  AlertCircle
} from 'lucide-react';
import { Link, useLocation, useNavigate, Outlet } from 'react-router-dom';
import { motion, AnimatePresence } from 'motion/react';
import { useAuthStore } from '../../store/authStore';

const SubscriptionWarning = () => {
  const user = useAuthStore(state => state.user);
  const navigate = useNavigate();
  if (!user || user.perfil === 'superadmin') return null;

  let daysSinceExpiration = -1;
  if (user.vencimento_assinatura) {
    const expirationDate = new Date(user.vencimento_assinatura);
    const today = new Date();
    daysSinceExpiration = Math.floor((today.getTime() - expirationDate.getTime()) / (1000 * 60 * 60 * 24));
  }

  // Se a conta já tiver sido cancelada explicitamente, mostramos um aviso
  const isCanceled = user.status_assinatura === 'cancelado';
  const isCancellationRequested = user.status_assinatura === 'Cancelamento Solicitado';
  
  // Condição para mostrar aviso: 
  // - Menos de 7 dias para expirar (aviso antecipado)
  // - Vencido (mesmo com os 10 dias de tolerância)
  // - Cancelamento já efetivado ou solicitado
  const today = new Date();
  const expirationDate = user.vencimento_assinatura ? new Date(user.vencimento_assinatura) : null;
  const isExpiredSoon = expirationDate && (expirationDate.getTime() - today.getTime()) < (7 * 24 * 60 * 60 * 1000);
  const isVencido = expirationDate && expirationDate < today;

  if (!isVencido && !isCanceled && !isCancellationRequested && !isExpiredSoon) return null;

  const isBlocked = isCanceled || daysSinceExpiration > 10;

  return (
    <div className={`fixed bottom-4 right-4 z-[9999] max-w-sm w-full transition-all duration-500 animate-in slide-in-from-bottom-10`}>
      <motion.div 
        initial={{ scale: 0.9, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        className={`p-6 rounded-3xl shadow-2xl border ${isBlocked ? 'bg-rose-600 border-rose-500 shadow-rose-200' : 'bg-amber-500 border-amber-400 shadow-amber-200'} text-white`}
      >
        <div className="flex items-center gap-3 mb-4">
          <div className="bg-white/20 p-2 rounded-xl">
            <AlertCircle className="w-6 h-6" />
          </div>
          <h4 className="font-black uppercase tracking-tight">
            {isBlocked ? 'Assinatura Bloqueada' : 'Aviso de Assinatura'}
          </h4>
        </div>
        <p className="text-sm font-medium mb-6 text-white/90 leading-relaxed">
          {isBlocked
            ? 'Sua assinatura expirou ou foi cancelada e o acesso foi bloqueado.'
            : isCancellationRequested
              ? `Acesso liberado até ${new Date(user.vencimento_assinatura).toLocaleDateString()}, porém a renovação automática está desativada no Stripe.`
              : isVencido
                ? `Sua assinatura está vencida há ${daysSinceExpiration} dias. Em breve o acesso será bloqueado.`
                : isExpiredSoon 
                  ? `Sua assinatura vencerá em breve (${new Date(user.vencimento_assinatura).toLocaleDateString()}). Verifique seus pagamentos.`
                  : 'Há um problema com sua assinatura. Verifique os detalhes do plano.'}
        </p>
        <button
          onClick={() => navigate('/subscription')}
          className="w-full bg-white text-slate-900 py-3 rounded-2xl font-black text-sm uppercase tracking-wider hover:bg-slate-50 transition-all shadow-lg active:scale-95"
        >
          Ir para Assinatura
        </button>
      </motion.div>
    </div>
  );
};

const SidebarItem = ({ icon: Icon, label, to, active, collapsed }: any) => (
  <Link 
    to={to} 
    className={`
      flex items-center gap-3 px-4 py-3.5 rounded-xl transition-all duration-300 relative group
      ${active 
        ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-100 font-bold' 
        : 'text-slate-500 hover:bg-slate-50 hover:text-indigo-600'}
      ${collapsed ? 'justify-center px-0' : ''}
    `}
  >
    <Icon className={`w-5 h-5 shrink-0 transition-transform duration-300 ${active ? 'scale-110' : 'group-hover:scale-110'}`} />
    {(!collapsed) && (
      <span className="truncate">{label}</span>
    )}
    {collapsed && (
      <div className="absolute left-full ml-4 px-3 py-2 bg-slate-900 text-white text-xs font-bold rounded-lg opacity-0 group-hover:opacity-100 pointer-events-none transition-all translate-x-2 group-hover:translate-x-0 z-50 whitespace-nowrap">
        {label}
      </div>
    )}
  </Link>
);

const SidebarDropdown = ({ icon: Icon, label, items, collapsed, activePath }: any) => {
  const [isOpen, setIsOpen] = useState(false);
  const location = useLocation();
  const isActive = items.some((item: any) => location.pathname === item.to);

  useEffect(() => {
    if (isActive) setIsOpen(true);
  }, [isActive]);

  if (collapsed) {
    return (
      <div className="relative group">
        <div className={`flex items-center justify-center p-3 rounded-xl transition-all ${isActive ? 'bg-indigo-50 text-indigo-600' : 'text-slate-500 hover:bg-slate-50'}`}>
          <Icon className="w-5 h-5" />
        </div>
        <div className="absolute left-full top-0 ml-4 w-48 bg-white border border-slate-100 rounded-2xl shadow-xl opacity-0 group-hover:opacity-100 pointer-events-none transition-all translate-x-2 group-hover:translate-x-0 z-50 overflow-hidden">
          <div className="px-4 py-3 bg-slate-50 border-b border-slate-100 font-bold text-xs text-slate-400 uppercase tracking-wider">{label}</div>
          {items.map((item: any, idx: number) => (
            <Link key={idx} to={item.to} className={`block px-4 py-3 text-sm transition-all ${location.pathname === item.to ? 'text-indigo-600 bg-indigo-50 font-bold' : 'text-slate-600 hover:bg-slate-50'}`}>
              {item.label}
            </Link>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-1">
      <button 
        onClick={() => setIsOpen(!isOpen)}
        className={`w-full flex items-center justify-between px-4 py-3.5 rounded-xl transition-all ${isActive ? 'bg-indigo-50 text-indigo-600' : 'text-slate-500 hover:bg-slate-50 hover:text-indigo-600'}`}
      >
        <div className="flex items-center gap-3">
          <Icon className="w-5 h-5" />
          <span className={`font-medium ${isActive ? 'font-bold' : ''}`}>{label}</span>
        </div>
        <ChevronDown className={`w-4 h-4 transition-transform duration-300 ${isOpen ? 'rotate-180' : ''}`} />
      </button>
      <AnimatePresence>
        {isOpen && (
          <motion.div 
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            className="overflow-hidden space-y-1 pl-12"
          >
            {items.map((item: any, idx: number) => (
              <Link key={idx} to={item.to} className={`block py-2 text-sm transition-all ${location.pathname === item.to ? 'text-indigo-600 font-bold' : 'text-slate-500 hover:text-indigo-600'}`}>
                {item.label}
              </Link>
            ))}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};

export const Layout = () => {
  const [isSidebarOpen, setIsSidebarOpen] = useState(true);
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const location = useLocation();
  const logout = useAuthStore(state => state.logout);
  const user = useAuthStore(state => state.user);

  useEffect(() => {
    setIsMobileMenuOpen(false);
  }, [location]);

  const hasModule = (module: string) => {
    if (!user) return false;
    if (user.perfil === 'superadmin') return true;

    const planHasModule = module === 'dashboard' ? true : user.modulos?.includes(module);
    if (!planHasModule) return false;

    // Admin passes group check automatically
    if (user.perfil === 'admin') return true;

    // Finally check user's group permissions
    if (user.permissoes && user.permissoes[module]) {
      return !!user.permissoes[module].acessar;
    }

    return false;
  };

  return (
    <div className="min-h-screen bg-slate-50 flex">
      <SubscriptionWarning />
      <AnimatePresence>
        {isMobileMenuOpen && (
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={() => setIsMobileMenuOpen(false)}
            className="fixed inset-0 bg-black/50 backdrop-blur-sm z-40 lg:hidden"
          />
        )}
      </AnimatePresence>

      <aside className={`
        fixed inset-y-0 left-0 z-50 bg-white border-r border-slate-100 transition-all duration-300 flex flex-col
        lg:static lg:translate-x-0 print:hidden
        ${isMobileMenuOpen ? 'translate-x-0 w-64' : '-translate-x-full lg:translate-x-0'}
        ${isSidebarOpen ? 'lg:w-64' : 'lg:w-20'}
      `}>
        <div className="p-6 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="bg-indigo-600 p-2 rounded-lg shrink-0">
              <TrendingUp className="text-white w-6 h-6" />
            </div>
            {(isSidebarOpen || isMobileMenuOpen) && <span className="font-bold text-xl text-slate-900 truncate">Sige Plus</span>}
          </div>
          <button onClick={() => setIsMobileMenuOpen(false)} className="lg:hidden text-slate-400">
            <X className="w-6 h-6" />
          </button>
        </div>

        <nav className="flex-1 px-3 space-y-1 overflow-y-auto">
          {hasModule('dashboard') && (
            <SidebarItem collapsed={!isSidebarOpen && !isMobileMenuOpen} icon={LayoutDashboard} label="Dashboard" to="/dashboard" active={location.pathname === '/dashboard'} />
          )}
          
          {hasModule('estoque') && (
            <SidebarItem collapsed={!isSidebarOpen && !isMobileMenuOpen} icon={Package} label="Estoque" to="/estoque" active={location.pathname === '/estoque'} />
          )}
          
          {hasModule('cadastros') && (
            <SidebarItem collapsed={!isSidebarOpen && !isMobileMenuOpen} icon={Users} label="Pessoas" to="/pessoas" active={location.pathname === '/pessoas'} />
          )}
          
          {hasModule('financeiro') && (
            <SidebarItem collapsed={!isSidebarOpen && !isMobileMenuOpen} icon={DollarSign} label="Financeiro" to="/financeiro" active={location.pathname === '/financeiro'} />
          )}
          
          {hasModule('vendas') && (
            <SidebarItem collapsed={!isSidebarOpen && !isMobileMenuOpen} icon={ShoppingCart} label="Pedidos e Orçamentos" to="/vendas" active={location.pathname === '/vendas'} />
          )}

          {hasModule('os') && (
            <SidebarItem collapsed={!isSidebarOpen && !isMobileMenuOpen} icon={Wrench} label="Ordens de Serviço" to="/os" active={location.pathname === '/os'} />
          )}

          {hasModule('mesas') && (
            <SidebarItem collapsed={!isSidebarOpen && !isMobileMenuOpen} icon={Coffee} label="Mesas & Comandas" to="/mesas" active={location.pathname === '/mesas'} />
          )}
          
          {hasModule('pdv') && (
            <SidebarItem collapsed={!isSidebarOpen && !isMobileMenuOpen} icon={MonitorPlay} label="PDV" to="/pdv" active={location.pathname === '/pdv'} />
          )}

          {(hasModule('financeiro') || hasModule('vendas') || hasModule('estoque')) && (
            <SidebarDropdown 
              collapsed={!isSidebarOpen && !isMobileMenuOpen} 
              icon={FileText} 
              label="Relatórios" 
              items={[
                hasModule('vendas') && { label: 'Vendas', to: '/reports/sales' },
                hasModule('estoque') && { label: 'Estoque', to: '/reports/inventory' },
                hasModule('financeiro') && { label: 'Financeiro', to: '/reports/finance' },
                hasModule('financeiro') && { label: 'DRE', to: '/dre' },
                hasModule('cadastros') && { label: 'Pessoas', to: '/reports/people' },
              ].filter(Boolean)} 
            />
          )}

          {hasModule('configuracoes') && (
            <SidebarItem collapsed={!isSidebarOpen && !isMobileMenuOpen} icon={SettingsIcon} label="Configurações" to="/settings" active={location.pathname === '/settings'} />
          )}

          {user?.perfil === 'superadmin' && (
            <SidebarItem collapsed={!isSidebarOpen && !isMobileMenuOpen} icon={TrendingUp} label="Gestão do SaaS" to="/admin" active={location.pathname === '/admin'} />
          )}
        </nav>

        <div className="p-4 border-t border-slate-100">
          <button 
            onClick={logout}
            className={`flex items-center gap-3 px-4 py-3 w-full text-rose-600 hover:bg-rose-50 rounded-xl transition-all font-medium ${!isSidebarOpen && !isMobileMenuOpen ? 'justify-center px-0' : ''}`}
          >
            <LogOut className="w-5 h-5 shrink-0" />
            {(isSidebarOpen || isMobileMenuOpen) && <span>Sair</span>}
          </button>
        </div>
      </aside>

      <main className="flex-1 flex flex-col min-w-0 h-screen overflow-hidden print:h-auto print:overflow-visible">
        <header className="h-16 bg-white border-b border-slate-100 flex items-center justify-between px-4 lg:px-8 shrink-0 print:hidden">
          <div className="flex items-center gap-4">
            <button onClick={() => setIsMobileMenuOpen(true)} className="lg:hidden text-slate-500 hover:text-indigo-600">
              <Menu className="w-6 h-6" />
            </button>
            <button onClick={() => setIsSidebarOpen(!isSidebarOpen)} className="hidden lg:block text-slate-500 hover:text-indigo-600">
              {isSidebarOpen ? <X className="w-6 h-6" /> : <Menu className="w-6 h-6" />}
            </button>
          </div>
          <div className="flex items-center gap-4">
            <div className="text-right hidden sm:block">
              <p className="text-sm font-bold text-slate-900">{user?.nome}</p>
              <p className="text-xs text-slate-500 capitalize">{user?.perfil}</p>
            </div>
            <Link 
              to="/profile"
              className="w-10 h-10 rounded-full bg-indigo-100 flex items-center justify-center text-indigo-600 font-bold shrink-0 overflow-hidden hover:ring-2 hover:ring-indigo-500 transition-all"
            >
              {user?.avatar ? (
                <img src={user.avatar} alt="Avatar" className="w-full h-full object-cover" referrerPolicy="no-referrer" />
              ) : (
                user?.nome.charAt(0)
              )}
            </Link>
          </div>
        </header>
        <div className="flex-1 p-4 lg:p-8 overflow-y-auto print:p-0 print:overflow-visible">
          <Outlet />
        </div>
      </main>
    </div>
  );
};

export default Layout;
