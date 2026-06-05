import React, { useState, useEffect } from 'react';
import { ShoppingCart, Wrench, Search, Plus, Edit2, MoreVertical, Printer, MessageCircle, Trash2, Ban, AlertCircle, X, FileText, CheckCircle } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { useAuthStore } from '../store/authStore';
import { formatMoney, formatDate } from '../utils/format';
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
    tipo: mode,
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

  const baseApi = mode === 'os' ? '/api/os' : '/api/sales';

  const handleCancelSale = async (id: any) => {
    setLoading(true);
    try {
      const response = await fetch(`${baseApi}/${id}/cancel`, {
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
    fetch(baseApi, { headers: { 'Authorization': `Bearer ${token}` } })
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

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const saleId = params.get('id');
    const pay = params.get('pay');
    
    if (saleId && sales.length > 0) {
      const sale = sales.find(s => s.sequencial_id?.toString() === saleId || s.id.toString() === saleId);
      if (sale) {
        handleEdit(sale.id);
        // Clean URL to prevent re-opening
        const newUrl = window.location.pathname;
        window.history.replaceState({}, '', newUrl);
      }
    }
  }, [sales]);

  const handlePrintSale = async (saleId: number, type: 'print' | 'whatsapp') => {
    setLoadingPrint(true);
    try {
      const res = await fetch(`${baseApi}/${saleId}`, { headers: { 'Authorization': `Bearer ${token}` } });
      const sale = await res.json();
      if (!res.ok) throw new Error(sale.error || 'Erro ao carregar venda');

      if (type === 'whatsapp') {
        let text = company?.nome_fantasia ? `*${company.nome_fantasia}*\n` : '';
        text += `\n*${sale.tipo === 'os' ? 'ORDEM DE SERVIÇO' : 'PEDIDO DE VENDA'}*\n`;
        text += `Pedido: #${sale.sequencial_id || sale.id}\n`;
        text += `Data: ${formatDate(sale.data_venda)}\n`;
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
      preco_unitario: product.preco_venda,
      quantidade: quantity,
      subtotal: (parseFloat(product.preco_venda) || 0) * quantity
    };

    const updatedItems = [...newSale.items, newItem];
    const total = updatedItems.reduce((acc, item) => acc + (parseFloat(item.subtotal) || 0), 0);

    setNewSale({
      ...newSale,
      items: updatedItems,
      desconto: 0, // Reset discount on item change
      valor_total: total + (parseFloat(newSale.frete) || 0)
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
    const total = updatedItems.reduce((acc: number, item: any) => acc + (parseFloat(item.subtotal) || 0), 0);
    setNewSale({
      ...newSale,
      items: updatedItems,
      desconto: 0, // Reset discount on item change
      valor_total: total + (parseFloat(newSale.frete) || 0)
    });
  };

  const calculateTotal = (frete: number, desconto: number) => {
    const itemsTotal = newSale.items.reduce((acc: number, item: any) => acc + (parseFloat(item.subtotal) || 0), 0);
    return itemsTotal + (parseFloat(frete as any) || 0) - (parseFloat(desconto as any) || 0);
  };

  const handleEdit = async (id: number) => {
    try {
      const res = await fetch(`${baseApi}/${id}`, {
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
    const allowEmptyItems = newSale.tipo === 'os' && newSale.status === 'orcamento';

    if ((newSale.items.length === 0 && !allowEmptyItems) || isSaving) {
      if (newSale.items.length === 0) alert("Adicione pelo menos um item.");
      return;
    }

    if (newSale.status === 'finalizada' && (!newSale.pagamentos || newSale.pagamentos.length === 0) && newSale.valor_total > 0) {
      alert("Para o status 'Finalizado', é obrigatório informar pelo menos um pagamento.");
      return;
    }

    // Discount validation
    const maxDiscountPercent = parseFloat(company?.max_desconto_venda) || 0;
    const itemsTotal = newSale.items.reduce((acc: number, item: any) => acc + (parseFloat(item.subtotal) || 0), 0);
    const currentDiscountPercent = itemsTotal > 0 ? ((parseFloat(newSale.desconto) || 0) / itemsTotal) * 100 : 0;

    if (currentDiscountPercent > maxDiscountPercent + 0.001) {
      alert(`O desconto máximo permitido é de ${maxDiscountPercent}%. O desconto atual é de ${currentDiscountPercent.toFixed(2)}%.`);
      return;
    }

    setIsSaving(true);
    try {
      const url = newSale.id ? `${baseApi}/${newSale.id}` : baseApi;
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
          tipo: mode
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
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <h1 className="text-xl md:text-2xl font-bold text-slate-900">{mode === 'venda' ? 'Pedidos e Orçamentos' : 'Ordens de Serviço'}</h1>
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
          className="bg-indigo-600 text-white px-4 py-2 rounded-xl font-bold text-sm flex items-center gap-2 hover:bg-indigo-700 transition-all shadow-lg shadow-indigo-200 w-full md:w-auto justify-center"
        >
          {mode === 'venda' ? <ShoppingCart className="w-4 h-4" /> : <Wrench className="w-4 h-4" />} {mode === 'venda' ? 'Novo Pedido' : 'Nova OS'}
        </button>
      </div>
      <div className="bg-white rounded-2xl shadow-sm border border-slate-100 overflow-hidden">
        <div className="p-4 border-b border-slate-100 flex flex-col xl:flex-row gap-4">
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
          <div className="flex flex-wrap items-center gap-2">
            <select
              className="flex-1 md:flex-none px-3 py-2 rounded-lg border border-slate-200 focus:ring-2 focus:ring-indigo-500 outline-none text-sm min-w-[120px]"
              value={statusFilter}
              onChange={e => setStatusFilter(e.target.value)}
            >
              <option value="todos">Todos</option>
              {mode === 'venda' ? (
                <>
                  <option value="finalizada">Finalizada</option>
                  <option value="aguardando_pagamento">Aberta / Aguardando Pagamento</option>
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
                className="flex-1 md:flex-none px-3 py-2 rounded-lg border border-slate-200 focus:ring-2 focus:ring-indigo-500 outline-none text-sm min-w-[120px]"
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
            <div className="flex items-center gap-2 w-full md:w-auto">
              <input 
                type="date" 
                className="flex-1 md:flex-none px-3 py-2 rounded-lg border border-slate-200 focus:ring-2 focus:ring-indigo-500 outline-none text-sm"
                value={startDate}
                onChange={e => setStartDate(e.target.value)}
              />
              <span className="text-slate-400">até</span>
              <input 
                type="date" 
                className="flex-1 md:flex-none px-3 py-2 rounded-lg border border-slate-200 focus:ring-2 focus:ring-indigo-500 outline-none text-sm"
                value={endDate}
                onChange={e => setEndDate(e.target.value)}
              />
            </div>
          </div>
        </div>
        <div className="overflow-x-auto min-h-[350px]">
          <table className="w-full text-left">
            <thead className="bg-slate-50 text-slate-500 text-[10px] sm:text-xs md:text-sm uppercase tracking-wider">
              <tr>
                <th className="px-2 sm:px-3 md:px-6 py-2 md:py-4 font-semibold hidden md:table-cell">Nº</th>
                <th className="px-2 sm:px-3 md:px-6 py-2 md:py-4 font-semibold hidden sm:table-cell">Data</th>
                <th className="px-2 sm:px-3 md:px-6 py-2 md:py-4 font-semibold hidden lg:table-cell">Origem</th>
                <th className="px-2 sm:px-3 md:px-6 py-2 md:py-4 font-semibold">Cliente</th>
                <th className="px-2 sm:px-3 md:px-6 py-2 md:py-4 font-semibold text-right">Total</th>
                <th className="px-2 sm:px-3 md:px-6 py-2 md:py-4 font-semibold text-center hidden md:table-cell">Status</th>
                <th className="px-2 sm:px-3 md:px-6 py-2 md:py-4 font-semibold text-right">Ações</th>
              </tr>
            </thead>
          <tbody className="divide-y divide-slate-100 text-[10px] sm:text-xs md:text-sm">
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
                const d = new Date(dateStr);
                if (isNaN(d.getTime())) return false;
                const saleDate = d.toISOString().split('T')[0];
                const matchesSearch = s.sequencial_id.toString().includes(term) || (s.cliente_nome && s.cliente_nome.toLowerCase().includes(term));
                const matchesDate = saleDate >= startDate && saleDate <= endDate;
                return matchesSearch && matchesDate;
              });

              return (
                <>
                  {filteredSales.map((s, index) => {
                    const isNearBottom = index >= filteredSales.length - 3 && index >= 3;
                    return (
                      <tr key={s.sequencial_id}>
                        <td className="px-2 sm:px-3 md:px-6 py-2 md:py-4 font-medium text-slate-900 hidden md:table-cell">#{s.sequencial_id.toString().padStart(6, '0')}</td>
                        <td className="px-2 sm:px-3 md:px-6 py-2 md:py-4 text-slate-600 hidden sm:table-cell">{formatDate(s.data_venda)}</td>
                        <td className="px-2 sm:px-3 md:px-6 py-2 md:py-4 text-slate-600 whitespace-nowrap hidden lg:table-cell">
                          <span className="px-1.5 md:px-2 py-0.5 md:py-1 bg-slate-100 text-slate-600 rounded-lg text-[8px] md:text-[10px] font-medium">
                            {s.origem || 'Balcão'}
                          </span>
                        </td>
                        <td className="px-2 sm:px-3 md:px-6 py-2 md:py-4">
                          <div className="font-medium text-slate-900 leading-tight">
                            <div className="line-clamp-2 md:line-clamp-none whitespace-normal min-w-[80px]">{s.cliente_nome || 'Consumidor Final'}</div>
                          </div>
                          <div className="text-[8px] sm:text-[10px] text-slate-400 font-mono mt-0.5 sm:hidden">#{s.sequencial_id.toString().padStart(6, '0')} • {formatDate(s.data_venda)}</div>
                          <div className="text-[8px] sm:text-[10px] text-slate-400 mt-0.5 lg:hidden">{s.origem || 'Balcão'}</div>
                          <div className="md:hidden mt-0.5">
                            <span className={`px-1.5 py-0.5 text-[8px] sm:text-[10px] font-black rounded-full uppercase ${
                              s.status === 'finalizada' ? 'bg-emerald-100 text-emerald-700' : 
                              s.status === 'cancelada' ? 'bg-rose-100 text-rose-700' :
                              s.status === 'aguardando_pagamento' ? 'bg-amber-100 text-amber-700 border border-amber-200' :
                              'bg-slate-100 text-slate-700'
                            }`}>{s.status === 'aguardando_pagamento' ? 'ABERTA' : s.status}</span>
                          </div>
                        </td>
                        <td className="px-2 sm:px-3 md:px-6 py-2 md:py-4 text-right font-bold text-slate-900 whitespace-nowrap">R$ {formatMoney(s.valor_total)}</td>
                         <td className="px-2 sm:px-3 md:px-6 py-2 md:py-4 text-center hidden md:table-cell">
                          <span className={`px-1.5 md:px-2 py-0.5 md:py-1 text-[8px] md:text-[10px] font-black rounded-full uppercase ${
                            s.status === 'finalizada' ? 'bg-emerald-100 text-emerald-700' : 
                            s.status === 'cancelada' ? 'bg-rose-100 text-rose-700' :
                            s.status === 'aguardando_pagamento' ? 'bg-amber-100 text-amber-700 border border-amber-200' :
                            'bg-slate-100 text-slate-700'
                          }`}>{s.status === 'aguardando_pagamento' ? 'ABERTA' : s.status}</span>
                        </td>
                        <td className="px-2 sm:px-3 md:px-6 py-2 md:py-4 text-right">
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
                                    {s.status === 'orcamento' && <button onClick={() => { handleEdit(s.id); setOpenActionMenuId(null); }} className="w-full text-left px-4 py-2 text-sm text-indigo-600 hover:bg-indigo-50 flex items-center gap-2"><Edit2 className="w-4 h-4" /> Editar</button>}
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
          <motion.div 
            initial={{ scale: 0.9, opacity: 0 }} 
            animate={{ scale: 1, opacity: 1 }} 
            className="bg-white w-full max-w-4xl rounded-3xl shadow-2xl flex flex-col max-h-[90vh] overflow-hidden"
          >
            <div className="p-8 border-b border-slate-100 flex justify-between items-center shrink-0">
              <h2 className="text-2xl font-bold text-slate-900">
                {newSale.id ? `Editar ${mode === 'os' ? 'OS' : 'Pedido'}` : `Nov${mode === 'os' ? 'a OS' : 'o Pedido'}`}
              </h2>
              <button 
                className="p-2 hover:bg-slate-100 rounded-full transition-colors"
                onClick={() => setIsModalOpen(false)}
              >
                <X className="text-slate-400" />
              </button>
            </div>
            
            <div className="p-8 overflow-y-auto">
              <form onSubmit={handleSubmit} className="space-y-8">
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 bg-slate-50 p-6 rounded-2xl border border-slate-100">
                  <div className="relative">
                    <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-2 px-1">Cliente</label>
                    <div className="relative">
                      <input 
                        type="text" 
                        className="w-full px-4 py-3 rounded-xl border border-slate-200 outline-none focus:ring-2 focus:ring-indigo-500 transition-all font-bold bg-white" 
                        placeholder="Pesquisar cliente..." 
                        value={clientSearchTerm} 
                        onChange={e => { setClientSearchTerm(e.target.value); setShowClientDropdown(true); }} 
                        onFocus={() => setShowClientDropdown(true)} 
                      />
                      <div className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-400">
                        <Search className="w-5 h-5" />
                      </div>
                    </div>
                    {showClientDropdown && (
                      <div className="absolute z-50 w-full mt-2 bg-white border border-slate-200 rounded-2xl shadow-2xl max-h-60 overflow-y-auto">
                        <div 
                          className="px-4 py-4 hover:bg-indigo-50 border-b border-slate-100 cursor-pointer italic text-slate-500 font-medium transition-colors" 
                          onClick={() => { setNewSale({...newSale, pessoa_id: ''}); setClientSearchTerm('Consumidor Final'); setShowClientDropdown(false); }}
                        >
                          Consumidor Final
                        </div>
                        {pessoas.filter(p => (p.tipo_pessoa === 'cliente' || p.tipo_pessoa === 'ambos') && (p.nome || '').toLowerCase().includes(clientSearchTerm.toLowerCase())).map(p => (
                          <div 
                            key={p.id} 
                            className="px-4 py-4 hover:bg-indigo-50 border-b border-slate-100 last:border-0 cursor-pointer font-bold text-slate-800 transition-colors" 
                            onClick={() => { setNewSale({...newSale, pessoa_id: p.id}); setClientSearchTerm(p.razao_social || p.nome); setShowClientDropdown(false); }}
                          >
                            <p>{p.razao_social || p.nome}</p>
                            {p.documento && <p className="text-[10px] text-slate-400 font-normal uppercase tracking-wider mt-1">{p.documento}</p>}
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-2 px-1">Status do Pedido</label>
                    <select 
                      className="w-full px-4 py-3 rounded-xl border border-slate-200 outline-none focus:ring-2 focus:ring-indigo-500 transition-all font-bold bg-white" 
                      value={newSale.status} 
                      onChange={e => setNewSale({...newSale, status: e.target.value})}
                    >
                      <option value="orcamento">Orçamento</option>
                      <option value="finalizada">Finalizada</option>
                    </select>
                  </div>
                </div>

                {mode === 'os' && (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <div className="space-y-2">
                       <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider px-1">Solicitação / Defeitos</label>
                       <textarea 
                        placeholder="Quais problemas o cliente relatou?" 
                        className="w-full px-4 py-3 rounded-2xl border border-slate-200 h-32 focus:ring-2 focus:ring-indigo-500 transition-all outline-none resize-none" 
                        value={newSale.solicitacao || ''} 
                        onChange={e => setNewSale({...newSale, solicitacao: e.target.value})} 
                       />
                    </div>
                    <div className="space-y-2">
                       <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider px-1">Laudo Técnico / Serviços</label>
                       <textarea 
                        placeholder="O que foi constatado e quais serviços realizar?" 
                        className="w-full px-4 py-3 rounded-2xl border border-slate-200 h-32 focus:ring-2 focus:ring-indigo-500 transition-all outline-none resize-none bg-slate-50/50" 
                        value={newSale.laudo_tecnico || ''} 
                        onChange={e => setNewSale({...newSale, laudo_tecnico: e.target.value})} 
                       />
                    </div>
                  </div>
                )}

                <div className="space-y-4">
                  <div className="flex items-center justify-between px-1">
                    <h3 className="text-sm font-bold text-slate-500 uppercase tracking-wider">Produtos e Serviços</h3>
                  </div>
                  <div className="bg-white border border-slate-200 rounded-2xl p-6 space-y-6 shadow-sm">
                    <div className="flex flex-col lg:flex-row gap-4 relative">
                      <div className="relative flex-1">
                        <input 
                          type="text" 
                          className="w-full px-4 py-3 rounded-xl border border-slate-200 outline-none focus:ring-2 focus:ring-indigo-500 transition-all" 
                          placeholder="Buscar item pelo nome..." 
                          value={productSearchTerm} 
                          onChange={e => { setProductSearchTerm(e.target.value); setShowProductDropdown(e.target.value.length >= 2); }} 
                        />
                        {showProductDropdown && (
                          <div className="absolute z-50 top-full left-0 mt-2 bg-white border border-slate-200 rounded-2xl w-full max-h-60 overflow-y-auto shadow-2xl">
                            {produtos.filter(p => (p.nome || '').toLowerCase().includes(productSearchTerm.toLowerCase())).map(p => (
                              <div 
                                key={p.id} 
                                className="p-4 hover:bg-emerald-50 border-b border-slate-100 last:border-0 cursor-pointer transition-colors" 
                                onClick={() => { setSelectedProduct(p.id.toString()); setProductSearchTerm(p.nome); setShowProductDropdown(false); }}
                              >
                                <p className="font-bold text-slate-800">{p.nome}</p>
                                <p className="text-xs font-black text-emerald-600 mt-1">R$ {formatMoney(p.preco_venda)}</p>
                              </div>
                            ))}
                            {produtos.filter(p => (p.nome || '').toLowerCase().includes(productSearchTerm.toLowerCase())).length === 0 && (
                              <div className="p-6 text-center text-slate-400 italic text-sm">Nenhum produto encontrado.</div>
                            )}
                          </div>
                        )}
                      </div>
                      <div className="flex gap-2 shrink-0">
                        <div className="w-24">
                          <input 
                            type="number" 
                            min="1" 
                            className="w-full px-4 py-3 rounded-xl border border-slate-200 outline-none focus:ring-2 focus:ring-indigo-500 text-center font-bold" 
                            value={quantity} 
                            onChange={e => { let val = parseInt(e.target.value); if (isNaN(val) || val < 1) val = 1; setQuantity(val); }} 
                          />
                        </div>
                        <button 
                          type="button" 
                          onClick={handleAddItem} 
                          className="px-6 py-3 bg-emerald-500 text-white rounded-xl font-bold hover:bg-emerald-600 transition-all active:scale-[0.98] flex items-center gap-2 shadow-lg shadow-emerald-100"
                        >
                          <Plus className="w-5 h-5" /> Adicionar
                        </button>
                      </div>
                    </div>

                    {newSale.items.length > 0 ? (
                      <div className="space-y-2 border-t border-slate-100 pt-6">
                        <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-3">Itens Adicionados</label>
                        <div className="grid grid-cols-1 gap-2">
                          {newSale.items.map((item: any, idx: number) => (
                            <div key={idx} className="flex justify-between items-center p-4 bg-slate-50/50 rounded-2xl border border-slate-100 group hover:border-indigo-200 transition-all">
                              <div className="flex-1 min-w-0 pr-4">
                                <span className="font-bold text-slate-800 truncate block">{item.nome}</span>
                                <span className="text-xs text-slate-400 font-medium">Qtd: <span className="text-slate-900 font-bold">{item.quantidade}</span> × R$ {formatMoney(item.preco_unitario)}</span>
                              </div>
                              <div className="flex items-center gap-4 shrink-0">
                                <span className="font-black text-slate-900">R$ {formatMoney(item.subtotal)}</span>
                                <button 
                                  onClick={() => handleRemoveItem(idx)}
                                  className="p-2 text-rose-300 hover:text-rose-500 hover:bg-rose-50 rounded-xl transition-all"
                                >
                                  <Trash2 className="w-4 h-4" />
                                </button>
                              </div>
                            </div>
                          ))}
                        </div>
                        <div className="space-y-4 mt-6 bg-slate-50 p-6 rounded-2xl border border-slate-100">
                          <div className="flex justify-between items-center text-sm font-medium">
                            <span className="text-slate-500 font-bold uppercase tracking-widest text-[10px]">Frete</span>
                            <div className="relative w-32">
                              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400">R$</span>
                              <input 
                                type="number" 
                                min="0"
                                step="0.01"
                                className="w-full pl-8 pr-3 py-2 text-right bg-white border border-slate-200 rounded-lg text-slate-700 outline-none focus:ring-2 focus:ring-indigo-500 transition-all font-bold"
                                value={newSale.frete || ''}
                                onChange={e => {
                                  const fr = parseFloat(e.target.value) || 0;
                                  const itemsTotal = newSale.items.reduce((acc: number, item: any) => acc + (parseFloat(item.subtotal) || 0), 0);
                                  setNewSale({...newSale, frete: fr, valor_total: itemsTotal + fr - (parseFloat(newSale.desconto) || 0)});
                                }}
                                placeholder="0,00"
                              />
                            </div>
                          </div>
                          
                          <div className="space-y-1">
                            <div className="flex justify-between items-center text-sm font-medium">
                              <span className="text-slate-500 font-bold uppercase tracking-widest text-[10px]">Desconto</span>
                              <div className="relative w-32">
                                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400">R$</span>
                                <input 
                                  type="number" 
                                  min="0"
                                  step="0.01"
                                  className={`w-full pl-8 pr-3 py-2 text-right bg-white border ${((newSale.items.reduce((acc: number, item: any) => acc + (parseFloat(item.subtotal) || 0), 0) > 0 ? (parseFloat(newSale.desconto) || 0) / newSale.items.reduce((acc: number, item: any) => acc + (parseFloat(item.subtotal) || 0), 0) * 100 : 0) > (parseFloat(company?.max_desconto_venda) || 0) + 0.001) ? 'border-rose-500 ring-2 ring-rose-100' : 'border-slate-200'} rounded-lg text-slate-700 outline-none focus:ring-2 focus:ring-indigo-500 transition-all font-bold`}
                                  value={newSale.desconto || ''}
                                  onChange={e => {
                                    const desc = parseFloat(e.target.value) || 0;
                                    const itemsTotal = newSale.items.reduce((acc: number, item: any) => acc + (parseFloat(item.subtotal) || 0), 0);
                                    setNewSale({...newSale, desconto: desc, valor_total: itemsTotal + (parseFloat(newSale.frete) || 0) - desc});
                                  }}
                                  placeholder="0,00"
                                />
                              </div>
                            </div>
                            {((newSale.items.reduce((acc: number, item: any) => acc + (parseFloat(item.subtotal) || 0), 0) > 0 ? (parseFloat(newSale.desconto) || 0) / newSale.items.reduce((acc: number, item: any) => acc + (parseFloat(item.subtotal) || 0), 0) * 100 : 0) > (parseFloat(company?.max_desconto_venda) || 0) + 0.001) && (
                              <p className="text-[10px] text-rose-500 font-bold text-right">O desconto máximo permitido é de {parseFloat(company?.max_desconto_venda) || 0}% ({(newSale.items.reduce((acc: number, item: any) => acc + (parseFloat(item.subtotal) || 0), 0) * (parseFloat(company?.max_desconto_venda) || 0) / 100).toLocaleString('pt-br', {style: 'currency', currency: 'BRL'})})</p>
                            )}
                          </div>
                        </div>

                        <div className="flex justify-between items-center bg-indigo-600 p-6 rounded-2xl shadow-xl shadow-indigo-100 mt-6">
                          <span className="text-indigo-100 font-bold uppercase tracking-widest text-xs">Total do Pedido</span>
                          <span className="text-white text-3xl font-black">R$ {formatMoney(newSale.valor_total)}</span>
                        </div>
                      </div>
                    ) : (
                      <div className="text-center py-8 border-2 border-dashed border-slate-100 rounded-2xl">
                        <p className="text-slate-400 text-sm italic">Nenhum item adicionado ao pedido.</p>
                      </div>
                    )}
                  </div>
                </div>

                <div className="space-y-4">
                  <h3 className="text-sm font-bold text-slate-500 uppercase tracking-wider px-1">Informações de Pagamento</h3>
                  <div className="bg-slate-50 border border-slate-200 rounded-3xl p-6 space-y-6">
                    <div className="flex flex-col lg:flex-row gap-4">
                      <div className="flex-1 grid grid-cols-1 sm:grid-cols-3 gap-3">
                        <div className="sm:col-span-1">
                          <label className="block text-[10px] font-bold text-slate-400 uppercase mb-2 ml-1">Forma</label>
                          <select 
                            className="w-full px-4 py-3 rounded-xl border border-slate-200 bg-white font-bold outline-none focus:ring-2 focus:ring-indigo-500" 
                            value={currentPayment.tipo_pagamento_id} 
                            onChange={e => {
                              const selectedTypeId = e.target.value;
                              const alreadyPaid = (newSale.pagamentos || []).reduce((acc: number, p: any) => acc + p.valor, 0);
                              const suggestedValue = Math.max(0, newSale.valor_total - alreadyPaid);
                              setCurrentPayment({
                                ...currentPayment, 
                                tipo_pagamento_id: selectedTypeId, 
                                parcelas: 1, 
                                valor: selectedTypeId ? suggestedValue : 0
                              });
                            }}
                          >
                            <option value="">Selecione...</option>
                            {paymentTypes.map(pt => <option key={pt.id} value={pt.id}>{pt.nome}</option>)}
                          </select>
                        </div>
                        <div>
                          <label className="block text-[10px] font-bold text-slate-400 uppercase mb-2 ml-1">Parc.</label>
                          <select
                            className="w-full px-4 py-3 rounded-xl border border-slate-200 bg-white font-bold outline-none disabled:opacity-50"
                            value={currentPayment.parcelas}
                            onChange={e => setCurrentPayment({...currentPayment, parcelas: parseInt(e.target.value)})}
                            disabled={!currentPayment.tipo_pagamento_id || paymentTypes.find(p => p.id === parseInt(currentPayment.tipo_pagamento_id))?.nome.toLowerCase() === 'dinheiro'}
                          >
                            {Array.from({ length: paymentTypes.find(p => p.id === parseInt(currentPayment.tipo_pagamento_id))?.qtd_parcelas || 1 }, (_, i) => i + 1).map(n => (
                              <option key={n} value={n}>{n}x</option>
                            ))}
                          </select>
                        </div>
                        <div>
                          <label className="block text-[10px] font-bold text-slate-400 uppercase mb-2 ml-1">Valor</label>
                          <input 
                            type="number" 
                            min="0" 
                            step="0.01" 
                            className="w-full px-4 py-3 rounded-xl border border-slate-200 bg-white font-black outline-none focus:ring-2 focus:ring-indigo-500 [appearance:textfield]" 
                            placeholder="0,00" 
                            value={currentPayment.valor === 0 ? '' : currentPayment.valor} 
                            onChange={e => {
                              let val = parseFloat(e.target.value);
                              if (isNaN(val) || val < 0) val = 0;
                              setCurrentPayment({...currentPayment, valor: val});
                            }} 
                          />
                        </div>
                      </div>
                      <div className="flex items-end">
                        <button 
                          type="button" 
                          onClick={handleAddPayment} 
                          className="w-full lg:w-auto px-8 py-3.5 bg-slate-800 text-white rounded-xl font-bold hover:bg-black transition-all active:scale-[0.98] shadow-lg"
                        >
                          Lançar Pagamento
                        </button>
                      </div>
                    </div>

                    {(newSale.pagamentos || []).length > 0 && (
                      <div className="grid grid-cols-1 gap-2 pt-2">
                        <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-widest px-1">Pagamentos Recebidos</label>
                        {newSale.pagamentos?.map((p: any, idx: number) => (
                          <div key={idx} className="flex justify-between items-center p-3 bg-white border border-slate-100 rounded-xl">
                            <div className="flex items-center gap-3">
                              <span className="w-2 h-2 rounded-full bg-emerald-500"></span>
                              <span className="font-bold text-slate-700">{p.nome}</span>
                              {p.parcelas > 1 && <span className="text-[10px] bg-slate-100 px-2 py-0.5 rounded-full font-bold">{p.parcelas}x</span>}
                            </div>
                            <div className="flex items-center gap-4">
                              <span className="font-black text-slate-900">R$ {formatMoney(p.valor)}</span>
                              <button onClick={() => handleRemovePayment(idx)} className="p-1.5 text-rose-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition-all">
                                <Trash2 className="w-4 h-4" />
                              </button>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>

                <div className="pt-4 shrink-0 pb-4">
                  <button 
                    type="submit" 
                    disabled={
                      (newSale.status === 'finalizada' && (!newSale.pagamentos || newSale.pagamentos.length === 0) && (newSale.valor_total || 0) > 0) ||
                      (newSale.items.length === 0 && !(newSale.tipo === 'os' && newSale.status === 'orcamento'))
                    }
                    className="w-full py-5 bg-emerald-500 text-white rounded-2xl font-black text-lg tracking-wider transition-all disabled:opacity-30 disabled:grayscale shadow-2xl shadow-emerald-100 enabled:hover:bg-emerald-600 enabled:active:scale-[0.98] flex items-center justify-center gap-3"
                  >
                    <CheckCircle className="w-6 h-6" />
                    Finalizar {mode === 'os' ? 'Ordem de Serviço' : 'Pedido de Venda'}
                  </button>
                </div>
              </form>
            </div>
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
