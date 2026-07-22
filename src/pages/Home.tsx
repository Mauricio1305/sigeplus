import React from 'react';
import { Link } from 'react-router-dom';
import { motion } from 'motion/react';
import { 
  Calendar, 
  ShoppingCart, 
  Wrench, 
  Coffee, 
  MonitorPlay,
  Sparkles,
  ChevronRight
} from 'lucide-react';
import { useAuthStore } from '../store/authStore';

export const Home = () => {
  const user = useAuthStore(state => state.user);

  const hasAccess = (module: string) => {
    if (!user) return false;
    if (user.perfil === 'superadmin') return true;
    
    // Check if plan has the module
    const planHasModule = user.modulos?.includes(module);
    
    // Check user group permissions
    let hasGroupAccess = false;
    if (user.perfil === 'admin') {
      hasGroupAccess = true;
    } else if (user.permissoes && user.permissoes[module]) {
      hasGroupAccess = !!user.permissoes[module].acessar;
    }
    
    return planHasModule && hasGroupAccess;
  };

  // Define the allowed modules list with their paths, icons, colors, and key descriptions
  const modules = [
    {
      key: 'agenda',
      label: 'Agenda',
      path: '/agenda',
      icon: Calendar,
      color: 'from-blue-500 to-indigo-600',
      bgColor: 'bg-blue-50',
      textColor: 'text-blue-600',
      description: 'Agendamentos e compromissos'
    },
    {
      key: 'vendas',
      label: 'Pedidos e Orçamentos',
      path: '/vendas',
      icon: ShoppingCart,
      color: 'from-emerald-500 to-teal-600',
      bgColor: 'bg-emerald-50',
      textColor: 'text-emerald-600',
      description: 'Gestão de vendas e orçamentos'
    },
    {
      key: 'os',
      label: 'Ordens de Serviço',
      path: '/os',
      icon: Wrench,
      color: 'from-amber-500 to-orange-600',
      bgColor: 'bg-amber-50',
      textColor: 'text-amber-600',
      description: 'Acompanhamento de OS'
    },
    {
      key: 'pdv',
      label: 'PDV',
      path: '/pdv',
      icon: MonitorPlay,
      color: 'from-violet-500 to-purple-600',
      bgColor: 'bg-violet-50',
      textColor: 'text-violet-600',
      description: 'Frente de caixa rápido'
    },
    {
      key: 'mesas',
      label: 'Mesas e Comandas',
      path: '/mesas',
      icon: Coffee,
      color: 'from-rose-500 to-pink-600',
      bgColor: 'bg-rose-50',
      textColor: 'text-rose-600',
      description: 'Atendimento de mesas'
    }
  ];

  // Filter modules based on user access
  const availableModules = modules.filter(m => hasAccess(m.key));

  return (
    <div className="max-w-4xl mx-auto px-4 py-8 md:py-12">
      {/* Welcome Header */}
      <motion.div 
        initial={{ opacity: 0, y: -20 }}
        animate={{ opacity: 1, y: 0 }}
        className="mb-10 text-center md:text-left"
      >
        <h1 className="text-3xl md:text-4xl font-extrabold text-slate-900 tracking-tight">
          Olá, <span className="text-indigo-600">{user?.nome}</span>!
        </h1>
        <p className="text-slate-500 mt-2 text-sm md:text-base">
          Escolha um dos seus módulos ativos abaixo para começar o seu atendimento:
        </p>
      </motion.div>

      {availableModules.length === 0 ? (
        <motion.div 
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          className="bg-white rounded-3xl border border-slate-100 shadow-sm p-12 text-center"
        >
          <div className="bg-slate-50 w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-4 border border-slate-100">
            <Sparkles className="text-slate-300 w-8 h-8" />
          </div>
          <h3 className="text-xl font-bold text-slate-900">Nenhum módulo ativo</h3>
          <p className="text-slate-500 max-w-sm mx-auto mt-2 text-sm leading-relaxed">
            Parece que o seu plano ou grupo de usuário não possui acesso a nenhum dos módulos principais configurados na tela inicial. Entre em contato com o administrador.
          </p>
        </motion.div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 md:gap-6">
          {availableModules.map((item, index) => {
            const IconComponent = item.icon;
            return (
              <motion.div
                key={item.key}
                initial={{ opacity: 0, y: 15 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: index * 0.05 }}
                whileHover={{ scale: 1.02 }}
                whileTap={{ scale: 0.98 }}
                className="group"
              >
                <Link 
                  to={item.path}
                  className="flex items-center gap-4 p-5 md:p-6 bg-white border border-slate-100 rounded-2xl shadow-sm hover:shadow-md hover:border-slate-200 transition-all duration-200 h-full relative overflow-hidden"
                >
                  {/* Decorative background gradient hover effect */}
                  <div className="absolute top-0 right-0 w-32 h-32 bg-gradient-to-br from-indigo-50/10 to-transparent rounded-full opacity-0 group-hover:opacity-100 transition-opacity" />
                  
                  {/* Icon with colored background */}
                  <div className={`w-14 h-14 rounded-2xl ${item.bgColor} ${item.textColor} flex items-center justify-center shrink-0 group-hover:scale-110 transition-transform duration-200`}>
                    <IconComponent className="w-7 h-7" />
                  </div>

                  {/* Text Details */}
                  <div className="flex-1 min-w-0">
                    <h3 className="font-bold text-slate-800 text-[16px] md:text-lg group-hover:text-indigo-600 transition-colors truncate">
                      {item.label}
                    </h3>
                    <p className="text-xs md:text-sm text-slate-400 mt-1 truncate">
                      {item.description}
                    </p>
                  </div>

                  {/* Arrow Indicator */}
                  <div className="text-slate-300 group-hover:text-indigo-500 transition-colors pl-2 shrink-0">
                    <ChevronRight className="w-5 h-5 group-hover:translate-x-1 transition-transform" />
                  </div>
                </Link>
              </motion.div>
            );
          })}
        </div>
      )}

    </div>
  );
};

export default Home;
