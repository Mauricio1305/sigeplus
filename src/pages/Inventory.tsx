import React, { useState, useEffect } from 'react';
import { Plus, Search, Edit2, X } from 'lucide-react';
import { motion } from 'motion/react';
import { useAuthStore } from '../store/authStore';
import { formatMoney } from '../utils/format';

export const Inventory = () => {
  const [products, setProducts] = useState<any[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingProduct, setEditingProduct] = useState<any>(null);
  const [newProduct, setNewProduct] = useState<any>({
    nome: '', tipo: 'produto', unidade: 'UN', custo: '', preco_venda: '', estoque_atual: '', estoque_minimo: '', categoria: '', codigo_barras: '', ativo: true
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

  useEffect(fetchProducts, [token]);

  const handleAdd = async (e: React.FormEvent) => {
    e.preventDefault();
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
          nome: '', tipo: 'produto', unidade: 'UN', custo: '', preco_venda: '', estoque_atual: '', estoque_minimo: '', categoria: '', codigo_barras: '', ativo: true
        });
        fetchProducts();
      } else {
        const data = await res.json();
        alert(data.error || 'Erro ao salvar produto');
      }
    } catch (err: any) {
      console.error("Error saving product:", err);
      alert("Erro ao salvar produto: " + err.message);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-bold text-slate-900">Estoque</h1>
          <p className="text-slate-500">Gerencie seus produtos e serviços.</p>
        </div>
        <button 
          onClick={() => {
            setEditingProduct(null);
            setNewProduct({
              nome: '', tipo: 'produto', unidade: 'UN', custo: '', preco_venda: '', estoque_atual: '', estoque_minimo: '', categoria: '', codigo_barras: '', ativo: true
            });
            setIsModalOpen(true);
          }}
          className="bg-indigo-600 text-white px-6 py-3 rounded-xl font-bold flex items-center gap-2 hover:bg-indigo-700 transition-all shadow-lg shadow-indigo-200"
        >
          <Plus className="w-5 h-5" />
          Novo Item
        </button>
      </div>

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
                      setNewProduct({ ...p, ativo: !!p.ativo });
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

      {isModalOpen && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center p-4 z-50">
          <motion.div 
            initial={{ scale: 0.9, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            className="bg-white w-full max-w-lg rounded-3xl p-8 shadow-2xl"
          >
            <div className="flex justify-between items-center mb-6">
              <h2 className="text-2xl font-bold text-slate-900">{editingProduct ? 'Editar Item' : 'Novo Produto/Serviço'}</h2>
              <button onClick={() => setIsModalOpen(false)}><X className="text-slate-400" /></button>
            </div>
            <form onSubmit={handleAdd} className="grid grid-cols-2 gap-4">
              {editingProduct && (
                <div className="col-span-1">
                  <label className="block text-sm font-semibold text-slate-500 mb-1">Código do Produto</label>
                  <input 
                    type="text" 
                    className="w-full px-4 py-2 rounded-xl border border-slate-100 bg-slate-50 text-slate-500 cursor-not-allowed"
                    value={editingProduct.id}
                    readOnly
                  />
                </div>
              )}
              <div className={editingProduct ? "col-span-1" : "col-span-2"}>
                <label className="block text-sm font-semibold text-slate-700 mb-1">Código de Barras (EAN13)</label>
                <input 
                  type="text" 
                  maxLength={13}
                  className="w-full px-4 py-2 rounded-xl border border-slate-200"
                  value={newProduct.codigo_barras || ''}
                  onChange={e => {
                    const val = e.target.value.replace(/\D/g, '').slice(0, 13);
                    setNewProduct({...newProduct, codigo_barras: val});
                  }}
                  placeholder="Máximo 13 dígitos"
                />
              </div>
              <div className="col-span-2">
                <label className="block text-sm font-semibold text-slate-700 mb-1">Nome</label>
                <input 
                  type="text" 
                  className="w-full px-4 py-2 rounded-xl border border-slate-200"
                  value={newProduct.nome}
                  onChange={e => setNewProduct({...newProduct, nome: e.target.value})}
                  required
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
                  className="w-full px-4 py-2 rounded-xl border border-slate-200"
                  value={newProduct.unidade}
                  onChange={e => setNewProduct({...newProduct, unidade: e.target.value})}
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
              <div className="col-span-2 flex items-center gap-2">
                <input 
                  type="checkbox" 
                  id="product-ativo"
                  checked={newProduct.ativo} 
                  onChange={e => setNewProduct({...newProduct, ativo: e.target.checked})} 
                  className="w-4 h-4 text-indigo-600 border-slate-300 rounded focus:ring-indigo-500"
                />
                <label htmlFor="product-ativo" className="text-sm font-semibold text-slate-700">Cadastro Ativo</label>
              </div>
              <div className="col-span-2">
                <button type="submit" className="w-full bg-indigo-600 text-white py-3 rounded-xl font-bold mt-4 shadow-lg shadow-indigo-100 hover:bg-indigo-700 transition-all">
                  {editingProduct ? 'Atualizar Item' : 'Salvar Item'}
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
