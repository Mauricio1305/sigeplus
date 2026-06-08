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
  MessageCircle,
  FileText
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'motion/react';
import { validatePayment } from '../utils/paymentValidation';
import { getDirectImageUrl } from '../utils/image';

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
    const activeProducts = produtos.filter(p => p.tipo !== 'servico');
    if (searchTerm.trim() === '') {
      setFilteredProdutos(activeProducts);
    } else {
      const lower = searchTerm.toLowerCase();
      setFilteredProdutos(activeProducts.filter(p => 
        p.nome.toLowerCase().includes(lower) || 
        (p.codigo_barras && p.codigo_barras.includes(searchTerm))
      ));
    }
  }, [searchTerm, produtos]);

  const addToCart = (produto: any) => {
    setDiscount(0); // Reset discount on item change
    const preco = parseFloat(produto.preco_venda || 0);
    setCart(prev => {
      const existing = prev.find(item => item.id === produto.id);
      if (existing) {
        return prev.map(item => 
          item.id === produto.id 
            ? { ...item, quantidade: item.quantidade + 1, subtotal: (item.quantidade + 1) * preco }
            : item
        );
      }
      return [...prev, { 
        id: produto.id, 
        nome: produto.nome, 
        preco_unitario: preco, 
        quantidade: 1, 
        subtotal: preco 
      }];
    });
  };

  const updateQuantity = (id: number, delta: number) => {
    setDiscount(0); // Reset discount on item change
    setCart(prev => prev.map(item => {
      if (item.id === id) {
        const newQ = Math.max(1, item.quantidade + delta);
        const preco = parseFloat(item.preco_venda || 0);
        return { ...item, quantidade: newQ, subtotal: newQ * preco };
      }
      return item;
    }));
  };

  const removeFromCart = (id: number) => {
    setDiscount(0); // Reset discount on item change
    setCart(prev => prev.filter(item => item.id !== id));
  };

  const cartTotal = cart.reduce((sum, item) => sum + (parseFloat(item.subtotal) || 0), 0);
  const finalTotal = Math.max(0, cartTotal - (parseFloat(discount as any) || 0));

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
      const res = await fetch('/api/pdv', {
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
        id: saleResponse.id,
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

  const handleSearchKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      if (filteredProdutos.length > 0) {
        // Se houver uma correspondência exata de código de barras, usa ela, senão pega o primeiro
        const exactMatch = filteredProdutos.find(p => p.codigo_barras === searchTerm);
        addToCart(exactMatch || filteredProdutos[0]);
        setSearchTerm('');
      }
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
              maxLength={255}
              value={searchTerm}
              onChange={e => setSearchTerm(e.target.value)}
              onKeyDown={handleSearchKeyDown}
              autoFocus
              className="w-full bg-slate-100 border-transparent focus:border-indigo-500 focus:bg-white focus:ring-4 focus:ring-indigo-100 rounded-xl py-3 pl-10 pr-4 transition-all text-slate-900 font-medium"
            />

            {/* Floating Search Results */}
            {searchTerm.length > 0 && (
              <div className="absolute left-0 right-0 top-[calc(100%+8px)] bg-white rounded-2xl shadow-2xl border border-slate-200 z-[100] max-h-[60vh] overflow-y-auto overflow-x-hidden">
                <div className="p-2">
                  {filteredProdutos.length > 0 ? (
                    filteredProdutos.map((produto) => (
                      <button
                        key={produto.id}
                        type="button"
                        onClick={() => {
                          addToCart(produto);
                          setSearchTerm('');
                        }}
                        className="w-full flex items-center gap-4 p-3 hover:bg-indigo-50 rounded-xl transition-colors text-left group"
                      >
                        <div className="w-12 h-12 bg-slate-100 rounded-lg flex-shrink-0 flex items-center justify-center overflow-hidden border border-slate-200">
                          {produto.foto ? (
                            <img 
                              src={getDirectImageUrl(produto.foto)} 
                              alt={produto.nome} 
                              className="w-full h-full object-cover"
                              onError={(e) => { (e.target as HTMLImageElement).src = 'https://placehold.co/100x100?text=P' }}
                            />
                          ) : (
                            <MonitorPlay className="w-6 h-6 text-slate-300" />
                          )}
                        </div>
                        <div className="flex-1 min-w-0">
                          <h4 className="font-bold text-slate-900 truncate group-hover:text-indigo-600 transition-colors">
                            {produto.nome}
                          </h4>
                          <p className="text-xs text-slate-500 font-medium truncate">
                            {produto.codigo_barras || 'Sem código'}
                          </p>
                        </div>
                        <div className="text-right flex-shrink-0">
                          <p className="font-black text-indigo-600 text-sm">
                            R$ {formatMoney(produto.preco_venda)}
                          </p>
                          <p className={`text-[10px] font-bold uppercase mt-0.5 ${produto.estoque_atual <= 0 ? 'text-red-500' : 'text-slate-400'}`}>
                            Estoque: {produto.estoque_atual}
                          </p>
                        </div>
                      </button>
                    ))
                  ) : (
                    <div className="py-8 text-center text-slate-500">
                      <Search className="w-8 h-8 mx-auto mb-2 opacity-30" />
                      <p className="font-bold uppercase text-[10px] tracking-widest">Nenhum produto encontrado</p>
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Company Logo Display (Replacing Products Grid) */}
        <div className="flex-1 flex flex-col items-center justify-center p-8 bg-white">
          <div className="max-w-md w-full flex flex-col items-center text-center space-y-6">
            {company?.logo ? (
              <motion.img 
                initial={{ opacity: 0, scale: 0.9 }}
                animate={{ opacity: 1, scale: 1 }}
                src={getDirectImageUrl(company.logo)} 
                alt={company.nome_fantasia} 
                className="w-64 h-64 object-contain"
                onError={(e) => { (e.target as HTMLImageElement).src = 'https://placehold.co/400x400?text=' + company?.nome_fantasia }}
              />
            ) : (
              <div className="w-64 h-64 bg-slate-100 rounded-full flex items-center justify-center border-4 border-slate-50 shadow-inner">
                <MonitorPlay className="w-24 h-24 text-slate-300" />
              </div>
            )}
            
            <div>
              <h2 className="text-3xl font-black text-slate-900">{company?.nome_fantasia || 'Bem-vindo'}</h2>
              <p className="text-slate-500 font-medium mt-2">Ponto de Venda Ativo</p>
            </div>

            <div className="grid grid-cols-2 gap-4 w-full pt-8">
              <div className="bg-slate-50 p-4 rounded-2xl border border-slate-100">
                <p className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-1">Status</p>
                <p className="text-emerald-600 font-bold flex items-center justify-center gap-2">
                  <span className="w-2 h-2 bg-emerald-500 rounded-full animate-pulse"></span>
                  Operacional
                </p>
              </div>
              <div className="bg-slate-50 p-4 rounded-2xl border border-slate-100">
                <p className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-1">Operador</p>
                <p className="text-slate-700 font-bold">Admin</p>
              </div>
            </div>
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
                <div className="font-medium text-slate-500">R$ {formatMoney(item.preco_unitario)} un.</div>
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
            
            <div className="space-y-1">
              <div className="flex justify-between items-center text-sm font-medium">
                <span className="text-slate-500">Desconto</span>
                <div className="relative w-28">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400">R$</span>
                  <input 
                    type="number" 
                    min="0"
                    step="0.01"
                    value={discount}
                    onChange={e => {
                      const val = parseFloat(e.target.value);
                      setDiscount(isNaN(val) ? 0 : val);
                    }}
                    className={`w-full pl-8 pr-3 py-1.5 text-right bg-white border ${(cartTotal > 0 && (discount / cartTotal) * 100 > (parseFloat(company?.max_desconto_venda) || 0) + 0.001) ? 'border-rose-500 ring-2 ring-rose-100' : 'border-slate-200'} rounded-lg text-slate-700 focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 transition-all font-mono`}
                    placeholder="0,00"
                  />
                </div>
              </div>
              {(cartTotal > 0 && (discount / cartTotal) * 100 > (parseFloat(company?.max_desconto_venda) || 0) + 0.001) && (
                <p className="text-[10px] text-rose-500 font-bold text-right leading-none mt-1">
                  Máximo {parseFloat(company?.max_desconto_venda) || 0}% ({(cartTotal * (parseFloat(company?.max_desconto_venda) || 0) / 100).toLocaleString('pt-br', {style: 'currency', currency: 'BRL'})})
                </p>
              )}
            </div>
          </div>
          
          <div className="flex justify-between items-end mb-4 pt-3 border-t-2 border-slate-200 border-dashed">
            <span className="text-slate-500 font-bold uppercase tracking-wider text-sm mb-1">Total a Pagar</span>
            <span className="text-3xl font-black text-indigo-600 tracking-tight">R$ {formatMoney(finalTotal)}</span>
          </div>

          <button 
            disabled={cart.length === 0}
            onClick={() => {
              const maxDiscountPercent = parseFloat(company?.max_desconto_venda) || 0;
              const currentDiscountPercent = cartTotal > 0 ? (discount / cartTotal) * 100 : 0;
              
              if (currentDiscountPercent > maxDiscountPercent + 0.001) { // 0.001 tolerance for floats
                alert(`O desconto máximo permitido é de ${maxDiscountPercent}%. O desconto atual é de ${currentDiscountPercent.toFixed(2)}%.`);
                return;
              }
              setIsFinishing(true);
            }}
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
                      onChange={e => {
                        const selectedTypeId = e.target.value;
                        const alreadyPaid = pagamentos.reduce((acc, p) => acc + p.valor, 0);
                        const suggestedValue = Math.max(0, finalTotal - alreadyPaid);
                        setCurrentPayment({
                          ...currentPayment, 
                          tipo_pagamento_id: selectedTypeId, 
                          parcelas: 1,
                          valor: selectedTypeId ? suggestedValue : 0
                        });
                      }}
                    >
                      <option value="">Forma...</option>
                      {paymentTypes.map(t => (
                        <option key={t.id} value={t.id}>{t.nome}</option>
                      ))}
                    </select>
                    <input 
                      type="number" 
                      min="0"
                      step="0.01"
                      placeholder="Valor R$"
                      className="w-full border border-slate-200 rounded-xl px-4 py-2 bg-white [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                      value={currentPayment.valor === 0 ? '' : currentPayment.valor}
                      onChange={e => {
                        let val = parseFloat(e.target.value);
                        if (isNaN(val) || val < 0) val = 0;
                        setCurrentPayment({...currentPayment, valor: val});
                      }}
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

              <div className="p-4 space-y-3 pt-0">
                <button 
                  onClick={() => { window.open('/print/venda/' + (finishedSaleData?.id || finishedSaleData?.sequencial_id) + '?t=' + token, '_blank') }}
                  className="w-full bg-indigo-600 hover:bg-indigo-700 text-white font-bold py-3.5 px-6 rounded-2xl transition-all flex items-center justify-center gap-3 shadow-md"
                >
                  <FileText className="w-5 h-5" /> Imprimir Pedido de Venda
                </button>
                <button 
                  onClick={() => handlePrintFinalReceipt('print')}
                  className="w-full bg-slate-800 hover:bg-slate-900 text-white font-bold py-3.5 px-6 rounded-2xl transition-all flex items-center justify-center gap-3 shadow-md"
                >
                  <Printer className="w-5 h-5" /> Imprimir Recibo Não Fiscal
                </button>
                <button 
                  onClick={() => handlePrintFinalReceipt('whatsapp')}
                  className="w-full bg-[#25D366] hover:bg-[#128C7E] text-white font-bold py-3.5 px-6 rounded-2xl transition-all flex items-center justify-center gap-3 shadow-md"
                >
                  <MessageCircle className="w-5 h-5" /> Enviar por WhatsApp
                </button>
                <button 
                  onClick={() => setIsReceiptModalOpen(false)}
                  className="w-full bg-slate-100 hover:bg-slate-200 text-slate-500 font-bold py-3.5 rounded-2xl transition-all mt-2"
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
