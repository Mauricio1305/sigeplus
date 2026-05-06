import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion } from 'motion/react';
import { AlertCircle, CheckCircle } from 'lucide-react';

export const ForgotPassword = () => {
  const [email, setEmail] = useState('');
  const [codigo, setCodigo] = useState('');
  const [novaSenha, setNovaSenha] = useState('');
  const [confirmarSenha, setConfirmarSenha] = useState('');
  const [step, setStep] = useState(1);
  const [timer, setTimer] = useState(120);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const navigate = useNavigate();

  useEffect(() => {
    let interval: any;
    if (step === 2 && timer > 0) {
      interval = setInterval(() => {
        setTimer((prev) => prev - 1);
      }, 1000);
    } else if (timer === 0) {
      setError('O código expirou. Por favor, solicite um novo.');
    }
    return () => clearInterval(interval);
  }, [step, timer]);

  const handleSendCode = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');
    try {
      const res = await fetch('/api/auth/forgot-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email })
      });
      const data = await res.json();
      if (res.ok) {
        setStep(2);
        setTimer(120);
        setMessage('Código enviado para o seu e-mail.');
      } else {
        setError(data.error || 'Erro ao enviar código.');
      }
    } catch (err) {
      setError('Erro de conexão.');
    } finally {
      setLoading(false);
    }
  };

  const handleResetPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (novaSenha !== confirmarSenha) {
      return setError('As senhas não coincidem.');
    }
    if (timer === 0) {
      return setError('O código expirou. Solicite um novo.');
    }
    setLoading(true);
    setError('');
    try {
      const res = await fetch('/api/auth/reset-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, codigo, novaSenha })
      });
      const data = await res.json();
      if (res.ok) {
        alert('Senha alterada com sucesso!');
        navigate('/login');
      } else {
        setError(data.error || 'Erro ao resetar senha.');
      }
    } catch (err) {
      setError('Erro de conexão.');
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
          <h2 className="text-3xl font-bold text-slate-900">Recuperar Senha</h2>
          <p className="text-slate-500 mt-2">
            {step === 1 ? 'Informe seu e-mail para receber o código' : 'Informe o código e sua nova senha'}
          </p>
        </div>

        {error && (
          <div className="mb-6 p-4 bg-rose-50 border border-rose-100 rounded-2xl flex items-center gap-3 text-rose-600 text-sm font-medium">
            <AlertCircle className="w-5 h-5 shrink-0" />
            <p>{error}</p>
          </div>
        )}

        {message && !error && (
          <div className="mb-6 p-4 bg-emerald-50 border border-emerald-100 rounded-2xl flex items-center gap-3 text-emerald-600 text-sm font-medium">
            <CheckCircle className="w-5 h-5 shrink-0" />
            <p>{message}</p>
          </div>
        )}

        {step === 1 ? (
          <form onSubmit={handleSendCode} className="space-y-4">
            <div>
              <label className="block text-sm font-semibold text-slate-700 mb-1">E-mail</label>
              <input 
                type="email" 
                className="w-full px-4 py-3 rounded-xl border border-slate-200 focus:ring-2 focus:ring-indigo-500 outline-none transition-all"
                value={email}
                onChange={e => setEmail(e.target.value)}
                required
              />
            </div>
            <button 
              type="submit"
              disabled={loading}
              className="w-full bg-indigo-600 text-white py-3 rounded-xl font-bold hover:bg-indigo-700 transition-all shadow-lg shadow-indigo-200 disabled:opacity-50"
            >
              {loading ? 'Enviando...' : 'Receber Código'}
            </button>
          </form>
        ) : (
          <form onSubmit={handleResetPassword} className="space-y-4">
            <div className="text-center mb-4">
              <span className={`text-lg font-bold ${timer < 30 ? 'text-rose-600' : 'text-indigo-600'}`}>
                Expira em: {Math.floor(timer / 60)}:{(timer % 60).toString().padStart(2, '0')}
              </span>
            </div>
            <div>
              <label className="block text-sm font-semibold text-slate-700 mb-1">Código</label>
              <input 
                type="text" 
                className="w-full px-4 py-3 rounded-xl border border-slate-200 focus:ring-2 focus:ring-indigo-500 outline-none transition-all text-center tracking-widest font-bold"
                value={codigo}
                onChange={e => setCodigo(e.target.value)}
                required
                maxLength={6}
              />
            </div>
            <div>
              <label className="block text-sm font-semibold text-slate-700 mb-1">Nova Senha</label>
              <input 
                type="password" 
                className="w-full px-4 py-3 rounded-xl border border-slate-200 focus:ring-2 focus:ring-indigo-500 outline-none transition-all"
                value={novaSenha}
                onChange={e => setNovaSenha(e.target.value)}
                required
              />
            </div>
            <div>
              <label className="block text-sm font-semibold text-slate-700 mb-1">Confirmar Nova Senha</label>
              <input 
                type="password" 
                className="w-full px-4 py-3 rounded-xl border border-slate-200 focus:ring-2 focus:ring-indigo-500 outline-none transition-all"
                value={confirmarSenha}
                onChange={e => setConfirmarSenha(e.target.value)}
                required
              />
            </div>
            <button 
              type="submit"
              disabled={loading || timer === 0}
              className="w-full bg-indigo-600 text-white py-3 rounded-xl font-bold hover:bg-indigo-700 transition-all shadow-lg shadow-indigo-200 disabled:opacity-50"
            >
              {loading ? 'Processando...' : 'Alterar Senha'}
            </button>
            <button 
              type="button"
              onClick={() => {
                setStep(1);
                setError('');
                setMessage('');
              }}
              className="w-full text-slate-500 font-semibold hover:underline"
            >
              Reenviar Código
            </button>
          </form>
        )}

        <div className="mt-6 text-center">
          <button 
            onClick={() => navigate('/login')}
            className="text-indigo-600 font-semibold hover:underline"
          >
            Voltar para o Login
          </button>
        </div>
      </motion.div>
    </div>
  );
};

export default ForgotPassword;
