import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { CreditCard, AlertCircle, CheckCircle } from 'lucide-react';
import { motion } from 'motion/react';
import { useAuthStore } from '../store/authStore';
import { formatMoney } from '../utils/format';
import SupportWidget from '../components/SupportWidget';

export const Subscription = () => {
  const user = useAuthStore(state => state.user);
  const token = useAuthStore(state => state.token);
  const [plans, setPlans] = useState<any[]>([]);
  const [selectedPlanId, setSelectedPlanId] = useState<number | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const navigate = useNavigate();

  useEffect(() => {
    fetch('/api/plans')
      .then(res => {
        if (!res.ok) throw new Error('Não foi possível carregar os planos');
        return res.json();
      })
      .then(data => {
        setPlans(data.sort((a: any, b: any) => a.id - b.id));
        if (user?.plano_id) {
          const userPlan = data.find((p: any) => p.id === user.plano_id);
          if (userPlan && !userPlan.is_trial) {
             setSelectedPlanId(user.plano_id);
          }
        }
      })
      .catch(err => {
        console.error("Error loading plans:", err);
        setError('Erro ao carregar planos. Verifique sua conexão.');
        // Set an empty array to stop the loading spinner if fetch fails
        setPlans([]);
      });
  }, [user?.plano_id]);

  const selectedPlan = plans.find(p => p.id === selectedPlanId);

  const handleSubscribe = async (planoId: number) => {
    setLoading(true);
    setError('');
    try {
      const res = await fetch('/api/stripe/create-checkout-session', {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({ planoId })
      });
      const data = await res.json();
      if (data.url) {
        if (window.self !== window.top) {
          window.open(data.url, '_blank');
        } else {
          window.location.href = data.url;
        }
      } else {
        setError(data.error || 'Erro ao iniciar sessão de pagamento.');
        setLoading(false);
      }
    } catch (err) {
      console.error("Error creating checkout session:", err);
      setError('Erro de conexão ao tentar iniciar o pagamento.');
      setLoading(false);
    }
  };

  // If we haven't loaded plans and there's no error, show a loader
  if (plans.length === 0 && !error) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4">
        <div className="text-center">
            <div className="w-8 h-8 border-4 border-indigo-600 border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
            <p className="text-slate-600">Carregando informações do plano...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4">
      <motion.div 
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="bg-white w-full max-w-md p-8 rounded-3xl shadow-xl border border-slate-100 text-center"
      >
        <div className="bg-indigo-100 w-16 h-16 rounded-2xl flex items-center justify-center mx-auto mb-6">
          <CreditCard className="text-indigo-600 w-8 h-8" />
        </div>
        <h2 className="text-3xl font-bold text-slate-900 mb-2">Assinatura</h2>
        <p className="text-slate-500 mb-8">Para começar a usar o sistema, realize o pagamento do seu plano.</p>

        {error && (
          <motion.div 
            initial={{ opacity: 0, x: -10 }}
            animate={{ opacity: 1, x: 0 }}
            className="mb-6 p-4 bg-rose-50 border border-rose-100 rounded-2xl flex items-center gap-3 text-rose-600 text-sm font-medium text-left"
          >
            <AlertCircle className="w-5 h-5 shrink-0" />
            <p>{error}</p>
          </motion.div>
        )}

        {plans.length > 0 && (
          <div className="grid grid-cols-1 gap-4 mb-8 text-left">
            {plans.filter(p => !p.is_trial).map(p => (
              <label 
                key={p.id} 
                className={`flex flex-col p-4 rounded-xl border-2 cursor-pointer transition-all ${
                  selectedPlanId === p.id ? 'border-indigo-600 bg-indigo-50' : 'border-slate-100 hover:border-slate-200'
                }`}
              >
                <input 
                  type="radio" 
                  name="plan" 
                  className="hidden" 
                  value={p.id} 
                  checked={selectedPlanId === p.id}
                  onChange={() => setSelectedPlanId(p.id)}
                />
                <div className="flex justify-between items-center mb-2">
                  <span className="font-bold text-slate-900 text-lg">{p.nome}</span>
                  <span className="bg-indigo-600 text-white px-3 py-1 rounded-full text-xs font-bold">
                    R$ {formatMoney(p.valor_mensal)}/mês
                  </span>
                </div>
                <ul className="space-y-1">
                  <li className="flex items-center gap-2 text-sm text-slate-600">
                    <CheckCircle className="w-4 h-4 text-emerald-500" />
                    {p.limite_usuarios === 9999 ? 'Usuários Ilimitados' : `${p.limite_usuarios} Usuários`}
                  </li>
                  <li className="flex items-center gap-2 text-sm text-slate-600">
                    <CheckCircle className="w-4 h-4 text-emerald-500" />
                    {p.modulos?.length > 0 ? `${p.modulos.length} módulos adicionais` : 'Módulos básicos'}
                  </li>
                </ul>
              </label>
            ))}
          </div>
        )}

        <button 
          onClick={() => selectedPlan?.id && handleSubscribe(selectedPlan.id)}
          disabled={loading || !selectedPlan?.stripe_price_id}
          className="w-full bg-indigo-600 text-white py-4 rounded-2xl font-bold hover:bg-indigo-700 transition-all shadow-lg shadow-indigo-200 disabled:opacity-50 flex items-center justify-center gap-2"
        >
          {loading ? (
            <>
              <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
              Processando...
            </>
          ) : (
            <>
              <CreditCard className="w-5 h-5" />
              Realizar Pagamento
            </>
          )}
        </button>
        
        <div className="flex flex-col gap-3 mt-6">
          <button 
            disabled={loading}
            onClick={async () => {
              setLoading(true);
              setError('');
              try {
                const res = await fetch('/api/auth/me', { headers: { 'Authorization': `Bearer ${token}` } });
                if (res.ok) {
                  const data = await res.json();
                  if (data.user?.status_assinatura === 'ativo') {
                    useAuthStore.getState().setAuth(data.user, token!);
                    window.location.href = '/dashboard';
                    return;
                  } else if (data.user?.status_assinatura === 'cancelado') {
                    setError('Sua assinatura anterior foi cancelada ou não foi encontrada. Por favor, escolha um plano abaixo para realizar uma nova assinatura.');
                  } else {
                    setError('Pagamento não identificado. Se você acabou de pagar, aguarde um minuto e tente novamente.');
                  }
                }
              } catch (e) {
                setError('Erro ao verificar status. Tente novamente em instantes.');
              } finally {
                setLoading(false);
              }
            }}
            className="text-indigo-600 font-bold hover:text-indigo-800 transition-all text-sm bg-indigo-50 px-4 py-3 rounded-xl mx-auto w-fit"
          >
            Já realizei o pagamento (verificar)
          </button>

          <button 
            type="button"
            onClick={() => {
              useAuthStore.getState().logout();
              // Force redirect back to login if navigate in store didn't happen
              window.location.href = '/login';
            }}
            className="text-slate-400 font-semibold hover:text-slate-600 transition-all text-sm"
          >
            Sair e entrar com outra conta
          </button>
        </div>
      </motion.div>
      <SupportWidget />
    </div>
  );
};

export default Subscription;
