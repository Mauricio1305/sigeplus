import React, { useState, useEffect } from 'react';
import { Plus, Search, Edit2, X, FolderPlus } from 'lucide-react';
import { motion } from 'motion/react';
import { useAuthStore } from '../store/authStore';

export const Pessoas = () => {
  const [pessoas, setPessoas] = useState<any[]>([]);
  const [grupos, setGrupos] = useState<any[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [selectedPessoa, setSelectedPessoa] = useState<any>(null);

  // Group quick modal state
  const [isGroupModalOpen, setIsGroupModalOpen] = useState(false);
  const [newGrupoNome, setNewGrupoNome] = useState('');
  const [savingGrupo, setSavingGrupo] = useState(false);

  const emptyPessoa = { 
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
    cep: '',
    data_aniversario: '',
    observacao: '',
    grupo_id: ''
  };

  const [newPessoa, setNewPessoa] = useState(emptyPessoa);
  const token = useAuthStore(state => state.token);

  const fetchPessoas = () => {
    fetch('/api/pessoas', { headers: { 'Authorization': `Bearer ${token}` } })
      .then(res => {
        if (res.status === 401) {
          useAuthStore.getState().logout();
          return;
        }
        if (!res.ok) {
          return [];
        }
        return res.json();
      })
      .then(data => {
        if (Array.isArray(data)) {
          setPessoas(data);
        } else {
          setPessoas([]);
        }
      })
      .catch(err => {
        setPessoas([]);
      });
  };

  const fetchGrupos = () => {
    fetch('/api/pessoas/grupos', { headers: { 'Authorization': `Bearer ${token}` } })
      .then(res => res.ok ? res.json() : [])
      .then(data => {
        if (Array.isArray(data)) setGrupos(data);
      })
      .catch(() => setGrupos([]));
  };

  useEffect(() => {
    fetchPessoas();
    fetchGrupos();
  }, [token]);

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
      setNewPessoa(emptyPessoa);
      fetchPessoas(); 
    }
  };

  const handleCreateGrupo = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newGrupoNome.trim()) return;
    setSavingGrupo(true);
    try {
      const res = await fetch('/api/pessoas/grupos', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
        body: JSON.stringify({ nome: newGrupoNome.trim() })
      });
      if (res.ok) {
        const data = await res.json();
        fetchGrupos();
        setNewPessoa(prev => ({ ...prev, grupo_id: data.id }));
        setNewGrupoNome('');
        setIsGroupModalOpen(false);
      }
    } catch (err) {
      console.error('Erro ao criar grupo:', err);
    } finally {
      setSavingGrupo(false);
    }
  };

  return (
    <div className="space-y-4 md:space-y-6">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <h1 className="text-2xl md:text-3xl font-bold text-slate-900">Pessoas</h1>
          <p className="text-sm md:text-base text-slate-500">Gestão de clientes e fornecedores.</p>
        </div>
        <button onClick={() => { 
          setSelectedPessoa(null); 
          setNewPessoa(emptyPessoa); 
          setIsModalOpen(true); 
        }} className="w-full sm:w-auto justify-center bg-indigo-600 text-white px-4 md:px-6 py-2.5 md:py-3 rounded-xl font-bold flex items-center gap-2 hover:bg-indigo-700 transition-all shadow-lg shadow-indigo-200 text-sm md:text-base">
          <Plus className="w-4 h-4 md:w-5 md:h-5" /> Nova Pessoa
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
          <thead className="bg-slate-50 text-slate-500 text-[10px] sm:text-xs md:text-sm uppercase tracking-wider">
            <tr>
              <th className="px-2 sm:px-3 md:px-6 py-2 md:py-4 font-semibold hidden md:table-cell">Cód.</th>
              <th className="px-2 sm:px-3 md:px-6 py-2 md:py-4 font-semibold">Razão Social / Nome Fantasia</th>
              <th className="px-2 sm:px-3 md:px-6 py-2 md:py-4 font-semibold hidden sm:table-cell">Tipo</th>
              <th className="px-2 sm:px-3 md:px-6 py-2 md:py-4 font-semibold hidden lg:table-cell">CPF/CNPJ</th>
              <th className="px-2 sm:px-3 md:px-6 py-2 md:py-4 font-semibold">Contato</th>
              <th className="px-2 sm:px-3 md:px-6 py-2 md:py-4 font-semibold text-center hidden md:table-cell">Status</th>
              <th className="px-2 sm:px-3 md:px-6 py-2 md:py-4 font-semibold text-right">Ações</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 text-[10px] sm:text-xs md:text-sm">
            {pessoas.filter(p => {
              const term = searchTerm.toLowerCase();
              return (
                (p.sequencial_id && p.sequencial_id.toString().includes(term)) ||
                p.id.toString().includes(term) ||
                (p.razao_social && p.razao_social.toLowerCase().includes(term)) ||
                (p.nome && p.nome.toLowerCase().includes(term)) ||
                (p.nome_fantasia && p.nome_fantasia.toLowerCase().includes(term)) ||
                (p.cpf_cnpj && p.cpf_cnpj.toLowerCase().includes(term))
              );
            }).map(p => (
              <tr key={p.id} className="hover:bg-slate-50 transition-colors">
                <td className="px-2 sm:px-3 md:px-6 py-2 md:py-4 font-medium text-slate-500 hidden md:table-cell">#{p.sequencial_id || p.id}</td>
                <td className="px-2 sm:px-3 md:px-6 py-2 md:py-4">
                  <div className="font-medium text-slate-900 leading-tight">
                    <div className="line-clamp-2 md:line-clamp-none whitespace-normal min-w-[80px]">{p.razao_social || p.nome}</div>
                  </div>
                  {p.nome_fantasia && <div className="text-[8px] sm:text-[10px] text-slate-500 mt-0.5">{p.nome_fantasia}</div>}
                  {p.grupo_nome && (
                    <div className="mt-1">
                      <span className="px-2 py-0.5 bg-indigo-50 text-indigo-700 text-[10px] font-semibold rounded-md border border-indigo-100">
                        {p.grupo_nome}
                      </span>
                    </div>
                  )}
                  <div className="text-[8px] sm:text-[10px] text-slate-400 sm:hidden mt-0.5">{p.tipo_pessoa} {p.cpf_cnpj ? `• ${p.cpf_cnpj}` : ''}</div>
                </td>
                <td className="px-2 sm:px-3 md:px-6 py-2 md:py-4 hidden sm:table-cell">
                  <span className={`px-1.5 md:px-2 py-0.5 md:py-1 text-[8px] md:text-[10px] font-bold rounded uppercase ${p.tipo_pessoa === 'cliente' ? 'bg-blue-100 text-blue-700' : p.tipo_pessoa === 'fornecedor' ? 'bg-amber-100 text-amber-700' : 'bg-purple-100 text-purple-700'}`}>
                    {p.tipo_pessoa}
                  </span>
                </td>
                <td className="px-2 sm:px-3 md:px-6 py-2 md:py-4 text-slate-600 font-mono hidden lg:table-cell">{p.cpf_cnpj}</td>
                <td className="px-2 sm:px-3 md:px-6 py-2 md:py-4">
                  <div className="text-slate-600 font-medium whitespace-nowrap">{p.telefone_celular || p.telefone}</div>
                  {p.email && <div className="text-[8px] sm:text-[10px] text-slate-400 truncate max-w-[100px] md:max-w-none">{p.email}</div>}
                </td>
                <td className="px-2 sm:px-3 md:px-6 py-2 md:py-4 text-center hidden md:table-cell">
                  <span className={`px-1.5 md:px-2 py-0.5 md:py-1 text-[8px] md:text-[10px] font-bold rounded uppercase ${p.ativo ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-100 text-slate-500'}`}>
                    {p.ativo ? 'Ativo' : 'Inativo'}
                  </span>
                </td>
                <td className="px-2 sm:px-3 md:px-6 py-2 md:py-4 text-right">
                  <button 
                    onClick={() => {
                      setSelectedPessoa(p);
                      setNewPessoa({ ...p, ativo: !!p.ativo, observacao: p.observacao || '', grupo_id: p.grupo_id || '' });
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
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center p-4 md:p-6 z-50">
          <motion.div initial={{ scale: 0.95, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} className="bg-white w-full max-w-4xl rounded-3xl p-6 md:p-8 shadow-2xl flex flex-col max-h-[90vh]">
            <div className="flex justify-between items-center pb-4 mb-4 border-b border-slate-100 shrink-0">
              <div>
                <h2 className="text-xl md:text-2xl font-bold text-slate-900">{selectedPessoa ? 'Editar Pessoa' : 'Nova Pessoa'}</h2>
                <p className="text-xs md:text-sm text-slate-400">Preencha as informações do cadastro</p>
              </div>
              <button onClick={() => setIsModalOpen(false)} className="p-2 hover:bg-slate-100 rounded-full transition-colors"><X className="text-slate-400 w-5 h-5" /></button>
            </div>
            
            <form onSubmit={handleAdd} className="overflow-y-auto pr-1 space-y-6 flex-1">
              <div>
                <h3 className="text-xs font-bold text-indigo-600 uppercase tracking-wider mb-3">Dados Principais</h3>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                  <div className="lg:col-span-2">
                    <label className="block text-xs font-bold text-slate-500 uppercase mb-1">Razão Social / Nome *</label>
                    <input type="text" maxLength={255} className="w-full px-4 py-2.5 rounded-xl border border-slate-200 focus:ring-2 focus:ring-indigo-500 outline-none text-sm" value={newPessoa.razao_social || ''} onChange={e => setNewPessoa({...newPessoa, razao_social: e.target.value, nome: e.target.value})} required />
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-slate-500 uppercase mb-1">Nome Fantasia</label>
                    <input type="text" maxLength={255} className="w-full px-4 py-2.5 rounded-xl border border-slate-200 focus:ring-2 focus:ring-indigo-500 outline-none text-sm" value={newPessoa.nome_fantasia || ''} onChange={e => setNewPessoa({...newPessoa, nome_fantasia: e.target.value})} />
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-slate-500 uppercase mb-1">Tipo de Pessoa *</label>
                    <select className="w-full px-4 py-2.5 rounded-xl border border-slate-200 focus:ring-2 focus:ring-indigo-500 outline-none text-sm bg-white" value={newPessoa.tipo_pessoa} onChange={e => setNewPessoa({...newPessoa, tipo_pessoa: e.target.value})} required>
                      <option value="cliente">Cliente</option>
                      <option value="fornecedor">Fornecedor</option>
                      <option value="ambos">Ambos</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-slate-500 uppercase mb-1">CPF/CNPJ</label>
                    <input type="text" maxLength={20} className="w-full px-4 py-2.5 rounded-xl border border-slate-200 focus:ring-2 focus:ring-indigo-500 outline-none text-sm font-mono" value={newPessoa.cpf_cnpj || ''} onChange={e => setNewPessoa({...newPessoa, cpf_cnpj: e.target.value})} />
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-slate-500 uppercase mb-1">E-mail</label>
                    <input type="email" maxLength={255} className="w-full px-4 py-2.5 rounded-xl border border-slate-200 focus:ring-2 focus:ring-indigo-500 outline-none text-sm" value={newPessoa.email || ''} onChange={e => setNewPessoa({...newPessoa, email: e.target.value})} />
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-slate-500 uppercase mb-1">Data de Aniversário</label>
                    <input type="date" className="w-full px-4 py-2.5 rounded-xl border border-slate-200 focus:ring-2 focus:ring-indigo-500 outline-none text-sm" value={newPessoa.data_aniversario ? newPessoa.data_aniversario.split('T')[0] : ''} onChange={e => setNewPessoa({...newPessoa, data_aniversario: e.target.value})} />
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-slate-500 uppercase mb-1">Telefone Fixo</label>
                    <input type="text" maxLength={20} className="w-full px-4 py-2.5 rounded-xl border border-slate-200 focus:ring-2 focus:ring-indigo-500 outline-none text-sm" value={newPessoa.telefone_fixo || ''} onChange={e => setNewPessoa({...newPessoa, telefone_fixo: e.target.value})} />
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-slate-500 uppercase mb-1">Telefone Celular</label>
                    <input type="text" maxLength={20} className="w-full px-4 py-2.5 rounded-xl border border-slate-200 focus:ring-2 focus:ring-indigo-500 outline-none text-sm" value={newPessoa.telefone_celular || ''} onChange={e => setNewPessoa({...newPessoa, telefone_celular: e.target.value, telefone: e.target.value})} />
                  </div>
                  <div className="col-span-full">
                    <label className="block text-xs font-bold text-slate-500 uppercase mb-1">Grupo</label>
                    <div className="flex gap-2">
                      <select 
                        className="flex-1 px-4 py-2.5 rounded-xl border border-slate-200 focus:ring-2 focus:ring-indigo-500 outline-none text-sm bg-white" 
                        value={newPessoa.grupo_id || ''} 
                        onChange={e => setNewPessoa({...newPessoa, grupo_id: e.target.value})}
                      >
                        <option value="">Sem grupo definido</option>
                        {grupos.map(g => (
                          <option key={g.id} value={g.id}>{g.nome}</option>
                        ))}
                      </select>
                      <button 
                        type="button" 
                        onClick={() => setIsGroupModalOpen(true)}
                        title="Cadastrar Novo Grupo"
                        className="px-3 py-2.5 bg-indigo-50 text-indigo-600 rounded-xl border border-indigo-200 hover:bg-indigo-100 transition-all font-bold flex items-center justify-center shrink-0"
                      >
                        <Plus className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                  <div className="col-span-full">
                    <div className="flex justify-between items-center mb-1">
                      <label className="block text-xs font-bold text-slate-500 uppercase">Observação</label>
                      <span className="text-[10px] text-slate-400 font-mono">{(newPessoa.observacao || '').length}/500 caracteres</span>
                    </div>
                    <textarea 
                      rows={3} 
                      maxLength={500} 
                      placeholder="Observações do cadastro (digitação livre, pressione Enter para pular linha)..." 
                      className="w-full px-4 py-2.5 rounded-xl border border-slate-200 focus:ring-2 focus:ring-indigo-500 outline-none text-sm resize-y" 
                      value={newPessoa.observacao || ''} 
                      onChange={e => setNewPessoa({...newPessoa, observacao: e.target.value})} 
                    />
                  </div>
                </div>
              </div>

              <div>
                <h3 className="text-xs font-bold text-indigo-600 uppercase tracking-wider mb-3">Endereço</h3>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                  <div className="lg:col-span-2">
                    <label className="block text-xs font-bold text-slate-500 uppercase mb-1">Logradouro</label>
                    <input type="text" maxLength={255} className="w-full px-4 py-2.5 rounded-xl border border-slate-200 focus:ring-2 focus:ring-indigo-500 outline-none text-sm" value={newPessoa.endereco || ''} onChange={e => setNewPessoa({...newPessoa, endereco: e.target.value})} />
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-slate-500 uppercase mb-1">Número</label>
                    <input type="text" maxLength={20} className="w-full px-4 py-2.5 rounded-xl border border-slate-200 focus:ring-2 focus:ring-indigo-500 outline-none text-sm" value={newPessoa.numero || ''} onChange={e => setNewPessoa({...newPessoa, numero: e.target.value})} />
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-slate-500 uppercase mb-1">CEP</label>
                    <input type="text" maxLength={20} className="w-full px-4 py-2.5 rounded-xl border border-slate-200 focus:ring-2 focus:ring-indigo-500 outline-none text-sm font-mono" value={newPessoa.cep || ''} onChange={e => setNewPessoa({...newPessoa, cep: e.target.value})} />
                  </div>
                  <div className="lg:col-span-3">
                    <label className="block text-xs font-bold text-slate-500 uppercase mb-1">Cidade</label>
                    <input type="text" maxLength={255} className="w-full px-4 py-2.5 rounded-xl border border-slate-200 focus:ring-2 focus:ring-indigo-500 outline-none text-sm" value={newPessoa.cidade || ''} onChange={e => setNewPessoa({...newPessoa, cidade: e.target.value})} />
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-slate-500 uppercase mb-1">Estado (UF)</label>
                    <input type="text" maxLength={2} className="w-full px-4 py-2.5 rounded-xl border border-slate-200 focus:ring-2 focus:ring-indigo-500 outline-none text-sm uppercase" value={newPessoa.uf || ''} onChange={e => setNewPessoa({...newPessoa, uf: e.target.value.toUpperCase()})} />
                  </div>
                </div>
              </div>

              <div className="pt-2 flex flex-col sm:flex-row items-center justify-between gap-4 border-t border-slate-100 shrink-0">
                <div className="flex items-center gap-2">
                  <input 
                    type="checkbox" 
                    id="pessoa-ativo"
                    checked={newPessoa.ativo} 
                    onChange={e => setNewPessoa({...newPessoa, ativo: e.target.checked})} 
                    className="w-4 h-4 text-indigo-600 border-slate-300 rounded focus:ring-indigo-500"
                  />
                  <label htmlFor="pessoa-ativo" className="text-sm font-semibold text-slate-700">Cadastro Ativo</label>
                </div>
                <div className="flex gap-3 w-full sm:w-auto">
                  <button type="button" onClick={() => setIsModalOpen(false)} className="flex-1 sm:flex-initial px-5 py-2.5 border border-slate-200 rounded-xl font-bold text-slate-600 text-sm hover:bg-slate-50 transition-all">
                    Cancelar
                  </button>
                  <button type="submit" className="flex-1 sm:flex-initial bg-indigo-600 text-white px-6 py-2.5 rounded-xl font-bold text-sm shadow-lg shadow-indigo-100 hover:bg-indigo-700 transition-all">
                    {selectedPessoa ? 'Atualizar Pessoa' : 'Salvar Pessoa'}
                  </button>
                </div>
              </div>
            </form>
          </motion.div>
        </div>
      )}

      {/* Quick Group Creation Modal */}
      {isGroupModalOpen && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center p-4 z-[60]">
          <motion.div initial={{ scale: 0.95, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} className="bg-white w-full max-w-md rounded-2xl p-6 shadow-2xl">
            <div className="flex justify-between items-center pb-3 mb-4 border-b border-slate-100">
              <div className="flex items-center gap-2">
                <div className="p-2 bg-indigo-50 text-indigo-600 rounded-lg">
                  <FolderPlus className="w-5 h-5" />
                </div>
                <h3 className="font-bold text-slate-900 text-base">Novo Grupo de Pessoas</h3>
              </div>
              <button onClick={() => setIsGroupModalOpen(false)} className="p-1 hover:bg-slate-100 rounded-full transition-colors">
                <X className="text-slate-400 w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleCreateGrupo} className="space-y-4">
              <div>
                <label className="block text-xs font-bold text-slate-500 uppercase mb-1">Nome do Grupo *</label>
                <input 
                  type="text" 
                  maxLength={255} 
                  required
                  autoFocus
                  placeholder="Ex: VIP, Atacado, Região Sul, Distribuidores..." 
                  className="w-full px-4 py-2.5 rounded-xl border border-slate-200 focus:ring-2 focus:ring-indigo-500 outline-none text-sm" 
                  value={newGrupoNome} 
                  onChange={e => setNewGrupoNome(e.target.value)} 
                />
              </div>

              <div className="flex justify-end gap-2 pt-2 border-t border-slate-100">
                <button 
                  type="button" 
                  onClick={() => setIsGroupModalOpen(false)} 
                  className="px-4 py-2 border border-slate-200 rounded-xl font-bold text-slate-600 text-sm hover:bg-slate-50 transition-all"
                >
                  Cancelar
                </button>
                <button 
                  type="submit" 
                  disabled={savingGrupo || !newGrupoNome.trim()}
                  className="bg-indigo-600 text-white px-5 py-2 rounded-xl font-bold text-sm shadow-md shadow-indigo-100 hover:bg-indigo-700 transition-all disabled:opacity-50"
                >
                  {savingGrupo ? 'Salvando...' : 'Cadastrar e Selecionar'}
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
