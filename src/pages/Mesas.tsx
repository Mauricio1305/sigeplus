import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuthStore } from '../store/authStore';
import { 
  Coffee, Plus, X, Search, CheckCircle, CreditCard, ShoppingCart, Minus, Printer, Users, MessageCircle, Trash2
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { validatePayment } from '../utils/paymentValidation';

function formatMoney(value: any): string {
  const num = typeof value === 'string' ? parseFloat(value) : value;
  return isNaN(num) ? '0,00' : num.toFixed(2).replace('.', ',');
}

export default function Mesas() {
  const [mesas, setMesas] = useState<any[]>([]);
  const [produtos, setProdutos] = useState<any[]>([]);
  const [pessoas, setPessoas] = useState<any[]>([]);
  const [paymentTypes, setPaymentTypes] = useState<any[]>([]);
  const [currentCashier, setCurrentCashier] = useState<any>(null);
  const [company, setCompany] = useState<any>(null);
  const [searchTerm, setSearchTerm] = useState('');
  
  // Modals state
  const [isNewMesaModalOpen, setIsNewMesaModalOpen] = useState(false);
  const [isOpeningMesa, setIsOpeningMesa] = useState(false);
  const [isAddingProduct, setIsAddingProduct] = useState(false);
  const [isFinishingMesa, setIsFinishingMesa] = useState(false);
  const [newMesaData, setNewMesaData] = useState({ identificacao: '', taxa_servico: 10 });
  
  const [selectedMesa, setSelectedMesa] = useState<any>(null);
  
  const [isAddingItems, setIsAddingItems] = useState(false);
  const [productSearchTerm, setProductSearchTerm] = useState('');
  
  const [showAddedToast, setShowAddedToast] = useState<string | null>(null);
  
  const [isFinishing, setIsFinishing] = useState(false);
  const [isSplitModalOpen, setIsSplitModalOpen] = useState(false);
  const [isReceiptModalOpen, setIsReceiptModalOpen] = useState(false);
  const [finishedSaleData, setFinishedSaleData] = useState<any>(null);
  const [splitCount, setSplitCount] = useState(1);
  const [discount, setDiscount] = useState(0);
  const [pagamentos, setPagamentos] = useState<any[]>([]);
  const [currentPayment, setCurrentPayment] = useState({ tipo_pagamento_id: '', valor: 0, parcelas: 1 });
  const [receivedValue, setReceivedValue] = useState(0);
  const [change, setChange] = useState(0);

  const token = useAuthStore(state => state.token);
  const navigate = useNavigate();

  const fetchMesas = () => {
    fetch('/api/sales', { headers: { 'Authorization': `Bearer ${token}` } })
      .then(res => res.json())
      .then(data => {
        // filter mesas that are open
        const openMesas = data.filter((s: any) => s.tipo === 'mesa' && s.status === 'aberta');
        setMesas(openMesas);
      });
  };

  useEffect(() => {
    fetchMesas();
    fetch('/api/products', { headers: { 'Authorization': `Bearer ${token}` } }).then(res => res.json()).then(setProdutos);
    fetch('/api/pessoas', { headers: { 'Authorization': `Bearer ${token}` } }).then(res => res.json()).then(setPessoas);
    fetch('/api/finance/payment-types', { headers: { 'Authorization': `Bearer ${token}` } }).then(res => res.json()).then(setPaymentTypes);
    fetch('/api/finance/cashier/current', { headers: { 'Authorization': `Bearer ${token}` } }).then(res => res.json()).then(setCurrentCashier);
    fetch('/api/company/settings', { headers: { 'Authorization': `Bearer ${token}` } }).then(res => res.json()).then(setCompany);
  }, [token]);

  const loadMesaDetails = async (mesa: any) => {
    const res = await fetch(`/api/sales/${mesa.sequencial_id}`, { headers: { 'Authorization': `Bearer ${token}` } });
    const fullMesa = await res.json();
    setSelectedMesa(fullMesa);
  };

  const handleOpenMesa = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isOpeningMesa) return;

    setIsOpeningMesa(true);
    try {
      const res = await fetch('/api/sales', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
        body: JSON.stringify({
          tipo: 'mesa',
          origem: 'Comanda',
          status: 'aberta',
          identificacao: newMesaData.identificacao,
          taxa_servico: newMesaData.taxa_servico,
          items: [],
          valor_total: 0,
          desconto: 0,
          frete: 0
        })
      });
      if (res.ok) {
        setIsNewMesaModalOpen(false);
        setNewMesaData({ identificacao: '', taxa_servico: 10 });
        fetchMesas();
      }
    } catch (err) {
      alert("Erro ao abrir mesa");
    } finally {
      setIsOpeningMesa(false);
    }
  };

  const addProductToMesa = async (produto: any) => {
    if (!selectedMesa || isAddingProduct) return;

    setIsAddingProduct(true);
    try {
      let items = [...(selectedMesa.items || [])];
      const existingIndex = items.findIndex((i: any) => i.id === produto.id);
      if (existingIndex >= 0) {
        const existing = { ...items[existingIndex] };
        existing.quantidade = parseFloat(existing.quantidade) + 1;
        existing.subtotal = existing.quantidade * parseFloat(existing.preco_venda);
        items[existingIndex] = existing;
      } else {
        items.push({
          id: produto.id,
          nome: produto.nome,
          preco_venda: parseFloat(produto.preco_venda) || 0,
          quantidade: 1,
          subtotal: parseFloat(produto.preco_venda) || 0
        });
      }

      const subtotal = items.reduce((acc, i) => acc + parseFloat(i.subtotal), 0);
      const serviceRate = parseFloat(selectedMesa.taxa_servico || 0) / 100;
      const newTotal = subtotal + (subtotal * serviceRate);

      const updatePayload = {
        ...selectedMesa,
        items,
        valor_total: newTotal
      };

      const res = await fetch(`/api/sales/${selectedMesa.sequencial_id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
        body: JSON.stringify(updatePayload)
      });

      if (res.ok) {
        loadMesaDetails(selectedMesa);
        fetchMesas(); // Refresh list to update totals in grid
        
        setIsAddingItems(false);
        setProductSearchTerm('');
        setShowAddedToast(produto.nome);
        setTimeout(() => setShowAddedToast(null), 3000);
      }
    } catch (err) {
      console.error("Error adding product:", err);
      alert("Erro ao adicionar produto");
    } finally {
      setIsAddingProduct(false);
    }
  };

  const updateItemQty = async (id: number, delta: number) => {
    if (!selectedMesa) return;
    
    let items = [...(selectedMesa.items || [])];
    const existingIndex = items.findIndex((i: any) => i.id === id);
    if (existingIndex >= 0) {
      const existing = { ...items[existingIndex] };
      existing.quantidade = parseFloat(existing.quantidade) + delta;
      if (existing.quantidade <= 0) {
        items = items.filter((i: any) => i.id !== id);
      } else {
        existing.subtotal = existing.quantidade * parseFloat(existing.preco_venda);
        items[existingIndex] = existing;
      }
    }

    const subtotal = items.reduce((acc, i) => acc + parseFloat(i.subtotal), 0);
    const serviceRate = parseFloat(selectedMesa.taxa_servico || 0) / 100;
    const newTotal = subtotal + (subtotal * serviceRate);

    const updatePayload = { ...selectedMesa, items, valor_total: newTotal };

    await fetch(`/api/sales/${selectedMesa.sequencial_id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
      body: JSON.stringify(updatePayload)
    });
    loadMesaDetails(selectedMesa);
    fetchMesas();
  };

  const calculateTotals = () => {
    if (!selectedMesa) return { subtotal: 0, service: 0, discount: 0, total: 0 };
    const subtotal = (selectedMesa.items || []).reduce((acc: number, i: any) => acc + parseFloat(i.subtotal || 0), 0);
    const serviceRate = parseFloat(selectedMesa.taxa_servico || 0) / 100;
    const service = subtotal * serviceRate;
    const total = subtotal + service - discount;
    return { subtotal, service, discount, total: Math.max(0, total) };
  };

  const handleAddPayment = () => {
    if (!currentPayment.tipo_pagamento_id || currentPayment.valor <= 0) return;

    const type = paymentTypes.find(p => p.id === parseInt(currentPayment.tipo_pagamento_id));
    if (!type) return;

    const validation = validatePayment(type, currentPayment.valor, currentPayment.parcelas);
    if (!validation.valid) {
      alert(validation.message);
      return;
    }

    const { total } = calculateTotals();
    const alreadyPaid = pagamentos.reduce((acc, p) => acc + p.valor, 0);
    const remaining = total - alreadyPaid;

    let valorToAdd = currentPayment.valor;
    let newChange = 0;

    // Check if it's cash (Dinheiro) based on some property? 
    // The user said "Dinheiro" in the code, let's assume if name is "Dinheiro"
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
    
    // Reset received and change to allow fresh calculation on next adds
    // or we could recalculate them here if we stored the raw input values.
    // Simplifying: if user removes a payment, they probably want to restart the payment logic.
    if (newPagamentos.length === 0) {
      setReceivedValue(0);
      setChange(0);
    } else {
      // Re-summing received value (approximate since we cap the added values)
      setReceivedValue(newPagamentos.reduce((acc, p) => acc + p.valor, 0));
      setChange(0); // Reset change as it's hard to trace which payment caused what change without history
    }
  };

  const handleFinishMesa = async () => {
    if (!currentCashier || isFinishingMesa) {
      if (!currentCashier) alert("Abra o caixa no Financeiro antes de receber!");
      return;
    }

    const { total } = calculateTotals();
    const alreadyPaid = pagamentos.reduce((acc, p) => acc + p.valor, 0);

    if (Math.abs(alreadyPaid - total) > 0.01) {
      alert("O valor total dos pagamentos deve ser igual ao total da venda.");
      return;
    }

    setIsFinishingMesa(true);
    try {
      const payload = {
        ...selectedMesa,
        status: 'finalizada',
        desconto: discount,
        valor_total: total,
        pagamentos: pagamentos
      };

      const res = await fetch(`/api/sales/${selectedMesa.sequencial_id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
        body: JSON.stringify(payload)
      });

      if (res.ok) {
        const finishedData = {
          ...payload,
          paymentName: pagamentos.map(p => p.nome).join(', ')
        };
        setFinishedSaleData(finishedData);
        setIsReceiptModalOpen(true);
        
        setSelectedMesa(null);
        setIsFinishing(false);
        setDiscount(0);
        setPagamentos([]);
        setCurrentPayment({ tipo_pagamento_id: '', valor: 0, parcelas: 1 });
        setReceivedValue(0);
        setChange(0);
        fetchMesas();
      } else {
        const err = await res.json();
        alert(err.error || 'Erro ao finalizar');
      }
    } catch (err) {
      console.error("Error finishing mesa:", err);
      alert("Erro de conexão ao finalizar mesa");
    } finally {
      setIsFinishingMesa(false);
    }
  };

  const handlePrintPre = (type: 'print' | 'whatsapp') => {
    const { subtotal, service, total } = calculateTotals();
    const splitValue = total / Math.max(1, splitCount);
    
    if (type === 'whatsapp') {
      let text = company?.nome_fantasia ? `*${company.nome_fantasia}*\n\n` : '';
      text += `*Pré-conta - ${selectedMesa.identificacao}*\n`;
      text += `------------------------\n`;
      (selectedMesa.items || []).forEach((i: any) => {
        text += `${i.quantidade}x ${i.nome} - R$ ${formatMoney(i.subtotal)}\n`;
      });
      text += `------------------------\n`;
      text += `Subtotal: R$ ${formatMoney(subtotal)}\n`;
      text += `Taxa (${selectedMesa.taxa_servico}%): R$ ${formatMoney(service)}\n`;
      text += `*Total: R$ ${formatMoney(total)}*\n`;
      if (splitCount > 1) {
        text += `_Dividido por ${splitCount}: R$ ${formatMoney(splitValue)} por pessoa_\n`;
      }
      text += `\nAgradecemos a preferência!`;

      const url = `https://wa.me/?text=${encodeURIComponent(text)}`;
      window.open(url, '_blank');
      return;
    }

    // Print Thermal 57mm
    const content = `
      <style>
        @page { size: 58mm auto; margin: 0; }
        body { 
          width: 58mm; 
          margin: 0; 
          padding: 2mm; 
          font-family: 'Courier New', Courier, monospace; 
          font-size: 11px; 
          color: #000;
          line-height: 1.2;
        }
        h2, h3 { text-align: center; margin: 2px 0; font-size: 14px; }
        .company-name { text-align: center; font-size: 16px; font-weight: bold; margin-bottom: 5px; }
        .divider { border-top: 1px dashed #000; margin: 5px 0; }
        .row { display: flex; justify-content: space-between; margin-bottom: 2px; }
        .bold { font-weight: bold; }
        .center { text-align: center; }
      </style>
      <div>
        ${company?.nome_fantasia ? `<div class="company-name">${company.nome_fantasia}</div>` : ''}
        <h2>PRÉ-CONTA</h2>
        <h3>${selectedMesa.identificacao}</h3>
        <div class="divider"></div>
        ${(selectedMesa.items || []).map((i: any) => `
          <div class="row">
            <span>${i.quantidade}x ${i.nome.substring(0,12)}</span>
            <span>R$ ${formatMoney(i.subtotal)}</span>
          </div>
        `).join('')}
        <div class="divider"></div>
        <div class="row">
          <span>Subtotal:</span>
          <span>R$ ${formatMoney(subtotal)}</span>
        </div>
        <div class="row">
          <span>Taxa (${selectedMesa.taxa_servico}%):</span>
          <span>R$ ${formatMoney(service)}</span>
        </div>
        <div class="row bold" style="font-size: 13px; margin-top: 4px;">
          <span>TOTAL:</span>
          <span>R$ ${formatMoney(total)}</span>
        </div>
        ${splitCount > 1 ? `
          <div class="divider"></div>
          <div class="center" style="font-size: 12px;">
            <span>Dividido por ${splitCount}</span><br/>
            <span class="bold">R$ ${formatMoney(splitValue)} / pessoa</span>
          </div>
        ` : ''}
        <div class="divider"></div>
        <div class="center" style="margin-top: 5px;">Agradecemos a preferência!</div>
      </div>
    `;

    const printWindow = window.open('', '_blank', 'width=300,height=500');
    if (printWindow) {
      printWindow.document.write(`<html><head><title>Pré Conta</title></head><body onload="window.print(); setTimeout(() => window.close(), 500);">${content}</body></html>`);
      printWindow.document.close();
    }
  };

  const handlePrintFinalReceipt = (type: 'print' | 'whatsapp') => {
    if (!finishedSaleData) return;

    const items = finishedSaleData.items || [];
    const subtotal = items.reduce((acc: number, i: any) => acc + parseFloat(i.subtotal || 0), 0);
    const serviceRate = parseFloat(finishedSaleData.taxa_servico || 0) / 100;
    const service = subtotal * serviceRate;
    const total = finishedSaleData.valor_total;
    const paymentName = finishedSaleData.paymentName || '';

    if (type === 'whatsapp') {
      let text = company?.nome_fantasia ? `*${company.nome_fantasia}*\n` : '';
      if (company?.cnpj) text += `CNPJ: ${company.cnpj}\n`;
      if (company?.endereco) text += `${company.endereco}, ${company.numero || ''} ${company.cidade || ''}/${company.estado || ''}\n`;
      if (company?.telefone_celular || company?.telefone_fixo) text += `Tel: ${company.telefone_celular || company.telefone_fixo}\n`;
      
      text += `\n*RECIBO DE VENDA (SEM VALOR FISCAL)*\n`;
      text += `Pedido: #${finishedSaleData.sequencial_id}\n`;
      text += `Mesa: ${finishedSaleData.identificacao}\n`;
      text += `Data: ${new Date().toLocaleString('pt-BR')}\n`;
      text += `------------------------\n`;
      items.forEach((i: any) => {
        text += `${i.quantidade}x ${i.nome} - R$ ${formatMoney(i.subtotal)}\n`;
      });
      text += `------------------------\n`;
      text += `Subtotal: R$ ${formatMoney(subtotal)}\n`;
      text += `Taxa (${finishedSaleData.taxa_servico}%): R$ ${formatMoney(service)}\n`;
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
        
        <div class="row"><span>Pedido: #${finishedSaleData.sequencial_id}</span></div>
        <div class="row"><span>Mesa: ${finishedSaleData.identificacao}</span></div>
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
        <div class="row"><span>Taxa (${finishedSaleData.taxa_servico}%):</span><span>R$ ${formatMoney(service)}</span></div>
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
      printWindow.document.write(`<html><head><title>Recibo Mesa #${finishedSaleData.sequencial_id}</title></head><body onload="window.print(); setTimeout(() => window.close(), 500);">${content}</body></html>`);
      printWindow.document.close();
    }
  };

  const filteredProdutos = productSearchTerm.trim() === '' ? produtos : produtos.filter(p => 
    p.nome.toLowerCase().includes(productSearchTerm.toLowerCase()) || 
    (p.codigo_barras && p.codigo_barras.includes(productSearchTerm))
  );

  return (
    <div className="space-y-6">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <h1 className="text-3xl font-bold text-slate-900 flex items-center gap-3">
            <Coffee className="w-8 h-8 text-indigo-600" />
            Mesas & Comandas
          </h1>
          <p className="text-slate-500">Gerenciamento de atendimento local</p>
        </div>
        {!selectedMesa && (
          <button 
            onClick={() => setIsNewMesaModalOpen(true)}
            className="bg-indigo-600 hover:bg-indigo-700 text-white px-6 py-3 rounded-xl font-bold transition-all shadow-lg flex items-center gap-2"
          >
            <Plus className="w-5 h-5" /> Nova Mesa
          </button>
        )}
      </div>

      {/* Main View: Grid of Mesas vs Mesa Detail */}
      {!selectedMesa ? (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-2 md:gap-6">
          {mesas.map(mesa => (
            <div 
              key={mesa.id} 
              onClick={() => loadMesaDetails(mesa)}
              className="bg-white rounded-lg md:rounded-2xl p-2 md:p-6 border-2 border-slate-100 hover:border-indigo-500 cursor-pointer transition-all shadow-sm flex flex-col group active:scale-95"
            >
              <div className="flex justify-between items-start mb-1 md:mb-4">
                <div className="bg-indigo-50 text-indigo-600 p-1.5 md:p-3 rounded-lg md:rounded-xl group-hover:bg-indigo-600 group-hover:text-white transition-colors">
                  <Coffee className="w-3.5 h-3.5 md:w-8 md:h-8" />
                </div>
                <div className="text-right">
                  <span className="text-[8px] md:text-xs font-bold text-emerald-500 uppercase tracking-widest bg-emerald-50 px-1.5 py-0.5 rounded-full">Aberta</span>
                </div>
              </div>
              <h3 className="text-sm md:text-2xl font-black text-slate-900 mb-0 md:mb-1 truncate">{mesa.identificacao || `Mesa #${mesa.sequencial_id}`}</h3>
              <p className="text-[10px] md:text-sm text-slate-500 mb-1 md:mb-4 font-medium font-mono">{mesa.qtd_itens || 0} Ite{parseInt(mesa.qtd_itens) === 1 ? 'm' : 'ns'}</p>
              <div className="mt-auto pt-1 md:pt-4 border-t border-slate-100 flex flex-col md:flex-row md:justify-between md:items-center">
                <span className="text-slate-400 md:text-slate-500 text-[9px] md:text-sm font-semibold">Consumo:</span>
                <span className="font-bold text-[11px] md:text-lg text-slate-900">R$ {formatMoney(mesa.valor_total)}</span>
              </div>
            </div>
          ))}

          {mesas.length === 0 && (
            <div className="col-span-full py-20 text-center">
              <div className="bg-slate-100 w-20 h-20 rounded-full flex items-center justify-center mx-auto mb-4">
                <Coffee className="w-10 h-10 text-slate-400" />
              </div>
              <h3 className="text-xl font-bold text-slate-900 mb-2">Nenhuma mesa aberta</h3>
              <p className="text-slate-500">Abra uma nova mesa para começar a lançar pedidos.</p>
            </div>
          )}
        </div>
      ) : (
        /* Mesa Detail View */
        <div className="flex flex-col lg:flex-row gap-6 h-[calc(100vh-[180px])] max-h-[800px]">
          
          {/* Left Panel: Items List */}
          <div className="flex-1 bg-white rounded-2xl shadow-sm border border-slate-200 flex flex-col overflow-hidden">
            <div className="p-4 border-b border-slate-200 bg-slate-50 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <button onClick={() => setSelectedMesa(null)} className="p-2 hover:bg-slate-200 rounded-lg text-slate-500 transition-colors">
                   <X className="w-5 h-5" />
                </button>
                <h2 className="text-xl font-bold text-slate-900">{selectedMesa.identificacao}</h2>
              </div>
              <span className="px-3 py-1 bg-slate-200 rounded-lg text-sm font-bold text-slate-700">Taxa: {selectedMesa.taxa_servico}%</span>
            </div>
            
            <div className="flex-1 overflow-y-auto p-4 space-y-3 bg-slate-50/50">
              {(selectedMesa.items || []).map((item: any) => (
                <div key={item.id} className="bg-white border text-sm border-slate-200 rounded-xl p-3 flex gap-3 items-center shadow-sm relative">
                  <div className="flex-1">
                    <h4 className="font-bold text-slate-800 leading-tight mb-1">{item.nome}</h4>
                    <div className="font-medium text-slate-500">R$ {formatMoney(item.preco_venda)}</div>
                  </div>
                  <div className="flex flex-col items-end gap-2">
                    <div className="font-black text-slate-900">R$ {formatMoney(item.subtotal)}</div>
                    <div className="flex items-center gap-1 bg-slate-100 rounded-lg border border-slate-200 p-0.5">
                      <button onClick={() => updateItemQty(item.id, -1)} className="p-1 hover:bg-white rounded-md text-slate-600">
                        <Minus className="w-4 h-4" />
                      </button>
                      <span className="w-8 text-center font-bold text-slate-800 text-sm select-none">
                        {item.quantidade}
                      </span>
                      <button onClick={() => updateItemQty(item.id, 1)} className="p-1 hover:bg-white rounded-md text-slate-600">
                        <Plus className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                </div>
              ))}
              {(selectedMesa.items || []).length === 0 && (
                <div className="text-center py-12 text-slate-400">
                  <ShoppingCart className="w-12 h-12 mx-auto mb-3 opacity-20" />
                  <p>A mesa está vazia</p>
                </div>
              )}
            </div>

            <div className="p-4 border-t border-slate-200 bg-white">
               <button 
                  onClick={() => setIsAddingItems(true)}
                  className="w-full py-4 border-2 border-dashed border-indigo-200 text-indigo-600 font-bold rounded-xl hover:bg-indigo-50 hover:border-indigo-400 transition-all flex items-center justify-center gap-2"
                >
                  <Plus className="w-5 h-5" /> Adicionar Produtos
                </button>
            </div>
          </div>

          {/* Right Panel: Totals & Actions */}
          <div className="w-full lg:w-96 bg-white rounded-2xl shadow-sm border border-slate-200 flex flex-col overflow-hidden shrink-0">
            <div className="p-6 flex-1 flex flex-col">
              <h3 className="text-lg font-bold text-slate-900 mb-6 border-b pb-4">Resumo da Conta</h3>
              
              <div className="space-y-4 mb-6 flex-1">
                <div className="flex justify-between text-slate-600 font-medium pb-2 border-b border-dashed">
                  <span>Subtotal Itens</span>
                  <span>R$ {formatMoney(calculateTotals().subtotal)}</span>
                </div>
                <div className="flex justify-between text-slate-600 font-medium pb-4 border-b border-dashed">
                  <span>Taxa de Serviço ({selectedMesa.taxa_servico}%)</span>
                  <span>R$ {formatMoney(calculateTotals().service)}</span>
                </div>
                <div className="flex justify-between items-center bg-slate-50 -mx-6 px-6 py-4">
                  <span className="text-sm font-bold text-slate-500 uppercase tracking-widest">Total Geral</span>
                  <span className="text-4xl font-black text-indigo-600">R$ {formatMoney(calculateTotals().total + discount)}</span>
                </div>
              </div>

              <div className="space-y-3 mt-auto">
                 <button 
                  onClick={() => {
                    setSplitCount(1);
                    setIsSplitModalOpen(true);
                  }}
                  className="w-full bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold py-4 rounded-xl transition-all flex items-center justify-center gap-2"
                >
                  <Printer className="w-5 h-5" /> Emitir Pré-Conta
                </button>
                <button 
                  onClick={() => setIsFinishing(true)}
                  className="w-full bg-emerald-500 hover:bg-emerald-600 text-white font-bold py-4 rounded-xl transition-all shadow-lg flex items-center justify-center gap-2"
                >
                  <CreditCard className="w-5 h-5" /> Receber Pagamento
                </button>
              </div>
            </div>
          </div>

        </div>
      )}

      {/* Add Products Modal/Panel overlay */}
      <AnimatePresence>
        {isAddingItems && (
           <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
             <motion.div 
               initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
               className="absolute inset-0 bg-slate-900/40 backdrop-blur-sm"
               onClick={() => setIsAddingItems(false)}
             />
             <motion.div 
               initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.95 }}
               className="bg-white flex flex-col w-full max-w-3xl h-[80vh] rounded-2xl shadow-2xl relative z-10 overflow-hidden"
             >
               <div className="p-4 border-b border-slate-100 flex items-center gap-4 bg-slate-50">
                 <div className="relative flex-1">
                   <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 w-5 h-5" />
                   <input 
                     type="text" autoFocus
                     placeholder="Buscar no cardápio..." 
                     value={productSearchTerm}
                     onChange={e => setProductSearchTerm(e.target.value)}
                     className="w-full bg-white border border-slate-200 rounded-xl py-3 pl-10 pr-4 focus:ring-2 focus:ring-indigo-500"
                   />
                 </div>
                 <button onClick={() => setIsAddingItems(false)} className="bg-slate-200 p-3 rounded-xl hover:bg-slate-300">
                    <X className="w-5 h-5 text-slate-700" />
                 </button>
               </div>
               
               <div className="flex-1 overflow-y-auto p-4 bg-slate-100">
                  <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                    {filteredProdutos.map(produto => (
                      <button 
                        key={produto.id}
                        onClick={() => addProductToMesa(produto)}
                        className="bg-white p-4 rounded-xl shadow-sm border border-slate-200 hover:border-indigo-500 transition-all text-left flex flex-col justify-between h-28 active:scale-95"
                      >
                         <h3 className="font-bold text-slate-800 line-clamp-2 leading-tight text-sm">{produto.nome}</h3>
                         <span className="font-black text-indigo-600 mt-2">R$ {formatMoney(produto.preco_venda)}</span>
                      </button>
                    ))}
                    {filteredProdutos.length === 0 && (
                      <div className="col-span-full py-10 text-center text-slate-400">Nenhum produto encontrado</div>
                    )}
                  </div>
               </div>
             </motion.div>
           </div>
        )}
      </AnimatePresence>

      {/* New Mesa Modal */}
      <AnimatePresence>
        {isNewMesaModalOpen && (
          <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
            <motion.div 
              initial={{ bgOpacity: 0 }} animate={{ bgOpacity: 1 }} exit={{ bgOpacity: 0 }}
              className="absolute inset-0 bg-slate-900/40 backdrop-blur-sm"
              onClick={() => setIsNewMesaModalOpen(false)}
            />
            <motion.div 
              initial={{ opacity: 0, y: 50 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 50 }}
              className="bg-white w-full max-w-md rounded-2xl shadow-xl relative z-10"
            >
              <form onSubmit={handleOpenMesa}>
                <div className="p-6 border-b border-slate-100 flex items-center justify-between">
                  <h3 className="text-xl font-bold text-slate-900">Abrir Nova Mesa</h3>
                  <button type="button" onClick={() => setIsNewMesaModalOpen(false)} className="text-slate-400 hover:text-slate-600"><X className="w-5 h-5" /></button>
                </div>
                <div className="p-6 space-y-4">
                  <div>
                    <label className="block text-sm font-semibold text-slate-700 mb-1">Identificação (Nome da mesa ou cliente)</label>
                    <input autoFocus required type="text" value={newMesaData.identificacao} onChange={e => setNewMesaData({...newMesaData, identificacao: e.target.value})} className="w-full border border-slate-300 rounded-lg px-4 py-2" placeholder="Ex: Mesa 12, Comanda 45" />
                  </div>
                  <div>
                    <label className="block text-sm font-semibold text-slate-700 mb-1">Taxa de Serviço (%)</label>
                    <input required type="number" min="0" step="0.1" value={newMesaData.taxa_servico} onChange={e => setNewMesaData({...newMesaData, taxa_servico: parseFloat(e.target.value) || 0})} className="w-full border border-slate-300 rounded-lg px-4 py-2" />
                  </div>
                </div>
                <div className="p-6 bg-slate-50 rounded-b-2xl flex gap-3 justify-end">
                  <button type="button" onClick={() => setIsNewMesaModalOpen(false)} className="px-6 py-2 text-slate-600 font-bold hover:bg-slate-200 rounded-xl">Cancelar</button>
                  <button 
                    type="submit" 
                    disabled={isOpeningMesa}
                    className={`px-6 py-2 text-white font-bold rounded-xl transition-all ${isOpeningMesa ? 'bg-indigo-400 cursor-not-allowed' : 'bg-indigo-600 hover:bg-indigo-700'}`}
                  >
                    {isOpeningMesa ? 'Abrindo...' : 'Abrir Mesa'}
                  </button>
                </div>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Payment Modal */}
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
                 Finalizar Mesa
               </h3>
               <button onClick={() => setIsFinishing(false)} className="text-slate-400 hover:text-slate-600"><X className="w-6 h-6" /></button>
                 <div className="p-6 space-y-4">
                <div className="bg-indigo-50 p-4 rounded-xl flex justify-between items-center text-indigo-900 font-medium">
                  <span>Subtotal + Taxa</span>
                  <span>R$ {formatMoney(calculateTotals().subtotal + calculateTotals().service)}</span>
                </div>
               
                <div>
                   <label className="block text-sm font-bold text-slate-700 mb-1">Desconto R$</label>
                   <input type="number" min="0" step="0.01" value={discount === 0 ? '' : discount} onChange={e => setDiscount(parseFloat(e.target.value) || 0)} className="w-full border border-slate-300 rounded-lg px-4 py-3 bg-white" placeholder="0,00" />
                </div>

                <div className="text-center py-4 border-b border-dashed">
                  <p className="text-slate-500 font-medium mb-1">Total a Pagar</p>
                  <p className="text-4xl font-black text-slate-900 tracking-tight">R$ {formatMoney(calculateTotals().total)}</p>
                </div>

                <div className="space-y-3">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
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
                  <div className="space-y-2 mt-4 max-h-40 overflow-y-auto pr-1">
                    {pagamentos.map((p, idx) => (
                      <div key={idx} className="flex justify-between items-center bg-slate-50 p-3 rounded-lg border border-slate-100 text-xs">
                        <div>
                          <span className="font-bold text-slate-700">{p.nome}</span>
                          <span className="text-slate-500 ml-2">{p.parcelas}x</span>
                        </div>
                        <div className="flex items-center gap-3">
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
                   <span className={`font-bold ${calculateTotals().total - pagamentos.reduce((acc, p) => acc + p.valor, 0) < 0.01 ? 'text-emerald-500' : 'text-rose-500'}`}>
                     R$ {formatMoney(Math.max(0, calculateTotals().total - pagamentos.reduce((acc, p) => acc + p.valor, 0)))}
                   </span>
                  </div>
                </div>

                <button 
                  onClick={handleFinishMesa}
                  disabled={calculateTotals().total - pagamentos.reduce((acc, p) => acc + p.valor, 0) > 0.01}
                  className="w-full mt-4 bg-emerald-500 disabled:bg-slate-300 hover:bg-emerald-600 text-white font-bold py-4 rounded-xl transition-all shadow-lg"
                >
                  Confirmar Pagamento
                </button>
              </div>
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
                <p className="text-slate-500 font-medium">O que deseja fazer com o recibo?</p>
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
                  Fechar sem imprimir
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Toast Notification */}
      <AnimatePresence>
        {showAddedToast && (
          <motion.div 
            initial={{ opacity: 0, y: 50, scale: 0.9 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 20, scale: 0.9 }}
            className="fixed bottom-6 right-6 bg-slate-900 text-white px-6 py-4 rounded-xl shadow-2xl z-[70] flex items-center gap-3"
          >
            <div className="bg-emerald-500 rounded-full p-1 border-2 border-emerald-400">
              <CheckCircle className="w-5 h-5 text-white" />
            </div>
            <div>
              <p className="font-bold text-sm leading-tight">Produto Adicionado</p>
              <p className="text-slate-300 text-xs truncate max-w-[200px]">{showAddedToast}</p>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Split/Print Modal */}
      <AnimatePresence>
        {isSplitModalOpen && (
          <div className="fixed inset-0 z-[70] flex items-center justify-center p-4">
            <motion.div 
              initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              className="absolute inset-0 bg-slate-900/60 backdrop-blur-sm"
              onClick={() => setIsSplitModalOpen(false)}
            />
            <motion.div 
              initial={{ opacity: 0, y: 50, scale: 0.9 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, y: 50, scale: 0.9 }}
              className="bg-white w-full max-w-sm rounded-2xl shadow-xl relative z-10 overflow-hidden"
            >
              <div className="p-6 border-b border-slate-100 flex items-center justify-between">
                <h3 className="text-xl font-bold text-slate-900 flex items-center gap-2">
                  <Printer className="w-5 h-5 text-indigo-600" />
                  Emitir Pré-Conta
                </h3>
                <button type="button" onClick={() => setIsSplitModalOpen(false)} className="text-slate-400 hover:text-slate-600"><X className="w-5 h-5" /></button>
              </div>

              <div className="p-6 space-y-6">
                <div>
                  <label className="block text-sm font-bold text-slate-700 mb-3 text-center">Dividir conta por quantas pessoas?</label>
                  <div className="flex items-center justify-center gap-4">
                    <button 
                      onClick={() => setSplitCount(Math.max(1, splitCount - 1))}
                      className="w-12 h-12 rounded-full bg-slate-100 text-slate-600 font-bold hover:bg-slate-200 flex items-center justify-center transition-all"
                    >
                      <Minus className="w-5 h-5" />
                    </button>
                    <div className="text-4xl font-black text-slate-900 w-16 text-center">{splitCount}</div>
                    <button 
                      onClick={() => setSplitCount(splitCount + 1)}
                      className="w-12 h-12 rounded-full bg-slate-100 text-slate-600 font-bold hover:bg-slate-200 flex items-center justify-center transition-all"
                    >
                      <Plus className="w-5 h-5" />
                    </button>
                  </div>
                </div>

                <div className="bg-indigo-50 rounded-xl p-4 text-center">
                  <p className="text-sm font-semibold text-indigo-900 mb-1">Total por pessoa</p>
                  <p className="text-3xl font-black text-indigo-600">R$ {formatMoney(calculateTotals().total / Math.max(1, splitCount))}</p>
                </div>

                <div className="space-y-3 pt-2">
                  <button 
                    onClick={() => { handlePrintPre('whatsapp'); setIsSplitModalOpen(false); }}
                    className="w-full bg-[#25D366] hover:bg-[#128C7E] text-white font-bold py-3 px-4 rounded-xl transition-all flex items-center justify-center gap-2 shadow-md"
                  >
                    <MessageCircle className="w-5 h-5" /> Enviar por WhatsApp
                  </button>
                  <button 
                    onClick={() => { handlePrintPre('print'); setIsSplitModalOpen(false); }}
                    className="w-full bg-slate-800 hover:bg-slate-900 text-white font-bold py-3 px-4 rounded-xl transition-all flex items-center justify-center gap-2 shadow-md"
                  >
                    <Printer className="w-5 h-5" /> Imprimir Cupom (57mm)
                  </button>
                </div>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

    </div>
  );
}
