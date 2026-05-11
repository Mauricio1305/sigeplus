import React, { useState, useEffect } from 'react';
import { Plus, Search, Edit2, X, Save } from 'lucide-react';
import { motion } from 'motion/react';
import { useAuthStore } from '../store/authStore';
import { formatMoney } from '../utils/format';

export const Inventory = () => {
  const [products, setProducts] = useState<any[]>([]);
  const [groups, setGroups] = useState<any[]>([]);
  const [layouts, setLayouts] = useState<any[]>([]);
  const [itemsToPrint, setItemsToPrint] = useState<{product: any, quantity: number}[]>([]);
  const [selectedLayoutId, setSelectedLayoutId] = useState<string>('');
  const [selectedProductId, setSelectedProductId] = useState<string>('');
  const [printQuantity, setPrintQuantity] = useState<number>(1);
  const [isUploading, setIsUploading] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [activeTab, setActiveTab] = useState<'lista' | 'etiquetas'>('lista');
  const [searchTerm, setSearchTerm] = useState('');
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingProduct, setEditingProduct] = useState<any>(null);
  const [newProduct, setNewProduct] = useState<any>({
    nome: '', tipo: 'produto', unidade: 'UN', custo: '', preco_venda: '', estoque_atual: '', estoque_minimo: '', categoria: '', codigo_barras: '', ativo: true, grupo_id: '', foto: '', marca: ''
  });
  const token = useAuthStore(state => state.token);

  const fetchProducts = () => {
    fetch('/api/products', {
      headers: { 'Authorization': `Bearer ${token}` }
    })
    .then(res => {
      if (res.status === 401) {
        useAuthStore.getState().logout();
        throw new Error("Unauthorized");
      }
      return res.json();
    })
    .then(data => {
      if (Array.isArray(data)) {
        setProducts(data);
      } else {
        console.error("products API returned non-array:", data);
        setProducts([]);
      }
    })
    .catch(err => {
      console.error("Error fetching products:", err);
      setProducts([]);
    });
  };

  const fetchLabelLayouts = () => {
    fetch('/api/inventory/layouts', { headers: { 'Authorization': `Bearer ${token}` } })
      .then(res => res.json())
      .then(data => {
        setLayouts(data);
        if (data.length > 0 && !selectedLayoutId) setSelectedLayoutId(data[0].id.toString());
      })
      .catch(console.error);
  };

  useEffect(() => {
    fetchProducts();
    fetch('/api/inventory/groups', { headers: { 'Authorization': `Bearer ${token}` } })
      .then(res => res.json())
      .then(setGroups)
      .catch(console.error);
    fetchLabelLayouts();
  }, [token]);

  const handleAddItemToPrint = (e: React.MouseEvent) => {
    e.preventDefault();
    if (!selectedProductId) return;
    const product = products.find(p => String(p.id) === String(selectedProductId));
    if (product) {
      setItemsToPrint([...itemsToPrint, { product, quantity: printQuantity }]);
      setSelectedProductId('');
      setPrintQuantity(1);
    } else {
      console.warn("Produto não encontrado para o ID:", selectedProductId);
    }
  };

  const handleRemoveItemToPrint = (index: number) => {
    const newItems = [...itemsToPrint];
    newItems.splice(index, 1);
    setItemsToPrint(newItems);
  };

  const handlePrintLabels = () => {
    if (itemsToPrint.length === 0) return alert("Adicione produtos para imprimir.");
    if (!selectedLayoutId) return alert("Selecione um layout de etiqueta.");

    const layout = layouts.find(l => l.id.toString() === selectedLayoutId);
    if (!layout) return;

    // Handle potential stringified JSON
    let config = layout.json_config;
    if (typeof config === 'string') {
      try { config = JSON.parse(config); } catch(e) { config = {}; }
    }

    const fieldsData = config?.fields;
    const margins = config?.margins || { top: 1, left: 1, right: 1, bottom: 1 };
    const spacing = config?.spacing || 0.5;
    const columnGap = config?.column_gap || 0;
    const rowGap = config?.row_gap || 0;

    const fields = {
      showNome: fieldsData?.showNome ?? true,
      showPreco: fieldsData?.showPreco ?? true,
      showBarcode: fieldsData?.showBarcode ?? true,
      showMarca: fieldsData?.showMarca ?? false,
      showId: fieldsData?.showId ?? false,
      showGrupo: fieldsData?.showGrupo ?? false,
    };
    
    const printWindow = window.open('', '_blank');
    if (!printWindow) return alert("Pop-ups bloqueados. Favor permitir para imprimir.");

    // Dynamic sizing helper (values in mm) - More conservative for small labels
    const h = parseFloat(layout.altura.toString());
    const w = parseFloat(layout.largura.toString());
    
    const availableHeight = h - margins.top - margins.bottom;
    const availableWidth = w - margins.left - margins.right;

    const fontSizeNome = Math.max(1.0, Math.min(3.0, availableHeight * 0.16)); 
    const fontSizeMarca = Math.max(0.8, Math.min(2.5, availableHeight * 0.10));
    const fontSizePreco = Math.max(2.4, Math.min(6.5, availableHeight * 0.38));
    const fontSizeBarcode = Math.max(2.5, Math.min(10.0, availableHeight * 0.42));

    let labelsHtml = '';
    itemsToPrint.forEach(item => {
      for (let i = 0; i < item.quantity; i++) {
        labelsHtml += `
          <div class="label" style="width: ${w}mm; height: ${h}mm; box-sizing: border-box; padding: ${margins.top}mm ${margins.right}mm ${margins.bottom}mm ${margins.left}mm; overflow: hidden; position: relative; display: flex; flex-direction: column; align-items: center; font-family: 'Inter', sans-serif; text-align: center; justify-content: flex-start;">
            <div style="width: 100%; display: flex; flex-direction: column; align-items: center; flex-grow: 1; justify-content: center; gap: ${spacing}mm; overflow: hidden;">
              ${fields.showNome ? `<div style="font-weight: 800; font-size: ${fontSizeNome}mm; width: 100%; white-space: normal; line-height: 1.0; margin-bottom: 0.3mm; word-wrap: break-word; display: block;">${item.product.nome}</div>` : ''}
              <div style="display: flex; flex-direction: column; align-items: center; gap: 0.1mm;">
                ${fields.showMarca && item.product.marca ? `<div style="font-size: ${fontSizeMarca}mm; font-weight: 600; opacity: 0.8; line-height: 1;">${item.product.marca}</div>` : ''}
                ${fields.showGrupo && item.product.grupo_nome ? `<div style="font-size: ${fontSizeMarca * 0.8}mm; opacity: 0.6; line-height: 1;">${item.product.grupo_nome}</div>` : ''}
              </div>
              
              ${fields.showBarcode && item.product.codigo_barras ? `
                <div style="width: 100%; display: flex; flex-direction: column; align-items: center; justify-content: center; overflow: hidden; flex-grow: 1;">
                  <div style="font-family: 'Libre Barcode 39', cursive; font-size: ${fontSizeBarcode}mm; line-height: 0.8; margin: 0; padding: 0; transform: scaleX(1.05);">*${item.product.codigo_barras}*</div>
                  <div style="font-size: ${fontSizeBarcode * 0.22}mm; font-family: monospace; letter-spacing: 0.4mm; margin-top: -0.1mm; font-weight: bold;">${item.product.codigo_barras}</div>
                </div>
              ` : '<div style="flex-grow: 1;"></div>'}
            </div>

            <div style="display: flex; justify-content: space-between; width: 100%; align-items: flex-end; padding: 0; margin-top: auto;">
              ${fields.showId ? `<span style="font-size: ${fontSizeNome * 0.7}mm; color: #444; font-weight: bold;">ID: ${item.product.id}</span>` : '<span></span>'}
              ${fields.showPreco ? `<span style="font-weight: 900; font-size: ${fontSizePreco}mm; color: #000; line-height: 0.9;">R$ ${formatMoney(item.product.preco_venda)}</span>` : ''}
            </div>
          </div>
        `;
      }
    });

    const columns = layout.colunas || 1;
    
    printWindow.document.write(`
      <html>
        <head>
          <title>Etiquetas - ${layout.nome}</title>
          <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;600;800;900&family=Libre+Barcode+39&display=swap" rel="stylesheet">
          <style>
            @page { 
              margin: 0; 
              size: auto;
            }
            body { 
              margin: 0; 
              padding: 0; 
              background: #f8fafc;
              -webkit-print-color-adjust: exact;
              print-color-adjust: exact;
            }
            .container { 
              display: grid; 
              grid-template-columns: repeat(${columns}, ${layout.largura}mm);
              column-gap: ${columnGap}mm;
              row-gap: ${rowGap}mm;
              padding: 0;
              margin: 0;
              width: fit-content;
            }
            .label { 
              page-break-inside: avoid; 
              background: white; 
              position: relative;
              box-sizing: border-box;
            }
            @media print {
              body { background: white; }
              .no-print { display: none !important; }
              .container { display: grid !important; }
            }
          </style>
        </head>
        <body>
          <div class="no-print" style="position: sticky; top: 0; left: 0; right: 0; padding: 20px; background: #1e293b; color: white; border-bottom: 2px solid #334155; text-align: center; z-index: 1000; font-family: 'Inter', sans-serif;">
            <button onclick="window.print()" style="padding: 12px 30px; font-weight: 800; background: #4f46e5; color: white; border: none; border-radius: 14px; cursor: pointer; font-size: 14px; box-shadow: 0 10px 15px -3px rgba(79, 70, 229, 0.4); text-transform: uppercase; letter-spacing: 0.05em;">Imprimir ou Salvar PDF</button>
            <div style="font-size: 12px; margin-top: 12px; opacity: 0.8; font-weight: 500;">
              Importante: Nas opções de impressão, defina <b>Margens</b> como <b>"Nenhuma"</b> e habilite <b>"Gráficos de segundo plano"</b>.
            </div>
          </div>
          <div class="container">
            ${labelsHtml}
          </div>
        </body>
      </html>
    `);
    printWindow.document.close();
  };

  const handleAdd = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isSaving) return;
    setIsSaving(true);
    try {
      const url = editingProduct ? `/api/products/${editingProduct.id}` : '/api/products';
      const method = editingProduct ? 'PUT' : 'POST';
      
      const res = await fetch(url, {
        method,
        headers: { 
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({
          ...newProduct,
          custo: newProduct.custo || 0,
          preco_venda: newProduct.preco_venda || 0,
          estoque_atual: newProduct.estoque_atual || 0,
          estoque_minimo: newProduct.estoque_minimo || 0
        })
      });

      if (res.status === 401) {
        useAuthStore.getState().logout();
        return;
      }

      if (res.ok) {
        setIsModalOpen(false);
        setEditingProduct(null);
        setNewProduct({
          nome: '', tipo: 'produto', unidade: 'UN', custo: '', preco_venda: '', estoque_atual: '', estoque_minimo: '', categoria: '', codigo_barras: '', ativo: true, grupo_id: '', foto: '', marca: ''
        });
        fetchProducts();
      } else {
        const data = await res.json();
        alert(data.error || 'Erro ao salvar produto');
      }
    } catch (err: any) {
      console.error("Error saving product:", err);
      alert("Erro ao salvar produto: " + err.message);
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-bold text-slate-900">Estoque</h1>
          <p className="text-slate-500">Gerencie seus produtos e serviços.</p>
        </div>
        <div className="flex gap-4 items-center">
          <div className="bg-white p-1 rounded-xl shadow-sm border border-slate-100 flex">
            <button 
              onClick={() => setActiveTab('lista')} 
              className={`px-4 py-2 rounded-lg font-bold text-sm transition-all ${activeTab === 'lista' ? 'bg-indigo-600 text-white' : 'text-slate-500 hover:bg-slate-50'}`}
            >
              Lista
            </button>
            <button 
              onClick={() => setActiveTab('etiquetas')} 
              className={`px-4 py-2 rounded-lg font-bold text-sm transition-all ${activeTab === 'etiquetas' ? 'bg-indigo-600 text-white' : 'text-slate-500 hover:bg-slate-50'}`}
            >
              Etiquetas
            </button>
          </div>
          <button 
            onClick={() => {
              setEditingProduct(null);
              setNewProduct({
                nome: '', tipo: 'produto', unidade: 'UN', custo: '', preco_venda: '', estoque_atual: '', estoque_minimo: '', categoria: '', codigo_barras: '', ativo: true, grupo_id: '', foto: ''
              });
              setIsModalOpen(true);
            }}
            className="bg-indigo-600 text-white px-6 py-2 rounded-xl font-bold flex items-center gap-2 hover:bg-indigo-700 transition-all shadow-lg shadow-indigo-200"
          >
            <Plus className="w-5 h-5" />
            Novo Item
          </button>
        </div>
      </div>

      {activeTab === 'lista' && (
      <div className="bg-white rounded-2xl shadow-sm border border-slate-100 overflow-hidden">
        <div className="p-4 border-b border-slate-100 flex gap-4">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 w-5 h-5" />
            <input 
              type="text" 
              placeholder="Buscar por Código, Nome ou Cód. Barras..." 
              className="w-full pl-10 pr-4 py-2 rounded-lg border border-slate-200 focus:ring-2 focus:ring-indigo-500 outline-none"
              value={searchTerm}
              onChange={e => setSearchTerm(e.target.value)}
            />
          </div>
        </div>
        <table className="w-full text-left">
          <thead className="bg-slate-50 text-slate-500 text-sm uppercase tracking-wider">
            <tr>
              <th className="px-6 py-4 font-semibold">Cód.</th>
              <th className="px-6 py-4 font-semibold">Cód. Barras</th>
              <th className="px-6 py-4 font-semibold">Nome</th>
              <th className="px-6 py-4 font-semibold">Tipo</th>
              <th className="px-6 py-4 font-semibold text-right">Preço</th>
              <th className="px-6 py-4 font-semibold text-right">Estoque</th>
              <th className="px-6 py-4 font-semibold text-center">Status</th>
              <th className="px-6 py-4 font-semibold text-right">Ações</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {products.filter(p => {
              const term = searchTerm.toLowerCase();
              return (
                p.nome.toLowerCase().includes(term) ||
                p.id.toString().includes(term) ||
                (p.codigo_barras && p.codigo_barras.toLowerCase().includes(term))
              );
            }).map(p => (
              <tr key={p.id} className="hover:bg-slate-50 transition-colors">
                <td className="px-6 py-4 font-medium text-slate-500 text-xs">#{p.id}</td>
                <td className="px-6 py-4 text-slate-600 font-mono text-xs">{p.codigo_barras || '-'}</td>
                <td className="px-6 py-4 font-medium text-slate-900">{p.nome}</td>
                <td className="px-6 py-4">
                  <span className={`px-2 py-1 rounded-md text-xs font-bold uppercase ${p.tipo === 'produto' ? 'bg-blue-100 text-blue-700' : 'bg-purple-100 text-purple-700'}`}>
                    {p.tipo}
                  </span>
                </td>
                <td className="px-6 py-4 text-right font-medium text-slate-900">R$ {formatMoney(p.preco_venda)}</td>
                <td className={`px-6 py-4 text-right font-bold ${p.estoque_atual <= p.estoque_minimo ? 'text-rose-600' : 'text-slate-900'}`}>
                  {p.estoque_atual} {p.unidade}
                </td>
                <td className="px-6 py-4 text-center">
                  <span className={`px-2 py-1 text-[10px] font-bold rounded uppercase ${p.ativo ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-100 text-slate-500'}`}>
                    {p.ativo ? 'Ativo' : 'Inativo'}
                  </span>
                </td>
                <td className="px-6 py-4 text-right">
                  <button 
                    onClick={() => {
                      setEditingProduct(p);
                      setNewProduct({ 
                        ...p, 
                        ativo: !!p.ativo,
                        grupo_id: p.grupo_id || '',
                        foto: p.foto || '',
                        marca: p.marca || ''
                      });
                      setIsModalOpen(true);
                    }}
                    className="text-indigo-600 hover:text-indigo-900 transition-colors"
                  >
                    <Edit2 className="w-5 h-5" />
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      )}

      {activeTab === 'etiquetas' && (
      <div className="bg-white rounded-2xl shadow-sm border border-slate-100 p-6">
        <h2 className="text-xl font-bold mb-6 text-slate-800">Impressão de Etiquetas em Lote</h2>
        <div className="space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-12 gap-4">
            <div className="md:col-span-4">
              <label className="block text-sm font-semibold text-slate-700 mb-1.5">1. Selecione o Layout</label>
              <select 
                className="w-full px-4 py-2.5 rounded-xl border border-slate-200 focus:ring-2 focus:ring-indigo-500 outline-none bg-slate-50/50"
                value={selectedLayoutId}
                onChange={e => setSelectedLayoutId(e.target.value)}
              >
                <option value="">Selecione um layout...</option>
                {layouts.map(l => (
                  <option key={l.id} value={l.id}>{l.nome} ({l.largura}x{l.altura}mm)</option>
                ))}
              </select>
            </div>
            <div className="md:col-span-8">
              <label className="block text-sm font-semibold text-slate-700 mb-1.5">2. Selecione o Produto</label>
              <div className="flex flex-col sm:flex-row gap-3">
                <select 
                  className="flex-1 px-4 py-2.5 rounded-xl border border-slate-200 focus:ring-2 focus:ring-indigo-500 outline-none bg-slate-50/50 min-w-0"
                  value={selectedProductId}
                  onChange={e => setSelectedProductId(e.target.value)}
                >
                   <option value="">Pesquisar produto na lista...</option>
                   {products.filter(p => p.tipo === 'produto').map(p => (
                     <option key={p.id} value={p.id}>{p.nome} (Estoque: {p.estoque_atual})</option>
                   ))}
                </select>
                <div className="flex gap-2 shrink-0">
                  <input 
                    type="number" 
                    className="w-24 px-4 py-2.5 rounded-xl border border-slate-200 focus:ring-2 focus:ring-indigo-500 outline-none text-center font-bold" 
                    placeholder="Qtd" 
                    min="1" 
                    value={printQuantity}
                    onChange={e => setPrintQuantity(Math.max(1, parseInt(e.target.value) || 1))}
                  />
                  <button 
                    onClick={handleAddItemToPrint}
                    className="bg-indigo-600 text-white px-6 py-2.5 rounded-xl font-bold hover:bg-indigo-700 transition-all shadow-md shadow-indigo-100 flex items-center gap-2 whitespace-nowrap"
                  >
                    <Plus className="w-5 h-5" />
                    Adicionar
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>

        <div className="mt-8">
          <div className="flex justify-between items-center mb-4">
            <h3 className="font-bold text-slate-800">Itens para Imprimir ({itemsToPrint.reduce((acc, i) => acc + i.quantity, 0)} etiquetas)</h3>
            {itemsToPrint.length > 0 && (
              <button onClick={() => setItemsToPrint([])} className="text-rose-600 text-xs font-bold hover:underline">Limpar Lista</button>
            )}
          </div>
          <div className="border border-slate-200 rounded-xl overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="bg-slate-50">
                <tr>
                  <th className="p-3">Produto</th>
                  <th className="p-3 text-center w-32">Quantidade</th>
                  <th className="p-3 text-right w-16"></th>
                </tr>
              </thead>
              <tbody>
                {itemsToPrint.length === 0 ? (
                  <tr>
                    <td colSpan={3} className="p-8 text-center text-slate-500 italic">
                      Nenhum item adicionado para impressão. Selecione um produto acima para começar.
                    </td>
                  </tr>
                ) : (
                  itemsToPrint.map((item, idx) => (
                    <tr key={idx} className="border-t border-slate-100 hover:bg-slate-50">
                      <td className="p-3">
                        <div className="font-bold text-slate-900 leading-tight break-words max-w-[200px] sm:max-w-md" title={item.product.nome}>{item.product.nome}</div>
                        <div className="text-[10px] text-slate-400 mt-1">ID: #{item.product.id} | Código: {item.product.codigo_barras || '-'}</div>
                      </td>
                      <td className="p-3">
                        <div className="flex items-center justify-center gap-2">
                           <input 
                            type="number" 
                            className="w-16 px-2 py-1 rounded border border-slate-200 text-center" 
                            value={item.quantity}
                            onChange={e => {
                              const newItems = [...itemsToPrint];
                              newItems[idx].quantity = Math.max(1, parseInt(e.target.value) || 1);
                              setItemsToPrint(newItems);
                            }}
                           />
                        </div>
                      </td>
                      <td className="p-3 text-right">
                        <button onClick={() => handleRemoveItemToPrint(idx)} className="text-rose-600 hover:bg-rose-50 p-2 rounded-lg transition-all">
                          <X className="w-4 h-4" />
                        </button>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
          <div className="mt-6 flex justify-end">
            <button 
              onClick={handlePrintLabels}
              disabled={itemsToPrint.length === 0}
              className="bg-emerald-600 text-white px-8 py-3 rounded-xl font-bold hover:bg-emerald-700 transition-all shadow-lg shadow-emerald-100 disabled:opacity-50 disabled:shadow-none"
            >
              Gerar Etiquetas para Impressão
            </button>
          </div>
        </div>
      </div>
      )}

      {isModalOpen && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-md flex items-center justify-center p-4 z-50">
          <motion.div 
            initial={{ scale: 0.95, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            className="bg-white w-full max-w-2xl rounded-3xl shadow-2xl flex flex-col max-h-[92vh] overflow-hidden"
          >
            <div className="flex justify-between items-center p-6 border-b border-slate-100 bg-white shrink-0">
              <h2 className="text-xl font-bold text-slate-800">{editingProduct ? 'Editar Item' : 'Novo Cadastro'}</h2>
              <button 
                onClick={() => { setIsModalOpen(false); setEditingProduct(null); }}
                className="text-slate-400 hover:text-slate-600 p-2 rounded-xl transition-colors"
              >
                <X className="w-6 h-6" />
              </button>
            </div>
            
            <form onSubmit={handleAdd} className="flex flex-col flex-grow overflow-hidden">
              <div className="p-6 overflow-y-auto grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="col-span-2 md:col-span-1">
                  <label className="block text-sm font-semibold text-slate-700 mb-1">Código de Barras (EAN13)</label>
                  <input 
                    type="text" 
                    maxLength={13}
                    className="w-full px-4 py-2 rounded-xl border border-slate-200 focus:ring-2 focus:ring-indigo-500 outline-none transition-all"
                    value={newProduct.codigo_barras || ''}
                    onChange={e => {
                      const val = e.target.value.replace(/\D/g, '').slice(0, 13);
                      setNewProduct({...newProduct, codigo_barras: val});
                    }}
                    placeholder="Máximo 13 dígitos"
                  />
                </div>
                {editingProduct && (
                  <div className="col-span-2 md:col-span-1">
                    <label className="block text-sm font-semibold text-slate-500 mb-1">Cód. Interno (ID)</label>
                    <input 
                      type="text" 
                      readOnly
                      className="w-full px-4 py-2 rounded-xl border border-slate-100 bg-slate-50 text-slate-500 cursor-not-allowed outline-none"
                      value={editingProduct.id}
                    />
                  </div>
                )}
                <div className="col-span-2">
                  <label className="block text-sm font-semibold text-slate-700 mb-1">Nome do Item *</label>
                  <input 
                    type="text" 
                    required
                    maxLength={255}
                    className="w-full px-4 py-2 rounded-xl border border-slate-200 focus:ring-2 focus:ring-indigo-500 outline-none transition-all"
                    value={newProduct.nome}
                    onChange={e => setNewProduct({...newProduct, nome: e.target.value})}
                    placeholder="Ex: Teclado Mecânico RGB"
                  />
                </div>
              <div>
                <label className="block text-sm font-semibold text-slate-700 mb-1">Tipo</label>
                <select 
                  className="w-full px-4 py-2 rounded-xl border border-slate-200"
                  value={newProduct.tipo}
                  onChange={e => setNewProduct({...newProduct, tipo: e.target.value})}
                >
                  <option value="produto">Produto</option>
                  <option value="servico">Serviço</option>
                </select>
              </div>
              <div>
                <label className="block text-sm font-semibold text-slate-700 mb-1">Unidade</label>
                <input 
                  type="text" 
                  maxLength={20}
                  className="w-full px-4 py-2 rounded-xl border border-slate-200"
                  value={newProduct.unidade}
                  onChange={e => setNewProduct({...newProduct, unidade: e.target.value})}
                  placeholder="UN, KG, etc"
                />
              </div>
              <div className="col-span-2">
                <label className="block text-sm font-semibold text-slate-700 mb-1">Grupo de Produto</label>
                <select 
                  className="w-full px-4 py-2 rounded-xl border border-slate-200 bg-white"
                  value={newProduct.grupo_id || ''}
                  onChange={e => setNewProduct({...newProduct, grupo_id: e.target.value})}
                >
                  <option value="">Nenhum</option>
                  {groups.map(g => (
                    <option key={g.id} value={g.id}>{g.nome}</option>
                  ))}
                </select>
              </div>
              <div className="col-span-2">
                <label className="block text-sm font-semibold text-slate-700 mb-1">Foto do Produto</label>
                <div className="flex items-center gap-4">
                  {newProduct.foto ? (
                    <div className="relative group">
                      <img src={newProduct.foto} alt="Foto" className="h-16 w-16 object-cover rounded-xl border border-slate-200 shadow-sm transition-transform group-hover:scale-105" />
                      <button 
                        type="button" 
                        onClick={() => setNewProduct({ ...newProduct, foto: '' })}
                        className="absolute -top-2 -right-2 bg-rose-500 text-white rounded-full p-1 shadow-md opacity-0 group-hover:opacity-100 transition-opacity"
                      >
                        <X className="w-3 h-3" />
                      </button>
                    </div>
                  ) : (
                    <div className="h-16 w-16 rounded-xl border-2 border-dashed border-slate-200 flex items-center justify-center bg-slate-50 text-slate-400">
                      IMG
                    </div>
                  )}
                  <div className="flex-1">
                    <input 
                      type="file" 
                      accept="image/*"
                      className="w-full px-4 py-2 rounded-xl border border-slate-200 text-sm file:mr-4 file:py-2 file:px-4 file:rounded-full file:border-0 file:text-sm file:font-semibold file:bg-indigo-50 file:text-indigo-700 hover:file:bg-indigo-100 cursor-pointer"
                      disabled={isUploading}
                      onChange={e => {
                        const file = e.target.files?.[0];
                        if (file) {
                          if (file.size > 2 * 1024 * 1024) {
                            return alert("A imagem é muito grande. O limite para o banco de dados é 2MB. Tente uma imagem menor.");
                          }
                          setIsUploading(true);
                          const reader = new FileReader();
                          reader.onloadend = () => {
                            setNewProduct({ ...newProduct, foto: reader.result as string });
                            setIsUploading(false);
                          };
                          reader.onerror = () => {
                            alert("Erro ao ler o arquivo.");
                            setIsUploading(false);
                          };
                          reader.readAsDataURL(file);
                        }
                      }}
                    />
                    {isUploading && <p className="text-xs text-indigo-600 mt-1 font-bold animate-pulse">Processando imagem...</p>}
                    {!isUploading && <p className="text-[10px] text-slate-400 mt-1">Formatos aceitos: JPG, PNG, WEBP. Máx: 2MB.</p>}
                  </div>
                </div>
              </div>
              <div className="col-span-2">
                <label className="block text-sm font-semibold text-slate-700 mb-1">Marca / Fabricante</label>
                <input 
                  type="text" 
                  maxLength={255}
                  className="w-full px-4 py-2 rounded-xl border border-slate-200"
                  value={newProduct.marca || ''}
                  onChange={e => setNewProduct({...newProduct, marca: e.target.value})}
                  placeholder="Ex: Nike, Coca-Cola, etc."
                />
              </div>
              <div>
                <label className="block text-sm font-semibold text-slate-700 mb-1">Custo (R$)</label>
                <input 
                  type="number" 
                  step="any"
                  className="w-full px-4 py-2 rounded-xl border border-slate-200"
                  value={newProduct.custo}
                  onChange={e => setNewProduct({...newProduct, custo: e.target.value === '' ? '' : parseFloat(e.target.value)})}
                />
              </div>
              <div>
                <label className="block text-sm font-semibold text-slate-700 mb-1">Venda (R$)</label>
                <input 
                  type="number" 
                  step="any"
                  className="w-full px-4 py-2 rounded-xl border border-slate-200"
                  value={newProduct.preco_venda}
                  onChange={e => setNewProduct({...newProduct, preco_venda: e.target.value === '' ? '' : parseFloat(e.target.value)})}
                />
              </div>
              <div>
                <label className="block text-sm font-semibold text-slate-700 mb-1">Qtd Atual</label>
                <input 
                  type="number" 
                  step="any"
                  className="w-full px-4 py-2 rounded-xl border border-slate-200"
                  value={newProduct.estoque_atual}
                  onChange={e => setNewProduct({...newProduct, estoque_atual: e.target.value === '' ? '' : parseFloat(e.target.value)})}
                />
              </div>
              <div>
                <label className="block text-sm font-semibold text-slate-700 mb-1">Estoque Mínimo</label>
                <input 
                  type="number" 
                  step="any"
                  className="w-full px-4 py-2 rounded-xl border border-slate-200"
                  value={newProduct.estoque_minimo}
                  onChange={e => setNewProduct({...newProduct, estoque_minimo: e.target.value === '' ? '' : parseFloat(e.target.value)})}
                />
              </div>
              <div className="col-span-2 flex items-center gap-2 py-2">
                <input 
                  type="checkbox" 
                  id="product-ativo" 
                  checked={!!newProduct.ativo} 
                  onChange={e => setNewProduct({...newProduct, ativo: e.target.checked})}
                  className="w-5 h-5 text-indigo-600 border-slate-300 rounded focus:ring-indigo-500 cursor-pointer"
                />
                <label htmlFor="product-ativo" className="text-sm font-bold text-slate-700 cursor-pointer select-none">Cadastro Ativo</label>
              </div>
            </div>
            
            <div className="p-6 border-t border-slate-100 bg-slate-50 shrink-0">
              <button 
                type="submit" 
                disabled={isSaving}
                className="w-full bg-indigo-600 text-white py-3.5 rounded-2xl font-bold shadow-lg shadow-indigo-100 hover:bg-indigo-700 transition-all disabled:opacity-50 flex items-center justify-center gap-2"
              >
                {isSaving ? <span className="animate-spin h-5 w-5 border-2 border-white border-t-transparent rounded-full"></span> : <Save className="w-5 h-5" />}
                {isSaving ? 'Salvando...' : (editingProduct ? 'Atualizar Alterações' : 'Salvar Novo Item')}
              </button>
            </div>
          </form>
        </motion.div>
      </div>
      )}
    </div>
  );
};

export default Inventory;
