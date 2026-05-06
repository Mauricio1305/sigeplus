import React, { useState, useEffect } from 'react';
import { useParams } from 'react-router-dom';
import { AlertCircle, FileText } from 'lucide-react';
import { useAuthStore } from '../store/authStore';
import { formatMoney } from '../utils/format';

export const Reports = () => {
  const { type } = useParams();
  const token = useAuthStore(state => state.token);
  const [data, setData] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  
  const [startDate, setStartDate] = useState(() => {
    const now = new Date();
    return new Date(now.getFullYear(), now.getMonth(), 1).toISOString().split('T')[0];
  });
  const [endDate, setEndDate] = useState(() => {
    const now = new Date();
    return new Date(now.getFullYear(), now.getMonth() + 1, 0).toISOString().split('T')[0];
  });
  const [statusFilter, setStatusFilter] = useState('todos');
  const [origemFilter, setOrigemFilter] = useState('Todas');
  const [personFilter, setPersonFilter] = useState('todos');
  const [financeTypeFilter, setFinanceTypeFilter] = useState<string[]>(['Pagar', 'Receber', 'Caixa', 'Banco', 'Cartão']);
  const [financeOpTypeFilter, setFinanceOpTypeFilter] = useState('todos');
  const [financeStatusFilter, setFinanceStatusFilter] = useState('todos');
  const [stockStatusFilter, setStockStatusFilter] = useState('todos');
  const [groupBy, setGroupBy] = useState('nenhum');

  const [pessoas, setPessoas] = useState<any[]>([]);

  useEffect(() => {
    fetch('/api/pessoas', { headers: { 'Authorization': `Bearer ${token}` } })
      .then(res => res.json())
      .then(setPessoas)
      .catch(err => console.error("Error fetching pessoas for filter:", err));
  }, [token]);

  useEffect(() => {
    setLoading(true);
    setError(null);
    let url = '';
    switch (type) {
      case 'sales': url = '/api/sales'; break;
      case 'inventory': url = '/api/products'; break;
      case 'finance': url = '/api/finance/accounts'; break;
      case 'people': url = '/api/pessoas'; break;
      default: return;
    }

    fetch(url, { headers: { 'Authorization': `Bearer ${token}` } })
      .then(async res => {
        const d = await res.json();
        if (!res.ok) throw new Error(d.error || 'Erro ao carregar dados');
        setData(Array.isArray(d) ? d : []);
        setLoading(false);
      })
      .catch(err => {
        console.error("Error fetching report data:", err);
        setError(err.message);
        setLoading(false);
      });
  }, [type, token]);

  const getTitle = () => {
    switch (type) {
      case 'sales': return 'Relatório de Vendas';
      case 'inventory': return 'Relatório de Estoque';
      case 'finance': return 'Relatório Financeiro';
      case 'people': return 'Relatório de Pessoas';
      default: return 'Relatório';
    }
  };

  const handlePrint = () => {
    const params = new URLSearchParams({
      start: startDate,
      end: endDate,
      status: statusFilter,
      origem: origemFilter,
      fType: financeTypeFilter.join(','),
      fOpType: financeOpTypeFilter,
      fStatus: financeStatusFilter,
      person: personFilter,
      stockStatus: stockStatusFilter,
      groupBy: groupBy,
      t: token
    });
    window.open(`/print/report/${type}?${params.toString()}`, '_blank');
  };

  const renderTable = () => {
    if (loading) return <div className="p-8 text-center text-slate-500">Gerando relatório...</div>;
    if (error) return (
      <div className="p-12 text-center text-rose-600">
        <AlertCircle className="w-12 h-12 mx-auto mb-4 opacity-50" />
        <p className="font-bold">Erro ao carregar relatório</p>
        <p className="text-sm opacity-80">{error}</p>
      </div>
    );
    
    let filteredData = [...data];
    
    if (type === 'sales') {
      filteredData = data.filter(s => {
        if (!s.data_venda) return false;
        if (s.tipo !== 'venda' && s.tipo !== 'mesa') return false;
        const dateStr = s.data_venda.includes('T') ? s.data_venda : s.data_venda.replace(' ', 'T');
        const saleDate = new Date(dateStr).toISOString().split('T')[0];
        const matchesDate = saleDate >= startDate && saleDate <= endDate;
        const matchesStatus = statusFilter === 'todos' || s.status === statusFilter;
        const matchesOrigem = origemFilter === 'Todas' || s.origem === origemFilter;
        const matchesPerson = personFilter === 'todos' || s.pessoa_id?.toString() === personFilter;
        return matchesDate && matchesStatus && matchesOrigem && matchesPerson;
      });
    }

    if (type === 'finance') {
      filteredData = data.filter(a => {
        if (!a.vencimento) return false;
        const dateStr = a.vencimento.includes('T') ? a.vencimento : a.vencimento + 'T12:00:00';
        const dueDate = new Date(dateStr).toISOString().split('T')[0];
        const matchesDate = dueDate >= startDate && dueDate <= endDate;

        const normalizeLocal = (l: string | null, t: 'receita' | 'despesa') => {
          if (!l) return t === 'receita' ? 'Receber' : 'Pagar';
          if (l === 'Contas a Receber') return 'Receber';
          if (l === 'Contas a Pagar') return 'Pagar';
          return l;
        };
        const local = normalizeLocal(a.local, a.tipo);
        const matchesType = financeTypeFilter.includes(local);
        const matchesOpType = financeOpTypeFilter === 'todos' || 
          (financeOpTypeFilter === 'entrada' ? a.tipo === 'receita' : a.tipo === 'despesa');

        const matchesStatus = financeStatusFilter === 'todos' || 
          (financeStatusFilter === 'pago' ? a.pago : !a.pago);
        const matchesPerson = personFilter === 'todos' || a.pessoa_id?.toString() === personFilter;
        return matchesDate && matchesType && matchesOpType && matchesStatus && matchesPerson;
      });
    }

    if (type === 'inventory') {
      filteredData = data.filter(p => {
        const estoque = p.estoque_atual || 0;
        const minimo = p.estoque_minimo || 0;
        
        switch (stockStatusFilter) {
          case 'minimo': return estoque > 0 && estoque <= minimo;
          case 'regular': return estoque > minimo;
          case 'negativo': return estoque < 0;
          case 'zerado': return estoque === 0;
          default: return true;
        }
      });
    }

    if (filteredData.length === 0) {
      return (
        <div className="p-12 text-center border rounded-2xl bg-white">
          <div className="bg-slate-50 w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-4">
            <FileText className="text-slate-300 w-8 h-8" />
          </div>
          <h3 className="text-slate-900 font-bold">Nenhum dado encontrado</h3>
          <p className="text-slate-500 text-sm mt-1 max-w-xs mx-auto">
            Não encontramos registros para os filtros selecionados.
          </p>
        </div>
      );
    }

    switch (type) {
      case 'sales':
        return (
          <div className="bg-white rounded-2xl shadow-sm border border-slate-100 overflow-hidden">
            <table className="w-full text-left">
              <thead className="bg-slate-50 text-slate-500 text-sm uppercase tracking-wider">
                <tr>
                  <th className="px-6 py-4 font-semibold">Nº</th>
                  <th className="px-6 py-4 font-semibold">Data</th>
                  <th className="px-6 py-4 font-semibold">Origem</th>
                  <th className="px-6 py-4 font-semibold">Cliente</th>
                  <th className="px-6 py-4 font-semibold text-right">Total</th>
                  <th className="px-6 py-4 font-semibold text-center">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filteredData.map(s => (
                  <tr key={`sale-${s.id}`}>
                    <td className="px-6 py-4 font-medium text-slate-900">#{s.sequencial_id?.toString().padStart(6, '0')}</td>
                    <td className="px-6 py-4 text-slate-600">{new Date(s.data_venda).toLocaleDateString()}</td>
                    <td className="px-6 py-4 text-slate-600 whitespace-nowrap">
                      <span className="px-2 py-1 bg-slate-100 text-slate-600 rounded-lg text-xs font-medium">
                        {s.origem || 'Balcão'}
                      </span>
                    </td>
                    <td className="px-6 py-4 text-slate-900">{s.cliente_nome || 'Consumidor Final'}</td>
                    <td className="px-6 py-4 text-right font-bold text-slate-900">R$ {formatMoney(s.valor_total)}</td>
                    <td className="px-6 py-4 text-center">
                      <span className={`px-2 py-1 text-xs font-bold rounded uppercase ${s.status === 'finalizada' ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-100 text-amber-700'}`}>{s.status}</span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        );
      case 'inventory':
        return (
          <div className="bg-white rounded-2xl shadow-sm border border-slate-100 overflow-hidden">
            <table className="w-full text-left">
              <thead className="bg-slate-50 text-slate-500 text-sm uppercase tracking-wider">
                <tr>
                  <th className="px-6 py-4 font-semibold">Produto</th>
                  <th className="px-6 py-4 font-semibold">Tipo</th>
                  <th className="px-6 py-4 font-semibold text-right">Preço Venda</th>
                  <th className="px-6 py-4 font-semibold text-right">Custo</th>
                  <th className="px-6 py-4 font-semibold text-right">Estoque</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filteredData.map(p => (
                  <tr key={`inventory-${p.id}`}>
                    <td className="px-6 py-4 font-medium text-slate-900">{p.nome}</td>
                    <td className="px-6 py-4 text-slate-600 capitalize">{p.tipo}</td>
                    <td className="px-6 py-4 text-right">R$ {formatMoney(p.preco_venda)}</td>
                    <td className="px-6 py-4 text-right text-slate-500">R$ {formatMoney(p.custo)}</td>
                    <td className="px-6 py-4 text-right font-bold">
                      <span className={p.estoque_atual <= p.estoque_minimo ? 'text-rose-600' : 'text-emerald-600'}>
                        {p.estoque_atual} {p.unidade}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        );
      case 'finance':
        // Apply grouping if selected
        if (groupBy !== 'nenhum') {
          const groups: { [key: string]: any[] } = {};
          filteredData.forEach(item => {
            let key = '';
            if (groupBy === 'data') key = new Date(item.vencimento + (item.vencimento.includes('T') ? '' : 'T12:00:00')).toLocaleDateString();
            else if (groupBy === 'tipo') key = item.tipo === 'receita' ? 'Entradas' : 'Saídas';
            else if (groupBy === 'status') key = item.pago ? 'Pagas' : 'Pendentes';
            else if (groupBy === 'pessoa') key = item.pessoa_nome || 'Sem Pessoa';
            
            if (!groups[key]) groups[key] = [];
            groups[key].push(item);
          });

          return (
            <div className="space-y-8">
              {Object.entries(groups).map(([groupTitle, items]) => (
                <div key={groupTitle} className="bg-white rounded-2xl shadow-sm border border-slate-100 overflow-hidden">
                  <div className="bg-slate-50 px-6 py-3 border-b border-slate-100">
                    <h3 className="font-bold text-slate-700">{groupTitle} <span className="text-slate-400 font-normal ml-2">({items.length} registros)</span></h3>
                  </div>
                  <table className="w-full text-left">
                    <thead className="bg-slate-25 text-slate-400 text-[10px] uppercase tracking-wider">
                      <tr>
                        <th className="px-6 py-3 font-semibold">Vencimento</th>
                        <th className="px-6 py-3 font-semibold">Descrição</th>
                        <th className="px-6 py-3 font-semibold">Categoria</th>
                        <th className="px-6 py-3 font-semibold">Pessoa</th>
                        <th className="px-6 py-3 font-semibold text-right">Valor</th>
                        <th className="px-6 py-3 font-semibold text-center">Status</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {items.map(a => (
                        <tr key={`finance-grouped-${a.id}-${a.local}-${a.tipo}`}>
                          <td className="px-6 py-4 text-slate-600 border-r border-slate-50">{new Date(a.vencimento + (a.vencimento.includes('T') ? '' : 'T12:00:00')).toLocaleDateString()}</td>
                          <td className="px-6 py-4 font-medium text-slate-900">{a.descricao}</td>
                          <td className="px-6 py-4 text-slate-600">
                            <span className="px-2 py-1 bg-slate-100 text-slate-600 rounded text-[10px] uppercase font-bold">
                              {a.categoria_nome || 'Sem Categoria'}
                            </span>
                          </td>
                          <td className="px-6 py-4 text-slate-600">{a.pessoa_nome || '-'}</td>
                          <td className="px-6 py-4 text-right font-bold text-slate-900">R$ {formatMoney(a.valor)}</td>
                          <td className="px-6 py-4 text-center">
                            <span className={`px-2 py-1 text-[10px] font-bold rounded uppercase ${a.pago ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-100 text-amber-700'}`}>
                              {a.pago ? 'Pago' : 'Pendente'}
                            </span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  <div className="bg-slate-50 px-6 py-3 border-t border-slate-100 text-right">
                    <span className="text-sm font-bold text-slate-900">Total do Grupo: R$ {formatMoney(items.reduce((acc, i) => acc + i.valor, 0))}</span>
                  </div>
                </div>
              ))}
            </div>
          );
        }

        return (
          <div className="bg-white rounded-2xl shadow-sm border border-slate-100 overflow-hidden">
            <table className="w-full text-left">
              <thead className="bg-slate-50 text-slate-500 text-sm uppercase tracking-wider">
                <tr>
                  <th className="px-6 py-4 font-semibold">Vencimento</th>
                  <th className="px-6 py-4 font-semibold">Descrição</th>
                  <th className="px-6 py-4 font-semibold">Categoria</th>
                  <th className="px-6 py-4 font-semibold">Pessoa</th>
                  <th className="px-6 py-4 font-semibold text-right">Valor</th>
                  <th className="px-6 py-4 font-semibold text-center">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filteredData.map(a => (
                  <tr key={`finance-${a.local}-${a.id}-${a.tipo}`}>
                    <td className="px-6 py-4 text-slate-600">{new Date(a.vencimento + (a.vencimento.includes('T') ? '' : 'T12:00:00')).toLocaleDateString()}</td>
                    <td className="px-6 py-4 font-medium text-slate-900">{a.descricao}</td>
                    <td className="px-6 py-4 text-slate-600">
                      <span className="px-2 py-1 bg-slate-100 text-slate-600 rounded text-[10px] uppercase font-bold">
                        {a.categoria_nome || 'Sem Categoria'}
                      </span>
                    </td>
                    <td className="px-6 py-4 text-slate-600">{a.pessoa_nome || '-'}</td>
                    <td className="px-6 py-4 text-right font-bold text-slate-900">R$ {formatMoney(a.valor)}</td>
                    <td className="px-6 py-4 text-center">
                      <span className={`px-2 py-1 text-[10px] font-bold rounded uppercase ${a.pago ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-100 text-amber-700'}`}>
                        {a.pago ? 'Pago' : 'Pendente'}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        );
      case 'people':
        return (
          <div className="bg-white rounded-2xl shadow-sm border border-slate-100 overflow-hidden">
            <table className="w-full text-left">
              <thead className="bg-slate-50 text-slate-500 text-sm uppercase tracking-wider">
                <tr>
                  <th className="px-6 py-4 font-semibold">Nome</th>
                  <th className="px-6 py-4 font-semibold">Tipo</th>
                  <th className="px-6 py-4 font-semibold">CPF/CNPJ</th>
                  <th className="px-6 py-4 font-semibold">Contato</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filteredData.map(p => (
                  <tr key={`people-${p.id}`}>
                    <td className="px-6 py-4 font-medium text-slate-900">{p.razao_social || p.nome}</td>
                    <td className="px-6 py-4 text-slate-600 capitalize">{p.tipo_pessoa}</td>
                    <td className="px-6 py-4 text-slate-600 font-mono text-xs">{p.cpf_cnpj}</td>
                    <td className="px-6 py-4 text-slate-600">{p.telefone_celular || p.telefone}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        );
      default:
        return <div>Relatório não encontrado.</div>;
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <h1 className="text-3xl font-bold text-slate-900">{getTitle()}</h1>
          <p className="text-slate-500 text-sm">Visualize e exporte dados filtrados do seu sistema.</p>
        </div>
        <div className="flex gap-2">
          <button 
            onClick={handlePrint}
            className="bg-indigo-600 text-white px-4 py-2 rounded-xl font-bold hover:bg-indigo-700 transition-all shadow-lg shadow-indigo-200 flex items-center gap-2"
          >
            <FileText className="w-4 h-4" /> Imprimir PDF
          </button>
        </div>
      </div>

      <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-100 space-y-6">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          <div className="space-y-1">
            <label className="block text-xs font-bold text-slate-500 uppercase">Período</label>
            <div className="flex items-center gap-2">
              <input type="date" value={startDate} onChange={e => setStartDate(e.target.value)} className="w-full px-3 py-2 rounded-lg border border-slate-200 text-sm outline-none focus:ring-2 focus:ring-indigo-500" />
              <span className="text-slate-400">a</span>
              <input type="date" value={endDate} onChange={e => setEndDate(e.target.value)} className="w-full px-3 py-2 rounded-lg border border-slate-200 text-sm outline-none focus:ring-2 focus:ring-indigo-500" />
            </div>
          </div>

          {type === 'sales' && (
            <>
              <div className="space-y-1">
                <label className="block text-xs font-bold text-slate-500 uppercase">Status</label>
                <select value={statusFilter} onChange={e => setStatusFilter(e.target.value)} className="w-full px-3 py-2 rounded-lg border border-slate-200 text-sm outline-none focus:ring-2 focus:ring-indigo-500">
                  <option value="todos">Todos os Status</option>
                  <option value="finalizada">Finalizada</option>
                  <option value="orcamento">Orçamento</option>
                  <option value="cancelada">Cancelada</option>
                </select>
              </div>
              <div className="space-y-1">
                <label className="block text-xs font-bold text-slate-500 uppercase">Origem</label>
                <select value={origemFilter} onChange={e => setOrigemFilter(e.target.value)} className="w-full px-3 py-2 rounded-lg border border-slate-200 text-sm outline-none focus:ring-2 focus:ring-indigo-500">
                  <option value="Todas">Todas Origens</option>
                  <option value="Balcão">Balcão</option>
                  <option value="Mesa">Mesa</option>
                  <option value="PDV">PDV</option>
                  <option value="OS">OS</option>
                </select>
              </div>
            </>
          )}

          {type === 'finance' && (
            <>
              <div className="space-y-1">
                <label className="block text-xs font-bold text-slate-500 uppercase">Tipo Operação</label>
                <select value={financeOpTypeFilter} onChange={e => setFinanceOpTypeFilter(e.target.value)} className="w-full px-3 py-2 rounded-lg border border-slate-200 text-sm outline-none focus:ring-2 focus:ring-indigo-500">
                  <option value="todos">Todas (Entrada/Saída)</option>
                  <option value="entrada">Apenas Entradas</option>
                  <option value="saida">Apenas Saídas</option>
                </select>
              </div>
              <div className="space-y-1">
                <label className="block text-xs font-bold text-slate-500 uppercase">Status Pagamento</label>
                <select value={financeStatusFilter} onChange={e => setFinanceStatusFilter(e.target.value)} className="w-full px-3 py-2 rounded-lg border border-slate-200 text-sm outline-none focus:ring-2 focus:ring-indigo-500">
                  <option value="todos">Todos (Pago/Pendente)</option>
                  <option value="pago">Apenas Pagos</option>
                  <option value="pendente">Apenas Pendentes</option>
                </select>
              </div>
              <div className="space-y-1">
                <label className="block text-xs font-bold text-slate-500 uppercase">Agrupar por</label>
                <select value={groupBy} onChange={e => setGroupBy(e.target.value)} className="w-full px-3 py-2 rounded-lg border border-slate-200 text-sm outline-none focus:ring-2 focus:ring-indigo-500">
                  <option value="nenhum">Nenhum Agrupamento</option>
                  <option value="data">Data de Vencimento</option>
                  <option value="tipo">Tipo (Entrada/Saída)</option>
                  <option value="status">Status (Pago/Pendente)</option>
                  <option value="pessoa">Pessoa</option>
                </select>
              </div>
            </>
          )}

          {type === 'inventory' && (
            <div className="space-y-1">
              <label className="block text-xs font-bold text-slate-500 uppercase">Status Estoque</label>
              <select value={stockStatusFilter} onChange={e => setStockStatusFilter(e.target.value)} className="w-full px-3 py-2 rounded-lg border border-slate-200 text-sm outline-none focus:ring-2 focus:ring-indigo-500">
                <option value="todos">Todos os Níveis</option>
                <option value="minimo">Abaixo do Mínimo</option>
                <option value="zerado">Estoques Zerados</option>
                <option value="negativo">Estoques Negativos</option>
                <option value="regular">Estoque Regular</option>
              </select>
            </div>
          )}

          {(type === 'sales' || type === 'finance') && (
            <div className="space-y-1">
              <label className="block text-xs font-bold text-slate-500 uppercase">Pessoa</label>
              <select value={personFilter} onChange={e => setPersonFilter(e.target.value)} className="w-full px-3 py-2 rounded-lg border border-slate-200 text-sm outline-none focus:ring-2 focus:ring-indigo-500">
                <option value="todos">Todas as Pessoas</option>
                {pessoas.map(p => <option key={p.id} value={p.id}>{p.nome}</option>)}
              </select>
            </div>
          )}
        </div>
      </div>

      <div className="bg-white rounded-2xl shadow-sm border border-slate-100 overflow-hidden">
        {renderTable()}
      </div>
    </div>
  );
};

export default Reports;
