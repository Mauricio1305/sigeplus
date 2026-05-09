import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { Plus, X, Search, Edit2, AlertCircle, TrendingUp, DollarSign, FileText, Package, MoreVertical } from 'lucide-react';
import { motion } from 'motion/react';
import { useAuthStore } from '../store/authStore';
import { formatMoney } from '../utils/format';

export const Finance = () => {
  const [activeTab, setActiveTab] = useState<'receivables' | 'payables' | 'cashier' | 'reports' | 'card' | 'bank'>('receivables');
  const [receivables, setReceivables] = useState<any[]>([]);
  const [payables, setPayables] = useState<any[]>([]);
  const [categories, setCategories] = useState<any[]>([]);
  const [paymentTypes, setPaymentTypes] = useState<any[]>([]);
  const [pessoas, setPessoas] = useState<any[]>([]);
  const [currentCashier, setCurrentCashier] = useState<any>(null);
  const [salesMovements, setSalesMovements] = useState<any[]>([]);
  const [bankMovements, setBankMovements] = useState<any[]>([]);
  const [cardMovements, setCardMovements] = useState<any[]>([]);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [modalType, setModalType] = useState<'receivable' | 'payable' | 'category' | 'paymentType' | 'baixa' | 'caixaOpen' | 'caixaClose' | 'caixaManualEntry'>('receivable');
  const [selectedItem, setSelectedItem] = useState<any>(null);
  const [formData, setFormData] = useState<any>({});
  
  const [isSaving, setIsSaving] = useState(false);
  
  // Filters
  const [filterStartDate, setFilterStartDate] = useState(() => {
    const now = new Date();
    return new Date(now.getFullYear(), now.getMonth(), 1).toISOString().split('T')[0];
  });
  const [filterEndDate, setFilterEndDate] = useState(() => {
    const now = new Date();
    return new Date(now.getFullYear(), now.getMonth() + 1, 0).toISOString().split('T')[0];
  });
  const [filterOrderNumber, setFilterOrderNumber] = useState('');
  const [filterStatus, setFilterStatus] = useState('todos');
  const [filterPerson, setFilterPerson] = useState('');
  const [openActionMenuId, setOpenActionMenuId] = useState<string | null>(null);
  const [cancelModalOpen, setCancelModalOpen] = useState(false);
  const [estornoModalOpen, setEstornoModalOpen] = useState(false);
  const [actionReason, setActionReason] = useState('');
  const [actionTarget, setActionTarget] = useState<{ id: string, table: 'caixa' | 'lancamentos' } | null>(null);

  const token = useAuthStore(state => state.token);

  const fetchData = () => {
    fetch('/api/finance/receivable', { headers: { 'Authorization': `Bearer ${token}` } }).then(res => res.json()).then(setReceivables);
    fetch('/api/finance/payable', { headers: { 'Authorization': `Bearer ${token}` } }).then(res => res.json()).then(setPayables);
    fetch('/api/finance/categories', { headers: { 'Authorization': `Bearer ${token}` } }).then(res => res.json()).then(setCategories);
    fetch('/api/finance/payment-types', { headers: { 'Authorization': `Bearer ${token}` } }).then(res => res.json()).then(setPaymentTypes);
    fetch('/api/pessoas', { headers: { 'Authorization': `Bearer ${token}` } }).then(res => res.json()).then(setPessoas);
    fetch('/api/finance/cashier/current', { headers: { 'Authorization': `Bearer ${token}` } }).then(res => res.json()).then(setCurrentCashier);
    fetch('/api/finance/sales-movements', { headers: { 'Authorization': `Bearer ${token}` } }).then(res => res.json()).then(setSalesMovements);
    fetch('/api/finance/movements/banco', { headers: { 'Authorization': `Bearer ${token}` } }).then(res => res.json()).then(setBankMovements);
    fetch('/api/finance/movements/cartao', { headers: { 'Authorization': `Bearer ${token}` } }).then(res => res.json()).then(setCardMovements);
  };

  useEffect(fetchData, [token]);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (!(event.target as Element).closest('.action-menu-container')) {
        setOpenActionMenuId(null);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleActionRequest = async (type: 'cancel' | 'estorno') => {
    if (!actionTarget || !actionReason.trim()) return;
    try {
      const res = await fetch(`/api/finance/movements/${actionTarget.table}/${actionTarget.id}/${type}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({ motivo: actionReason })
      });
      if (res.ok) {
        setCancelModalOpen(false);
        setEstornoModalOpen(false);
        setActionReason('');
        fetchData();
      } else {
        const errorData = await res.json();
        alert(`Erro: ${errorData.error || 'Falha na operação'}`);
      }
    } catch (error) {
      alert('Erro de conexão com o servidor');
    }
  };

  const renderActionMenu = (item: any, type: string, table: 'lancamentos' | 'caixa' = 'lancamentos') => (
    <div className={`relative inline-block text-left ${openActionMenuId === item.id ? 'z-50' : 'z-auto'}`}>
      <button onClick={() => setOpenActionMenuId(openActionMenuId === item.id ? null : item.id)} className="p-2 hover:bg-slate-100 rounded-lg text-slate-400 transition-colors">
        <MoreVertical className="w-4 h-4" />
      </button>
      {openActionMenuId === item.id && (
        <div className="action-menu-container absolute right-0 mt-2 w-48 bg-white rounded-xl shadow-xl border border-slate-100 py-1 z-[50]">
          {item.status !== 'paga' && item.status !== 'cancelada' && table === 'lancamentos' && (
            <button
              onClick={() => {
                setOpenActionMenuId(null);
                setSelectedItem({id: item.id, type, valor: item.valor - (item.valor_pago || 0)});
                setFormData({ local: '', valor_pago: item.valor - (item.valor_pago || 0), data_pagamento: new Date().toISOString().split('T')[0] });
                setModalType('baixa');
                setIsModalOpen(true);
              }}
              className="w-full text-left px-4 py-2 hover:bg-slate-50 text-indigo-600 font-medium text-sm flex items-center gap-2"
            >
              Baixar
            </button>
          )}
          {item.status === 'aberta' && (
            <button
              onClick={() => { setOpenActionMenuId(null); setActionTarget({ id: item.id, table }); setCancelModalOpen(true); }}
              className="w-full text-left px-4 py-2 hover:bg-slate-50 text-rose-600 font-medium text-sm flex items-center gap-2"
            >
              Cancelar
            </button>
          )}
          {(item.status === 'paga' || item.status === 'parcial') && (
            <button
              onClick={() => { setOpenActionMenuId(null); setActionTarget({ id: item.id, table }); setEstornoModalOpen(true); }}
              className="w-full text-left px-4 py-2 hover:bg-slate-50 text-amber-600 font-medium text-sm flex items-center gap-2"
            >
              Estornar
            </button>
          )}
        </div>
      )}
    </div>
  );

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isSaving) return;

    setIsSaving(true);
    let url = '';
    let body = { ...formData };
    let method = 'POST';

    if (modalType === 'receivable') url = '/api/finance/receivable';
    if (modalType === 'payable') url = '/api/finance/payable';
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
    if (modalType === 'baixa') {
      if (!selectedItem) return;
      url = `/api/finance/${selectedItem.type}/${selectedItem.id}/pay`;
      if (!body.valor_pago) body.valor_pago = selectedItem.valor;
      if (!body.data_pagamento) body.data_pagamento = new Date().toISOString().split('T')[0];
    }
    if (modalType === 'caixaOpen') url = '/api/finance/cashier/open';
    if (modalType === 'caixaManualEntry') url = '/api/finance/cashier/manual-entry';
    if (modalType === 'caixaClose') {
      url = '/api/finance/cashier/close';
      const totalCounted = Object.values(body.counted || {}).reduce((sum: number, val: any) => sum + (parseFloat(val) || 0), 0);
      body = { valor_final: totalCounted, breakdown: body.counted };
    }

    if (!url) return;

    try {
      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
        body: JSON.stringify(body)
      });

      if (res.ok) {
        setIsModalOpen(false);
        setFormData({});
        setSelectedItem(null);
        fetchData();
      } else {
        let errorMessage = 'Falha ao salvar';
        try {
          const errorData = await res.json();
          errorMessage = errorData.message || errorMessage;
        } catch (e) {
          // Response is not JSON
        }
        alert(`Erro: ${errorMessage}`);
      }
    } catch (error) {
      console.error('Submit error:', error);
      alert('Erro de conexão com o servidor');
    } finally {
      setIsSaving(false);
    }
  };

  const handleCloseCashier = async () => {
    try {
      const res = await fetch(`/api/finance/cashier/${currentCashier.id}/report`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      const data = await res.json();
      
      const expectedBreakdown: any = { 'Dinheiro': data.cashier.valor_inicial || 0 };
      data.movements.forEach((m: any) => {
        const ptName = m.descricao?.split('|')[2]?.trim() || 'Dinheiro';
        expectedBreakdown[ptName] = (expectedBreakdown[ptName] || 0) + (m.tipo === 'entrada' ? m.valor : -m.valor);
      });

      setSelectedItem({
        cashier: data.cashier,
        expectedBreakdown
      });
      
      const initialCounted: any = {};
      Object.keys(expectedBreakdown).forEach(k => initialCounted[k] = 0);
      setFormData({ counted: initialCounted });
      
      setModalType('caixaClose');
      setIsModalOpen(true);
    } catch (err) {
      console.error("Error preparing cashier close:", err);
      alert("Erro ao preparar fechamento de caixa");
    }
  };

  const getFilteredReceivables = (list: any[]) => {
    return list.filter(r => {
      const effectiveLocal = r.tp_local || r.local || 'Receber';
      if (effectiveLocal !== 'Receber' && effectiveLocal !== 'Contas a Receber') return false;
      const dueDate = new Date(r.vencimento).toISOString().split('T')[0];
      const matchesDate = (!filterStartDate || dueDate >= filterStartDate) && (!filterEndDate || dueDate <= filterEndDate);
      const matchesOrder = !filterOrderNumber || (r.venda_id && r.venda_id.toString().includes(filterOrderNumber));
      const matchesPerson = !filterPerson || (r.cliente_nome && r.cliente_nome.toLowerCase().includes(filterPerson.toLowerCase()));
      const matchesStatus = filterStatus === 'todos' || r.status === filterStatus;
      return matchesDate && matchesOrder && matchesPerson && matchesStatus;
    });
  };

  const getFilteredPayables = (list: any[]) => {
    return list.filter(p => {
      const effectiveLocal = p.tp_local || p.local || 'Pagar';
      if (effectiveLocal !== 'Pagar' && effectiveLocal !== 'Contas a Pagar') return false;
      const dueDate = new Date(p.vencimento).toISOString().split('T')[0];
      const matchesDate = (!filterStartDate || dueDate >= filterStartDate) && (!filterEndDate || dueDate <= filterEndDate);
      const matchesOrder = !filterOrderNumber || (p.venda_id && p.venda_id.toString().includes(filterOrderNumber));
      const matchesPerson = !filterPerson || (p.fornecedor_nome && p.fornecedor_nome.toLowerCase().includes(filterPerson.toLowerCase()));
      const matchesStatus = filterStatus === 'todos' || p.status === filterStatus;
      return matchesDate && matchesOrder && matchesPerson && matchesStatus;
    });
  };

  const getFilteredCardBankMovements = (movements: any[]) => {
    return movements.filter(t => {
      const date = new Date(t.vencimento || t.data_movimentacao).toISOString().split('T')[0];
      const matchesDate = (!filterStartDate || date >= filterStartDate) && (!filterEndDate || date <= filterEndDate);
      const matchesOrder = !filterOrderNumber || (t.venda_id && t.venda_id.toString().includes(filterOrderNumber));
      const personName = t.cliente_nome || t.fornecedor_nome || t.pessoa_nome || '';
      const matchesPerson = !filterPerson || personName.toLowerCase().includes(filterPerson.toLowerCase());
      const matchesStatus = filterStatus === 'todos' || t.status === filterStatus;
      return matchesDate && matchesOrder && matchesPerson && matchesStatus;
    });
  };

  const getFilteredCashierMovements = (movements: any[]) => {
    return movements.filter(m => {
      if (m.local !== 'Caixa') return false;
      const date = new Date(m.created_at).toISOString().split('T')[0];
      const matchesDate = (!filterStartDate || date >= filterStartDate) && (!filterEndDate || date <= filterEndDate);
      const matchesOrder = !filterOrderNumber || (m.venda_id && m.venda_id.toString().includes(filterOrderNumber));
      const personName = m.pessoa_nome || '';
      const matchesPerson = !filterPerson || personName.toLowerCase().includes(filterPerson.toLowerCase());
      return matchesDate && matchesOrder && matchesPerson;
    });
  };

  const FilterSection = () => (
    <div className="bg-white p-4 rounded-xl border border-slate-100 shadow-sm flex flex-wrap gap-4 items-end mb-4">
      <div>
        <label className="block text-xs font-bold text-slate-500 uppercase mb-1">Período</label>
        <div className="flex items-center gap-2">
          <input type="date" className="px-3 py-2 rounded-lg border border-slate-200 text-sm outline-none focus:ring-2 focus:ring-indigo-500" value={filterStartDate} onChange={e => setFilterStartDate(e.target.value)} />
          <span className="text-slate-400">-</span>
          <input type="date" className="px-3 py-2 rounded-lg border border-slate-200 text-sm outline-none focus:ring-2 focus:ring-indigo-500" value={filterEndDate} onChange={e => setFilterEndDate(e.target.value)} />
        </div>
      </div>
      <div>
        <label className="block text-xs font-bold text-slate-500 uppercase mb-1">Nº Pedido</label>
        <input type="text" placeholder="ID..." className="w-24 px-3 py-2 rounded-lg border border-slate-200 text-sm outline-none focus:ring-2 focus:ring-indigo-500" value={filterOrderNumber} onChange={e => setFilterOrderNumber(e.target.value)} />
      </div>
      <div>
        <label className="block text-xs font-bold text-slate-500 uppercase mb-1">Pessoa</label>
        <input type="text" placeholder="Nome..." className="w-40 px-3 py-2 rounded-lg border border-slate-200 text-sm outline-none focus:ring-2 focus:ring-indigo-500" value={filterPerson} onChange={e => setFilterPerson(e.target.value)} />
      </div>
      {activeTab !== 'reports' && (
        <div>
          <label className="block text-xs font-bold text-slate-500 uppercase mb-1">Status</label>
          <select className="px-3 py-2 rounded-lg border border-slate-200 text-sm outline-none focus:ring-2 focus:ring-indigo-500" value={filterStatus} onChange={e => setFilterStatus(e.target.value)}>
            <option value="todos">Todos</option>
            <option value="aberta">Aberta</option>
            <option value="paga">Paga</option>
            <option value="parcial">Parcial</option>
            <option value="cancelada">Cancelada</option>
          </select>
        </div>
      )}
    </div>
  );

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <h1 className="text-3xl font-bold text-slate-900">Financeiro</h1>
        <div className="flex bg-white p-1 rounded-xl border border-slate-100 shadow-sm overflow-x-auto">
          {['cashier', 'payables', 'receivables', 'card', 'bank', 'reports'].map((tab) => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab as any)}
              className={`px-4 py-2 rounded-lg font-bold text-sm transition-all whitespace-nowrap ${
                activeTab === tab ? 'bg-indigo-600 text-white' : 'text-slate-500 hover:bg-slate-50'
              }`}
            >
              {tab === 'cashier' ? 'Caixa' : tab === 'payables' ? 'Pagar' : tab === 'receivables' ? 'Receber' : tab === 'card' ? 'Cartão' : tab === 'bank' ? 'Banco' : 'Relatórios'}
            </button>
          ))}
        </div>
      </div>

      {activeTab === 'receivables' && (
        <div className="space-y-4">
          <div className="flex justify-between items-center">
            <h2 className="text-xl font-bold text-slate-800">Contas a Receber</h2>
            <button onClick={() => { setModalType('receivable'); setSelectedItem(null); setFormData({ vencimento: new Date().toISOString().split('T')[0], local: 'Receber' }); setIsModalOpen(true); }} className="bg-emerald-600 text-white px-4 py-2 rounded-xl font-bold flex items-center gap-2 hover:bg-emerald-700 transition-all shadow-lg shadow-emerald-200">
              <Plus className="w-4 h-4" /> Novo Recebimento
            </button>
          </div>

          <FilterSection />

          <div className="bg-white rounded-2xl shadow-sm border border-slate-100 overflow-visible">
            <table className="w-full text-left">
              <thead className="bg-slate-50 text-slate-500 text-xs text-left uppercase tracking-wider">
                <tr>
                  <th className="px-6 py-4 font-semibold rounded-tl-2xl">Cliente / Descrição</th>
                  <th className="px-6 py-4 font-semibold">Vencimento</th>
                  <th className="px-6 py-4 font-semibold text-right">Valor</th>
                  <th className="px-6 py-4 font-semibold text-right">Pago</th>
                  <th className="px-6 py-4 font-semibold text-center">Status</th>
                  <th className="px-6 py-4 font-semibold text-right rounded-tr-2xl">Ações</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {getFilteredReceivables(receivables).map(r => (
                  <tr key={r.id}>
                    <td className="px-6 py-4">
                      <div className="font-medium text-slate-900">{r.cliente_nome || 'Diversos'}</div>
                      {r.descricao && <div className="text-[10px] text-slate-400 font-mono mt-0.5">{r.descricao}</div>}
                    </td>
                    <td className="px-6 py-4 text-slate-500">{new Date(r.vencimento).toLocaleDateString()}</td>
                    <td className="px-6 py-4 text-right font-bold text-slate-900">R$ {formatMoney(r.valor)}</td>
                    <td className="px-6 py-4 text-right text-emerald-600 font-medium">R$ {formatMoney(r.valor_pago)}</td>
                    <td className="px-6 py-4 text-center">
                      <span className={`px-2 py-1 text-[10px] font-bold rounded uppercase ${r.status === 'paga' ? 'bg-emerald-100 text-emerald-700' : r.status === 'parcial' ? 'bg-amber-100 text-amber-700' : r.status === 'cancelada' ? 'bg-rose-100 text-rose-700 line-through' : 'bg-slate-100 text-slate-700'}`}>
                        {r.status}
                      </span>
                    </td>
                    <td className="px-6 py-4 text-right">
                      {renderActionMenu(r, 'receivable')}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {activeTab === 'card' && (
        <div className="space-y-4">
          <div className="flex justify-between items-center">
            <h2 className="text-xl font-bold text-slate-800">Transações em Cartão</h2>
            <div className="flex gap-2">
              <button onClick={() => { setModalType('receivable'); setSelectedItem(null); setFormData({ vencimento: new Date().toISOString().split('T')[0], local: 'Cartão' }); setIsModalOpen(true); }} className="bg-emerald-600 text-white px-4 py-2 rounded-xl font-bold flex items-center gap-2 hover:bg-emerald-700 transition-all shadow-lg shadow-emerald-200">
                <Plus className="w-4 h-4" /> Recebimento
              </button>
              <button onClick={() => { setModalType('payable'); setSelectedItem(null); setFormData({ vencimento: new Date().toISOString().split('T')[0], local: 'Cartão' }); setIsModalOpen(true); }} className="bg-rose-600 text-white px-4 py-2 rounded-xl font-bold flex items-center gap-2 hover:bg-rose-700 transition-all shadow-lg shadow-rose-200">
                <Plus className="w-4 h-4" /> Pagamento
              </button>
            </div>
          </div>
          <FilterSection />

          <div className="bg-white rounded-2xl shadow-sm border border-slate-100 overflow-visible">
            <table className="w-full text-left">
              <thead className="bg-slate-50 text-slate-500 text-xs text-left uppercase tracking-wider">
                <tr>
                  <th className="px-6 py-4 font-semibold rounded-tl-2xl">Descrição / Cliente</th>
                  <th className="px-6 py-4 font-semibold">Vencimento</th>
                  <th className="px-6 py-4 text-right font-semibold">Valor</th>
                  <th className="px-6 py-4 text-center font-semibold">Status</th>
                  <th className="px-6 py-4 text-right font-semibold rounded-tr-2xl">Ações</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {getFilteredCardBankMovements([...receivables.map(r => ({...r, tType: 'receivable'})), ...payables.map(p => ({...p, tType: 'payable'}))])
                  .filter(t => (t.local === 'Cartão' || t.tp_local === 'Cartão') && t.local !== 'Banco')
                  .sort((a, b) => new Date(b.vencimento || b.data_movimentacao).getTime() - new Date(a.vencimento || a.data_movimentacao).getTime())
                  .map(t => (
                    <tr key={`${t.tType}-${t.id}`}>
                      <td className="px-6 py-4">
                        <div className="font-medium text-slate-900">{t.cliente_nome || t.fornecedor_nome || 'Diversos'}</div>
                        <div className="text-[10px] text-slate-400 font-mono mt-0.5">{t.descricao}</div>
                      </td>
                      <td className="px-6 py-4 text-slate-500">{new Date(t.vencimento || t.data_movimentacao).toLocaleDateString()}</td>
                      <td className={`px-6 py-4 text-right font-bold ${t.tType === 'receivable' ? 'text-emerald-600' : 'text-rose-600'}`}>
                        {t.tType === 'receivable' ? '+' : '-'} R$ {formatMoney(t.valor)}
                      </td>
                      <td className="px-6 py-4 text-center">
                        <span className={`px-2 py-1 text-[10px] font-bold rounded uppercase ${t.status === 'paga' ? 'bg-emerald-100 text-emerald-700' : t.status === 'parcial' ? 'bg-amber-100 text-amber-700' : t.status === 'cancelada' ? 'bg-rose-100 text-rose-700 line-through' : 'bg-slate-100 text-slate-700'}`}>
                          {t.status}
                        </span>
                      </td>
                      <td className="px-6 py-4 text-right">
                        {renderActionMenu(t, t.tType, 'lancamentos')}
                      </td>
                    </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {activeTab === 'bank' && (
        <div className="space-y-4">
          <div className="flex justify-between items-center">
            <h2 className="text-xl font-bold text-slate-800">Transações em Banco</h2>
            <div className="flex gap-2">
              <button onClick={() => { setModalType('receivable'); setSelectedItem(null); setFormData({ vencimento: new Date().toISOString().split('T')[0], local: 'Banco' }); setIsModalOpen(true); }} className="bg-emerald-600 text-white px-4 py-2 rounded-xl font-bold flex items-center gap-2 hover:bg-emerald-700 transition-all shadow-lg shadow-emerald-200">
                <Plus className="w-4 h-4" /> Recebimento
              </button>
              <button onClick={() => { setModalType('payable'); setSelectedItem(null); setFormData({ vencimento: new Date().toISOString().split('T')[0], local: 'Banco' }); setIsModalOpen(true); }} className="bg-rose-600 text-white px-4 py-2 rounded-xl font-bold flex items-center gap-2 hover:bg-rose-700 transition-all shadow-lg shadow-rose-200">
                <Plus className="w-4 h-4" /> Pagamento
              </button>
            </div>
          </div>
          <FilterSection />

          <div className="bg-white rounded-2xl shadow-sm border border-slate-100 overflow-visible">
            <table className="w-full text-left">
              <thead className="bg-slate-50 text-slate-500 text-xs text-left uppercase tracking-wider">
                <tr>
                  <th className="px-6 py-4 font-semibold rounded-tl-2xl">Descrição / Pessoa</th>
                  <th className="px-6 py-4 font-semibold">Vencimento</th>
                  <th className="px-6 py-4 text-right font-semibold">Valor</th>
                  <th className="px-6 py-4 text-center font-semibold">Status</th>
                  <th className="px-6 py-4 text-right font-semibold rounded-tr-2xl">Ações</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {getFilteredCardBankMovements([...receivables.map(r => ({...r, tType: 'receivable'})), ...payables.map(p => ({...p, tType: 'payable'}))])
                  .filter(t => t.local === 'Banco' || t.tp_local === 'Banco')
                  .sort((a, b) => new Date(b.vencimento || b.data_movimentacao).getTime() - new Date(a.vencimento || a.data_movimentacao).getTime())
                  .map(t => (
                    <tr key={`${t.tType}-${t.id}`}>
                      <td className="px-6 py-4">
                        <div className="font-medium text-slate-900">{t.cliente_nome || t.fornecedor_nome || 'Diversos'}</div>
                        <div className="text-[10px] text-slate-400 font-mono mt-0.5">{t.descricao}</div>
                      </td>
                      <td className="px-6 py-4 text-slate-500">{new Date(t.vencimento || t.data_movimentacao).toLocaleDateString()}</td>
                      <td className={`px-6 py-4 text-right font-bold ${t.tType === 'receivable' ? 'text-emerald-600' : 'text-rose-600'}`}>
                        {t.tType === 'receivable' ? '+' : '-'} R$ {formatMoney(t.valor)}
                      </td>
                      <td className="px-6 py-4 text-center">
                        <span className={`px-2 py-1 text-[10px] font-bold rounded uppercase ${t.status === 'paga' ? 'bg-emerald-100 text-emerald-700' : t.status === 'parcial' ? 'bg-amber-100 text-amber-700' : t.status === 'cancelada' ? 'bg-rose-100 text-rose-700 line-through' : 'bg-slate-100 text-slate-700'}`}>
                          {t.status}
                        </span>
                      </td>
                      <td className="px-6 py-4 text-right">
                        {renderActionMenu(t, t.tType, 'lancamentos')}
                      </td>
                    </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {activeTab === 'payables' && (
        <div className="space-y-4">
          <div className="flex justify-between items-center">
            <h2 className="text-xl font-bold text-slate-800">Contas a Pagar</h2>
            <button onClick={() => { setModalType('payable'); setSelectedItem(null); setFormData({ vencimento: new Date().toISOString().split('T')[0], local: 'Pagar' }); setIsModalOpen(true); }} className="bg-rose-600 text-white px-4 py-2 rounded-xl font-bold flex items-center gap-2 hover:bg-rose-700 transition-all shadow-lg shadow-rose-200">
              <Plus className="w-4 h-4" /> Novo Pagamento
            </button>
          </div>
          <FilterSection />

          <div className="bg-white rounded-2xl shadow-sm border border-slate-100 overflow-visible">
            <table className="w-full text-left">
              <thead className="bg-slate-50 text-slate-500 text-xs text-left uppercase tracking-wider">
                <tr>
                  <th className="px-6 py-4 font-semibold rounded-tl-2xl">Fornecedor</th>
                  <th className="px-6 py-4 font-semibold">Vencimento</th>
                  <th className="px-6 py-4 text-right font-semibold">Valor</th>
                  <th className="px-6 py-4 text-right font-semibold">Pago</th>
                  <th className="px-6 py-4 text-center font-semibold">Status</th>
                  <th className="px-6 py-4 text-right font-semibold rounded-tr-2xl">Ações</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {getFilteredPayables(payables).map(p => (
                  <tr key={p.id}>
                    <td className="px-6 py-4">
                      <div className="font-medium text-slate-900">{p.fornecedor_nome || 'Diversos'}</div>
                      {p.descricao && <div className="text-[10px] text-slate-400 font-mono mt-0.5">{p.descricao}</div>}
                    </td>
                    <td className="px-6 py-4 text-slate-500">{new Date(p.vencimento).toLocaleDateString()}</td>
                    <td className="px-6 py-4 text-right font-bold text-slate-900">R$ {formatMoney(p.valor)}</td>
                    <td className="px-6 py-4 text-right text-rose-600 font-medium">R$ {formatMoney(p.valor_pago)}</td>
                    <td className="px-6 py-4 text-center">
                      <span className={`px-2 py-1 text-[10px] font-bold rounded uppercase ${p.status === 'paga' ? 'bg-emerald-100 text-emerald-700' : p.status === 'parcial' ? 'bg-amber-100 text-amber-700' : p.status === 'cancelada' ? 'bg-rose-100 text-rose-700 line-through' : 'bg-slate-100 text-slate-700'}`}>
                        {p.status}
                      </span>
                    </td>
                    <td className="px-6 py-4 text-right">
                      {renderActionMenu(p, 'payable', 'lancamentos')}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {activeTab === 'cashier' && (
        <div className="space-y-6">
          <div className="flex justify-between items-center">
            <h2 className="text-xl font-bold text-slate-800">Controle de Caixa</h2>
            {!currentCashier ? (
              <button onClick={() => { setModalType('caixaOpen'); setFormData({ valor_inicial: 0 }); setIsModalOpen(true); }} className="bg-indigo-600 text-white px-4 py-2 rounded-xl font-bold hover:bg-indigo-700 transition-all shadow-lg shadow-indigo-200">
                Abrir Caixa
              </button>
            ) : (
              <div className="flex gap-2">
                <button 
                  onClick={() => { setModalType('caixaManualEntry'); setFormData({ tipo: 'entrada', valor: '', descricao: '' }); setIsModalOpen(true); }}
                  className="bg-amber-500 text-white px-4 py-2 rounded-xl font-bold hover:bg-amber-600 transition-all shadow-lg shadow-amber-200 flex items-center gap-2"
                >
                  <Plus className="w-4 h-4" /> Lançamento
                </button>
                <button onClick={handleCloseCashier} className="bg-rose-600 text-white px-4 py-2 rounded-xl font-bold hover:bg-rose-700 transition-all shadow-lg shadow-rose-200">
                  Fechar Caixa
                </button>
              </div>
            )}
          </div>
          
          <FilterSection />
          
          {currentCashier ? (
            <>
              <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
                <div className="bg-white p-6 rounded-2xl border border-slate-100 shadow-sm">
                  <p className="text-xs font-bold text-slate-400 uppercase mb-1">Valor Inicial</p>
                  <p className="text-2xl font-black text-slate-900">R$ {formatMoney(currentCashier.valor_inicial)}</p>
                </div>
                <div className="bg-white p-6 rounded-2xl border border-slate-100 shadow-sm">
                  <p className="text-xs font-bold text-slate-400 uppercase mb-1">Saldo Atual</p>
                  <p className="text-2xl font-black text-indigo-600">
                    R$ {formatMoney(
                      (parseFloat(currentCashier.valor_inicial) || 0) + 
                      salesMovements
                        .filter(m => m.local === 'Caixa')
                        .reduce((sum, m) => sum + (m.tipo === 'saida' ? -(parseFloat(m.valor) || 0) : (parseFloat(m.valor) || 0)), 0)
                    )}
                  </p>
                </div>
              </div>

              <div className="bg-white rounded-2xl shadow-sm border border-slate-100 overflow-visible">
                <div className="p-4 border-b border-slate-100 bg-slate-50/50 flex flex-col gap-4 rounded-t-2xl">
                  <h3 className="font-bold text-slate-900">Movimentações de Caixa</h3>
                </div>
                <table className="w-full text-left">
                  <thead className="bg-slate-50 text-slate-500 text-[10px] uppercase tracking-wider">
                    <tr>
                      <th className="px-6 py-3 font-semibold">Data/Hora</th>
                      <th className="px-6 py-3 font-semibold">Descrição</th>
                      <th className="px-6 py-3 font-semibold text-center">Status</th>
                      <th className="px-6 py-3 font-semibold text-right">Valor</th>
                      <th className="px-6 py-3 font-semibold text-right rounded-tr-2xl">Ações</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 text-sm">
                    {getFilteredCashierMovements(salesMovements)
                      .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
                      .map((m) => (
                        <tr key={m.id}>
                          <td className="px-6 py-4 text-slate-500">{new Date(m.created_at).toLocaleString()}</td>
                          <td className="px-6 py-4 font-medium text-slate-900">{m.descricao || 'Venda'}</td>
                          <td className="px-6 py-4 text-center">
                            <span className={`px-2 py-1 text-[10px] font-bold rounded uppercase ${(m.status || 'paga') === 'paga' ? 'bg-emerald-100 text-emerald-700' : (m.status || 'paga') === 'cancelada' ? 'bg-rose-100 text-rose-700 line-through' : 'bg-slate-100 text-slate-700'}`}>
                              {m.status || 'paga'}
                            </span>
                          </td>
                          <td className={`px-6 py-4 text-right font-bold ${m.tipo === 'saida' ? 'text-rose-600' : 'text-emerald-600'}`}>
                            {m.tipo === 'saida' ? '-' : '+'} R$ {formatMoney(m.valor)}
                          </td>
                          <td className="px-6 py-4 text-right">
                            {(!m.origem || m.origem === 'Lançamento Manual') && renderActionMenu(m, 'movimentacao', 'caixa')}
                          </td>
                        </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          ) : (
            <div className="bg-slate-100 p-12 rounded-2xl text-center text-slate-400 italic">
              O caixa está fechado no momento.
            </div>
          )}
        </div>
      )}

      {activeTab === 'reports' && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          <Link to="/reports/sales" className="bg-white p-8 rounded-2xl border border-slate-100 shadow-sm hover:shadow-md transition-all group">
            <div className="bg-indigo-50 w-12 h-12 rounded-xl flex items-center justify-center text-indigo-600 mb-4 group-hover:scale-110 transition-transform">
              <TrendingUp className="w-6 h-6" />
            </div>
            <h3 className="font-bold text-slate-900 mb-1">Relatório de Vendas</h3>
            <p className="text-sm text-slate-500">Análise detalhada de vendas, produtos e clientes.</p>
          </Link>
          <Link to="/reports/finance" className="bg-white p-8 rounded-2xl border border-slate-100 shadow-sm hover:shadow-md transition-all group">
            <div className="bg-emerald-50 w-12 h-12 rounded-xl flex items-center justify-center text-emerald-600 mb-4 group-hover:scale-110 transition-transform">
              <DollarSign className="w-6 h-6" />
            </div>
            <h3 className="font-bold text-slate-900 mb-1">Relatório Financeiro</h3>
            <p className="text-sm text-slate-500">Contas a pagar, receber e fluxo de caixa.</p>
          </Link>
          <Link to="/dre" className="bg-white p-8 rounded-2xl border border-slate-100 shadow-sm hover:shadow-md transition-all group">
            <div className="bg-amber-50 w-12 h-12 rounded-xl flex items-center justify-center text-amber-600 mb-4 group-hover:scale-110 transition-transform">
              <FileText className="w-6 h-6" />
            </div>
            <h3 className="font-bold text-slate-900 mb-1">DRE</h3>
            <p className="text-sm text-slate-500">Demonstrativo de Resultados do Exercício.</p>
          </Link>
          <Link to="/reports/inventory" className="bg-white p-8 rounded-2xl border border-slate-100 shadow-sm hover:shadow-md transition-all group">
            <div className="bg-rose-50 w-12 h-12 rounded-xl flex items-center justify-center text-rose-600 mb-4 group-hover:scale-110 transition-transform">
              <Package className="w-6 h-6" />
            </div>
            <h3 className="font-bold text-slate-900 mb-1">Relatório de Estoque</h3>
            <p className="text-sm text-slate-500">Níveis de estoque e reposição necessária.</p>
          </Link>
        </div>
      )}

      {isModalOpen && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center p-4 z-50">
          <motion.div initial={{ scale: 0.9, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} className="bg-white w-full max-w-md rounded-3xl p-8 shadow-2xl">
            <div className="flex justify-between items-center mb-6">
              <h2 className="text-2xl font-bold text-slate-900">
                {modalType === 'receivable' && 'Novo Recebimento'}
                {modalType === 'payable' && 'Novo Pagamento'}
                {modalType === 'baixa' && 'Baixar Conta'}
                {modalType === 'caixaOpen' && 'Abrir Caixa'}
                {modalType === 'caixaClose' && 'Fechar Caixa'}
                {modalType === 'caixaManualEntry' && 'Lançamento de Caixa'}
              </h2>
              <button onClick={() => setIsModalOpen(false)}><X className="text-slate-400" /></button>
            </div>
            <form onSubmit={handleSubmit} className="space-y-4">
              {modalType === 'caixaClose' && selectedItem && (
                <div className="space-y-4 text-sm text-slate-600">
                  <p>Informe o valor total em dinheiro:</p>
                  <input type="number" step="0.01" className="w-full px-4 py-2 rounded-xl border border-slate-200" onChange={e => setFormData({...formData, counted: { 'Dinheiro': parseFloat(e.target.value) }})} required />
                </div>
              )}
              {modalType === 'caixaManualEntry' && (
                <>
                  <select className="w-full px-4 py-2 rounded-xl border border-slate-200" onChange={e => setFormData({...formData, tipo: e.target.value})} required>
                    <option value="entrada">Entrada</option>
                    <option value="saida">Saída</option>
                  </select>
                  <select className="w-full px-4 py-2 rounded-xl border border-slate-200 text-sm outline-none focus:ring-2 focus:ring-indigo-500" value={formData.categoria_id || ''} onChange={e => setFormData({...formData, categoria_id: parseInt(e.target.value)})} required>
                    <option value="">Categoria...</option>
                    {categories.map(c => <option key={c.id} value={c.id}>{c.nome}</option>)}
                  </select>
                  <input type="number" step="0.01" placeholder="Valor" className="w-full px-4 py-2 rounded-xl border border-slate-200" onChange={e => setFormData({...formData, valor: parseFloat(e.target.value)})} required />
                  <input type="text" placeholder="Descrição" className="w-full px-4 py-2 rounded-xl border border-slate-200" onChange={e => setFormData({...formData, descricao: e.target.value})} required />
                </>
              )}
              {['receivable', 'payable'].includes(modalType) && (
                <>
                  <select className="w-full px-4 py-2 rounded-xl border border-slate-200 text-sm outline-none focus:ring-2 focus:ring-indigo-500" value={formData.pessoa_id || ''} onChange={e => setFormData({...formData, pessoa_id: parseInt(e.target.value)})} required>
                    <option value="">Pessoa...</option>
                    {pessoas.map(p => <option key={p.id} value={p.id}>{p.nome}</option>)}
                  </select>
                  <select className="w-full px-4 py-2 rounded-xl border border-slate-200 text-sm outline-none focus:ring-2 focus:ring-indigo-500" value={formData.categoria_id || ''} onChange={e => setFormData({...formData, categoria_id: parseInt(e.target.value)})} required>
                    <option value="">Categoria...</option>
                    {categories.map(c => <option key={c.id} value={c.id}>{c.nome}</option>)}
                  </select>
                  <input type="date" className="w-full px-4 py-2 rounded-xl border border-slate-200" value={formData.vencimento || ''} onChange={e => setFormData({...formData, vencimento: e.target.value})} required />
                  <input type="number" step="0.01" placeholder="Valor" className="w-full px-4 py-2 rounded-xl border border-slate-200" value={formData.valor || ''} onChange={e => setFormData({...formData, valor: parseFloat(e.target.value)})} required />
                  <input type="text" placeholder="Descrição" className="w-full px-4 py-2 rounded-xl border border-slate-200" value={formData.descricao || ''} onChange={e => setFormData({...formData, descricao: e.target.value})} />
                </>
              )}
              {modalType === 'baixa' && (
                <>
                  <input type="number" step="0.01" placeholder="Valor Pago" className="w-full px-4 py-2 rounded-xl border border-slate-200" value={formData.valor_pago || ''} onChange={e => setFormData({...formData, valor_pago: parseFloat(e.target.value)})} required />
                  <select className="w-full px-4 py-2 rounded-xl border border-slate-200" value={formData.local || ''} onChange={e => setFormData({...formData, local: e.target.value})} required>
                    <option value="">Local...</option>
                    <option value="Caixa">Caixa</option>
                    <option value="Banco">Banco</option>
                    <option value="Cartão">Cartão</option>
                  </select>
                  <select className="w-full px-4 py-2 rounded-xl border border-slate-200 text-sm outline-none focus:ring-2 focus:ring-indigo-500" value={formData.categoria_id || ''} onChange={e => setFormData({...formData, categoria_id: parseInt(e.target.value)})}>
                    <option value="">Trocar Categoria (Opcional)</option>
                    {categories.map(c => <option key={c.id} value={c.id}>{c.nome}</option>)}
                  </select>
                </>
              )}
              {modalType === 'caixaOpen' && (
                <input type="number" step="0.01" placeholder="Valor Inicial" className="w-full px-4 py-2 rounded-xl border border-slate-200" onChange={e => setFormData({...formData, valor_inicial: parseFloat(e.target.value)})} required />
              )}
              <button type="submit" className="w-full bg-indigo-600 text-white py-3 rounded-xl font-bold hover:bg-indigo-700 transition-all">Confirmar</button>
            </form>
          </motion.div>
        </div>
      )}

      {cancelModalOpen && (
        <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} className="bg-white rounded-2xl shadow-xl w-full max-w-md overflow-hidden">
            <div className="p-6 border-b border-slate-100 flex justify-between items-center bg-rose-50/50">
              <h2 className="text-xl font-bold text-rose-800">Confirmar Cancelamento</h2>
              <button onClick={() => setCancelModalOpen(false)} className="p-2 hover:bg-rose-100 rounded-full text-rose-500 transition-colors">
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="p-6 space-y-4">
              <div className="bg-rose-50 text-rose-700 p-4 rounded-xl text-sm mb-4">
                <p><strong>Atenção:</strong> Esta ação marcará o lançamento como cancelado e não entrará mais nos relatórios no DRE. A ação fica registrada.</p>
              </div>
              <textarea placeholder="Motivo do Cancelamento..." value={actionReason} onChange={e => setActionReason(e.target.value)} className="w-full h-32 px-4 py-3 rounded-xl border border-slate-200 outline-none focus:ring-2 focus:ring-rose-500 resize-none"></textarea>
              <button onClick={() => handleActionRequest('cancel')} disabled={!actionReason.trim()} className="w-full bg-rose-600 disabled:bg-slate-300 text-white py-3 rounded-xl font-bold hover:bg-rose-700 transition-all">Cancelar Lançamento</button>
            </div>
          </motion.div>
        </div>
      )}

      {estornoModalOpen && (
        <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} className="bg-white rounded-2xl shadow-xl w-full max-w-md overflow-hidden">
            <div className="p-6 border-b border-slate-100 flex justify-between items-center bg-amber-50/50">
              <h2 className="text-xl font-bold text-amber-800">Confirmar Estorno</h2>
              <button onClick={() => setEstornoModalOpen(false)} className="p-2 hover:bg-amber-100 rounded-full text-amber-500 transition-colors">
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="p-6 space-y-4">
              <div className="bg-amber-50 text-amber-800 p-4 rounded-xl text-sm mb-4">
                <p><strong>Atenção:</strong> Esta ação voltará o lançamento atual para o status aberto e criará um contra-lançamento no respectivo local de repasse (Caixa/Banco/Cartão) para subtrair/adicionar o valor devidamente.</p>
              </div>
              <textarea placeholder="Motivo do Estorno..." value={actionReason} onChange={e => setActionReason(e.target.value)} className="w-full h-32 px-4 py-3 rounded-xl border border-slate-200 outline-none focus:ring-2 focus:ring-amber-500 resize-none"></textarea>
              <button onClick={() => handleActionRequest('estorno')} disabled={!actionReason.trim()} className="w-full bg-amber-600 disabled:bg-slate-300 text-white py-3 rounded-xl font-bold hover:bg-amber-700 transition-all">Efetuar Estorno</button>
            </div>
          </motion.div>
        </div>
      )}
    </div>
  );
};

export default Finance;
