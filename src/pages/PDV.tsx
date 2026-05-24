import React, { useState, useEffect } from 'react';
import { useAuthStore } from '../store/authStore';
import { 
  X, 
  Search, 
  ShoppingCart, 
  Plus, 
  Minus, 
  Trash2, 
  CreditCard,
  User as UserIcon,
  CheckCircle,
  MonitorPlay,
  AlertCircle,
  Printer,
  MessageCircle
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'motion/react';
import { validatePayment } from '../utils/paymentValidation';

function formatMoney(value: any): string {
  const num = typeof value === 'string' ? parseFloat(value) : value;
  return isNaN(num) ? '0,00' : num.toFixed(2).replace('.', ',');
}

export default function PDV() {
  const [produtos, setProdutos] = useState<any[]>([]);
  const [filteredProdutos, setFilteredProdutos] = useState<any[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [cart, setCart] = useState<any[]>([]);
  const [pessoas, setPessoas] = useState<any[]>([]);
  const [selectedClient, setSelectedClient] = useState<string>('');
  const [paymentTypes, setPaymentTypes] = useState<any[]>([]);
  const [selectedPaymentType, setSelectedPaymentType] = useState<string>('');
  const [currentCashier, setCurrentCashier] = useState<any>(null);
  
  const [isFinishing, setIsFinishing] = useState(false);
  const [discount, setDiscount] = useState(0);
  const [pagamentos, setPagamentos] = useState<any[]>([]);
  const [currentPayment, setCurrentPayment] = useState({ tipo_pagamento_id: '', valor: 0, parcelas: 1 });
  const [change, setChange] = useState(0);
  const [receivedValue, setReceivedValue] = useState(0);

  const [company, setCompany] = useState<any>(null);
  const [isReceiptModalOpen, setIsReceiptModalOpen] = useState(false);
  const [finishedSaleData, setFinishedSaleData] = useState<any>(null);
  
  const token = useAuthStore(state => state.token);
  const navigate = useNavigate();

  useEffect(() => {
    fetch('/api/products', { headers: { 'Authorization': `Bearer ${token}` } })
      .then(res => res.json())
      .then(data => {
        setProdutos(data);
        setFilteredProdutos(data);
      });

    fetch('/api/pessoas', { headers: { 'Authorization': `Bearer ${token}` } })
      .then(res => res.json())
      .then(setPessoas);

    fetch('/api/finance/payment-types', { headers: { 'Authorization': `Bearer ${token}` } })
      .then(res => res.json())
      .then(setPaymentTypes);

    fetch('/api/finance/cashier/current', { headers: { 'Authorization': `Bearer ${token}` } })
      .then(res => res.json())
      .then(setCurrentCashier);

    fetch('/api/company/settings', { headers: { 'Authorization': `Bearer ${token}` } })
      .then(res => res.json())
      .then(setCompany);
  }, [token]);

  useEffect(() => {
    if (searchTerm.trim() === '') {
      setFilteredProdutos(produtos);
    } else {
      const lower = searchTerm.toLowerCase();
      setFilteredProdutos(produtos.filter(p => 
        p.nome.toLowerCase().includes(lower) || 
        (p.codigo_barras && p.codigo_barras.includes(searchTerm))
      ));
    }
  }, [searchTerm, produtos]);

  const addToCart = (produto: any) => {
    setCart(prev => {
      const existing = prev.find(item => item.id === produto.id);
      if (existing) {
        return prev.map(item => 
          item.id === produto.id 
            ? { ...item, quantidade: item.quantidade + 1, subtotal: (item.quantidade + 1) * item.preco_venda }
            : item
        );
      }
      return [...prev, { 
        id: produto.id, 
        nome: produto.nome, 
        preco_venda: produto.preco_venda, 
        quantidade: 1, 
        subtotal: produto.preco_venda 
      }];
    });
  };

  const updateQuantity = (id: number, delta: number) => {
    setCart(prev => prev.map(item => {
      if (item.id === id) {
        const newQ = Math.max(1, item.quantidade + delta);
        return { ...item, quantidade: newQ, subtotal: newQ * item.preco_venda };
      }
      return item;
    }));
  };

  const removeFromCart = (id: number) => {
    setCart(prev => prev.filter(item => item.id !== id));
  };

  const cartTotal = cart.reduce((sum, item) => sum + item.subtotal, 0);
  const finalTotal = Math.max(0, cartTotal - discount);

  const handleAddPayment = () => {
    if (!currentPayment.tipo_pagamento_id || currentPayment.valor <= 0) return;

    const type = paymentTypes.find(p => p.id === parseInt(currentPayment.tipo_pagamento_id));
    if (!type) return;

    const validation = validatePayment(type, currentPayment.valor, currentPayment.parcelas);
    if (!validation.valid) {
      alert(validation.message);
      return;
    }

    const alreadyPaid = pagamentos.reduce((acc, p) => acc + p.valor, 0);
    const remaining = finalTotal - alreadyPaid;

    let valorToAdd = currentPayment.valor;
    let newChange = 0;
    const isDinheiro = type.nome.toLowerCase() === 'dinheiro';

    if (isDinheiro) {
      if (valorToAdd > remaining) {
        newChange = valorToAdd - remaining;
        valorToAdd = remaining;
      }
    } else {
      if (valorToAdd > remaining) {
        alert(`O valor do pagamento (${type.nome}) não pode ser superior ao total do pedido.`);
        return;
      }
    }

    const newPayment = {
      tipo_pagamento_id: type.id,
      nome: type.nome,
      valor: valorToAdd,
      parcelas: currentPayment.parcelas
    };

    setPagamentos([...pagamentos, newPayment]);
    setChange(prev => prev + newChange);
    setReceivedValue(prev => prev + currentPayment.valor);
    setCurrentPayment({ tipo_pagamento_id: '', valor: 0, parcelas: 1 });
  };

  const handleRemovePayment = (index: number) => {
    const newPagamentos = pagamentos.filter((_, i) => i !== index);
    setPagamentos(newPagamentos);
    if (newPagamentos.length === 0) {
      setReceivedValue(0);
      setChange(0);
    } else {
      setReceivedValue(newPagamentos.reduce((acc, p) => acc + p.valor, 0));
      setChange(0);
    }
  };

  const handleFinishSale = async () => {
    if (!currentCashier) {
      alert("Nenhum caixa aberto! Abra o caixa no Financeiro antes de vender.");
      return;
    }
    if (cart.length === 0) return;
    
    const alreadyPaid = pagamentos.reduce((acc, p) => acc + p.valor, 0);
    if (Math.abs(alreadyPaid - finalTotal) > 0.01) {
      alert("O valor total dos pagamentos deve ser igual ao total da venda.");
      return;
    }

    const salePayload = {
      pessoa_id: selectedClient || null,
      valor_total: finalTotal,
      desconto: discount,
      frete: 0,
      status: 'finalizada',
      tipo: 'venda',
      origem: 'PDV',
      items: cart,
      pagamentos: pagamentos
    };

    try {
      const res = await fetch('/api/sales', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify(salePayload)
      });
      
      if (!res.ok) {
        const d = await res.json();
        throw new Error(d.error || 'Erro ao finalizar venda');
      }

      const saleResponse = await res.json();
      
      const finishedData = {
        ...salePayload,
        sequencial_id: saleResponse.sequencial_id,
        paymentName: pagamentos.map(p => p.nome).join(', ')
      };

      setFinishedSaleData(finishedData);
      setCart([]);
      setDiscount(0);
      setSelectedClient('');
      setPagamentos([]);
      setCurrentPayment({ tipo_pagamento_id: '', valor: 0, parcelas: 1 });
      setChange(0);
      setReceivedValue(0);
      setIsFinishing(false);
      setIsReceiptModalOpen(true);

    } catch (err: any) {
      alert(err.message);
    }
  };

  const handlePrintFinalReceipt = (type: 'print' | 'whatsapp') => {
    if (!finishedSaleData) return;

    const items = finishedSaleData.items || [];
    const subtotal = items.reduce((acc: number, i: any) => acc + parseFloat(i.subtotal || 0), 0);
    const total = finishedSaleData.valor_total;
    const paymentName = finishedSaleData.paymentName || '';

    if (type === 'whatsapp') {
      let text = company?.nome_fantasia ? `*${company.nome_fantasia}*\n` : '';
      if (company?.cnpj) text += `CNPJ: ${company.cnpj}\n`;
      if (company?.endereco) text += `${company.endereco}, ${company.numero || ''} ${company.cidade || ''}/${company.estado || ''}\n`;
      if (company?.telefone_celular || company?.telefone_fixo) text += `Tel: ${company.telefone_celular || company.telefone_fixo}\n`;
      
      text += `\n*RECIBO DE VENDA (SEM VALOR FISCAL)*\n`;
      text += `Venda: #${finishedSaleData.sequencial_id}\n`;
      text += `Data: ${new Date().toLocaleString('pt-BR')}\n`;
      text += `------------------------\n`;
      items.forEach((i: any) => {
        text += `${i.quantidade}x ${i.nome} - R$ ${formatMoney(i.subtotal)}\n`;
      });
      text += `------------------------\n`;
      text += `Subtotal: R$ ${formatMoney(subtotal)}\n`;
      if (finishedSaleData.desconto > 0) text += `Desconto: R$ ${formatMoney(finishedSaleData.desconto)}\n`;
      text += `*TOTAL: R$ ${formatMoney(total)}*\n`;
      if (finishedSaleData.pagamentos && finishedSaleData.pagamentos.length > 0) {
        text += `Pagamento(s):\n`;
        finishedSaleData.pagamentos.forEach((p: any) => {
          text += `- ${p.nome}${p.parcelas > 1 ? ` (${p.parcelas}x)` : ''}: R$ ${formatMoney(p.valor)}\n`;
        });
      } else {
        text += `Pagamento: ${paymentName}\n`;
      }
      text += `\nAgradecemos a preferência!`;

      const url = `https://wa.me/?text=${encodeURIComponent(text)}`;
      window.open(url, '_blank');
      return;
    }

    // Print Layout
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
        
        <div class="center disclaimer">RECIBO DE VENDA<br/>SEM VALOR FISCAL</div>
        
        <div class="row"><span>Venda: #${finishedSaleData.sequencial_id}</span></div>
        <div class="row"><span>Data: ${new Date().toLocaleString('pt-BR')}</span></div>
        
        <div class="divider"></div>
        ${items.map((i: any) => `
          <div class="row">
            <span>${i.quantidade}x ${i.nome.substring(0,14)}</span>
            <span>R$ ${formatMoney(i.subtotal)}</span>
          </div>
        `).join('')}
        <div class="divider"></div>
        
        <div class="row"><span>Subtotal:</span><span>R$ ${formatMoney(subtotal)}</span></div>
        ${finishedSaleData.desconto > 0 ? `<div class="row"><span>Desconto:</span><span>R$ ${formatMoney(finishedSaleData.desconto)}</span></div>` : ''}
        
        <div class="row bold" style="font-size: 12px; margin-top: 4px;">
          <span>TOTAL:</span>
          <span>R$ ${formatMoney(total)}</span>
        </div>
        
        <div class="divider"></div>
        <div class="row bold" style="font-size: 11px;"><span>Pagamentos:</span></div>
        ${finishedSaleData.pagamentos && finishedSaleData.pagamentos.length > 0 ? 
          finishedSaleData.pagamentos.map((p: any) => `
            <div class="row" style="padding-left: 5px;">
              <span>- ${p.nome} ${p.parcelas > 1 ? `(${p.parcelas}x)` : ''}</span>
              <span class="bold">R$ ${formatMoney(p.valor)}</span>
            </div>
          `).join('')
        : `
          <div class="row"><span>Único:</span><span class="bold">${paymentName}</span></div>
        `}
        
        <div class="divider"></div>
        <div class="center" style="margin-top: 10px;">Agradecemos a preferência!</div>
      </div>
    `;

    const printWindow = window.open('', '_blank', 'width=300,height=600');
    if (printWindow) {
      printWindow.document.write(`<html><head><title>Recibo Venda #${finishedSaleData.sequencial_id}</title></head><body onload="window.print(); setTimeout(() => window.close(), 500);">${content}</body></html>`);
      printWindow.document.close();
    }
  };

  return (
    <div className="fixed inset-0 bg-slate-100 flex flex-col md:flex-row z-50 overflow-hidden font-sans">
      
      {/* Left Menu / Products */}
      <div className="flex-1 flex flex-col h-full h-1/2 md:h-full bg-slate-50 border-r border-slate-200">
        
        {/* Header Left */}
        <div className="bg-white p-4 flex items-center justify-between border-b border-slate-200 shadow-sm flex-shrink-0">
          <div className="flex items-center gap-3">
            <div className="bg-indigo-600 p-2 rounded-lg text-white">
              <MonitorPlay className="w-6 h-6" />
            </div>
            <h1 className="text-xl font-bold text-slate-900">Ponto de Venda</h1>
          </div>
          <button 
            onClick={() => navigate('/dashboard')}
            className="flex items-center gap-2 px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-600 rounded-lg transition-colors font-medium text-sm"
          >
            <X className="w-4 h-4" />
            Fechar PDV
          </button>
        </div>

        {/* Search Bar */}
        <div className="p-4 flex-shrink-0 bg-white border-b border-slate-100">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 w-5 h-5" />
            <input 
              type="text" 
              placeholder="Buscar Produto (Nome ou Código)" 
              value={searchTerm}
              onChange={e => setSearchTerm(e.target.value)}
              className="w-full bg-slate-100 border-transparent focus:border-indigo-500 focus:bg-white focus:ring-4 focus:ring-indigo-100 rounded-xl py-3 pl-10 pr-4 transition-all text-slate-900 font-medium"
            />
          </div>
        </div>

        {/* Products Grid */}
        <div className="flex-1 overflow-y-auto p-4 hide-scrollbar">
          <div className="grid grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
            {filteredProdutos.map(produto => (
              <button 
                key={produto.id}
                onClick={() => addToCart(produto)}
                className="bg-white p-4 rounded-xl shadow-sm border border-slate-200 hover:border-indigo-500 hover:shadow-md hover:shadow-indigo-100 transition-all text-left flex flex-col justify-between h-32 active:scale-95"
              >
                <div>
                  <h3 className="font-bold text-slate-800 line-clamp-2 leading-tight">{produto.nome}</h3>
                  <p className="text-xs text-slate-400 mt-1">{produto.codigo_barras || 'Sem código'}</p>
                </div>
                <div className="flex justify-between items-end mt-2">
                  <span className="font-black text-indigo-600">R$ {formatMoney(produto.preco_venda)}</span>
                  <span className={`text-xs font-bold px-2 py-1 rounded bg-slate-100 ${produto.estoque_atual <= 0 ? 'text-red-500' : 'text-slate-500'}`}>
                    Estoque: {produto.estoque_atual}
                  </span>
                </div>
              </button>
            ))}
            {filteredProdutos.length === 0 && (
              <div className="col-span-full py-12 text-center text-slate-400">
                <Search className="w-8 h-8 mx-auto mb-2 opacity-50" />
                Nenhum produto encontrado
              </div>
            )}
          </div>
        </div>

      </div>

      {/* Right Menu / Cart */}
      <div className="w-full md:w-[400px] lg:w-[480px] bg-white flex flex-col h-1/2 md:h-full flex-shrink-0 shadow-2xl relative z-10 border-t md:border-t-0 md:border-l border-slate-200">
        
        {/* Cart Header */}
        <div className="p-4 border-b border-slate-200 bg-slate-50 flex items-center justify-between flex-shrink-0">
          <h2 className="text-lg font-bold text-slate-800 flex items-center gap-2">
            <ShoppingCart className="w-5 h-5 text-indigo-600" />
            Carrinho Atual
          </h2>
          <span className="bg-indigo-100 text-indigo-700 py-1 px-3 rounded-full text-sm font-bold">
            {cart.reduce((s, i) => s + i.quantidade, 0)} itens
          </span>
        </div>

        {/* Cart Items */}
        <div className="flex-1 overflow-y-auto p-4 space-y-3">
          {cart.map(item => (
            <div key={item.id} className="bg-white border text-sm border-slate-200 rounded-lg p-3 flex gap-3 shadow-sm relative group">
              <div className="flex-1">
                <h4 className="font-bold text-slate-800 leading-tight mb-1 pr-6">{item.nome}</h4>
                <div className="font-medium text-slate-500">R$ {formatMoney(item.preco_venda)} un.</div>
              </div>
              <div className="flex flex-col items-end justify-between">
                <div className="font-black text-slate-900 mb-2">R$ {formatMoney(item.subtotal)}</div>
                
                <div className="flex items-center gap-1 bg-slate-100 rounded-lg border border-slate-200 p-0.5">
                  <button onClick={() => updateQuantity(item.id, -1)} className="p-1 hover:bg-white rounded-md text-slate-600 transition-colors">
                    <Minus className="w-4 h-4" />
                  </button>
                  <span className="w-8 text-center font-bold text-slate-800 text-sm select-none">
                    {item.quantidade}
                  </span>
                  <button onClick={() => updateQuantity(item.id, 1)} className="p-1 hover:bg-white rounded-md text-slate-600 transition-colors">
                    <Plus className="w-4 h-4" />
                  </button>
                </div>
              </div>

              <button 
                onClick={() => removeFromCart(item.id)}
                className="absolute top-2 right-2 p-1.5 text-slate-300 hover:text-rose-500 hover:bg-rose-50 rounded-md opacity-0 group-hover:opacity-100 transition-all"
              >
                <Trash2 className="w-4 h-4" />
              </button>
            </div>
          ))}
          {cart.length === 0 && (
            <div className="h-full flex flex-col items-center justify-center text-slate-400 py-12">
              <ShoppingCart className="w-16 h-16 mb-4 opacity-20" />
              <p className="font-medium">Carrinho vazio</p>
              <p className="text-sm opacity-70">Adicione produtos para vender</p>
            </div>
          )}
        </div>

        {/* Footer / Summary */}
        <div className="p-4 bg-slate-50 border-t border-slate-200 flex-shrink-0">
          {/* Cliente */}
          <div className="mb-3">
            <div className="flex items-center gap-2 mb-1.5">
              <UserIcon className="w-4 h-4 text-slate-400" />
              <label className="text-xs font-bold text-slate-500 uppercase tracking-wider">Cliente (Opcional)</label>
            </div>
            <select 
              value={selectedClient} 
              onChange={e => setSelectedClient(e.target.value)}
              className="w-full bg-white border border-slate-200 rounded-lg text-sm py-2 px-3 text-slate-700"
            >
              <option value="">Consumidor Final</option>
              {pessoas.filter(p => p.tipo_pessoa === 'cliente').map(p => (
                <option key={p.id} value={p.id}>{p.nome || p.razao_social}</option>
              ))}
            </select>
          </div>

          <div className="space-y-2 mb-4">
            <div className="flex justify-between text-sm text-slate-500 font-medium tracking-wide">
              <span>Subtotal</span>
              <span>R$ {formatMoney(cartTotal)}</span>
            </div>
            
            <div className="flex justify-between items-center text-sm font-medium">
              <span className="text-slate-500">Desconto</span>
              <div className="relative w-28">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400">R$</span>
                <input 
                  type="number" 
                  min="0"
                  step="0.01"
                  value={discount === 0 ? '' : discount}
                  onChange={e => setDiscount(parseFloat(e.target.value) || 0)}
                  className="w-full pl-8 pr-3 py-1.5 text-right bg-white border border-slate-200 rounded-lg text-slate-700 focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 transition-all font-mono"
                  placeholder="0,00"
                />
              </div>
            </div>
          </div>
          
          <div className="flex justify-between items-end mb-4 pt-3 border-t-2 border-slate-200 border-dashed">
            <span className="text-slate-500 font-bold uppercase tracking-wider text-sm mb-1">Total a Pagar</span>
            <span className="text-3xl font-black text-indigo-600 tracking-tight">R$ {formatMoney(finalTotal)}</span>
          </div>

          <button 
            disabled={cart.length === 0}
            onClick={() => setIsFinishing(true)}
            className="w-full bg-emerald-500 hover:bg-emerald-600 disabled:bg-slate-300 disabled:cursor-not-allowed text-white py-4 rounded-xl font-bold text-lg shadow-lg shadow-emerald-500/30 transition-all active:scale-[0.98] flex items-center justify-center gap-2"
          >
            <CheckCircle className="w-6 h-6" />
            Receber Pagamento
          </button>
        </div>

      </div>

      {/* Payment Output Modal (Finishing Sale) */}
      <AnimatePresence>
        {isFinishing && (
          <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
            <motion.div 
              initial={{ bgOpacity: 0 }}
              animate={{ bgOpacity: 1 }}
              exit={{ bgOpacity: 0 }}
              className="absolute inset-0 bg-slate-900/40 backdrop-blur-sm"
              onClick={() => setIsFinishing(false)}
            />
            
            <motion.div 
              initial={{ opacity: 0, y: 100, scale: 0.9 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 100, scale: 0.9 }}
              className="bg-white w-full max-w-md rounded-2xl shadow-2xl relative z-10 overflow-hidden"
            >
              <div className="p-6 bg-slate-50 border-b border-slate-100 flex items-center justify-between">
                <h3 className="text-xl font-bold text-slate-900 flex items-center gap-2">
                  <CreditCard className="w-5 h-5 text-indigo-600" />
                  Pagamento
                </h3>
                <button onClick={() => setIsFinishing(false)} className="text-slate-400 hover:text-slate-600">
                  <X className="w-6 h-6" />
                </button>
              </div>

              <div className="p-6">
                <div className="text-center mb-6 border-b border-dashed pb-4">
                  <p className="text-slate-500 font-medium mb-1">Valor Total</p>
                  <p className="text-4xl font-black text-slate-900 tracking-tight">R$ {formatMoney(finalTotal)}</p>
                </div>

                <div className="space-y-4">
                  <div className="grid grid-cols-2 gap-2">
                    <select 
                      className="w-full border border-slate-200 rounded-xl px-4 py-2 bg-slate-50 text-slate-900 font-medium focus:ring-2 focus:ring-indigo-500 transition-all outline-none"
                      value={currentPayment.tipo_pagamento_id}
                      onChange={e => setCurrentPayment({...currentPayment, tipo_pagamento_id: e.target.value, parcelas: 1})}
                    >
                      <option value="">Forma...</option>
                      {paymentTypes.map(t => (
                        <option key={t.id} value={t.id}>{t.nome}</option>
                      ))}
                    </select>
                    <input 
                      type="number" 
                      placeholder="Valor R$"
                      className="w-full border border-slate-200 rounded-xl px-4 py-2 bg-white"
                      value={currentPayment.valor || ''}
                      onChange={e => setCurrentPayment({...currentPayment, valor: parseFloat(e.target.value) || 0})}
                    />
                  </div>
                  
                  <div className="grid grid-cols-2 gap-2">
                    <select
                      className="w-full border border-slate-200 rounded-xl px-4 py-2 bg-slate-50 text-slate-900 font-medium"
                      value={currentPayment.parcelas}
                      onChange={e => setCurrentPayment({...currentPayment, parcelas: parseInt(e.target.value)})}
                      disabled={!currentPayment.tipo_pagamento_id || paymentTypes.find(p => p.id === parseInt(currentPayment.tipo_pagamento_id))?.nome.toLowerCase() === 'dinheiro'}
                    >
                      {Array.from({ length: paymentTypes.find(p => p.id === parseInt(currentPayment.tipo_pagamento_id))?.qtd_parcelas || 1 }, (_, i) => i + 1).map(n => (
                        <option key={n} value={n}>{n}x</option>
                      ))}
                    </select>
                    <button 
                      type="button"
                      onClick={handleAddPayment}
                      className="bg-indigo-600 text-white font-bold py-2 rounded-xl hover:bg-indigo-700 transition-all"
                    >
                      Adicionar
                    </button>
                  </div>
                </div>

                {pagamentos.length > 0 && (
                  <div className="mt-4 space-y-2 max-h-40 overflow-y-auto pr-1">
                    {pagamentos.map((p, idx) => (
                      <div key={idx} className="flex justify-between items-center bg-slate-50 p-2 rounded-lg border border-slate-100 text-xs">
                        <div>
                          <span className="font-bold text-slate-700">{p.nome}</span>
                          <span className="text-slate-500 ml-2">{p.parcelas}x</span>
                        </div>
                        <div className="flex items-center gap-2">
                          <span className="font-bold text-slate-900">R$ {formatMoney(p.valor)}</span>
                          <button type="button" onClick={() => handleRemovePayment(idx)} className="text-rose-500 hover:text-rose-700">
                             <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}

                <div className="mt-4 pt-4 border-t border-slate-100 space-y-1 text-sm">
                  <div className="flex justify-between font-medium">
                    <span className="text-slate-500">Total Pago:</span>
                    <span className="text-slate-900 font-bold">R$ {formatMoney(pagamentos.reduce((acc, p) => acc + p.valor, 0))}</span>
                  </div>
                  {change > 0 && (
                    <div className="flex justify-between font-medium text-emerald-600 bg-emerald-50 p-2 rounded-lg mt-2">
                      <span>Troco:</span>
                      <span className="font-black">R$ {formatMoney(change)}</span>
                    </div>
                  )}
                  <div className="flex justify-between font-medium">
                   <span className="text-slate-500">Restante:</span>
                   <span className={`font-bold ${finalTotal - pagamentos.reduce((acc, p) => acc + p.valor, 0) < 0.01 ? 'text-emerald-500' : 'text-rose-500'}`}>
                     R$ {formatMoney(Math.max(0, finalTotal - pagamentos.reduce((acc, p) => acc + p.valor, 0)))}
                   </span>
                  </div>
                </div>

                {!currentCashier && (
                  <div className="mt-4 p-3 bg-red-50 text-red-600 rounded-lg text-sm font-medium flex items-start gap-2 border border-red-100">
                    <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />
                    <p>O caixa não está aberto. Acesse o Financeiro para abrir o caixa antes de realizar vendas.</p>
                  </div>
                )}

                <button 
                  onClick={handleFinishSale}
                  disabled={finalTotal - pagamentos.reduce((acc, p) => acc + p.valor, 0) > 0.01 || !currentCashier}
                  className="w-full mt-8 bg-indigo-600 disabled:bg-slate-300 hover:bg-indigo-700 text-white font-bold py-4 rounded-xl transition-all active:scale-[0.98] shadow-lg shadow-indigo-600/20"
                >
                  Confirmar Pagamento
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Finished Sale Receipt Options Modal */}
      <AnimatePresence>
        {isReceiptModalOpen && finishedSaleData && (
          <div className="fixed inset-0 z-[80] flex items-center justify-center p-4">
            <motion.div 
              initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              className="absolute inset-0 bg-slate-900/60 backdrop-blur-md"
            />
            <motion.div 
              initial={{ opacity: 0, scale: 0.9, y: 20 }} animate={{ opacity: 1, scale: 1, y: 0 }} exit={{ opacity: 0, scale: 0.9, y: 20 }}
              className="bg-white w-full max-w-sm rounded-3xl shadow-2xl relative z-10 overflow-hidden"
            >
              <div className="p-8 text-center bg-gradient-to-b from-emerald-50 to-white">
                <div className="w-20 h-20 bg-emerald-500 rounded-full flex items-center justify-center mx-auto mb-6 shadow-lg shadow-emerald-200">
                  <CheckCircle className="w-10 h-10 text-white" />
                </div>
                <h2 className="text-2xl font-black text-slate-900 mb-2">Venda Finalizada!</h2>
                <p className="text-slate-500 font-medium">Selecione uma opção de recibo:</p>
              </div>

              <div className="p-8 space-y-4 pt-0">
                <button 
                  onClick={() => handlePrintFinalReceipt('whatsapp')}
                  className="w-full bg-[#25D366] hover:bg-[#128C7E] text-white font-bold py-4 px-6 rounded-2xl transition-all flex items-center justify-center gap-3 shadow-lg shadow-emerald-100"
                >
                  <MessageCircle className="w-6 h-6" /> Enviar por WhatsApp
                </button>
                <button 
                  onClick={() => handlePrintFinalReceipt('print')}
                  className="w-full bg-slate-900 hover:bg-slate-800 text-white font-bold py-4 px-6 rounded-2xl transition-all flex items-center justify-center gap-3 shadow-lg shadow-slate-200"
                >
                  <Printer className="w-6 h-6" /> Imprimir Cupom
                </button>
                
                <button 
                  onClick={() => setIsReceiptModalOpen(false)}
                  className="w-full bg-slate-100 hover:bg-slate-200 text-slate-500 font-bold py-4 rounded-2xl transition-all"
                >
                  Fechar
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Finished Sale Receipt Options Modal */}
      <AnimatePresence>
        {isReceiptModalOpen && finishedSaleData && (
          <div className="fixed inset-0 z-[80] flex items-center justify-center p-4">
            <motion.div 
              initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              className="absolute inset-0 bg-slate-900/60 backdrop-blur-md"
              onClick={() => setIsReceiptModalOpen(false)}
            />
            <motion.div 
              initial={{ opacity: 0, scale: 0.9, y: 20 }} animate={{ opacity: 1, scale: 1, y: 0 }} exit={{ opacity: 0, scale: 0.9, y: 20 }}
              className="bg-white w-full max-w-sm rounded-3xl shadow-2xl relative z-10 overflow-hidden"
            >
              <div className="p-8 text-center bg-gradient-to-b from-emerald-50 to-white">
                <div className="w-20 h-20 bg-emerald-500 rounded-full flex items-center justify-center mx-auto mb-6 shadow-lg shadow-emerald-200">
                  <CheckCircle className="w-10 h-10 text-white" />
                </div>
                <h2 className="text-2xl font-black text-slate-900 mb-2">Venda Finalizada!</h2>
                <p className="text-slate-500 font-medium">Selecione uma opção de recibo:</p>
              </div>

              <div className="p-8 space-y-4 pt-0">
                <button 
                  onClick={() => handlePrintFinalReceipt('whatsapp')}
                  className="w-full bg-[#25D366] hover:bg-[#128C7E] text-white font-bold py-4 px-6 rounded-2xl transition-all flex items-center justify-center gap-3 shadow-lg shadow-emerald-100"
                >
                  <MessageCircle className="w-6 h-6" /> Enviar por WhatsApp
                </button>
                <button 
                  onClick={() => handlePrintFinalReceipt('print')}
                  className="w-full bg-slate-900 hover:bg-slate-800 text-white font-bold py-4 px-6 rounded-2xl transition-all flex items-center justify-center gap-3 shadow-lg shadow-slate-200"
                >
                  <Printer className="w-6 h-6" /> Imprimir Cupom
                </button>
                
                <button 
                  onClick={() => setIsReceiptModalOpen(false)}
                  className="w-full bg-slate-100 hover:bg-slate-200 text-slate-500 font-bold py-4 rounded-2xl transition-all"
                >
                  Fechar
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

    </div>
  );
}
