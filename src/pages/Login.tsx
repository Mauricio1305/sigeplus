import React, { useState, useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { motion } from 'motion/react';
import { TrendingUp, AlertCircle } from 'lucide-react';
import { useAuthStore } from '../store/authStore';
import { FormField } from '../components/ui/FormField';
import { formatMoney } from '../utils/format';

export const Login = () => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [isRegistering, setIsRegistering] = useState(false);
  const [companyName, setCompanyName] = useState('');
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
            index === self.findIndex((p: any) => p.nome === plan.nome)
          );
          setPlans(uniquePlans);
          if (uniquePlans.length > 0 && !selectedPlan) {
            setSelectedPlan(uniquePlans[0].id);
          }
        })
        .catch(err => console.error("Error fetching plans:", err));
    }
  }, [isRegistering, selectedPlan]);

  const validate = () => {
    const errors: Record<string, string> = {};
    if (!email) errors.email = 'E-mail é obrigatório';
    else if (!/\S+@\S+\.\S+/.test(email)) errors.email = 'E-mail inválido';
    
    if (!password) errors.password = 'Senha é obrigatória';
    else if (password.length < 6) errors.password = 'A senha deve ter pelo menos 6 caracteres';

    if (isRegistering) {
      if (!companyName) errors.companyName = 'Nome da empresa é obrigatório';
      if (!name) errors.name = 'Seu nome é obrigatório';
      if (!selectedPlan) errors.selectedPlan = 'Selecione um plano para continuar';
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
        ? { companyName, email, password, name, plano_id: selectedPlan } 
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
          navigate('/subscription');
        } else {
          const from = (location.state as any)?.from;
          if (from) {
            navigate(from.pathname + from.search, { replace: true });
          } else {
            const isExpired = data.user.status_assinatura !== 'ativo' || (data.user.vencimento_assinatura && new Date(data.user.vencimento_assinatura) < new Date());
            
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
    <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4">
      <motion.div 
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="bg-white w-full max-w-md p-8 rounded-3xl shadow-xl border border-slate-100"
      >
        <div className="text-center mb-8">
          <div className="bg-indigo-600 w-12 h-12 rounded-2xl flex items-center justify-center mx-auto mb-4">
            <TrendingUp className="text-white w-8 h-8" />
          </div>
          <h2 className="text-3xl font-bold text-slate-900">Sige Plus</h2>
          <p className="text-slate-500 mt-2">
            {isRegistering ? 'Crie sua conta multi-tenant' : 'Bem-vindo de volta'}
          </p>
        </div>

        {error && (
          <motion.div 
            initial={{ opacity: 0, x: -10 }}
            animate={{ opacity: 1, x: 0 }}
            className="mb-6 p-4 bg-rose-50 border border-rose-100 rounded-2xl flex items-center gap-3 text-rose-600 text-sm font-medium"
          >
            <AlertCircle className="w-5 h-5 shrink-0" />
            <p>{error}</p>
          </motion.div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4" noValidate>
          {isRegistering && (
            <>
              <FormField label="Nome da Empresa" error={fieldErrors.companyName} required>
                <input 
                  type="text" 
                  className={`w-full px-4 py-3 rounded-xl border outline-none transition-all ${fieldErrors.companyName ? 'border-rose-500 bg-rose-50 focus:ring-rose-200' : 'border-slate-200 focus:ring-indigo-500'}`}
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
                  className={`w-full px-4 py-3 rounded-xl border outline-none transition-all ${fieldErrors.name ? 'border-rose-500 bg-rose-50 focus:ring-rose-200' : 'border-slate-200 focus:ring-indigo-500'}`}
                  value={name}
                  onChange={e => {
                    setName(e.target.value);
                    if (fieldErrors.name) setFieldErrors({...fieldErrors, name: ''});
                  }}
                />
              </FormField>
              <FormField label="Escolha seu Plano" error={fieldErrors.selectedPlan} required>
                <div className="grid grid-cols-1 gap-2">
                  {plans.map(p => (
                    <label 
                      key={p.id} 
                      className={`flex justify-between items-center p-3 rounded-xl border-2 cursor-pointer transition-all ${
                        selectedPlan === p.id ? 'border-indigo-600 bg-indigo-50' : 'border-slate-100 hover:border-slate-200'
                      } ${fieldErrors.selectedPlan ? 'border-rose-200' : ''}`}
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
                        <span className="font-bold text-slate-900">{p.nome}</span>
                        <span className="text-xs text-slate-500">{p.limite_usuarios === 9999 ? 'Usuários Ilimitados' : `${p.limite_usuarios} Usuários`}</span>
                      </div>
                      <span className="font-bold text-indigo-600">R$ {formatMoney(p.valor_mensal)}</span>
                    </label>
                  ))}
                </div>
              </FormField>
            </>
          )}
          <FormField label="E-mail" error={fieldErrors.email} required>
            <input 
              type="email" 
              className={`w-full px-4 py-3 rounded-xl border outline-none transition-all ${fieldErrors.email ? 'border-rose-500 bg-rose-50 focus:ring-rose-200' : 'border-slate-200 focus:ring-indigo-500'}`}
              value={email}
              onChange={e => {
                setEmail(e.target.value);
                if (fieldErrors.email) setFieldErrors({...fieldErrors, email: ''});
              }}
            />
          </FormField>
          <FormField label="Senha" error={fieldErrors.password} required>
            <input 
              type="password" 
              className={`w-full px-4 py-3 rounded-xl border outline-none transition-all ${fieldErrors.password ? 'border-rose-500 bg-rose-50 focus:ring-rose-200' : 'border-slate-200 focus:ring-indigo-500'}`}
              value={password}
              onChange={e => {
                setPassword(e.target.value);
                if (fieldErrors.password) setFieldErrors({...fieldErrors, password: ''});
              }}
            />
          </FormField>
          {!isRegistering && (
            <div className="flex justify-end">
              <button 
                type="button"
                onClick={() => navigate('/forgot-password')}
                className="text-xs font-semibold text-indigo-600 hover:underline"
              >
                Esqueci minha senha
              </button>
            </div>
          )}
          <button 
            type="submit"
            disabled={loading}
            className="w-full bg-indigo-600 text-white py-3 rounded-xl font-bold hover:bg-indigo-700 transition-all shadow-lg shadow-indigo-200 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {loading ? 'Processando...' : (isRegistering ? 'Cadastrar Empresa' : 'Entrar no Sistema')}
          </button>
        </form>

        <div className="mt-6 text-center">
          <button 
            onClick={() => {
              setIsRegistering(!isRegistering);
              setError('');
            }}
            className="text-indigo-600 font-semibold hover:underline"
          >
            {isRegistering ? 'Já tenho uma conta' : 'Quero cadastrar minha empresa'}
          </button>
        </div>
      </motion.div>
    </div>
  );
};

export default Login;
