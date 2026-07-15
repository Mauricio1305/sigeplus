import React, { useState, useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { motion, AnimatePresence } from 'motion/react';
import { TrendingUp, AlertCircle, ArrowRight, CheckCircle2, ChevronLeft, Menu } from 'lucide-react';
import { useAuthStore } from '../store/authStore';
import { FormField } from '../components/ui/FormField';
import { formatMoney } from '../utils/format';
import SupportWidget from '../components/SupportWidget';

export const Login = () => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [isRegistering, setIsRegistering] = useState(false);
  const [companyName, setCompanyName] = useState('');
  const [whatsapp, setWhatsapp] = useState('');
  const [name, setName] = useState('');
  const [plans, setPlans] = useState<any[]>([]);
  const [selectedPlan, setSelectedPlan] = useState<number | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const setAuth = useAuthStore(state => state.setAuth);
  const navigate = useNavigate();
  const location = useLocation();

  useEffect(() => {
    if (isRegistering) {
      fetch('/api/plans')
        .then(res => res.json())
        .then(data => {
          const uniquePlans = data.filter((plan: any, index: number, self: any[]) =>
            index === self.findIndex((p: any) => p.nome === plan.nome) && plan.visivel !== 0
          ).sort((a: any, b: any) => a.id - b.id);
          setPlans(uniquePlans);
          if (uniquePlans.length > 0 && !selectedPlan) {
            setSelectedPlan(uniquePlans[0].id);
          }
        })
        .catch(err => console.error("Error fetching plans:", err));
    }
  }, [isRegistering]);

  const formatWhatsApp = (value: string) => {
    const digits = value.replace(/\D/g, '');
    if (digits.length <= 2) return digits;
    if (digits.length <= 7) return `(${digits.slice(0, 2)}) ${digits.slice(2)}`;
    return `(${digits.slice(0, 2)}) ${digits.slice(2, 7)}-${digits.slice(7, 11)}`;
  };

  const validate = () => {
    const errors: Record<string, string> = {};
    if (!email) {
      errors.email = 'E-mail é obrigatório';
    } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      errors.email = 'Informe um e-mail válido';
    }
    
    if (!password) {
      errors.password = 'Senha é obrigatória';
    } else if (password.length < 6) {
      errors.password = 'A senha deve ter pelo menos 6 caracteres';
    }

    if (isRegistering) {
      if (!companyName) errors.companyName = 'Nome da empresa é obrigatório';
      if (!name) errors.name = 'Seu nome é obrigatório';
      if (!selectedPlan) errors.selectedPlan = 'Selecione um plano';
      
      const whatsappDigits = whatsapp.replace(/\D/g, '');
      if (!whatsappDigits) {
        errors.whatsapp = 'WhatsApp é obrigatório';
      } else if (whatsappDigits.length < 10 || whatsappDigits.length > 11) {
        errors.whatsapp = 'WhatsApp inválido';
      }
    }

    setFieldErrors(errors);
    return Object.keys(errors).length === 0;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!validate()) return;
    
    setLoading(true);
    setError('');

    try {
      const endpoint = isRegistering ? '/api/auth/register' : '/api/auth/login';
      const body = isRegistering 
        ? { companyName, email, password, name, whatsapp, plano_id: selectedPlan } 
        : { email, password };

      const res = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body)
      });

      const data = await res.json();
      if (res.ok) {
        setAuth(data.user, data.token);
        
        if (isRegistering) {
            const vencimento = data.user.vencimento_assinatura ? new Date(data.user.vencimento_assinatura) : null;
            const isTrial = data.user.status_assinatura === 'ativo' && vencimento && !isNaN(vencimento.getTime()) && vencimento > new Date();
            if (isTrial) {
               navigate('/dashboard');
            } else {
               navigate('/subscription');
            }
        } else {
          const from = (location.state as any)?.from;
          if (from) {
            navigate(from.pathname + from.search, { replace: true });
          } else {
            let daysSinceExpiration = -1;
            if (data.user.vencimento_assinatura) {
              const expirationDate = new Date(data.user.vencimento_assinatura);
              const today = new Date();
              daysSinceExpiration = Math.floor((today.getTime() - expirationDate.getTime()) / (1000 * 60 * 60 * 24));
            }
            
            const isExpired = data.user.status_assinatura === 'cancelado' || daysSinceExpiration > 10;
            
            if (data.user.perfil === 'superadmin') {
              navigate('/admin');
            } else if (isExpired) {
              navigate('/subscription');
            } else {
              navigate('/dashboard');
            }
          }
        }
      } else {
        const errorMessage = data.details 
          ? `${data.error}: ${data.details}` 
          : (data.error || 'Ocorreu um erro ao processar sua solicitação.');
        setError(errorMessage);
      }
    } catch (err) {
      console.error("Auth error:", err);
      setError('Erro de conexão com o servidor.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex flex-col font-sans bg-slate-50">
      {/* Header */}
      <header className="h-[76px] bg-white flex items-center justify-between px-6 lg:px-12 border-b border-slate-200 shrink-0 relative z-30 sticky top-0">
        <div className="flex items-center gap-3">
          <div className="bg-indigo-600 p-2 rounded-xl flex items-center justify-center">
            <TrendingUp className="text-white w-6 h-6" />
          </div>
          <span className="text-2xl font-bold text-slate-900 tracking-tight hidden sm:block">sige plus</span>
        </div>
        
        <div className="flex items-center gap-4">
          <button 
            onClick={() => {
              setIsRegistering(false);
              setError('');
              setFieldErrors({});
            }} 
            className="text-slate-600 font-semibold hover:bg-slate-100 px-5 py-2.5 rounded-full transition-colors hidden sm:block"
          >
            Login Empresas
          </button>
          <button 
            onClick={() => {
              setIsRegistering(true);
              setError('');
              setFieldErrors({});
            }} 
            className="hidden sm:flex bg-indigo-600 text-white px-5 py-2.5 rounded-full font-bold hover:bg-indigo-700 transition-colors"
          >
            Quero ser Sige Plus
          </button>
          <button className="sm:hidden p-2 text-slate-600 hover:bg-slate-100 rounded-full">
            <Menu className="w-6 h-6" />
          </button>
        </div>
      </header>

      {/* Main Content Area */}
      <main className="flex-1 relative flex bg-slate-900 min-h-[calc(100vh-76px)]">
        {/* Background Image (Fixed) */}
        <div className="fixed inset-0 top-[76px] z-0">
          <img 
            src="https://images.unsplash.com/photo-1556742049-0cfed4f6a45d?auto=format&fit=crop&w=2000&q=80" 
            alt="Pessoas em um café"
            className="w-full h-full object-cover"
          />
          {/* Overlay to ensure text readability */}
          <div className="absolute inset-0 bg-gradient-to-r from-black/80 via-black/50 to-black/30"></div>
        </div>

        {/* Content Container */}
        <div className="relative z-10 w-full max-w-7xl mx-auto px-6 lg:px-12 flex flex-col lg:flex-row items-center justify-between gap-12 py-12 lg:py-0 min-h-full">
          
          {/* Left Text */}
          <div className="w-full lg:w-1/2 pt-8 lg:pt-0 order-2 lg:order-1">
            <h1 className="text-[3.5rem] sm:text-[4.5rem] lg:text-[5.5rem] font-bold text-white tracking-tight leading-[1.05] mb-6">
              Sinal de sorte<br/>é contar com<br/>Sige Plus.
            </h1>
            
            <button 
              onClick={() => setIsRegistering(true)} 
              className="bg-indigo-600 text-white px-8 py-4 rounded-full font-bold text-lg hover:bg-indigo-700 transition-all hidden lg:inline-flex items-center gap-2 mt-4 hover:scale-105 active:scale-95"
            >
              Conheça as vantagens
            </button>
          </div>

          {/* Right Form Card */}
          <div className="w-full lg:w-[480px] order-1 lg:order-2 flex-shrink-0">
            <motion.div 
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              className="bg-white p-8 sm:p-10 rounded-3xl shadow-2xl"
            >
              <AnimatePresence mode="wait">
                <motion.div
                  key={isRegistering ? 'register' : 'login'}
                  initial={{ opacity: 0, x: isRegistering ? 20 : -20 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: isRegistering ? -20 : 20 }}
                  transition={{ duration: 0.2 }}
                >
                  <div className="mb-8 flex items-center justify-between">
                    <h2 className="text-[1.75rem] font-bold text-slate-900 tracking-tight">
                      {isRegistering ? 'Abra sua conta' : 'Acesse sua conta'}
                    </h2>
                    {isRegistering && (
                      <button 
                        onClick={() => setIsRegistering(false)} 
                        className="p-2 text-slate-400 hover:bg-slate-100 hover:text-slate-600 rounded-full transition-colors"
                      >
                        <ChevronLeft className="w-6 h-6" />
                      </button>
                    )}
                  </div>

                  {error && (
                    <div className="mb-6 p-4 bg-rose-50 border border-rose-100 rounded-2xl flex items-start gap-3 text-rose-600 font-medium">
                      <AlertCircle className="w-5 h-5 shrink-0 mt-0.5" />
                      <p className="leading-relaxed text-sm">{error}</p>
                    </div>
                  )}

                  <form onSubmit={handleSubmit} className="space-y-6" noValidate>
                    {isRegistering ? (
                      <div className="space-y-5 max-h-[50vh] lg:max-h-[60vh] overflow-y-auto pr-2 custom-scrollbar">
                        <FormField label="Nome da Empresa" error={fieldErrors.companyName} required>
                          <input 
                            type="text" 
                            className={`w-full px-4 py-3.5 rounded-xl border outline-none transition-all ${fieldErrors.companyName ? 'border-rose-500 bg-rose-50' : 'border-slate-300 hover:border-slate-400 focus:border-indigo-600 focus:ring-1 focus:ring-indigo-600'}`}
                            value={companyName}
                            onChange={e => {
                              setCompanyName(e.target.value);
                              if (fieldErrors.companyName) setFieldErrors({...fieldErrors, companyName: ''});
                            }}
                          />
                        </FormField>
                        
                        <FormField label="Seu Nome" error={fieldErrors.name} required>
                          <input 
                            type="text" 
                            className={`w-full px-4 py-3.5 rounded-xl border outline-none transition-all ${fieldErrors.name ? 'border-rose-500 bg-rose-50' : 'border-slate-300 hover:border-slate-400 focus:border-indigo-600 focus:ring-1 focus:ring-indigo-600'}`}
                            value={name}
                            onChange={e => {
                              setName(e.target.value);
                              if (fieldErrors.name) setFieldErrors({...fieldErrors, name: ''});
                            }}
                          />
                        </FormField>
                        
                        <FormField label="WhatsApp" error={fieldErrors.whatsapp} required>
                          <input 
                            type="text" 
                            className={`w-full px-4 py-3.5 rounded-xl border outline-none transition-all ${fieldErrors.whatsapp ? 'border-rose-500 bg-rose-50' : 'border-slate-300 hover:border-slate-400 focus:border-indigo-600 focus:ring-1 focus:ring-indigo-600'}`}
                            value={whatsapp}
                            onChange={e => {
                              const formatted = formatWhatsApp(e.target.value);
                              if (formatted.length <= 15) {
                                setWhatsapp(formatted);
                              }
                              if (fieldErrors.whatsapp) setFieldErrors({...fieldErrors, whatsapp: ''});
                            }}
                          />
                        </FormField>

                        <FormField label="Escolha seu Plano" error={fieldErrors.selectedPlan} required>
                          <div className="grid grid-cols-1 gap-3 mt-1">
                            {plans.map(p => (
                              <label 
                                key={p.id} 
                                className={`relative flex items-center justify-between p-4 rounded-xl border cursor-pointer transition-all ${
                                  selectedPlan === p.id 
                                    ? 'border-indigo-600 bg-indigo-600/5 shadow-sm' 
                                    : 'border-slate-200 hover:border-indigo-600/30 bg-white'
                                } ${fieldErrors.selectedPlan ? 'border-rose-300' : ''}`}
                              >
                                <input 
                                  type="radio" 
                                  name="plan" 
                                  className="hidden" 
                                  value={p.id} 
                                  checked={selectedPlan === p.id}
                                  onChange={() => {
                                    setSelectedPlan(p.id);
                                    if (fieldErrors.selectedPlan) setFieldErrors({...fieldErrors, selectedPlan: ''});
                                  }}
                                />
                                <div className="flex flex-col">
                                  <span className="font-bold text-slate-900 text-[15px]">{p.nome}</span>
                                  <span className="text-xs text-slate-500 mt-1 font-medium bg-slate-100 w-fit px-2 py-0.5 rounded">
                                      {p.limite_usuarios === 9999 ? 'Ilimitado' : `Até ${p.limite_usuarios} usuários`}
                                  </span>
                                </div>
                                <div className="flex flex-col items-end">
                                  <span className="font-black text-indigo-600 text-lg">R$ {formatMoney(p.valor_mensal)}</span>
                                  <span className="text-slate-400 text-[10px] font-semibold uppercase">por mês</span>
                                </div>
                                {selectedPlan === p.id && (
                                  <div className="absolute -top-2 -right-2 bg-white rounded-full">
                                    <CheckCircle2 className="w-5 h-5 text-indigo-600" />
                                  </div>
                                )}
                              </label>
                            ))}
                          </div>
                        </FormField>

                        <FormField label="E-mail" error={fieldErrors.email} required>
                          <input 
                            type="email" 
                            className={`w-full px-4 py-3.5 rounded-xl border outline-none transition-all ${fieldErrors.email ? 'border-rose-500 bg-rose-50' : 'border-slate-300 hover:border-slate-400 focus:border-indigo-600 focus:ring-1 focus:ring-indigo-600'}`}
                            value={email}
                            onChange={e => {
                              setEmail(e.target.value);
                              if (fieldErrors.email) setFieldErrors({...fieldErrors, email: ''});
                            }}
                          />
                        </FormField>

                        <FormField 
                          label="Senha" 
                          error={fieldErrors.password} 
                          required 
                        >
                          <input 
                            type="password" 
                            placeholder="••••••••"
                            className={`w-full px-4 py-3.5 rounded-xl border outline-none transition-all ${fieldErrors.password ? 'border-rose-500 bg-rose-50' : 'border-slate-300 hover:border-slate-400 focus:border-indigo-600 focus:ring-1 focus:ring-indigo-600'}`}
                            value={password}
                            onChange={e => {
                              setPassword(e.target.value);
                              if (fieldErrors.password) setFieldErrors({...fieldErrors, password: ''});
                            }}
                          />
                        </FormField>
                      </div>
                    ) : (
                      <div className="space-y-5">
                        <FormField label="E-mail" error={fieldErrors.email} required>
                          <input 
                            type="email" 
                            placeholder="seu@email.com.br"
                            className={`w-full px-4 py-4 rounded-xl border outline-none transition-all text-lg ${fieldErrors.email ? 'border-rose-500 bg-rose-50' : 'border-slate-300 hover:border-slate-400 focus:border-indigo-600 focus:ring-1 focus:ring-indigo-600'}`}
                            value={email}
                            onChange={e => {
                              setEmail(e.target.value);
                              if (fieldErrors.email) setFieldErrors({...fieldErrors, email: ''});
                            }}
                          />
                        </FormField>

                        <FormField 
                          label="Senha" 
                          error={fieldErrors.password} 
                          required 
                        >
                          <input 
                            type="password" 
                            placeholder="••••••••"
                            className={`w-full px-4 py-4 rounded-xl border outline-none transition-all text-lg ${fieldErrors.password ? 'border-rose-500 bg-rose-50' : 'border-slate-300 hover:border-slate-400 focus:border-indigo-600 focus:ring-1 focus:ring-indigo-600'}`}
                            value={password}
                            onChange={e => {
                              setPassword(e.target.value);
                              if (fieldErrors.password) setFieldErrors({...fieldErrors, password: ''});
                            }}
                          />
                        </FormField>
                        
                        <div className="flex justify-end">
                           <button 
                            type="button"
                            onClick={() => navigate('/forgot-password')}
                            className="text-sm font-semibold text-indigo-600 hover:underline"
                          >
                            Esqueci minha senha
                          </button>
                        </div>
                      </div>
                    )}

                    <button 
                      type="submit"
                      disabled={loading}
                      className="w-full bg-indigo-600 text-white py-4 rounded-full font-bold text-lg hover:bg-indigo-700 transition-all disabled:opacity-70 disabled:cursor-not-allowed mt-2 flex items-center justify-between px-6 group"
                    >
                      <span>{loading ? 'Processando...' : 'Continuar'}</span>
                      {!loading && <ArrowRight className="w-5 h-5 group-hover:translate-x-1 transition-transform" />}
                    </button>
                    
                    {!isRegistering && (
                      <div className="pt-6 text-center lg:hidden">
                        <button 
                           onClick={() => {
                            setIsRegistering(true);
                            setError('');
                            setFieldErrors({});
                          }}
                          className="text-sm font-semibold text-slate-600 hover:text-indigo-600"
                        >
                          Ainda não tem conta? <span className="text-indigo-600 underline">Abra aqui</span>
                        </button>
                      </div>
                    )}
                  </form>
                </motion.div>
              </AnimatePresence>
            </motion.div>
          </div>
        </div>
      </main>

      <SupportWidget />
    </div>
  );
};

export default Login;


