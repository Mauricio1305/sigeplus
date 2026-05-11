import React, { useState, useEffect } from 'react';
import { Plus, Search, Edit2, X } from 'lucide-react';
import { motion } from 'motion/react';
import { useAuthStore } from '../store/authStore';

export const Pessoas = () => {
  const [pessoas, setPessoas] = useState<any[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [selectedPessoa, setSelectedPessoa] = useState<any>(null);
  const [newPessoa, setNewPessoa] = useState({ 
    nome: '', 
    tipo_pessoa: 'cliente', 
    cpf_cnpj: '', 
    telefone: '', 
    email: '', 
    endereco: '', 
    cidade: '', 
    uf: '', 
    ativo: true,
    razao_social: '',
    nome_fantasia: '',
    telefone_fixo: '',
    telefone_celular: '',
    numero: '',
    cep: ''
  });
  const token = useAuthStore(state => state.token);

  const fetchPessoas = () => {
    fetch('/api/pessoas', { headers: { 'Authorization': `Bearer ${token}` } })
      .then(res => {
        if (res.status === 401) {
          useAuthStore.getState().logout();
          return;
        }
        return res.json();
      })
      .then(data => {
        if (Array.isArray(data)) {
          setPessoas(data);
        } else {
          console.error("pessoas API returned non-array:", data);
          setPessoas([]);
        }
      })
      .catch(err => {
        console.error("Error fetching pessoas:", err);
        setPessoas([]);
      });
  };

  useEffect(fetchPessoas, [token]);

  const handleAdd = async (e: React.FormEvent) => {
    e.preventDefault();
    const url = selectedPessoa ? `/api/pessoas/${selectedPessoa.id}` : '/api/pessoas';
    const method = selectedPessoa ? 'PUT' : 'POST';
    
    const res = await fetch(url, {
      method,
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
      body: JSON.stringify(newPessoa)
    });
    if (res.ok) { 
      setIsModalOpen(false); 
      setSelectedPessoa(null);
      setNewPessoa({ nome: '', tipo_pessoa: 'cliente', cpf_cnpj: '', telefone: '', email: '', endereco: '', cidade: '', uf: '', ativo: true, razao_social: '', nome_fantasia: '', telefone_fixo: '', telefone_celular: '', numero: '', cep: '' });
      fetchPessoas(); 
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-bold text-slate-900">Pessoas</h1>
          <p className="text-slate-500">Gestão de clientes e fornecedores.</p>
        </div>
        <button onClick={() => { 
          setSelectedPessoa(null); 
          setNewPessoa({ 
            nome: '', 
            tipo_pessoa: 'cliente', 
            cpf_cnpj: '', 
            telefone: '', 
            email: '', 
            endereco: '', 
            cidade: '', 
            uf: '', 
            ativo: true,
            razao_social: '',
            nome_fantasia: '',
            telefone_fixo: '',
            telefone_celular: '',
            numero: '',
            cep: ''
          }); 
          setIsModalOpen(true); 
        }} className="bg-indigo-600 text-white px-6 py-3 rounded-xl font-bold flex items-center gap-2 hover:bg-indigo-700 transition-all shadow-lg shadow-indigo-200">
          <Plus className="w-5 h-5" /> Nova Pessoa
        </button>
      </div>
      <div className="bg-white rounded-2xl shadow-sm border border-slate-100 overflow-hidden">
        <div className="p-4 border-b border-slate-100 flex gap-4">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 w-5 h-5" />
            <input 
              type="text" 
              placeholder="Buscar por Código, Razão Social, Nome Fantasia ou CPF/CNPJ..." 
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
              <th className="px-6 py-4 font-semibold">Razão Social / Nome Fantasia</th>
              <th className="px-6 py-4 font-semibold">Tipo</th>
              <th className="px-6 py-4 font-semibold">CPF/CNPJ</th>
              <th className="px-6 py-4 font-semibold">Contato</th>
              <th className="px-6 py-4 font-semibold text-center">Status</th>
              <th className="px-6 py-4 font-semibold text-right">Ações</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {pessoas.filter(p => {
              const term = searchTerm.toLowerCase();
              return (
                p.id.toString().includes(term) ||
                (p.razao_social && p.razao_social.toLowerCase().includes(term)) ||
                (p.nome && p.nome.toLowerCase().includes(term)) ||
                (p.nome_fantasia && p.nome_fantasia.toLowerCase().includes(term)) ||
                (p.cpf_cnpj && p.cpf_cnpj.toLowerCase().includes(term))
              );
            }).map(p => (
              <tr key={p.id} className="hover:bg-slate-50 transition-colors">
                <td className="px-6 py-4 font-medium text-slate-500 text-xs">#{p.id}</td>
                <td className="px-6 py-4">
                  <div className="font-medium text-slate-900">{p.razao_social || p.nome}</div>
                  {p.nome_fantasia && <div className="text-xs text-slate-500">{p.nome_fantasia}</div>}
                </td>
                <td className="px-6 py-4">
                  <span className={`px-2 py-1 text-[10px] font-bold rounded uppercase ${p.tipo_pessoa === 'cliente' ? 'bg-blue-100 text-blue-700' : p.tipo_pessoa === 'fornecedor' ? 'bg-amber-100 text-amber-700' : 'bg-purple-100 text-purple-700'}`}>
                    {p.tipo_pessoa}
                  </span>
                </td>
                <td className="px-6 py-4 text-slate-600 font-mono text-xs">{p.cpf_cnpj}</td>
                <td className="px-6 py-4">
                  <div className="text-slate-600 text-sm">{p.telefone_celular || p.telefone}</div>
                  {p.email && <div className="text-[10px] text-slate-400">{p.email}</div>}
                </td>
                <td className="px-6 py-4 text-center">
                  <span className={`px-2 py-1 text-[10px] font-bold rounded uppercase ${p.ativo ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-100 text-slate-500'}`}>
                    {p.ativo ? 'Ativo' : 'Inativo'}
                  </span>
                </td>
                <td className="px-6 py-4 text-right">
                  <button 
                    onClick={() => {
                      setSelectedPessoa(p);
                      setNewPessoa({ ...p, ativo: !!p.ativo });
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
          <motion.div initial={{ scale: 0.9, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} className="bg-white w-full max-w-lg rounded-3xl p-8 shadow-2xl">
            <div className="flex justify-between items-center mb-6">
              <h2 className="text-2xl font-bold text-slate-900">{selectedPessoa ? 'Editar Pessoa' : 'Nova Pessoa'}</h2>
              <button onClick={() => setIsModalOpen(false)}><X className="text-slate-400" /></button>
            </div>
            <form onSubmit={handleAdd} className="grid grid-cols-2 gap-4 max-h-[70vh] overflow-y-auto pr-2">
              <div className="col-span-2">
                <label className="block text-xs font-bold text-slate-400 uppercase mb-1">Razão Social</label>
                <input type="text" maxLength={255} className="w-full px-4 py-2 rounded-xl border border-slate-200" value={newPessoa.razao_social || ''} onChange={e => setNewPessoa({...newPessoa, razao_social: e.target.value, nome: e.target.value})} required />
              </div>
              <div className="col-span-2">
                <label className="block text-xs font-bold text-slate-400 uppercase mb-1">Nome Fantasia</label>
                <input type="text" maxLength={255} className="w-full px-4 py-2 rounded-xl border border-slate-200" value={newPessoa.nome_fantasia || ''} onChange={e => setNewPessoa({...newPessoa, nome_fantasia: e.target.value})} />
              </div>
              <div className="col-span-2">
                <label className="block text-xs font-bold text-slate-400 uppercase mb-1">Tipo de Pessoa</label>
                <select className="w-full px-4 py-2 rounded-xl border border-slate-200" value={newPessoa.tipo_pessoa} onChange={e => setNewPessoa({...newPessoa, tipo_pessoa: e.target.value})} required>
                  <option value="cliente">Cliente</option>
                  <option value="fornecedor">Fornecedor</option>
                  <option value="ambos">Ambos</option>
                </select>
              </div>
              <div>
                <label className="block text-xs font-bold text-slate-400 uppercase mb-1">CPF/CNPJ</label>
                <input type="text" maxLength={20} className="w-full px-4 py-2 rounded-xl border border-slate-200" value={newPessoa.cpf_cnpj || ''} onChange={e => setNewPessoa({...newPessoa, cpf_cnpj: e.target.value})} />
              </div>
              <div>
                <label className="block text-xs font-bold text-slate-400 uppercase mb-1">E-mail</label>
                <input type="email" maxLength={255} className="w-full px-4 py-2 rounded-xl border border-slate-200" value={newPessoa.email || ''} onChange={e => setNewPessoa({...newPessoa, email: e.target.value})} />
              </div>
              <div>
                <label className="block text-xs font-bold text-slate-400 uppercase mb-1">Telefone Fixo</label>
                <input type="text" maxLength={20} className="w-full px-4 py-2 rounded-xl border border-slate-200" value={newPessoa.telefone_fixo || ''} onChange={e => setNewPessoa({...newPessoa, telefone_fixo: e.target.value})} />
              </div>
              <div>
                <label className="block text-xs font-bold text-slate-400 uppercase mb-1">Telefone Celular</label>
                <input type="text" maxLength={20} className="w-full px-4 py-2 rounded-xl border border-slate-200" value={newPessoa.telefone_celular || ''} onChange={e => setNewPessoa({...newPessoa, telefone_celular: e.target.value, telefone: e.target.value})} />
              </div>
              <div className="col-span-2">
                <label className="block text-xs font-bold text-slate-400 uppercase mb-1">Logradouro</label>
                <input type="text" maxLength={65535} className="w-full px-4 py-2 rounded-xl border border-slate-200" value={newPessoa.endereco || ''} onChange={e => setNewPessoa({...newPessoa, endereco: e.target.value})} />
              </div>
              <div>
                <label className="block text-xs font-bold text-slate-400 uppercase mb-1">Número</label>
                <input type="text" maxLength={20} className="w-full px-4 py-2 rounded-xl border border-slate-200" value={newPessoa.numero || ''} onChange={e => setNewPessoa({...newPessoa, numero: e.target.value})} />
              </div>
              <div>
                <label className="block text-xs font-bold text-slate-400 uppercase mb-1">CEP</label>
                <input type="text" maxLength={20} className="w-full px-4 py-2 rounded-xl border border-slate-200" value={newPessoa.cep || ''} onChange={e => setNewPessoa({...newPessoa, cep: e.target.value})} />
              </div>
              <div>
                <label className="block text-xs font-bold text-slate-400 uppercase mb-1">Cidade</label>
                <input type="text" maxLength={255} className="w-full px-4 py-2 rounded-xl border border-slate-200" value={newPessoa.cidade || ''} onChange={e => setNewPessoa({...newPessoa, cidade: e.target.value})} />
              </div>
              <div>
                <label className="block text-xs font-bold text-slate-400 uppercase mb-1">Estado (UF)</label>
                <input type="text" maxLength={2} className="w-full px-4 py-2 rounded-xl border border-slate-200 uppercase" value={newPessoa.uf || ''} onChange={e => setNewPessoa({...newPessoa, uf: e.target.value.toUpperCase()})} />
              </div>
              <div className="col-span-2 flex items-center gap-2">
                <input 
                  type="checkbox" 
                  id="pessoa-ativo"
                  checked={newPessoa.ativo} 
                  onChange={e => setNewPessoa({...newPessoa, ativo: e.target.checked})} 
                  className="w-4 h-4 text-indigo-600 border-slate-300 rounded focus:ring-indigo-500"
                />
                <label htmlFor="pessoa-ativo" className="text-sm font-semibold text-slate-700">Cadastro Ativo</label>
              </div>
              <div className="col-span-2">
                <button type="submit" className="w-full bg-indigo-600 text-white py-3 rounded-xl font-bold mt-4 shadow-lg shadow-indigo-100 hover:bg-indigo-700 transition-all">
                  {selectedPessoa ? 'Atualizar Pessoa' : 'Salvar Pessoa'}
                </button>
              </div>
            </form>
          </motion.div>
        </div>
      )}
    </div>
  );
};

export default Pessoas;
