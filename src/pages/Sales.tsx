import React, { useState, useEffect } from 'react';
import { ShoppingCart, Wrench, Search, Plus, Edit2, MoreVertical, Printer, MessageCircle, Trash2, Ban, AlertCircle, X, FileText } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { useAuthStore } from '../store/authStore';
import { formatMoney } from '../utils/format';
import { validatePayment } from '../utils/paymentValidation';

export const Sales = ({ mode = 'venda' }: { mode?: 'venda' | 'os' }) => {
  const [sales, setSales] = useState<any[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [startDate, setStartDate] = useState(() => {
    const now = new Date();
    return new Date(now.getFullYear(), now.getMonth(), 1).toISOString().split('T')[0];
  });
  const [endDate, setEndDate] = useState(() => {
    const now = new Date();
    return new Date(now.getFullYear(), now.getMonth() + 1, 0).toISOString().split('T')[0];
  });
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [origemFilter, setOrigemFilter] = useState('Todas');
  const [statusFilter, setStatusFilter] = useState('todos');
  const [company, setCompany] = useState<any>(null);
  const [printModalSale, setPrintModalSale] = useState<any>(null);
  const [loadingPrint, setLoadingPrint] = useState(false);
  const [pessoas, setPessoas] = useState<any[]>([]);
  const [produtos, setProdutos] = useState<any[]>([]);
  const [paymentTypes, setPaymentTypes] = useState<any[]>([]);
  const [newSale, setNewSale] = useState<any>({
    pessoa_id: '',
    items: [],
    valor_total: 0,
    desconto: 0,
    frete: 0,
    pagamentos: [],
    status: 'finalizada',
    tipo: 'venda',
    origem: 'Balcao'
  });
  const [currentPayment, setCurrentPayment] = useState<any>({
    tipo_pagamento_id: '',
    valor: 0,
    parcelas: 1
  });
  const [selectedProduct, setSelectedProduct] = useState<any>('');
  const [productSearchTerm, setProductSearchTerm] = useState('');
  const [showProductDropdown, setShowProductDropdown] = useState(false);
  const [clientSearchTerm, setClientSearchTerm] = useState('');
  const [showClientDropdown, setShowClientDropdown] = useState(false);
  const [quantity, setQuantity] = useState<number>(1);
  const [currentCashier, setCurrentCashier] = useState<any>(null);
  const [openActionMenuId, setOpenActionMenuId] = useState<number | null>(null);
  const [confirmCancelId, setConfirmCancelId] = useState<number | null>(null);
  const [loading, setLoading] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  
  const token = useAuthStore(state => state.token);

  const handleCancelSale = async (id: any) => {
    setLoading(true);
    try {
      const response = await fetch(`/api/sales/${id}/cancel`, {
        method: 'POST',
        headers: { 
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        }
      });
      
      if (response.ok) {
        fetchData();
        setConfirmCancelId(null);
      } else {
        const errorData = await response.json();
        alert("Erro no servidor: " + (errorData.error || 'Não foi possível cancelar o pedido.'));
      }
    } catch (error) {
      console.error("Erro na requisição de cancelamento:", error);
      alert("Erro de conexão: Verifique sua internet ou tente novamente mais tarde.");
    } finally {
      setLoading(false);
    }
  };

  const fetchData = () => {
    fetch('/api/sales', { headers: { 'Authorization': `Bearer ${token}` } })
      .then(res => res.json())
      .then(data => {
        if (Array.isArray(data)) {
          setSales(data);
        } else {
          console.error("Sales API returned non-array:", data);
          setSales([]);
        }
      })
      .catch(err => {
        console.error("Error fetching sales:", err);
        setSales([]);
      });
    fetch('/api/pessoas', { headers: { 'Authorization': `Bearer ${token}` } })
      .then(res => res.json()).then(setPessoas);
    fetch('/api/products', { headers: { 'Authorization': `Bearer ${token}` } })
      .then(res => res.json()).then(setProdutos);
    fetch('/api/finance/payment-types', { headers: { 'Authorization': `Bearer ${token}` } })
      .then(res => res.json()).then(setPaymentTypes);
    fetch('/api/finance/cashier/current', { headers: { 'Authorization': `Bearer ${token}` } })
      .then(res => res.json()).then(setCurrentCashier);
  };

  useEffect(() => {
    fetchData();
    fetch('/api/company/settings', { headers: { 'Authorization': `Bearer ${token}` } })
      .then(res => res.json())
      .then(setCompany)
      .catch(err => console.error("Error fetching company settings:", err));
  }, [token]);

  const handlePrintSale = async (saleId: number, type: 'print' | 'whatsapp') => {
    setLoadingPrint(true);
    try {
      const res = await fetch(`/api/sales/${saleId}`, { headers: { 'Authorization': `Bearer ${token}` } });
      const sale = await res.json();
      if (!res.ok) throw new Error(sale.error || 'Erro ao carregar venda');

      if (type === 'whatsapp') {
        let text = company?.nome_fantasia ? `*${company.nome_fantasia}*\n` : '';
        text += `\n*${sale.tipo === 'os' ? 'ORDEM DE SERVIÇO' : 'PEDIDO DE VENDA'}*\n`;
        text += `Pedido: #${sale.sequencial_id || sale.id}\n`;
        text += `Data: ${new Date(sale.data_venda).toLocaleDateString()}\n`;
        text += `Cliente: ${sale.cliente_nome || 'Consumidor Final'}\n`;
        
        if (sale.tipo === 'os') {
          text += `\n*INFORMAÇÕES DA O.S.*\n`;
          text += `Solicitação: ${sale.solicitacao || '-'}\n`;
          if (sale.laudo_tecnico) text += `Laudo: ${sale.laudo_tecnico}\n`;
        }

        text += `------------------------\n`;
        sale.items.forEach((i: any) => {
          text += `${i.quantidade}x ${i.nome} - R$ ${formatMoney(i.subtotal)}\n`;
        });
        text += `------------------------\n`;
        text += `*TOTAL: R$ ${formatMoney(sale.valor_total)}*\n`;
        if (sale.pagamentos && sale.pagamentos.length > 0) {
          text += `Pagamentos:\n`;
          sale.pagamentos.forEach((p: any) => {
            text += `- ${p.nome}${p.parcelas > 1 ? ` (${p.parcelas}x)` : ''}: R$ ${formatMoney(p.valor)}\n`;
          });
        }
        text += `\nAgradecemos a preferência!`;
        window.open(`https://wa.me/?text=${encodeURIComponent(text)}`, '_blank');
      } else {
        const items = sale.items || [];
        const subtotal = items.reduce((acc: number, i: any) => acc + parseFloat(i.subtotal || 0), 0);
        const total = sale.valor_total;
        
        const content = `
          <style>
            @page { size: 58mm auto; margin: 0; }
            body { 
              width: 58mm; 
              margin: 0; 
              padding: 2mm; 
              font-family: 'Courier New', Courier, monospace; 
              font-size: 10px; 
              color: #000;
              line-height: 1.2;
            }
            .header { text-align: center; margin-bottom: 5px; }
            .company-name { font-size: 14px; font-weight: bold; }
            .disclaimer { font-weight: bold; font-size: 11px; margin: 8px 0; border: 1px solid #000; padding: 2px; }
            .divider { border-top: 1px dashed #000; margin: 5px 0; }
            .row { display: flex; justify-content: space-between; margin-bottom: 2px; }
            .bold { font-weight: bold; }
            .center { text-align: center; }
          </style>
          <div>
            <div class="header">
              <div class="company-name">${company?.nome_fantasia || 'RECIBO'}</div>
              ${company?.cnpj ? `<span>CNPJ: ${company.cnpj}</span><br/>` : ''}
              ${company?.endereco ? `<span>${company.endereco}, ${company.numero || ''}</span><br/>` : ''}
              ${company?.cidade ? `<span>${company.cidade}/${company.estado || ''}</span><br/>` : ''}
              ${company?.telefone_celular || company?.telefone_fixo ? `<span>Tel: ${company.telefone_celular || company.telefone_fixo}</span>` : ''}
            </div>
            
            <div class="center disclaimer">${sale.tipo === 'os' ? 'ORDEM DE SERVIÇO' : 'RECIBO DE VENDA'}<br/>SEM VALOR FISCAL</div>
            
            <div class="row"><span>${sale.tipo === 'os' ? 'O.S' : 'Venda'}: #${sale.sequencial_id || sale.id}</span></div>
            <div class="row"><span>Data: ${new Date(sale.data_venda).toLocaleString('pt-BR')}</span></div>
            ${sale.cliente_nome ? `<div class="row"><span>Cliente: ${sale.cliente_nome.substring(0,15)}</span></div>` : ''}
            
            <div class="divider"></div>
            ${items.map((i: any) => `
              <div class="row">
                <span>${i.quantidade}x ${i.nome.substring(0,14)}</span>
                <span>R$ ${formatMoney(i.subtotal)}</span>
              </div>
            `).join('')}
            <div class="divider"></div>
            
            <div class="row"><span>Subtotal:</span><span>R$ ${formatMoney(subtotal)}</span></div>
            ${parseFloat(sale.desconto) > 0 ? `<div class="row"><span>Desconto:</span><span>R$ ${formatMoney(sale.desconto)}</span></div>` : ''}
            
            <div class="row bold" style="font-size: 12px; margin-top: 4px;">
              <span>TOTAL:</span>
              <span>R$ ${formatMoney(total)}</span>
            </div>
            
            <div class="divider"></div>
            <div class="row bold" style="font-size: 11px;"><span>Pagamentos:</span></div>
            ${sale.pagamentos && sale.pagamentos.length > 0 ? 
              sale.pagamentos.map((p: any) => `
                <div class="row" style="padding-left: 5px;">
                  <span>- ${p.nome} ${p.parcelas > 1 ? `(${p.parcelas}x)` : ''}</span>
                  <span class="bold">R$ ${formatMoney(p.valor)}</span>
                </div>
              `).join('')
            : `
              <div class="row"><span>-</span><span class="bold">A Receber</span></div>
            `}
            
            <div class="divider"></div>
            <div class="center" style="margin-top: 10px;">Agradecemos a preferência!</div>
          </div>
        `;

        const printWindow = window.open('', '_blank', 'width=300,height=600');
        if (printWindow) {
          printWindow.document.write(`<html><head><title>Recibo #${sale.sequencial_id || sale.id}</title></head><body onload="window.print(); setTimeout(() => window.close(), 500);">${content}</body></html>`);
          printWindow.document.close();
        }
      }
    } catch (err) {
      console.error(err);
      alert("Erro ao imprimir");
    } finally {
      setLoadingPrint(false);
      setPrintModalSale(null);
    }
  };

  const handleAddItem = () => {
    if (!selectedProduct || quantity <= 0) return;
    const product = produtos.find(p => p.id === parseInt(selectedProduct));
    if (!product) return;

    const newItem = {
      id: product.id,
      nome: product.nome,
      preco_venda: product.preco_venda,
      quantidade: quantity,
      subtotal: product.preco_venda * quantity
    };

    const updatedItems = [...newSale.items, newItem];
    const total = updatedItems.reduce((acc, item) => acc + item.subtotal, 0);

    setNewSale({
      ...newSale,
      items: updatedItems,
      valor_total: total + (newSale.frete || 0) - (newSale.desconto || 0)
    });
    setSelectedProduct('');
    setProductSearchTerm('');
    setQuantity(1);
  };

  const handleAddPayment = () => {
    if (!currentPayment.tipo_pagamento_id || currentPayment.valor <= 0) return;
    
    const type = paymentTypes.find(pt => pt.id === parseInt(currentPayment.tipo_pagamento_id));
    const paymentName = type?.nome;

    const validation = validatePayment(type, currentPayment.valor, currentPayment.parcelas);
    if (!validation.valid) {
      alert(validation.message);
      return;
    }

    const alreadyPaid = (newSale.pagamentos || []).reduce((acc: number, p: any) => acc + p.valor, 0);
    const remaining = newSale.valor_total - alreadyPaid;

    let valorToAdd = currentPayment.valor;
    const isDinheiro = paymentName?.toLowerCase() === 'dinheiro';

    if (!isDinheiro && valorToAdd > remaining) {
      alert(`O valor do pagamento (${paymentName}) não pode ser superior ao total do pedido.`);
      return;
    }

    if (isDinheiro && valorToAdd > remaining) {
      valorToAdd = remaining;
    }

    const newPayment = {
      ...currentPayment,
      nome: paymentName,
      valor: valorToAdd
    };

    setNewSale({
      ...newSale,
      pagamentos: [...(newSale.pagamentos || []), newPayment]
    });

    setCurrentPayment({
      tipo_pagamento_id: '',
      valor: 0,
      parcelas: 1
    });
  };

  const handleRemovePayment = (index: number) => {
    const updatedPagamentos = newSale.pagamentos.filter((_: any, i: number) => i !== index);
    setNewSale({
      ...newSale,
      pagamentos: updatedPagamentos
    });
  };

  const handleRemoveItem = (index: number) => {
    const updatedItems = newSale.items.filter((_: any, i: number) => i !== index);
    const total = updatedItems.reduce((acc: number, item: any) => acc + item.subtotal, 0);
    setNewSale({
      ...newSale,
      items: updatedItems,
      valor_total: total + (newSale.frete || 0) - (newSale.desconto || 0)
    });
  };

  const calculateTotal = (frete: number, desconto: number) => {
    const itemsTotal = newSale.items.reduce((acc: number, item: any) => acc + item.subtotal, 0);
    return itemsTotal + (frete || 0) - (desconto || 0);
  };

  const handleEdit = async (id: number) => {
    try {
      const res = await fetch(`/api/sales/${id}`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (res.ok) {
        const data = await res.json();
        setNewSale({
          ...data,
          pagamentos: data.pagamentos || []
        });
        const client = pessoas.find(p => p.id === data.pessoa_id);
        setClientSearchTerm(client ? (client.razao_social || client.nome) : 'Consumidor Final');
        setIsModalOpen(true);
      } else {
        alert('Erro ao buscar detalhes da venda');
      }
    } catch (err) {
      console.error("Error fetching sale:", err);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (newSale.items.length === 0 || isSaving) {
      if (newSale.items.length === 0) alert("Adicione pelo menos um item à venda.");
      return;
    }

    setIsSaving(true);
    try {
      const url = newSale.id ? `/api/sales/${newSale.id}` : '/api/sales';
      const method = newSale.id ? 'PUT' : 'POST';

      const res = await fetch(url, {
        method,
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify(newSale)
      });

      if (res.ok) {
        const saleData = await res.json();
        setIsModalOpen(false);
        setNewSale({
          pessoa_id: '',
          items: [],
          valor_total: 0,
          desconto: 0,
          frete: 0,
          pagamentos: [],
          status: 'finalizada',
          tipo: 'venda'
        });
        setClientSearchTerm('');
        setProductSearchTerm('');
        fetchData();
        
        if (saleData.sequencial_id) {
          setPrintModalSale(saleData);
        }
      } else {
        const data = await res.json();
        alert(data.error || 'Erro ao registrar venda');
      }
    } catch (err) {
      console.error("Error saving sale:", err);
      alert("Erro de conexão ao salvar venda.");
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="space-y-6">
      {!currentCashier && (
        <div className="bg-amber-50 border border-amber-200 p-4 rounded-xl flex items-center gap-3 text-amber-800">
          <AlertCircle className="w-5 h-5 text-amber-600" />
          <p className="font-medium">Faça abertura do Caixa para Iniciar um Novo Pedido ou OS</p>
        </div>
      )}
      <div className="flex justify-between items-center">
        <h1 className="text-3xl font-bold text-slate-900">{mode === 'venda' ? 'Pedidos e Orçamentos' : 'Ordens de Serviço'}</h1>
        <button 
          onClick={() => {
            if (!currentCashier) {
              alert("Faça abertura do Caixa para Iniciar um Novo Pedido ou OS");
              return;
            }
            setNewSale({
              pessoa_id: '',
              items: [],
              valor_total: 0,
              desconto: 0,
              frete: 0,
              pagamentos: [],
              status: 'finalizada',
              tipo: mode,
              origem: mode === 'venda' ? 'Balcao' : 'Ordem de Serviço'
            });
            setIsModalOpen(true);
          }}
          className="bg-indigo-600 text-white px-6 py-3 rounded-xl font-bold flex items-center gap-2 hover:bg-indigo-700 transition-all shadow-lg shadow-indigo-200"
        >
          {mode === 'venda' ? <ShoppingCart className="w-5 h-5" /> : <Wrench className="w-5 h-5" />} {mode === 'venda' ? 'Novo Pedido' : 'Nova OS'}
        </button>
      </div>
      <div className="bg-white rounded-2xl shadow-sm border border-slate-100 overflow-hidden">
        <div className="p-4 border-b border-slate-100 flex flex-col md:flex-row gap-4">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 w-5 h-5" />
            <input 
              type="text" 
              placeholder="Buscar por Nº Pedido ou Cliente..." 
              className="w-full pl-10 pr-4 py-2 rounded-lg border border-slate-200 focus:ring-2 focus:ring-indigo-500 outline-none"
              value={searchTerm}
              onChange={e => setSearchTerm(e.target.value)}
            />
          </div>
          <div className="flex items-center gap-2">
            <select
              className="px-3 py-2 rounded-lg border border-slate-200 focus:ring-2 focus:ring-indigo-500 outline-none text-sm"
              value={statusFilter}
              onChange={e => setStatusFilter(e.target.value)}
            >
              <option value="todos">Todos os Status</option>
              {mode === 'venda' ? (
                <>
                  <option value="finalizada">Finalizada</option>
                  <option value="orcamento">Orçamento</option>
                  <option value="cancelada">Cancelada</option>
                </>
              ) : (
                <>
                  <option value="orcamento">Orçamento / Aberta</option>
                  <option value="em_andamento">Em Andamento</option>
                  <option value="aguardando_pecas">Aguardando Peças</option>
                  <option value="finalizada">Finalizada / Pronta</option>
                  <option value="cancelada">Cancelada</option>
                </>
              )}
            </select>
            {mode === 'venda' && (
              <select
                className="px-3 py-2 rounded-lg border border-slate-200 focus:ring-2 focus:ring-indigo-500 outline-none text-sm"
                value={origemFilter}
                onChange={e => setOrigemFilter(e.target.value)}
              >
                <option value="Todas">Todas as Origens</option>
                <option value="Balcao">Balcão</option>
                <option value="Comanda">Comanda</option>
                <option value="PDV">PDV</option>
                <option value="Agenda">Agenda</option>
              </select>
            )}
            <input 
              type="date" 
              className="px-3 py-2 rounded-lg border border-slate-200 focus:ring-2 focus:ring-indigo-500 outline-none text-sm"
              value={startDate}
              onChange={e => setStartDate(e.target.value)}
            />
            <span className="text-slate-400">até</span>
            <input 
              type="date" 
              className="px-3 py-2 rounded-lg border border-slate-200 focus:ring-2 focus:ring-indigo-500 outline-none text-sm"
              value={endDate}
              onChange={e => setEndDate(e.target.value)}
            />
          </div>
        </div>
        <div className="overflow-x-auto min-h-[350px]">
          <table className="w-full text-left">
            <thead className="bg-slate-50 text-slate-500 text-sm uppercase tracking-wider">
              <tr>
                <th className="px-6 py-4 font-semibold">Nº</th>
                <th className="px-6 py-4 font-semibold">Data</th>
                <th className="px-6 py-4 font-semibold">Origem</th>
                <th className="px-6 py-4 font-semibold">Cliente</th>
                <th className="px-6 py-4 font-semibold text-right">Total</th>
                <th className="px-6 py-4 font-semibold text-center">Status</th>
                <th className="px-6 py-4 font-semibold text-right">Ações</th>
              </tr>
            </thead>
          <tbody className="divide-y divide-slate-100">
            {Array.isArray(sales) && (() => {
              const filteredSales = sales.filter(s => {
                const term = searchTerm.toLowerCase();
                if (!s.data_venda) return false;
                if (mode === 'venda' ? (s.tipo !== 'venda' && s.tipo !== 'mesa') : s.tipo !== mode) return false;
                const matchesOrigem = origemFilter === 'Todas' || s.origem === origemFilter;
                if (!matchesOrigem) return false;
                const matchesStatus = statusFilter === 'todos' || s.status === statusFilter;
                if (!matchesStatus) return false;
                const dateStr = s.data_venda.includes('T') ? s.data_venda : s.data_venda.replace(' ', 'T');
                const saleDate = new Date(dateStr).toISOString().split('T')[0];
                const matchesSearch = s.sequencial_id.toString().includes(term) || (s.cliente_nome && s.cliente_nome.toLowerCase().includes(term));
                const matchesDate = saleDate >= startDate && saleDate <= endDate;
                return matchesSearch && matchesDate;
              });

              return (
                <>
                  {filteredSales.map((s, index) => {
                    const isNearBottom = index >= filteredSales.length - 3 && filteredSales.length >= 2;
                    return (
                      <tr key={s.sequencial_id}>
                        <td className="px-6 py-4 font-medium text-slate-900">#{s.sequencial_id.toString().padStart(6, '0')}</td>
                        <td className="px-6 py-4 text-slate-600">{new Date(s.data_venda).toLocaleDateString()}</td>
                        <td className="px-6 py-4 text-slate-600 whitespace-nowrap">
                          <span className="px-2 py-1 bg-slate-100 text-slate-600 rounded-lg text-xs font-medium">
                            {s.origem || 'Balcão'}
                          </span>
                        </td>
                        <td className="px-6 py-4 font-medium text-slate-900">{s.cliente_nome || 'Consumidor Final'}</td>
                        <td className="px-6 py-4 text-right font-bold text-slate-900">R$ {formatMoney(s.valor_total)}</td>
                        <td className="px-6 py-4 text-center">
                          <span className={`px-2 py-1 text-xs font-bold rounded uppercase ${
                            s.status === 'finalizada' ? 'bg-emerald-100 text-emerald-700' : 
                            s.status === 'cancelada' ? 'bg-rose-100 text-rose-700' :
                            'bg-amber-100 text-amber-700'
                          }`}>{s.status}</span>
                        </td>
                        <td className="px-6 py-4 text-right">
                          <div className="relative inline-block text-left">
                            <button 
                              onClick={(e) => {
                                e.stopPropagation();
                                setOpenActionMenuId(openActionMenuId === s.id ? null : s.id);
                              }}
                              className="p-1 rounded-lg hover:bg-slate-100 transition-colors text-slate-400 hover:text-slate-600"
                            >
                              <MoreVertical className="w-5 h-5" />
                            </button>
                            <AnimatePresence>
                              {openActionMenuId === s.id && (
                                <>
                                  <div className="fixed inset-0 z-10" onClick={() => setOpenActionMenuId(null)} />
                                  <motion.div 
                                    initial={{ opacity: 0, scale: 0.95, y: isNearBottom ? 10 : -10 }}
                                    animate={{ opacity: 1, scale: 1, y: 0 }}
                                    exit={{ opacity: 0, scale: 0.95, y: isNearBottom ? 10 : -10 }}
                                    className={`absolute right-0 ${isNearBottom ? 'bottom-full mb-2' : 'mt-2'} w-48 bg-white rounded-xl shadow-xl border border-slate-100 z-50 py-1`}
                                  >
                                    <button onClick={() => { setPrintModalSale(s); setOpenActionMenuId(null); }} className="w-full text-left px-4 py-2 text-sm text-slate-700 hover:bg-slate-50 flex items-center gap-2"><Printer className="w-4 h-4" /> Imprimir</button>
                                    {s.status === 'orcamento' && <button onClick={() => { handleEdit(s.sequencial_id); setOpenActionMenuId(null); }} className="w-full text-left px-4 py-2 text-sm text-indigo-600 hover:bg-indigo-50 flex items-center gap-2"><Edit2 className="w-4 h-4" /> Editar</button>}
                                    {['aberta', 'orcamento', 'finalizada'].includes(s.status) && <button onClick={() => { setConfirmCancelId(s.id); setOpenActionMenuId(null); }} className="w-full text-left px-4 py-2 text-sm text-rose-600 hover:bg-rose-100 flex items-center gap-2 font-bold"><Ban className="w-4 h-4" /> Cancelar {mode === 'os' ? 'OS' : 'Pedido'}</button>}
                                  </motion.div>
                                </>
                              )}
                            </AnimatePresence>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                  {filteredSales.length === 0 && <tr><td colSpan={7} className="px-6 py-12 text-center text-slate-400 italic">Nenhum registro encontrado</td></tr>}
                </>
              );
            })()}
          </tbody>
          </table>
        </div>
      </div>

      {printModalSale && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center p-4 z-[60]">
          <motion.div initial={{ scale: 0.9, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} className="bg-white w-full max-w-sm rounded-3xl p-6 shadow-2xl text-center">
            <div className="w-16 h-16 bg-indigo-100 rounded-full flex items-center justify-center mx-auto mb-4 text-indigo-600"><Printer className="w-8 h-8" /></div>
            <h3 className="text-xl font-bold text-slate-900 mb-2">Recibo de Venda</h3>
            <p className="text-slate-500 mb-6 text-sm">Escolha como deseja emitir o recibo para <br/><strong>Pedido #${printModalSale.sequencial_id}</strong></p>
            <div className="grid grid-cols-1 gap-3">
              <button 
                onClick={() => { window.open('/print/venda/' + (printModalSale.id || printModalSale.sequencial_id) + '?t=' + token, '_blank') }}
                className="w-full py-3.5 bg-indigo-600 text-white rounded-2xl font-bold flex items-center justify-center gap-3 hover:bg-indigo-700 transition-all shadow-md"
              >
                <FileText className="w-5 h-5" /> Imprimir Pedido de Venda
              </button>
              <button 
                onClick={() => handlePrintSale(printModalSale.id || printModalSale.sequencial_id, 'print')}
                className="w-full py-3.5 bg-slate-800 text-white rounded-2xl font-bold flex items-center justify-center gap-3 hover:bg-slate-900 transition-all shadow-md"
              >
                <Printer className="w-5 h-5" /> Imprimir Recibo Não Fiscal
              </button>
              <button 
                onClick={() => handlePrintSale(printModalSale.id || printModalSale.sequencial_id, 'whatsapp')}
                className="w-full py-3.5 bg-emerald-500 text-white rounded-2xl font-bold flex items-center justify-center gap-3 hover:bg-emerald-600 transition-all shadow-md"
              >
                <MessageCircle className="w-5 h-5" /> Enviar via WhatsApp
              </button>
              <button 
                onClick={() => setPrintModalSale(null)} 
                className="w-full py-3.5 text-slate-400 font-bold hover:text-slate-600 bg-slate-100 rounded-2xl mt-2"
              >
                Cancelar
              </button>
            </div>
          </motion.div>
        </div>
      )}

      {isModalOpen && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center p-4 z-50">
          <motion.div initial={{ scale: 0.9, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} className="bg-white w-full max-w-3xl rounded-3xl p-8 shadow-2xl max-h-[90vh] overflow-y-auto">
            <div className="flex justify-between items-center mb-6">
              <h2 className="text-2xl font-bold text-slate-900">{newSale.id ? `Editar ${mode === 'os' ? 'OS' : 'Pedido'}` : `Nov${mode === 'os' ? 'a OS' : 'o Pedido'}`}</h2>
              <button onClick={() => setIsModalOpen(false)}><X className="text-slate-400" /></button>
            </div>
            <form onSubmit={handleSubmit} className="space-y-6">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="relative">
                  <label className="block text-sm font-semibold text-slate-700 mb-1">Cliente</label>
                  <input type="text" className="w-full px-4 py-2 rounded-xl border border-slate-200" placeholder="Pesquisar cliente..." value={clientSearchTerm} onChange={e => { setClientSearchTerm(e.target.value); setShowClientDropdown(true); }} onFocus={() => setShowClientDropdown(true)} />
                  {showClientDropdown && (
                    <div className="absolute z-50 w-full mt-1 bg-white border border-slate-200 rounded-xl shadow-2xl max-h-60 overflow-y-auto">
                      <div className="px-4 py-3 hover:bg-indigo-50 border-b border-slate-100 cursor-pointer italic text-slate-600" onClick={() => { setNewSale({...newSale, pessoa_id: ''}); setClientSearchTerm('Consumidor Final'); setShowClientDropdown(false); }}>Consumidor Final</div>
                      {pessoas.filter(p => (p.tipo_pessoa === 'cliente' || p.tipo_pessoa === 'ambos') && (p.nome || '').toLowerCase().includes(clientSearchTerm.toLowerCase())).map(p => (
                        <div key={p.id} className="px-4 py-3 hover:bg-indigo-50 border-b border-slate-100 last:border-0 cursor-pointer font-medium text-slate-800" onClick={() => { setNewSale({...newSale, pessoa_id: p.id}); setClientSearchTerm(p.razao_social || p.nome); setShowClientDropdown(false); }}>{p.razao_social || p.nome}</div>
                      ))}
                    </div>
                  )}
                </div>
                <div>
                  <label className="block text-sm font-semibold text-slate-700 mb-1">Status</label>
                  <select className="w-full px-4 py-2 rounded-xl border border-slate-200" value={newSale.status} onChange={e => setNewSale({...newSale, status: e.target.value})}>
                    <option value="finalizada">Finalizada</option>
                    <option value="orcamento">Orçamento</option>
                  </select>
                </div>
              </div>
              {mode === 'os' && (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <textarea placeholder="Solicitação" className="w-full px-4 py-2 rounded-xl border border-slate-200 h-24" value={newSale.solicitacao || ''} onChange={e => setNewSale({...newSale, solicitacao: e.target.value})} />
                  <textarea placeholder="Laudo Técnico" className="w-full px-4 py-2 rounded-xl border border-slate-200 h-24" value={newSale.laudo_tecnico || ''} onChange={e => setNewSale({...newSale, laudo_tecnico: e.target.value})} />
                </div>
              )}
              <div className="border p-4 rounded-xl bg-slate-50">
                <h3 className="font-bold mb-4">Itens</h3>
                <div className="flex gap-2 relative">
                  <input type="text" className="flex-1 px-4 py-2 rounded-xl border" placeholder="Pesquisar item..." value={productSearchTerm} onChange={e => { setProductSearchTerm(e.target.value); setShowProductDropdown(e.target.value.length >= 3); }} />
                  {showProductDropdown && (
                    <div className="absolute z-50 top-11 left-0 bg-white border border-slate-200 rounded-xl w-[calc(100%-130px)] max-h-60 overflow-y-auto shadow-2xl">
                      {produtos.filter(p => (p.nome || '').toLowerCase().includes(productSearchTerm.toLowerCase())).map(p => (
                        <div key={p.id} className="p-3 hover:bg-indigo-50 border-b border-slate-100 last:border-0 cursor-pointer" onClick={() => { setSelectedProduct(p.id.toString()); setProductSearchTerm(p.nome); setShowProductDropdown(false); }}>
                          <span className="font-bold text-slate-800">{p.nome}</span>
                          <span className="block text-sm text-slate-500">R$ {formatMoney(p.preco_venda)}</span>
                        </div>
                      ))}
                      {produtos.filter(p => (p.nome || '').toLowerCase().includes(productSearchTerm.toLowerCase())).length === 0 && (
                        <div className="p-4 text-center text-slate-500 text-sm">Nenhum produto encontrado.</div>
                      )}
                    </div>
                  )}
                  <input type="number" className="w-20 px-4 py-2 rounded-xl border" value={quantity} onChange={e => setQuantity(parseInt(e.target.value))} />
                  <button type="button" onClick={handleAddItem} className="bg-indigo-600 text-white px-4 py-2 rounded-xl font-medium">Add</button>
                </div>
                {newSale.items.map((item: any, idx: number) => (
                  <div key={idx} className="flex justify-between py-2 border-b">
                    <span>{item.nome} x{item.quantidade}</span>
                    <span>R$ {formatMoney(item.subtotal)} <button onClick={() => handleRemoveItem(idx)}><Trash2 className="w-4 h-4 text-rose-500" /></button></span>
                  </div>
                ))}
              </div>
              <div className="flex justify-between items-center bg-indigo-50 p-4 rounded-xl">
                <span className="font-bold">Total: R$ {formatMoney(newSale.valor_total)}</span>
              </div>
              <div className="border p-4 rounded-xl bg-slate-50">
                <h3 className="font-bold mb-4">Pagamentos</h3>
                <div className="flex gap-2">
                  <select className="flex-1 px-4 py-2 rounded-xl border border-slate-200" value={currentPayment.tipo_pagamento_id} onChange={e => setCurrentPayment({...currentPayment, tipo_pagamento_id: e.target.value, parcelas: 1})}>
                    <option value="">Tipo...</option>
                    {paymentTypes.map(pt => <option key={pt.id} value={pt.id}>{pt.nome}</option>)}
                  </select>
                  <select
                    className="w-20 px-3 py-2 rounded-xl border border-slate-200"
                    value={currentPayment.parcelas}
                    onChange={e => setCurrentPayment({...currentPayment, parcelas: parseInt(e.target.value)})}
                    disabled={!currentPayment.tipo_pagamento_id || paymentTypes.find(p => p.id === parseInt(currentPayment.tipo_pagamento_id))?.nome.toLowerCase() === 'dinheiro'}
                  >
                    {Array.from({ length: paymentTypes.find(p => p.id === parseInt(currentPayment.tipo_pagamento_id))?.qtd_parcelas || 1 }, (_, i) => i + 1).map(n => (
                      <option key={n} value={n}>{n}x</option>
                    ))}
                  </select>
                  <input type="number" className="w-32 px-4 py-2 rounded-xl border border-slate-200" placeholder="Valor" value={currentPayment.valor || ''} onChange={e => setCurrentPayment({...currentPayment, valor: parseFloat(e.target.value) || 0})} />
                  <button type="button" onClick={handleAddPayment} className="bg-indigo-600 text-white px-4 py-2 rounded-xl">Add</button>
                </div>
                {newSale.pagamentos?.map((p: any, idx: number) => (
                  <div key={idx} className="flex justify-between py-1">
                    <span>{p.nome}</span>
                    <span>R$ {formatMoney(p.valor)} <button onClick={() => handleRemovePayment(idx)}><Trash2 className="w-4 h-4 text-rose-500" /></button></span>
                  </div>
                ))}
              </div>
              <button type="submit" className="w-full py-4 bg-emerald-600 text-white rounded-xl font-bold">Finalizar</button>
            </form>
          </motion.div>
        </div>
      )}

      {confirmCancelId && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center p-4 z-[100]">
          <div className="bg-white p-8 rounded-3xl text-center max-w-md">
            <Ban className="w-12 h-12 text-rose-500 mx-auto mb-4" />
            <h3 className="text-xl font-bold mb-4">Cancelar Pedido?</h3>
            <button onClick={() => handleCancelSale(confirmCancelId)} className="bg-rose-600 text-white px-6 py-2 rounded-xl mr-2">Sim</button>
            <button onClick={() => setConfirmCancelId(null)} className="text-slate-400">Não</button>
          </div>
        </div>
      )}
    </div>
  );
};

export default Sales;
