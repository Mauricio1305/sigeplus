import React, { useState, useEffect } from 'react';
import { User as UserIcon, CreditCard, Camera, AlertCircle, CheckCircle, Settings as SettingsIcon } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { useSearchParams } from 'react-router-dom';
import { useAuthStore } from '../store/authStore';
import { FormField } from '../components/ui/FormField';

export const UserProfile = () => {
  const user = useAuthStore(state => state.user);
  const token = useAuthStore(state => state.token);
  const setAuth = useAuthStore(state => state.setAuth);
  const [searchParams] = useSearchParams();
  const [activeTab, setActiveTab] = useState<'profile' | 'subscription'>('profile');
  const [nome, setNome] = useState(user?.nome || '');
  const [senha, setSenha] = useState('');
  const [confirmarSenha, setConfirmarSenha] = useState('');
  const [avatar, setAvatar] = useState(user?.avatar || '');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  
  const [company, setCompany] = useState<any>(null);
  const [plans, setPlans] = useState<any[]>([]);
  const [loadingSubscription, setLoadingSubscription] = useState(false);

  useEffect(() => {
    if (activeTab === 'subscription') {
      fetchCompany();
      fetchPlans();
    }
  }, [activeTab]);

  useEffect(() => {
    const success_msg = searchParams.get('success');
    const canceled_msg = searchParams.get('canceled');
    if (success_msg) setSuccess('Assinatura atualizada com sucesso!');
    if (canceled_msg) setError('O processo de assinatura foi cancelado.');
  }, [searchParams]);

  const fetchCompany = async () => {
    try {
      const res = await fetch('/api/company/settings', {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (res.ok) {
        const data = await res.json();
        setCompany(data);
      }
    } catch (err) {
      console.error("Error fetching company:", err);
    }
  };

  const fetchPlans = async () => {
    try {
      const res = await fetch('/api/plans', {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (res.ok) {
        const data = await res.json();
        setPlans(data);
      }
    } catch (err) {
      console.error("Error fetching plans:", err);
    }
  };

  const handleStripeCheckout = async (planoId: number) => {
    setLoadingSubscription(true);
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
        const stripeWindow = window.open(data.url, 'stripe_checkout', 'width=600,height=700');
        if (!stripeWindow) {
          window.location.href = data.url;
        }
      } else {
        setError(data.error || 'Erro ao iniciar checkout');
      }
    } catch (err) {
      setError('Erro ao conectar com Stripe');
    } finally {
      setLoadingSubscription(false);
    }
  };

  const handleStripePortal = async () => {
    setLoadingSubscription(true);
    try {
      const res = await fetch('/api/stripe/create-portal-session', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });
      const data = await res.json();
      if (data.url) {
        const portalWindow = window.open(data.url, 'stripe_portal', 'width=600,height=700');
        if (!portalWindow) {
          window.location.href = data.url;
        }
      } else {
        setError(data.error || 'Erro ao abrir portal');
      }
    } catch (err) {
      setError('Erro ao conectar com Stripe');
    } finally {
      setLoadingSubscription(false);
    }
  };

  const formatVencimento = (dateString: string) => {
    if (!dateString) return '-';
    if (dateString.includes('T')) {
      const [year, month, day] = dateString.split('T')[0].split('-');
      return `${day}/${month}/${year}`;
    }
    return new Date(dateString).toLocaleDateString('pt-BR');
  };

  const compressImage = (file: File): Promise<string> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.readAsDataURL(file);
      reader.onload = (event) => {
        const img = new Image();
        img.src = event.target?.result as string;
        img.onload = () => {
          const canvas = document.createElement('canvas');
          const MAX_WIDTH = 400;
          const MAX_HEIGHT = 400;
          let width = img.width;
          let height = img.height;

          if (width > height) {
            if (width > MAX_WIDTH) {
              height *= MAX_WIDTH / width;
              width = MAX_WIDTH;
            }
          } else {
            if (height > MAX_HEIGHT) {
              width *= MAX_HEIGHT / height;
              height = MAX_HEIGHT;
            }
          }

          canvas.width = width;
          canvas.height = height;
          const ctx = canvas.getContext('2d');
          ctx?.drawImage(img, 0, 0, width, height);
          
          const dataUrl = canvas.toDataURL('image/jpeg', 0.7);
          resolve(dataUrl);
        };
        img.onerror = (err) => reject(err);
      };
      reader.onerror = (err) => reject(err);
    });
  };

  const handleImageChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      try {
        setLoading(true);
        setError('');
        const compressedBase64 = await compressImage(file);
        setAvatar(compressedBase64);
      } catch (err) {
        console.error("Erro ao comprimir imagem:", err);
        setError('Erro ao processar a imagem. Tente outra.');
      } finally {
        setLoading(false);
      }
    }
  };

  const validate = () => {
    const errors: Record<string, string> = {};
    if (!nome) errors.nome = 'Nome é obrigatório';
    if (senha && senha.length < 6) errors.senha = 'A senha deve ter pelo menos 6 caracteres';
    if (senha && senha !== confirmarSenha) errors.confirmarSenha = 'As senhas não coincidem';
    setFieldErrors(errors);
    return Object.keys(errors).length === 0;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!validate()) return;
    
    setError('');
    setSuccess('');
    setLoading(true);
    try {
      const res = await fetch('/api/auth/profile', {
        method: 'PUT',
        headers: { 
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({ nome, avatar, senha })
      });

      const data = await res.json();
      if (res.ok) {
        setAuth(data.user, token!);
        setSuccess('Perfil atualizado com sucesso!');
        setSenha('');
        setConfirmarSenha('');
      } else {
        setError(data.error || 'Erro ao atualizar perfil');
      }
    } catch (err) {
      console.error("Profile update error:", err);
      setError('Erro de conexão com o servidor');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="max-w-6xl mx-auto">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-8">
        <div className="flex items-center gap-4">
          <div className="bg-indigo-600 p-3 rounded-2xl">
            <UserIcon className="text-white w-8 h-8" />
          </div>
          <div>
            <h2 className="text-3xl font-bold text-slate-900">Meu Perfil</h2>
            <p className="text-slate-500">Gerencie suas informações e assinatura</p>
          </div>
        </div>

        <div className="flex bg-white p-1 rounded-2xl border border-slate-100 shadow-sm self-start">
          <button
            onClick={() => setActiveTab('profile')}
            className={`px-6 py-2.5 rounded-xl text-sm font-bold transition-all flex items-center gap-2 ${
              activeTab === 'profile'
                ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-100'
                : 'text-slate-500 hover:bg-slate-50'
            }`}
          >
            <UserIcon className="w-4 h-4" />
            Perfil
          </button>
          <button
            onClick={() => setActiveTab('subscription')}
            className={`px-6 py-2.5 rounded-xl text-sm font-bold transition-all flex items-center gap-2 ${
              activeTab === 'subscription'
                ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-100'
                : 'text-slate-500 hover:bg-slate-50'
            }`}
          >
            <CreditCard className="w-4 h-4" />
            Assinatura
          </button>
        </div>
      </div>

      <AnimatePresence mode="wait">
        {activeTab === 'profile' ? (
          <motion.div
            key="profile"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -20 }}
            className="max-w-2xl mx-auto w-full"
          >
            <div className="bg-white rounded-3xl shadow-sm border border-slate-100 overflow-hidden">
              <form onSubmit={handleSubmit} className="p-8 space-y-6" noValidate>
                {error && (
                  <div className="p-4 bg-rose-50 border border-rose-100 rounded-2xl flex items-center gap-3 text-rose-600 text-sm font-medium">
                    <AlertCircle className="w-5 h-5 shrink-0" />
                    <p>{error}</p>
                  </div>
                )}
                {success && (
                  <div className="p-4 bg-emerald-50 border border-emerald-100 rounded-2xl flex items-center gap-3 text-emerald-600 text-sm font-medium">
                    <CheckCircle className="w-5 h-5 shrink-0" />
                    <p>{success}</p>
                  </div>
                )}

                <div className="flex flex-col items-center gap-4 pb-6 border-b border-slate-100">
                  <div className="relative group">
                    <div className="w-32 h-32 rounded-full bg-slate-100 border-4 border-white shadow-md overflow-hidden flex items-center justify-center text-slate-400">
                      {avatar ? (
                        <img src={avatar} alt="Avatar" className="w-full h-full object-cover" referrerPolicy="no-referrer" />
                      ) : (
                        <UserIcon className="w-16 h-16" />
                      )}
                    </div>
                    <label className="absolute bottom-0 right-0 bg-indigo-600 p-2 rounded-full text-white cursor-pointer shadow-lg hover:bg-indigo-700 transition-all">
                      <Camera className="w-5 h-5" />
                      <input type="file" className="hidden" accept="image/*" onChange={handleImageChange} />
                    </label>
                  </div>
                  <p className="text-xs text-slate-500">Clique no ícone da câmera para alterar sua foto</p>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <FormField label="Nome Completo" error={fieldErrors.nome} required>
                    <input 
                      type="text" 
                      className={`w-full px-4 py-3 rounded-xl border outline-none transition-all ${fieldErrors.nome ? 'border-rose-500 bg-rose-50 focus:ring-rose-200' : 'border-slate-200 focus:ring-indigo-500'}`}
                      value={nome}
                      onChange={e => {
                        setNome(e.target.value);
                        if (fieldErrors.nome) setFieldErrors({...fieldErrors, nome: ''});
                      }}
                    />
                  </FormField>
                  <FormField label="E-mail (Não alterável)">
                    <input 
                      type="email" 
                      className="w-full px-4 py-3 rounded-xl border border-slate-200 bg-slate-50 text-slate-500 cursor-not-allowed"
                      value={user?.email}
                      disabled
                    />
                  </FormField>
                </div>

                <div className="pt-6 border-t border-slate-100">
                  <h3 className="text-lg font-bold text-slate-900 mb-4">Alterar Senha</h3>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <FormField label="Nova Senha" error={fieldErrors.senha}>
                      <input 
                        type="password" 
                        className={`w-full px-4 py-3 rounded-xl border outline-none transition-all ${fieldErrors.senha ? 'border-rose-500 bg-rose-50 focus:ring-rose-200' : 'border-slate-200 focus:ring-indigo-500'}`}
                        value={senha}
                        onChange={e => {
                          setSenha(e.target.value);
                          if (fieldErrors.senha) setFieldErrors({...fieldErrors, senha: ''});
                        }}
                        placeholder="Deixe em branco para não alterar"
                      />
                    </FormField>
                    <FormField label="Confirmar Nova Senha" error={fieldErrors.confirmarSenha}>
                      <input 
                        type="password" 
                        className={`w-full px-4 py-3 rounded-xl border outline-none transition-all ${fieldErrors.confirmarSenha ? 'border-rose-500 bg-rose-50 focus:ring-rose-200' : 'border-slate-200 focus:ring-indigo-500'}`}
                        value={confirmarSenha}
                        onChange={e => {
                          setConfirmarSenha(e.target.value);
                          if (fieldErrors.confirmarSenha) setFieldErrors({...fieldErrors, confirmarSenha: ''});
                        }}
                        placeholder="Confirme a nova senha"
                      />
                    </FormField>
                  </div>
                </div>

                <div className="flex justify-end pt-4">
                  <button 
                    type="submit"
                    disabled={loading}
                    className="bg-indigo-600 text-white px-8 py-3 rounded-xl font-bold hover:bg-indigo-700 transition-all shadow-lg shadow-indigo-200 disabled:opacity-50"
                  >
                    {loading ? 'Salvando...' : 'Salvar Alterações'}
                  </button>
                </div>
              </form>
            </div>
          </motion.div>
        ) : (
          <motion.div
            key="subscription"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -20 }}
            className="space-y-6"
          >
            {error && (
              <div className="p-4 bg-rose-50 border border-rose-100 rounded-2xl flex items-center gap-3 text-rose-600 text-sm font-medium">
                <AlertCircle className="w-5 h-5 shrink-0" />
                <p>{error}</p>
              </div>
            )}
            {success && (
              <div className="p-4 bg-emerald-50 border border-emerald-100 rounded-2xl flex items-center gap-3 text-emerald-600 text-sm font-medium">
                <CheckCircle className="w-5 h-5 shrink-0" />
                <p>{success}</p>
              </div>
            )}

            <div className="bg-white rounded-3xl shadow-sm border border-slate-100 p-8">
              <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
                <div className="flex items-center gap-4">
                  <div className="bg-indigo-50 p-4 rounded-2xl">
                    <CreditCard className="text-indigo-600 w-8 h-8" />
                  </div>
                  <div>
                    <h3 className="text-xl font-bold text-slate-900">
                      Plano Atual: <span className="text-indigo-600">{company?.plano_nome || 'Nenhum'}</span>
                    </h3>
                    <div className="flex flex-wrap gap-x-4 gap-y-1 mt-1">
                      <p className="text-slate-500 text-sm">
                        Status: <span className={`font-bold ${company?.status_assinatura === 'ativo' ? 'text-emerald-600' : 'text-rose-600'}`}>{company?.status_assinatura || 'N/A'}</span>
                      </p>
                      <p className="text-slate-500 text-sm">
                        Vencimento: <span className="font-medium text-slate-700">{formatVencimento(company?.vencimento_assinatura)}</span>
                      </p>
                    </div>
                  </div>
                </div>
                {company?.stripe_subscription_id && (
                  <button
                    onClick={handleStripePortal}
                    disabled={loadingSubscription}
                    className="flex items-center gap-2 bg-slate-900 text-white px-6 py-3 rounded-xl font-bold hover:bg-slate-800 transition-all shadow-lg shadow-slate-200 disabled:opacity-50"
                  >
                    <SettingsIcon className="w-5 h-5" />
                    Gerenciar Assinatura
                  </button>
                )}
              </div>
            </div>

            <div className="bg-white rounded-3xl shadow-sm border border-slate-100 p-8">
              <h4 className="text-sm font-bold text-slate-400 uppercase mb-4">Informações da Empresa</h4>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div>
                  <p className="text-xs font-bold text-slate-400 uppercase mb-1">Empresa</p>
                  <p className="font-medium text-slate-900">{company?.nome_fantasia || 'Não informado'}</p>
                </div>
                <div>
                  <p className="text-xs font-bold text-slate-400 uppercase mb-1">Tenant ID</p>
                  <p className="font-mono text-xs text-slate-600 bg-slate-50 p-2 rounded-lg inline-block border border-slate-100">{company?.tenant_id || 'Não informado'}</p>
                </div>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              {plans.map((plan) => (
                <div 
                  key={plan.id}
                  className={`bg-white rounded-3xl p-8 border-2 transition-all relative overflow-hidden flex flex-col ${
                    company?.plano_id === plan.id 
                      ? 'border-indigo-600 shadow-xl shadow-indigo-50' 
                      : 'border-slate-100 hover:border-indigo-200'
                  }`}
                >
                  {company?.plano_id === plan.id && (
                    <div className="absolute top-0 right-0 bg-indigo-600 text-white px-4 py-1 rounded-bl-xl text-xs font-bold">
                      Plano Atual
                    </div>
                  )}
                  <h4 className="text-xl font-bold text-slate-900 mb-2">{plan.nome}</h4>
                  <div className="flex items-baseline gap-1 mb-6">
                    <span className="text-3xl font-bold text-slate-900">R$ {Number(plan.valor_mensal || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</span>
                    <span className="text-slate-500 text-sm">/mês</span>
                  </div>
                  
                  <ul className="space-y-4 mb-8 flex-grow">
                    <li className="flex items-center gap-3 text-slate-600">
                      <CheckCircle className="w-5 h-5 text-emerald-500 shrink-0" />
                      <span>Até {plan.limite_usuarios === 9999 ? 'Ilimitados' : plan.limite_usuarios} usuários</span>
                    </li>
                    <li className="flex items-center gap-3 text-slate-600">
                      <CheckCircle className="w-5 h-5 text-emerald-500 shrink-0" />
                      <span>Suporte prioritário</span>
                    </li>
                    <li className="flex items-center gap-3 text-slate-600">
                      <CheckCircle className="w-5 h-5 text-emerald-500 shrink-0" />
                      <span>Acesso a todos os módulos</span>
                    </li>
                  </ul>

                  <button
                    onClick={() => handleStripeCheckout(plan.id)}
                    disabled={loadingSubscription || company?.plano_id === plan.id}
                    className={`w-full py-3 rounded-xl font-bold transition-all ${
                      company?.plano_id === plan.id
                        ? 'bg-slate-100 text-slate-400 cursor-not-allowed'
                        : 'bg-indigo-600 text-white hover:bg-indigo-700 shadow-lg shadow-indigo-100'
                    }`}
                  >
                    {company?.plano_id === plan.id ? 'Plano Atual' : 'Selecionar Plano'}
                  </button>
                </div>
              ))}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};

export default UserProfile;
