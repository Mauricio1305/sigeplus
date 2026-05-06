import React, { useState, useEffect } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { AlertCircle } from 'lucide-react';
import { useAuthStore } from '../store/authStore';

export const StripeSuccess = () => {
  const location = useLocation();
  const navigate = useNavigate();
  const token = useAuthStore(state => state.token);
  const [status, setStatus] = useState('Processando sua assinatura...');
  const [error, setError] = useState('');

  useEffect(() => {
    const params = new URLSearchParams(location.search);
    const sessionId = params.get('session_id');

    if (sessionId) {
      if (window.opener) {
        window.opener.postMessage({ type: 'STRIPE_SUCCESS', sessionId }, '*');
        window.close();
      } else {
        let attempts = 0;
        const maxAttempts = 10;
        
        const checkStatus = async () => {
          try {
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
                    useAuthStore.getState().setAuth(meData.user, token);
                    setStatus('Pagamento confirmado! Redirecionando...');
                    setTimeout(() => navigate('/dashboard', { replace: true }), 2000);
                    return;
                  }
                }
              }
            }
          } catch (e) {
            console.error("Error checking status:", e);
          }
          
          attempts++;
          if (attempts < maxAttempts) {
            setTimeout(checkStatus, 2000);
          } else {
            setError('O pagamento foi recebido, mas a ativação está demorando. Por favor, acesse o painel em alguns instantes.');
            setTimeout(() => navigate('/dashboard', { replace: true }), 5000);
          }
        };
        
        checkStatus();
      }
    } else {
      navigate('/dashboard', { replace: true });
    }
  }, [location, navigate, token]);

  return (
    <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4">
      <div className="bg-white p-8 rounded-2xl shadow-xl text-center max-w-sm w-full">
        <div className={`w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-4 ${error ? 'bg-rose-100 text-rose-600' : 'bg-emerald-100 text-emerald-600'}`}>
          {error ? (
            <AlertCircle className="w-8 h-8" />
          ) : (
            <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
            </svg>
          )}
        </div>
        <h2 className="text-2xl font-bold text-slate-900 mb-2">
          {error ? 'Atenção' : 'Pagamento Aprovado!'}
        </h2>
        <p className={`mb-6 ${error ? 'text-rose-600' : 'text-slate-500'}`}>
          {error || status}
        </p>
        {!error && !status.includes('Redirecionando') && (
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-600 mx-auto"></div>
        )}
      </div>
    </div>
  );
};

export const StripePortalReturn = () => {
  useEffect(() => {
    if (window.opener) {
      window.close();
    } else {
      window.location.href = '/settings';
    }
  }, []);

  return (
    <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4">
      <div className="bg-white p-8 rounded-2xl shadow-xl text-center max-w-sm w-full">
        <h2 className="text-2xl font-bold text-slate-900 mb-2">Retornando...</h2>
        <p className="text-slate-500 mb-6">Você pode fechar esta janela.</p>
      </div>
    </div>
  );
};
