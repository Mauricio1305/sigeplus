import React, { useState, useEffect } from 'react';
import { Settings as SettingsIcon, Users, Edit2, X } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { useNavigate, useLocation, Link } from 'react-router-dom';
import { useAuthStore } from '../store/authStore';
import { Toast } from '../components/ui/Toast';
import { FormField } from '../components/ui/FormField';

export const Settings = () => {
  const user = useAuthStore(state => state.user);
  const token = useAuthStore(state => state.token);
  const navigate = useNavigate();
  const location = useLocation();
  const [activeTab, setActiveTab] = useState<'general' | 'finance'>('general');
  const [loading, setLoading] = useState(false);
  const [toast, setToast] = useState<{message: string, type: 'success' | 'error'} | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [financeFieldErrors, setFinanceFieldErrors] = useState<Record<string, string>>({});
  const [company, setCompany] = useState<any>({
    nome_fantasia: '',
    razao_social: '',
    cnpj: '',
    email: '',
    telefone_fixo: '',
    telefone_celular: '',
    endereco: '',
    numero: '',
    cep: '',
    cidade: '',
    estado: ''
  });

  useEffect(() => {
    const handleMessage = (event: MessageEvent) => {
      const origin = event.origin;
      if (!origin.endsWith('.run.app') && !origin.includes('localhost')) {
        return;
      }
      
      if (event.data?.type === 'STRIPE_SUCCESS' && event.data?.sessionId) {
        setLoading(true);
        fetch('/api/stripe/verify-session', {
          method: 'POST',
          headers: { 
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${token}`
          },
          body: JSON.stringify({ sessionId: event.data.sessionId })
        })
        .then(res => res.json())
        .then(data => {
          if (data.success) {
            setToast({ message: 'Assinatura confirmada com sucesso!', type: 'success' });
            setTimeout(() => setToast(null), 5000);
            fetch('/api/company/settings', {
              headers: { 'Authorization': `Bearer ${token}` }
            })
            .then(res => res.json())
            .then(setCompany);
          }
        })
        .catch(err => console.error("Verification error:", err))
        .finally(() => setLoading(false));
      }
    };

    window.addEventListener('message', handleMessage);
    return () => window.removeEventListener('message', handleMessage);
  }, [token]);

  useEffect(() => {
    const params = new URLSearchParams(location.search);
    const tab = params.get('tab');
    if (tab === 'finance' || tab === 'general') {
      setActiveTab(tab as 'general' | 'finance');
    }
  }, [location]);

  const [paymentTypes, setPaymentTypes] = useState<any[]>([]);
  const [categories, setCategories] = useState<any[]>([]);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [modalType, setModalType] = useState<'category' | 'paymentType'>('category');
  const [selectedItem, setSelectedItem] = useState<any>(null);
  const [formData, setFormData] = useState<any>({});

  useEffect(() => {
    fetch('/api/company/settings', {
      headers: { 'Authorization': `Bearer ${token}` }
    })
    .then(res => res.json())
    .then(data => {
      if (data) setCompany(data);
    })
    .catch(err => console.error("Error fetching company settings:", err));
  }, [token]);

  const fetchPaymentTypes = () => {
    fetch('/api/finance/payment-types', { headers: { 'Authorization': `Bearer ${token}` } })
      .then(res => res.json())
      .then(setPaymentTypes)
      .catch(err => console.error("Error fetching payment types:", err));
  };

  const fetchCategories = () => {
    fetch('/api/finance/categories', { headers: { 'Authorization': `Bearer ${token}` } })
      .then(res => res.json())
      .then(setCategories)
      .catch(err => console.error("Error fetching categories:", err));
  };

  useEffect(() => {
    if (activeTab === 'finance') {
      fetchPaymentTypes();
      fetchCategories();
    }
  }, [activeTab, token]);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    const errors: Record<string, string> = {};
    if (!company.nome_fantasia) errors.nome_fantasia = 'Nome Fantasia é obrigatório';
    if (!company.email) errors.email = 'E-mail é obrigatório';
    
    if (Object.keys(errors).length > 0) {
      setFieldErrors(errors);
      return;
    }

    setFieldErrors({});
    setLoading(true);
    try {
      const res = await fetch('/api/company/settings', {
        method: 'PUT',
        headers: { 
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify(company)
      });
      if (res.ok) {
        setToast({ message: 'Dados da empresa atualizados com sucesso!', type: 'success' });
      } else {
        const data = await res.json();
        setToast({ message: data.error || 'Erro ao salvar dados da empresa', type: 'error' });
      }
    } catch (err) {
      console.error("Error saving company settings:", err);
      setToast({ message: 'Erro de conexão ao salvar dados', type: 'error' });
    } finally {
      setLoading(false);
      setTimeout(() => setToast(null), 5000);
    }
  };

  const handleSubmitFinance = async (e: React.FormEvent) => {
    e.preventDefault();
    const errors: Record<string, string> = {};
    if (!formData.nome) errors.nome = 'Nome é obrigatório';
    if (modalType === 'paymentType') {
      if (formData.prazo_dias === undefined || formData.prazo_dias === null) errors.prazo_dias = 'Prazo é obrigatório';
      if (!formData.qtd_parcelas) errors.qtd_parcelas = 'Quantidade de parcelas é obrigatória';
    }
    
    if (Object.keys(errors).length > 0) {
      setFinanceFieldErrors(errors);
      return;
    }

    setFinanceFieldErrors({});
    let url = '';
    let method = 'POST';

    if (modalType === 'category') {
      if (selectedItem?.id) {
        url = `/api/finance/categories/${selectedItem.id}`;
        method = 'PUT';
      } else {
        url = '/api/finance/categories';
        method = 'POST';
      }
    }
    if (modalType === 'paymentType') {
      if (selectedItem?.id) {
        url = `/api/finance/payment-types/${selectedItem.id}`;
        method = 'PUT';
      } else {
        url = '/api/finance/payment-types';
        method = 'POST';
      }
    }

    try {
      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
        body: JSON.stringify(formData)
      });

      if (res.ok) {
        setToast({ message: 'Salvo com sucesso!', type: 'success' });
        setIsModalOpen(false);
        setFormData({});
        setSelectedItem(null);
        if (modalType === 'category') fetchCategories();
        if (modalType === 'paymentType') fetchPaymentTypes();
      } else {
        const data = await res.json();
        setToast({ message: data.message || 'Erro ao salvar', type: 'error' });
      }
    } catch (error) {
      console.error('Submit error:', error);
      setToast({ message: 'Erro de conexão com o servidor', type: 'error' });
    } finally {
      setTimeout(() => setToast(null), 5000);
    }
  };

  return (
    <div className="space-y-6 max-w-6xl relative">
      <AnimatePresence>
        {toast && (
          <Toast 
            message={toast.message} 
            type={toast.type} 
            onClose={() => setToast(null)} 
          />
        )}
      </AnimatePresence>
      <div className="flex justify-between items-center">
        <h1 className="text-3xl font-bold text-slate-900">Configurações</h1>
        <div className="flex bg-white p-1 rounded-xl border border-slate-100 shadow-sm">
          <button 
            onClick={() => setActiveTab('general')} 
            className={`px-4 py-2 rounded-lg font-bold text-sm transition-all ${activeTab === 'general' ? 'bg-indigo-600 text-white' : 'text-slate-500 hover:bg-slate-50'}`}
          >
            Geral
          </button>
          <button 
            onClick={() => setActiveTab('finance')} 
            className={`px-4 py-2 rounded-lg font-bold text-sm transition-all ${activeTab === 'finance' ? 'bg-indigo-600 text-white' : 'text-slate-500 hover:bg-slate-50'}`}
          >
            Cadastros Financeiros
          </button>
        </div>
      </div>
      
      {activeTab === 'general' && (
        <div className="space-y-6 max-w-4xl">
          {user?.perfil === 'superadmin' && (
            <div className="bg-indigo-600 p-6 rounded-2xl shadow-lg shadow-indigo-100 text-white flex justify-between items-center">
              <div>
                <h3 className="text-xl font-bold">Gestão de Planos</h3>
                <p className="text-indigo-100 text-sm">Gerencie, cadastre e edite os planos do sistema.</p>
              </div>
              <button 
                onClick={() => navigate('/admin')}
                className="bg-white text-indigo-600 px-4 py-2 rounded-xl font-bold hover:bg-indigo-50 transition-all"
              >
                Acessar Painel
              </button>
            </div>
          )}

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            <div className="lg:col-span-2 space-y-6">
              <div className="bg-white p-8 rounded-2xl shadow-sm border border-slate-100">
                <h3 className="text-lg font-bold text-slate-900 mb-6 flex items-center gap-2">
                  <SettingsIcon className="w-5 h-5 text-indigo-600" />
                  Dados da Empresa
                </h3>
                <form onSubmit={handleSave} className="grid grid-cols-1 md:grid-cols-2 gap-4" noValidate>
                  <div className="md:col-span-2">
                    <FormField label="Nome Fantasia" error={fieldErrors.nome_fantasia} required>
                      <input 
                        type="text" 
                        className={`w-full px-4 py-2 rounded-xl border outline-none transition-all ${fieldErrors.nome_fantasia ? 'border-rose-500 bg-rose-50 focus:ring-rose-200' : 'border-slate-200 focus:ring-indigo-500'}`}
                        value={company.nome_fantasia || ''}
                        onChange={e => {
                          setCompany({...company, nome_fantasia: e.target.value});
                          if (fieldErrors.nome_fantasia) setFieldErrors({...fieldErrors, nome_fantasia: ''});
                        }}
                      />
                    </FormField>
                  </div>
                  <div className="md:col-span-2">
                    <FormField label="Razão Social">
                      <input 
                        type="text" 
                        className="w-full px-4 py-2 rounded-xl border border-slate-200 focus:ring-2 focus:ring-indigo-500 outline-none"
                        value={company.razao_social || ''}
                        onChange={e => setCompany({...company, razao_social: e.target.value})}
                      />
                    </FormField>
                  </div>
                  <div>
                    <FormField label="CPF / CNPJ">
                      <input 
                        type="text" 
                        className="w-full px-4 py-2 rounded-xl border border-slate-200 focus:ring-2 focus:ring-indigo-500 outline-none"
                        value={company.cnpj || ''}
                        onChange={e => setCompany({...company, cnpj: e.target.value})}
                      />
                    </FormField>
                  </div>
                  <div>
                    <FormField label="E-mail" error={fieldErrors.email} required>
                      <input 
                        type="email" 
                        className={`w-full px-4 py-2 rounded-xl border outline-none transition-all ${fieldErrors.email ? 'border-rose-500 bg-rose-50 focus:ring-rose-200' : 'border-slate-200 focus:ring-indigo-500'}`}
                        value={company.email || ''}
                        onChange={e => {
                          setCompany({...company, email: e.target.value});
                          if (fieldErrors.email) setFieldErrors({...fieldErrors, email: ''});
                        }}
                      />
                    </FormField>
                  </div>
                  <div>
                    <FormField label="Telefone Fixo">
                      <input 
                        type="text" 
                        className="w-full px-4 py-2 rounded-xl border border-slate-200 focus:ring-2 focus:ring-indigo-500 outline-none"
                        value={company.telefone_fixo || ''}
                        onChange={e => setCompany({...company, telefone_fixo: e.target.value})}
                      />
                    </FormField>
                  </div>
                  <div>
                    <FormField label="Telefone Celular">
                      <input 
                        type="text" 
                        className="w-full px-4 py-2 rounded-xl border border-slate-200 focus:ring-2 focus:ring-indigo-500 outline-none"
                        value={company.telefone_celular || ''}
                        onChange={e => setCompany({...company, telefone_celular: e.target.value})}
                      />
                    </FormField>
                  </div>
                  <div className="md:col-span-2">
                    <FormField label="Endereço">
                      <input 
                        type="text" 
                        className="w-full px-4 py-2 rounded-xl border border-slate-200 focus:ring-2 focus:ring-indigo-500 outline-none"
                        value={company.endereco || ''}
                        onChange={e => setCompany({...company, endereco: e.target.value})}
                      />
                    </FormField>
                  </div>
                  <div>
                    <FormField label="Número">
                      <input 
                        type="text" 
                        className="w-full px-4 py-2 rounded-xl border border-slate-200 focus:ring-2 focus:ring-indigo-500 outline-none"
                        value={company.numero || ''}
                        onChange={e => setCompany({...company, numero: e.target.value})}
                      />
                    </FormField>
                  </div>
                  <div>
                    <FormField label="CEP">
                      <input 
                        type="text" 
                        className="w-full px-4 py-2 rounded-xl border border-slate-200 focus:ring-2 focus:ring-indigo-500 outline-none"
                        value={company.cep || ''}
                        onChange={e => setCompany({...company, cep: e.target.value})}
                      />
                    </FormField>
                  </div>
                  <div>
                    <FormField label="Cidade">
                      <input 
                        type="text" 
                        className="w-full px-4 py-2 rounded-xl border border-slate-200 focus:ring-2 focus:ring-indigo-500 outline-none"
                        value={company.cidade || ''}
                        onChange={e => setCompany({...company, cidade: e.target.value})}
                      />
                    </FormField>
                  </div>
                  <div>
                    <FormField label="Estado (UF)">
                      <input 
                        type="text" 
                        maxLength={2}
                        className="w-full px-4 py-2 rounded-xl border border-slate-200 focus:ring-2 focus:ring-indigo-500 outline-none uppercase"
                        value={company.estado || ''}
                        onChange={e => setCompany({...company, estado: e.target.value.toUpperCase()})}
                      />
                    </FormField>
                  </div>
                  <div className="md:col-span-2 pt-4">
                    <button 
                      type="submit" 
                      disabled={loading}
                      className="w-full bg-indigo-600 text-white py-3 rounded-xl font-bold hover:bg-indigo-700 transition-all shadow-lg shadow-indigo-100 disabled:opacity-50"
                    >
                      {loading ? 'Salvando...' : 'Salvar Alterações'}
                    </button>
                  </div>
                </form>
              </div>
            </div>

            <div className="space-y-6">
              <div className="bg-white p-8 rounded-2xl shadow-sm border border-slate-100">
                <h3 className="text-lg font-bold text-slate-900 mb-6 flex items-center gap-2">
                  <Users className="w-5 h-5 text-indigo-600" />
                  Usuário Atual
                </h3>
                <div className="flex items-center gap-4 p-4 bg-slate-50 rounded-2xl">
                  <div className="w-12 h-12 rounded-full bg-indigo-100 text-indigo-600 flex items-center justify-center font-bold text-xl shrink-0 overflow-hidden">
                    {user?.avatar ? (
                      <img src={user.avatar} alt="Avatar" className="w-full h-full object-cover" referrerPolicy="no-referrer" />
                    ) : (
                      user?.nome.charAt(0)
                    )}
                  </div>
                  <div className="min-w-0">
                    <p className="font-bold text-slate-900 truncate">{user?.nome}</p>
                    <p className="text-xs text-slate-500 truncate">{user?.email}</p>
                    <span className="inline-block mt-1 px-2 py-0.5 bg-indigo-100 text-indigo-700 text-[10px] font-bold uppercase rounded">
                      {user?.perfil}
                    </span>
                  </div>
                </div>
                <div className="mt-6 space-y-4">
                  <Link 
                    to="/profile"
                    className="flex items-center justify-center gap-2 w-full py-3 bg-white border border-slate-200 text-slate-700 rounded-xl font-bold hover:bg-slate-50 transition-all text-sm"
                  >
                    <Edit2 className="w-4 h-4" />
                    Editar Perfil
                  </Link>
                  <div>
                    <label className="block text-xs font-bold text-slate-400 uppercase mb-1">Tenant ID</label>
                    <div className="p-3 bg-slate-50 rounded-lg text-slate-600 font-mono text-xs break-all">
                      {user?.tenant_id}
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {activeTab === 'finance' && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
          <div className="space-y-4">
            <div className="flex justify-between items-center">
              <h3 className="font-bold text-slate-900">Tipos de Pagamento</h3>
              <button 
                onClick={() => { 
                  setModalType('paymentType'); 
                  setSelectedItem(null); 
                  setFormData({ prazo_dias: 0, local_lancamento: 'Caixa', ativo: true }); 
                  setIsModalOpen(true); 
                }} 
                className="text-indigo-600 text-sm font-bold hover:underline"
              >
                + Adicionar
              </button>
            </div>
            <div className="bg-white rounded-xl border border-slate-100 overflow-hidden">
              <table className="w-full text-left text-sm">
                <thead className="bg-slate-50 text-slate-500 uppercase text-[10px]">
                  <tr>
                    <th className="px-4 py-2">Nome</th>
                    <th className="px-4 py-2">Prazo</th>
                    <th className="px-4 py-2">Parcelas</th>
                    <th className="px-4 py-2">Local</th>
                    <th className="px-4 py-2">Status</th>
                    <th className="px-4 py-2 text-right">Ações</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {paymentTypes.map(pt => (
                    <tr key={pt.id}>
                      <td className="px-4 py-2 font-medium">{pt.nome}</td>
                      <td className="px-4 py-2">{pt.prazo_dias} dias</td>
                      <td className="px-4 py-2">{pt.qtd_parcelas || 1}x</td>
                      <td className="px-4 py-2">{pt.local_lancamento}</td>
                      <td className="px-4 py-2">
                        <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold uppercase ${pt.ativo ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-100 text-slate-500'}`}>
                          {pt.ativo ? 'Ativo' : 'Inativo'}
                        </span>
                      </td>
                      <td className="px-4 py-2 text-right">
                        <button 
                          onClick={() => {
                            setModalType('paymentType');
                            setSelectedItem(pt);
                            setFormData({ ...pt, ativo: !!pt.ativo });
                            setIsModalOpen(true);
                          }}
                          className="text-indigo-600 hover:text-indigo-900"
                        >
                          <Edit2 className="w-4 h-4" />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          <div className="space-y-4">
            <div className="flex justify-between items-center">
              <h3 className="font-bold text-slate-900">Categorias de Contas</h3>
              <button 
                onClick={() => { 
                  setModalType('category'); 
                  setSelectedItem(null); 
                  setFormData({ tipo: 'receita', ativo: true }); 
                  setIsModalOpen(true); 
                }} 
                className="text-indigo-600 text-sm font-bold hover:underline"
              >
                + Adicionar
              </button>
            </div>
            <div className="bg-white rounded-xl border border-slate-100 overflow-hidden">
              <table className="w-full text-left text-sm">
                <thead className="bg-slate-50 text-slate-500 uppercase text-[10px]">
                  <tr>
                    <th className="px-4 py-2">Nome</th>
                    <th className="px-4 py-2">Tipo</th>
                    <th className="px-4 py-2">Status</th>
                    <th className="px-4 py-2 text-right">Ações</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {categories.map(c => (
                    <tr key={c.id}>
                      <td className="px-4 py-2 font-medium">{c.nome}</td>
                      <td className="px-4 py-2 capitalize">{c.tipo}</td>
                      <td className="px-4 py-2">
                        <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold uppercase ${c.ativo ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-100 text-slate-500'}`}>
                          {c.ativo ? 'Ativo' : 'Inativo'}
                        </span>
                      </td>
                      <td className="px-4 py-2 text-right">
                        <button 
                          onClick={() => {
                            setModalType('category');
                            setSelectedItem(c);
                            setFormData({ ...c, ativo: !!c.ativo });
                            setIsModalOpen(true);
                          }}
                          className="text-indigo-600 hover:text-indigo-900"
                        >
                          <Edit2 className="w-4 h-4" />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {isModalOpen && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center p-4 z-50">
          <motion.div initial={{ scale: 0.9, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} className="bg-white w-full max-w-md rounded-3xl p-8 shadow-2xl">
            <div className="flex justify-between items-center mb-6">
              <h2 className="text-2xl font-bold text-slate-900">
                {modalType === 'category' && (selectedItem ? 'Editar Categoria' : 'Nova Categoria')}
                {modalType === 'paymentType' && (selectedItem ? 'Editar Tipo de Pagamento' : 'Novo Tipo de Pagamento')}
              </h2>
              <button onClick={() => setIsModalOpen(false)}><X className="text-slate-400" /></button>
            </div>
            <form onSubmit={handleSubmitFinance} className="space-y-4" noValidate>
              {modalType === 'paymentType' && (
                <>
                  <FormField label="Nome" error={financeFieldErrors.nome} required>
                    <input 
                      type="text" 
                      className={`w-full px-4 py-2 rounded-xl border outline-none transition-all ${financeFieldErrors.nome ? 'border-rose-500 bg-rose-50 focus:ring-rose-200' : 'border-slate-200 focus:ring-indigo-500'}`}
                      value={formData.nome || ''} 
                      onChange={e => {
                        setFormData({...formData, nome: e.target.value});
                        if (financeFieldErrors.nome) setFinanceFieldErrors({...financeFieldErrors, nome: ''});
                      }} 
                    />
                  </FormField>
                  <FormField label="Prazo de Recebimento (dias)" error={financeFieldErrors.prazo_dias} required>
                    <input 
                      type="number" 
                      className={`w-full px-4 py-2 rounded-xl border outline-none transition-all ${financeFieldErrors.prazo_dias ? 'border-rose-500 bg-rose-50 focus:ring-rose-200' : 'border-slate-200 focus:ring-indigo-500'}`}
                      value={formData.prazo_dias || 0} 
                      onChange={e => {
                        setFormData({...formData, prazo_dias: parseInt(e.target.value)});
                        if (financeFieldErrors.prazo_dias) setFinanceFieldErrors({...financeFieldErrors, prazo_dias: ''});
                      }} 
                    />
                  </FormField>
                  <FormField label="Quantidade de Parcelas" error={financeFieldErrors.qtd_parcelas} required>
                    <input 
                      type="number" 
                      className={`w-full px-4 py-2 rounded-xl border outline-none transition-all ${financeFieldErrors.qtd_parcelas ? 'border-rose-500 bg-rose-50 focus:ring-rose-200' : 'border-slate-200 focus:ring-indigo-500'}`}
                      value={formData.qtd_parcelas || 1} 
                      onChange={e => {
                        setFormData({...formData, qtd_parcelas: parseInt(e.target.value)});
                        if (financeFieldErrors.qtd_parcelas) setFinanceFieldErrors({...financeFieldErrors, qtd_parcelas: ''});
                      }} 
                    />
                  </FormField>
                  <FormField label="Local de Lançamento">
                    <select className="w-full px-4 py-2 rounded-xl border border-slate-200 focus:ring-2 focus:ring-indigo-500 outline-none" value={formData.local_lancamento || 'Caixa'} onChange={e => setFormData({...formData, local_lancamento: e.target.value})}>
                      <option value="Caixa">Caixa</option>
                      <option value="Banco">Banco</option>
                      <option value="Cartão">Cartão</option>
                      <option value="Receber">Receber</option>
                      <option value="Pagar">Pagar</option>
                    </select>
                  </FormField>

                  <div className="bg-slate-50 p-4 rounded-xl space-y-4">
                    <div className="flex items-center gap-2">
                      <input 
                        type="checkbox" 
                        id="eh_cartao"
                        checked={formData.eh_cartao ?? false} 
                        onChange={e => setFormData({...formData, eh_cartao: e.target.checked, tipo_cartao: e.target.checked ? 'credito' : null})} 
                        className="w-4 h-4 text-indigo-600 border-slate-300 rounded focus:ring-indigo-500"
                      />
                      <label htmlFor="eh_cartao" className="text-sm font-semibold text-slate-700">É Cartão?</label>
                    </div>

                    {formData.eh_cartao && (
                      <FormField label="Tipo de Cartão">
                        <select 
                          className="w-full px-4 py-2 rounded-xl border border-slate-200 focus:ring-2 focus:ring-indigo-500 outline-none" 
                          value={formData.tipo_cartao || 'credito'} 
                          onChange={e => setFormData({...formData, tipo_cartao: e.target.value})}
                        >
                          <option value="credito">Crédito</option>
                          <option value="debito">Débito</option>
                        </select>
                      </FormField>
                    )}

                    {(formData.qtd_parcelas > 1 || !formData.qtd_parcelas) && (
                      <FormField label="Valor Mín. por Parcela (R$)">
                        <input 
                          type="number" 
                          step="0.01"
                          placeholder="0,00"
                          className="w-full px-4 py-2 rounded-xl border border-slate-200 focus:ring-2 focus:ring-indigo-500 outline-none font-mono"
                          value={formData.valor_min_parcela || ''} 
                          onChange={e => setFormData({...formData, valor_min_parcela: parseFloat(e.target.value) || 0})} 
                        />
                        <p className="text-[10px] text-slate-400 mt-1">Deixe 0 para não validar valor mínimo.</p>
                      </FormField>
                    )}
                  </div>

                  <div className="flex items-center gap-2">
                    <input 
                      type="checkbox" 
                      id="pt_ativo"
                      checked={formData.ativo ?? true} 
                      onChange={e => setFormData({...formData, ativo: e.target.checked})} 
                      className="w-4 h-4 text-indigo-600 border-slate-300 rounded focus:ring-indigo-500"
                    />
                    <label htmlFor="pt_ativo" className="text-sm font-semibold text-slate-700">Ativo</label>
                  </div>
                </>
              )}

              {modalType === 'category' && (
                <>
                  <FormField label="Nome" error={financeFieldErrors.nome} required>
                    <input 
                      type="text" 
                      className={`w-full px-4 py-2 rounded-xl border outline-none transition-all ${financeFieldErrors.nome ? 'border-rose-500 bg-rose-50 focus:ring-rose-200' : 'border-slate-200 focus:ring-indigo-500'}`}
                      value={formData.nome || ''} 
                      onChange={e => {
                        setFormData({...formData, nome: e.target.value});
                        if (financeFieldErrors.nome) setFinanceFieldErrors({...financeFieldErrors, nome: ''});
                      }} 
                    />
                  </FormField>
                  <FormField label="Tipo">
                    <select className="w-full px-4 py-2 rounded-xl border border-slate-200 focus:ring-2 focus:ring-indigo-500 outline-none" value={formData.tipo || 'receita'} onChange={e => setFormData({...formData, tipo: e.target.value})}>
                      <option value="receita">Receita</option>
                      <option value="despesa">Despesa</option>
                    </select>
                  </FormField>
                  <div className="flex items-center gap-2">
                    <input 
                      type="checkbox" 
                      id="cat_ativo"
                      checked={formData.ativo ?? true} 
                      onChange={e => setFormData({...formData, ativo: e.target.checked})} 
                      className="w-4 h-4 text-indigo-600 border-slate-300 rounded focus:ring-indigo-500"
                    />
                    <label htmlFor="cat_ativo" className="text-sm font-semibold text-slate-700">Ativo</label>
                  </div>
                </>
              )}

              <button type="submit" className="w-full bg-indigo-600 text-white py-3 rounded-xl font-bold mt-4 shadow-lg shadow-indigo-100 hover:bg-indigo-700 transition-all">
                {selectedItem ? 'Atualizar' : 'Cadastrar'}
              </button>
            </form>
          </motion.div>
        </div>
      )}
    </div>
  );
};

export default Settings;
