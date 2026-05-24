import React, { useState, useEffect } from 'react';
import { Search, Plus, Edit2, Trash2, X } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { useAuthStore } from '../store/authStore';
import { Toast } from '../components/ui/Toast';
import { FormField } from '../components/ui/FormField';
import { formatMoney } from '../utils/format';

export const SuperAdmin = () => {
  const [companies, setCompanies] = useState<any[]>([]);
  const [plans, setPlans] = useState<any[]>([]);
  const [activeTab, setActiveTab] = useState<'companies' | 'plans'>('companies');
  const [editingPlan, setEditingPlan] = useState<any>(null);
  const [editingCompany, setEditingCompany] = useState<any>(null);
  const [isNewPlanModalOpen, setIsNewPlanModalOpen] = useState(false);
  const [planToDelete, setPlanToDelete] = useState<number | null>(null);
  const [newPlan, setNewPlan] = useState({ nome: '', valor_mensal: 0, limite_usuarios: 1, stripe_price_id: '' });
  const [toast, setToast] = useState<{message: string, type: 'success' | 'error'} | null>(null);
  const [isVerifying, setIsVerifying] = useState(false);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [planFilter, setPlanFilter] = useState('all');

  const token = useAuthStore(state => state.token);

  const formatVencimento = (dateString: string) => {
    if (!dateString) return '-';
    if (dateString.includes('T')) {
      const [year, month, day] = dateString.split('T')[0].split('-');
      return `${day}/${month}/${year}`;
    }
    return new Date(dateString).toLocaleDateString('pt-BR');
  };

  const filteredCompanies = companies.filter(c => {
    const matchesSearch = c.nome_fantasia?.toLowerCase().includes(searchTerm.toLowerCase()) || 
                          c.tenant_id?.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesStatus = statusFilter === 'all' || c.status_assinatura === statusFilter;
    const matchesPlan = planFilter === 'all' || c.plano_id?.toString() === planFilter;
    return matchesSearch && matchesStatus && matchesPlan;
  });

  const fetchData = () => {
    fetch('/api/admin/companies', { headers: { 'Authorization': `Bearer ${token}` } })
      .then(res => {
        if (res.status === 401) {
          useAuthStore.getState().logout();
          return;
        }
        return res.json();
      })
      .then(setCompanies);
    fetch('/api/plans').then(res => res.json()).then(setPlans);
  };

  useEffect(fetchData, [token]);

  const handleVerifyStripeStatus = async () => {
    if (!editingCompany?.id) return;
    
    setIsVerifying(true);
    try {
      const res = await fetch(`/api/admin/companies/${editingCompany.id}/stripe-status`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      
      const data = await res.json();
      if (res.ok) {
        setEditingCompany({
          ...editingCompany,
          status_assinatura: data.status_assinatura,
          vencimento_assinatura: data.vencimento_assinatura,
          stripe_customer_id: data.stripe_customer_id
        });
        setToast({ message: 'Status verificado e atualizado com sucesso!', type: 'success' });
        fetchData();
      } else {
        setToast({ message: data.error || 'Erro ao verificar status no Stripe', type: 'error' });
      }
    } catch (err) {
      console.error(err);
      setToast({ message: 'Erro de conexão ao verificar status no Stripe', type: 'error' });
    } finally {
      setIsVerifying(false);
      setTimeout(() => setToast(null), 5000);
    }
  };

  const handleUpdateCompany = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const res = await fetch(`/api/admin/companies/${editingCompany.id}`, {
        method: 'PUT',
        headers: { 
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({
          status_assinatura: editingCompany.status_assinatura,
          vencimento_assinatura: editingCompany.vencimento_assinatura,
          stripe_customer_id: editingCompany.stripe_customer_id
        })
      });
      if (res.ok) {
        setEditingCompany(null);
        fetchData();
        setToast({ message: 'Empresa atualizada com sucesso!', type: 'success' });
      } else {
        const data = await res.json();
        setToast({ message: data.error || 'Erro ao atualizar empresa', type: 'error' });
      }
    } catch (err) {
      console.error(err);
      setToast({ message: 'Erro de conexão ao atualizar empresa', type: 'error' });
    } finally {
      setTimeout(() => setToast(null), 5000);
    }
  };

  const validatePlan = (plan: any) => {
    const errors: Record<string, string> = {};
    if (!plan.nome) errors.nome = 'Nome do plano é obrigatório';
    if (plan.valor_mensal < 0) errors.valor_mensal = 'Valor mensal não pode ser negativo';
    if (plan.limite_usuarios < 1) errors.limite_usuarios = 'Limite de usuários deve ser pelo menos 1';
    if (!plan.stripe_price_id) errors.stripe_price_id = 'ID do preço no Stripe é obrigatório';
    else if (!plan.stripe_price_id.startsWith('price_')) errors.stripe_price_id = 'ID do preço deve começar com price_';
    
    setFieldErrors(errors);
    return Object.keys(errors).length === 0;
  };

  const handleUpdatePlan = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!validatePlan(editingPlan)) return;
    try {
      const res = await fetch(`/api/admin/plans/${editingPlan.id}`, {
        method: 'PUT',
        headers: { 
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify(editingPlan)
      });
      if (res.ok) {
        setEditingPlan(null);
        fetchData();
        setToast({ message: 'Plano atualizado com sucesso!', type: 'success' });
      } else {
        const data = await res.json();
        setToast({ message: data.error || 'Erro ao atualizar plano', type: 'error' });
      }
    } catch (err) {
      console.error(err);
      setToast({ message: 'Erro de conexão ao atualizar plano', type: 'error' });
    } finally {
      setTimeout(() => setToast(null), 5000);
    }
  };

  const handleCreatePlan = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!validatePlan(newPlan)) return;
    try {
      const res = await fetch('/api/admin/plans', {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify(newPlan)
      });
      if (res.ok) {
        setIsNewPlanModalOpen(false);
        setNewPlan({ nome: '', valor_mensal: 0, limite_usuarios: 1, stripe_price_id: '' });
        fetchData();
        setToast({ message: 'Plano criado com sucesso!', type: 'success' });
      } else {
        const data = await res.json();
        setToast({ message: data.error || 'Erro ao criar plano', type: 'error' });
      }
    } catch (err) {
      console.error(err);
      setToast({ message: 'Erro de conexão ao criar plano', type: 'error' });
    } finally {
      setTimeout(() => setToast(null), 5000);
    }
  };

  const confirmDeletePlan = async () => {
    if (!planToDelete || !token) return;
    
    try {
      const res = await fetch(`/api/admin/plans/${planToDelete}`, {
        method: 'DELETE',
        headers: { 'Authorization': `Bearer ${token}` }
      });
      
      if (res.ok) {
        fetchData();
        setToast({ message: 'Plano excluído com sucesso!', type: 'success' });
      } else {
        const data = await res.json();
        setToast({ message: data.error || 'Erro ao excluir plano', type: 'error' });
      }
    } catch (err) {
      setToast({ message: 'Erro de conexão ao excluir plano', type: 'error' });
    } finally {
      setPlanToDelete(null);
      setTimeout(() => setToast(null), 5000);
    }
  };

  const handleDeletePlan = (id: number) => {
    setPlanToDelete(id);
  };

  return (
    <div className="space-y-8 relative">
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
        <h1 className="text-3xl font-bold text-slate-900">Painel SuperAdmin</h1>
        <div className="flex bg-white p-1 rounded-xl border border-slate-100 shadow-sm">
          <button 
            onClick={() => setActiveTab('companies')}
            className={`px-4 py-2 rounded-lg font-bold text-sm transition-all ${activeTab === 'companies' ? 'bg-indigo-600 text-white' : 'text-slate-500 hover:bg-slate-50'}`}
          >
            Empresas
          </button>
          <button 
            onClick={() => setActiveTab('plans')}
            className={`px-4 py-2 rounded-lg font-bold text-sm transition-all ${activeTab === 'plans' ? 'bg-indigo-600 text-white' : 'text-slate-500 hover:bg-slate-50'}`}
          >
            Configurações de Planos
          </button>
        </div>
      </div>

      {activeTab === 'companies' ? (
        <div className="bg-white rounded-2xl shadow-sm border border-slate-100 overflow-hidden">
          <div className="p-4 border-b border-slate-100 bg-slate-50/50 flex flex-col md:flex-row md:items-center justify-between gap-4">
            <h3 className="font-bold text-slate-900 whitespace-nowrap">Empresas Cadastradas</h3>
            
            <div className="flex flex-col sm:flex-row gap-3 w-full md:w-auto">
              <div className="relative flex-1 sm:w-64">
                <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                <input 
                  type="text" 
                  placeholder="Buscar empresa ou Tenant ID..."
                  value={searchTerm}
                  onChange={e => setSearchTerm(e.target.value)}
                  className="w-full pl-9 pr-4 py-2 rounded-xl border border-slate-200 text-sm focus:ring-2 focus:ring-indigo-500 outline-none"
                />
              </div>
              
              <select 
                value={statusFilter}
                onChange={e => setStatusFilter(e.target.value)}
                className="px-4 py-2 rounded-xl border border-slate-200 text-sm bg-white focus:ring-2 focus:ring-indigo-500 outline-none"
              >
                <option value="all">Todos os Status</option>
                <option value="ativo">Ativo</option>
                <option value="suspenso">Suspenso</option>
                <option value="Cancelamento Solicitado">Cancelamento Solicitado</option>
                <option value="cancelado">Cancelado</option>
              </select>

              <select 
                value={planFilter}
                onChange={e => setPlanFilter(e.target.value)}
                className="px-4 py-2 rounded-xl border border-slate-200 text-sm bg-white focus:ring-2 focus:ring-indigo-500 outline-none"
              >
                <option value="all">Todos os Planos</option>
                {plans.map(p => (
                  <option key={p.id} value={p.id.toString()}>{p.nome}</option>
                ))}
              </select>
            </div>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-left">
              <thead className="bg-slate-50 text-slate-500 text-sm uppercase tracking-wider">
                <tr>
                  <th className="px-6 py-4 font-semibold">Empresa</th>
                  <th className="px-6 py-4 font-semibold">Tenant ID</th>
                  <th className="px-6 py-4 font-semibold">Plano</th>
                  <th className="px-6 py-4 font-semibold">Status</th>
                  <th className="px-6 py-4 font-semibold">Vencimento</th>
                  <th className="px-6 py-4 font-semibold text-right">Ações</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filteredCompanies.length > 0 ? (
                  filteredCompanies.map(c => (
                    <tr key={c.id}>
                      <td className="px-6 py-4 font-medium text-slate-900">{c.nome_fantasia}</td>
                      <td className="px-6 py-4 text-slate-500 font-mono text-xs">{c.tenant_id}</td>
                      <td className="px-6 py-4 text-slate-600">{c.plano_nome}</td>
                      <td className="px-6 py-4">
                        <span className={`px-2 py-1 text-xs font-bold rounded uppercase ${c.status_assinatura === 'ativo' ? 'bg-emerald-100 text-emerald-700' : c.status_assinatura === 'Cancelamento Solicitado' ? 'bg-amber-100 text-amber-700' : 'bg-rose-100 text-rose-700'}`}>
                          {c.status_assinatura}
                        </span>
                      </td>
                      <td className="px-6 py-4 text-slate-600">
                        {formatVencimento(c.vencimento_assinatura)}
                      </td>
                      <td className="px-6 py-4 text-right">
                        <button 
                          onClick={() => setEditingCompany(c)}
                          className="text-indigo-600 hover:text-indigo-800 font-medium text-sm"
                        >
                          Editar
                        </button>
                      </td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td colSpan={6} className="px-6 py-8 text-center text-slate-500">
                      Nenhuma empresa encontrada com os filtros atuais.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      ) : (
        <div className="space-y-6">
          <div className="flex justify-between items-center">
            <h2 className="text-2xl font-bold text-slate-900">Gestão de Planos</h2>
            <button 
              onClick={() => setIsNewPlanModalOpen(true)}
              className="bg-indigo-600 text-white px-4 py-2 rounded-xl font-bold flex items-center gap-2 hover:bg-indigo-700 transition-all shadow-lg shadow-indigo-200"
            >
              <Plus className="w-4 h-4" /> Novo Plano
            </button>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
            {plans.map(p => (
              <div key={p.id} className="bg-white p-6 rounded-2xl shadow-sm border border-slate-100 flex flex-col justify-between">
                <div>
                  <div className="flex justify-between items-start">
                    <h3 className="text-xl font-bold text-slate-900">{p.nome}</h3>
                  </div>
                  <p className="text-3xl font-black text-indigo-600 mt-2">R$ {formatMoney(p.valor_mensal)}</p>
                  <p className="text-slate-500 text-sm mt-4">
                    Limite: <span className="font-bold text-slate-900">{p.limite_usuarios === 9999 ? 'Ilimitado' : `${p.limite_usuarios} usuários`}</span>
                  </p>
                  <p className="text-slate-400 text-[10px] mt-1 font-mono">ID Stripe: {p.stripe_price_id || 'Não configurado'}</p>
                </div>
                <div className="mt-6 flex gap-2">
                  <button 
                    onClick={() => setEditingPlan(p)}
                    className="flex-1 py-2 border border-indigo-600 text-indigo-600 rounded-xl font-bold hover:bg-indigo-600 hover:text-white transition-all"
                  >
                    Editar
                  </button>
                  <button 
                    onClick={() => handleDeletePlan(p.id)}
                    className="px-3 py-2 border border-rose-100 text-rose-400 rounded-xl hover:bg-rose-50 hover:text-rose-600 transition-all"
                    title="Excluir Plano"
                  >
                    <Trash2 className="w-5 h-5" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {isNewPlanModalOpen && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center p-4 z-50">
          <motion.div initial={{ scale: 0.9, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} className="bg-white w-full max-w-md rounded-3xl p-8 shadow-2xl">
            <div className="flex justify-between items-center mb-6">
              <h2 className="text-2xl font-bold text-slate-900">Novo Plano</h2>
              <button onClick={() => {
                setIsNewPlanModalOpen(false);
                setFieldErrors({});
              }}><X className="text-slate-400" /></button>
            </div>
            <form onSubmit={handleCreatePlan} className="space-y-4" noValidate>
              <FormField label="Nome do Plano" error={fieldErrors.nome} required>
                <input 
                  type="text" 
                  className={`w-full px-4 py-2 rounded-xl border outline-none transition-all ${fieldErrors.nome ? 'border-rose-500 bg-rose-50 focus:ring-rose-200' : 'border-slate-200 focus:ring-indigo-500'}`}
                  value={newPlan.nome}
                  onChange={e => {
                    setNewPlan({...newPlan, nome: e.target.value});
                    if (fieldErrors.nome) setFieldErrors({...fieldErrors, nome: ''});
                  }}
                />
              </FormField>
              <FormField label="Valor Mensal (R$)" error={fieldErrors.valor_mensal} required>
                <input 
                  type="number" 
                  step="0.01"
                  className={`w-full px-4 py-2 rounded-xl border outline-none transition-all ${fieldErrors.valor_mensal ? 'border-rose-500 bg-rose-50 focus:ring-rose-200' : 'border-slate-200 focus:ring-indigo-500'}`}
                  value={newPlan.valor_mensal}
                  onChange={e => {
                    setNewPlan({...newPlan, valor_mensal: parseFloat(e.target.value)});
                    if (fieldErrors.valor_mensal) setFieldErrors({...fieldErrors, valor_mensal: ''});
                  }}
                />
              </FormField>
              <FormField label="Limite de Usuários" error={fieldErrors.limite_usuarios} required>
                <input 
                  type="number" 
                  className={`w-full px-4 py-2 rounded-xl border outline-none transition-all ${fieldErrors.limite_usuarios ? 'border-rose-500 bg-rose-50 focus:ring-rose-200' : 'border-slate-200 focus:ring-indigo-500'}`}
                  value={newPlan.limite_usuarios}
                  onChange={e => {
                    setNewPlan({...newPlan, limite_usuarios: parseInt(e.target.value)});
                    if (fieldErrors.limite_usuarios) setFieldErrors({...fieldErrors, limite_usuarios: ''});
                  }}
                />
              </FormField>
              <FormField label="ID do Preço no Stripe" error={fieldErrors.stripe_price_id} required>
                <input 
                  type="text" 
                  className={`w-full px-4 py-2 rounded-xl border font-mono text-sm outline-none transition-all ${fieldErrors.stripe_price_id ? 'border-rose-500 bg-rose-50 focus:ring-rose-200' : 'border-slate-200 focus:ring-indigo-500'}`}
                  placeholder="price_..."
                  value={newPlan.stripe_price_id}
                  onChange={e => {
                    setNewPlan({...newPlan, stripe_price_id: e.target.value});
                    if (fieldErrors.stripe_price_id) setFieldErrors({...fieldErrors, stripe_price_id: ''});
                  }}
                />
                <p className="text-[10px] text-slate-500 mt-1">
                  * Atenção: Use o <strong>ID da Tarifa (Price ID)</strong> que começa com <code className="bg-slate-100 px-1 rounded text-indigo-600">price_...</code> e <strong>NÃO</strong> o ID do Produto (<code className="bg-slate-100 px-1 rounded text-red-500">prod_...</code>).
                </p>
              </FormField>
              <button type="submit" className="w-full bg-indigo-600 text-white py-3 rounded-xl font-bold mt-4 hover:bg-indigo-700 transition-all shadow-lg shadow-indigo-100">Cadastrar Plano</button>
            </form>
          </motion.div>
        </div>
      )}

      {editingPlan && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center p-4 z-50">
          <motion.div initial={{ scale: 0.9, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} className="bg-white w-full max-w-md rounded-3xl p-8 shadow-2xl">
            <div className="flex justify-between items-center mb-6">
              <h2 className="text-2xl font-bold text-slate-900">Editar Plano</h2>
              <button onClick={() => {
                setEditingPlan(null);
                setFieldErrors({});
              }}><X className="text-slate-400" /></button>
            </div>
            <form onSubmit={handleUpdatePlan} className="space-y-4" noValidate>
              <FormField label="Nome do Plano" error={fieldErrors.nome} required>
                <input 
                  type="text" 
                  className={`w-full px-4 py-2 rounded-xl border outline-none transition-all ${fieldErrors.nome ? 'border-rose-500 bg-rose-50 focus:ring-rose-200' : 'border-slate-200 focus:ring-indigo-500'}`}
                  value={editingPlan.nome}
                  onChange={e => {
                    setEditingPlan({...editingPlan, nome: e.target.value});
                    if (fieldErrors.nome) setFieldErrors({...fieldErrors, nome: ''});
                  }}
                />
              </FormField>
              <FormField label="Valor Mensal (R$)" error={fieldErrors.valor_mensal} required>
                <input 
                  type="number" 
                  step="0.01"
                  className={`w-full px-4 py-2 rounded-xl border outline-none transition-all ${fieldErrors.valor_mensal ? 'border-rose-500 bg-rose-50 focus:ring-rose-200' : 'border-slate-200 focus:ring-indigo-500'}`}
                  value={editingPlan.valor_mensal}
                  onChange={e => {
                    setEditingPlan({...editingPlan, valor_mensal: parseFloat(e.target.value)});
                    if (fieldErrors.valor_mensal) setFieldErrors({...fieldErrors, valor_mensal: ''});
                  }}
                />
              </FormField>
              <FormField label="Limite de Usuários" error={fieldErrors.limite_usuarios} required>
                <input 
                  type="number" 
                  className={`w-full px-4 py-2 rounded-xl border outline-none transition-all ${fieldErrors.limite_usuarios ? 'border-rose-500 bg-rose-50 focus:ring-rose-200' : 'border-slate-200 focus:ring-indigo-500'}`}
                  value={editingPlan.limite_usuarios}
                  onChange={e => {
                    setEditingPlan({...editingPlan, limite_usuarios: parseInt(e.target.value)});
                    if (fieldErrors.limite_usuarios) setFieldErrors({...fieldErrors, limite_usuarios: ''});
                  }}
                />
                <p className="text-[10px] text-slate-400 mt-1">* Use 9999 para ilimitado</p>
              </FormField>
              <FormField label="ID do Preço no Stripe" error={fieldErrors.stripe_price_id} required>
                <input 
                  type="text" 
                  className={`w-full px-4 py-2 rounded-xl border font-mono text-sm outline-none transition-all ${fieldErrors.stripe_price_id ? 'border-rose-500 bg-rose-50 focus:ring-rose-200' : 'border-slate-200 focus:ring-indigo-500'}`}
                  placeholder="price_..."
                  value={editingPlan.stripe_price_id || ''}
                  onChange={e => {
                    setEditingPlan({...editingPlan, stripe_price_id: e.target.value});
                    if (fieldErrors.stripe_price_id) setFieldErrors({...fieldErrors, stripe_price_id: ''});
                  }}
                />
                <p className="text-[10px] text-slate-500 mt-1">
                  * Atenção: Use o <strong>ID da Tarifa (Price ID)</strong> que começa com <code className="bg-slate-100 px-1 rounded text-indigo-600">price_...</code> e <strong>NÃO</strong> o ID do Produto (<code className="bg-slate-100 px-1 rounded text-red-500">prod_...</code>).
                </p>
              </FormField>
              <button type="submit" className="w-full bg-indigo-600 text-white py-3 rounded-xl font-bold mt-4 hover:bg-indigo-700 transition-all shadow-lg shadow-indigo-100">Salvar Alterações</button>
            </form>
          </motion.div>
        </div>
      )}

      {planToDelete && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center p-4 z-50">
          <motion.div initial={{ scale: 0.9, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} className="bg-white w-full max-w-md rounded-3xl p-8 shadow-2xl">
            <div className="flex justify-between items-center mb-6">
              <h2 className="text-2xl font-bold text-slate-900">Confirmar Exclusão</h2>
              <button onClick={() => setPlanToDelete(null)}><X className="text-slate-400" /></button>
            </div>
            <p className="text-slate-600 mb-8">Tem certeza que deseja excluir este plano? Esta ação não pode ser desfeita.</p>
            <div className="flex gap-4">
              <button 
                onClick={() => setPlanToDelete(null)}
                className="flex-1 py-3 border border-slate-200 text-slate-600 rounded-xl font-bold hover:bg-slate-50 transition-all"
              >
                Cancelar
              </button>
              <button 
                onClick={confirmDeletePlan}
                className="flex-1 py-3 bg-rose-600 text-white rounded-xl font-bold hover:bg-rose-700 transition-all"
              >
                Excluir
              </button>
            </div>
          </motion.div>
        </div>
      )}

      {editingCompany && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center p-4 z-50">
          <motion.div initial={{ scale: 0.9, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} className="bg-white w-full max-w-md rounded-3xl p-8 shadow-2xl">
            <div className="flex justify-between items-center mb-6">
              <h2 className="text-2xl font-bold text-slate-900">Editar Empresa</h2>
              <button onClick={() => setEditingCompany(null)}><X className="text-slate-400" /></button>
            </div>
            <form onSubmit={handleUpdateCompany} className="space-y-4">
              <div>
                <label className="block text-sm font-semibold text-slate-700 mb-1">Status da Assinatura</label>
                <select 
                  className="w-full px-4 py-2 rounded-xl border border-slate-200 bg-white"
                  value={editingCompany.status_assinatura || 'ativo'}
                  onChange={e => setEditingCompany({...editingCompany, status_assinatura: e.target.value})}
                  required
                >
                  <option value="ativo">Ativo</option>
                  <option value="inativo">Inativo</option>
                  <option value="suspenso">Suspenso</option>
                  <option value="cancelado">Cancelado</option>
                </select>
              </div>
              <div>
                <label className="block text-sm font-semibold text-slate-700 mb-1">Vencimento da Assinatura</label>
                <input 
                  type="date" 
                  className="w-full px-4 py-2 rounded-xl border border-slate-200"
                  value={editingCompany.vencimento_assinatura ? (typeof editingCompany.vencimento_assinatura === 'string' ? editingCompany.vencimento_assinatura.split('T')[0].split(' ')[0] : new Date(editingCompany.vencimento_assinatura).toISOString().split('T')[0]) : ''}
                  onChange={e => setEditingCompany({...editingCompany, vencimento_assinatura: e.target.value})}
                />
              </div>
              <div>
                <label className="block text-sm font-semibold text-slate-700 mb-1">Stripe Customer ID</label>
                <div className="flex gap-2">
                  <input 
                    type="text" 
                    className="w-full px-4 py-2 rounded-xl border border-slate-200"
                    value={editingCompany.stripe_customer_id || ''}
                    onChange={e => setEditingCompany({...editingCompany, stripe_customer_id: e.target.value})}
                    placeholder="cus_..."
                  />
                  <button 
                    type="button" 
                    onClick={handleVerifyStripeStatus}
                    disabled={isVerifying}
                    className="bg-slate-100 hover:bg-slate-200 text-slate-700 px-4 py-2 rounded-xl font-medium whitespace-nowrap transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
                  >
                    {isVerifying ? (
                      <>
                        <div className="w-4 h-4 border-2 border-slate-400 border-t-transparent rounded-full animate-spin"></div>
                        Verificando...
                      </>
                    ) : (
                      'Verificar no Stripe'
                    )}
                  </button>
                </div>
              </div>
              <button type="submit" className="w-full bg-indigo-600 text-white py-3 rounded-xl font-bold mt-4">Salvar Alterações</button>
            </form>
          </motion.div>
        </div>
      )}
    </div>
  );
};

export default SuperAdmin;
