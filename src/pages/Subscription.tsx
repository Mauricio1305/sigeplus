import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { CreditCard, AlertCircle, CheckCircle } from 'lucide-react';
import { motion } from 'motion/react';
import { useAuthStore } from '../store/authStore';
import { formatMoney } from '../utils/format';

export const Subscription = () => {
  const user = useAuthStore(state => state.user);
  const token = useAuthStore(state => state.token);
  const [plans, setPlans] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const navigate = useNavigate();

  useEffect(() => {
    fetch('/api/plans').then(res => res.json()).then(setPlans);
  }, []);

  const selectedPlan = plans.find(p => {
    const planId = Number(p.id);
    const userPlanoId = Number(user?.plano_id);
    return planId === userPlanoId;
  });
  
  useEffect(() => {
    if (!selectedPlan && plans.length > 0) {
        console.warn('Plan not found for user!', { userPlanoId: user?.plano_id, availablePlans: plans });
    }
  }, [user, plans, selectedPlan]);

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
        // Open Stripe Checkout in a popup
        const width = 600;
        const height = 800;
        const left = window.screenX + (window.outerWidth - width) / 2;
        const top = window.screenY + (window.outerHeight - height) / 2;
        
        const popup = window.open(
          data.url, 
          'Stripe Checkout', 
          `width=${width},height=${height},left=${left},top=${top}`
        );

        if (!popup) {
          setError('Por favor, habilite popups no seu navegador para realizar o pagamento.');
          setLoading(false);
          return;
        }

        const checkPopupClosed = setInterval(() => {
          if (popup.closed) {
            clearInterval(checkPopupClosed);
            setLoading(false);
          }
        }, 1000);

        const handleMessage = async (event: MessageEvent) => {
          const origin = event.origin;
          if (!origin.endsWith('.run.app') && !origin.includes('localhost')) return;
          
          if (event.data?.type === 'STRIPE_SUCCESS') {
            clearInterval(checkPopupClosed);
            window.removeEventListener('message', handleMessage);
            
            // Poll for subscription status update
            let attempts = 0;
            const maxAttempts = 10;
            
            const checkStatus = async () => {
              try {
                const sessionId = event.data.sessionId;
                if (sessionId) {
                  const verifyRes = await fetch('/api/stripe/verify-session', {
                    method: 'POST',
                    headers: { 
                      'Content-Type': 'application/json',
                      'Authorization': `Bearer ${token}` 
                    },
                    body: JSON.stringify({ sessionId })
                  });
                  
                  if (verifyRes.ok) {
                    const verifyData = await verifyRes.json();
                    if (verifyData.success) {
                      const meRes = await fetch('/api/auth/me', {
                        headers: { 'Authorization': `Bearer ${token}` }
                      });
                      if (meRes.ok) {
                        const meData = await meRes.json();
                        if (meData.user.status_assinatura === 'ativo') {
                          useAuthStore.getState().setAuth(meData.user, token!);
                          window.location.href = '/dashboard';
                          return;
                        }
                      }
                    }
                  }
                } else {
                  // Fallback if no sessionId provided
                  const meRes = await fetch('/api/auth/me', {
                    headers: { 'Authorization': `Bearer ${token}` }
                  });
                  if (meRes.ok) {
                    const meData = await meRes.json();
                    if (meData.user.status_assinatura === 'ativo') {
                      useAuthStore.getState().setAuth(meData.user, token!);
                      window.location.href = '/dashboard';
                      return;
                    }
                  }
                }
              } catch (e) {
                console.error("Error checking status:", e);
              }
              
              attempts++;
              if (attempts < maxAttempts) {
                setTimeout(checkStatus, 2000); // Check every 2 seconds
              } else {
                setError('O pagamento foi recebido, mas a ativação está demorando. Por favor, atualize a página em alguns instantes.');
                setLoading(false);
              }
            };
            
            checkStatus();
          }
        };

        window.addEventListener('message', handleMessage);
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

  // If we haven't loaded plans, show a loader
  if (plans.length === 0) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4">
        <div className="text-center">
            <div className="w-8 h-8 border-4 border-indigo-600 border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
            <p className="text-slate-600">Carregando informações do plano...</p>
        </div>
      </div>
    );
  }

  // If plans loaded but we didn't find the user's plan
  if (!selectedPlan) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4">
        <div className="bg-white p-8 rounded-3xl shadow-xl text-center max-w-md w-full">
          <h2 className="text-2xl font-bold text-slate-900 mb-4">Plano não encontrado</h2>
          <p className="text-slate-500 mb-6">Não conseguimos identificar o seu plano (ID: {user?.plano_id}). Por favor, entre em contato com o suporte técnico.</p>
          <button onClick={() => navigate('/dashboard')} className="w-full bg-indigo-600 text-white py-3 rounded-xl font-bold">Voltar ao Dashboard</button>
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

        {selectedPlan && (
          <div className="bg-slate-50 p-6 rounded-2xl border border-slate-100 mb-8 text-left">
            <div className="flex justify-between items-start mb-4">
              <div>
                <h3 className="font-bold text-slate-900 text-lg">{selectedPlan.nome}</h3>
                <p className="text-sm text-slate-500">Plano Selecionado</p>
              </div>
              <span className="bg-indigo-600 text-white px-3 py-1 rounded-full text-xs font-bold">
                R$ {formatMoney(selectedPlan.valor_mensal)}/mês
              </span>
            </div>
            <ul className="space-y-2">
              <li className="flex items-center gap-2 text-sm text-slate-600">
                <CheckCircle className="w-4 h-4 text-emerald-500" />
                {selectedPlan.limite_usuarios === 9999 ? 'Usuários Ilimitados' : `${selectedPlan.limite_usuarios} Usuários`}
              </li>
              <li className="flex items-center gap-2 text-sm text-slate-600">
                <CheckCircle className="w-4 h-4 text-emerald-500" />
                Acesso a todos os módulos
              </li>
              <li className="flex items-center gap-2 text-sm text-slate-600">
                <CheckCircle className="w-4 h-4 text-emerald-500" />
                Suporte prioritário
              </li>
            </ul>
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
        
        <button 
          onClick={() => useAuthStore.getState().logout()}
          className="mt-6 text-slate-400 font-semibold hover:text-slate-600 transition-all text-sm"
        >
          Sair e entrar com outra conta
        </button>
      </motion.div>
    </div>
  );
};

export default Subscription;
