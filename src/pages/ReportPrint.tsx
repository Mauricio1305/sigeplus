import React, { useState, useEffect } from 'react';
import { useParams, useSearchParams } from 'react-router-dom';
import { Printer } from 'lucide-react';
import { useAuthStore } from '../store/authStore';
import { formatMoney } from '../utils/format';

export const ReportPrint = () => {
  const { type } = useParams();
  const [searchParams] = useSearchParams();
  const [data, setData] = useState<any[]>([]);
  const [company, setCompany] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const tokenStore = useAuthStore(state => state.token);
  const user = useAuthStore(state => state.user);
  const logout = useAuthStore(state => state.logout);

  const urlToken = searchParams.get('t');
  const activeToken = (urlToken && urlToken !== 'null' && urlToken !== 'undefined') ? urlToken : tokenStore;

  const startDate = searchParams.get('start') || '';
  const endDate = searchParams.get('end') || '';
  const statusFilter = searchParams.get('status') || 'todos';
  const origemFilter = searchParams.get('origem') || 'Todas';
  const financeTypeFilterStr = searchParams.get('fType') || 'receita,despesa,Caixa,Banco,Cartão';
  const financeTypeFilter = financeTypeFilterStr.split(',');
  const financeOpTypeFilter = searchParams.get('fOpType') || 'todos';
  const financeStatusFilter = searchParams.get('fStatus') || 'todos';
  const personFilter = searchParams.get('person') || 'todos';
  const stockStatusFilter = searchParams.get('stockStatus') || 'todos';
  const groupBy = searchParams.get('groupBy') || 'nenhum';

  useEffect(() => {
    if (!activeToken || activeToken === 'null' || activeToken === 'undefined') {
      setError('Acesso expirado ou token ausente. Por favor, faça login novamente no sistema.');
      setLoading(false);
      return;
    }
    
    setLoading(true);
    let url = '';
    switch (type) {
      case 'sales': url = '/api/sales'; break;
      case 'inventory': url = '/api/products'; break;
      case 'finance': url = '/api/finance/accounts'; break;
      case 'people': url = '/api/pessoas'; break;
      default: return;
    }

    fetch(url, { headers: { 'Authorization': `Bearer ${activeToken}` } })
      .then(async res => {
        if (res.status === 401) {
          setError('Acesso expirado ou inválido. Por favor, faça login novamente no sistema e tente abrir a impressão de novo.');
          setLoading(false);
          return;
        }
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

    fetch('/api/company/settings', { headers: { 'Authorization': `Bearer ${activeToken}` } })
      .then(res => res.json())
      .then(setCompany)
      .catch(err => console.error("Error fetching company settings:", err));
  }, [type, activeToken, logout]);

  if (loading) return <div className="p-8 text-center text-slate-500">Gerando relatório...</div>;
  if (error) return <div className="p-8 text-center text-rose-500">Erro: {error}</div>;

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
  } else if (type === 'finance') {
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

      const matchesStatus = financeStatusFilter === 'todos' || (financeStatusFilter === 'pago' ? a.pago : !a.pago);
      const matchesPerson = personFilter === 'todos' || a.pessoa_id?.toString() === personFilter;
      return matchesDate && matchesType && matchesOpType && matchesStatus && matchesPerson;
    });
  } else if (type === 'inventory') {
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

  const getTitle = () => {
    switch (type) {
      case 'sales': return 'Relatório de Vendas';
      case 'inventory': return 'Relatório de Estoque';
      case 'finance': return 'Relatório Financeiro';
      case 'people': return 'Relatório de Pessoas';
      default: return 'Relatório';
    }
  };

  return (
    <div className="bg-white min-h-screen p-8 text-slate-900 font-sans">
      <div className="max-w-4xl mx-auto border border-slate-200 p-8 rounded-lg shadow-sm print:shadow-none print:border-none print:p-0">
        <div className="flex justify-between items-start border-b-2 border-slate-900 pb-6 mb-6">
          <div className="flex-1">
            <h2 className="text-2xl font-black text-slate-900 uppercase tracking-tight">{company?.nome_fantasia || user?.nome}</h2>
            {company?.razao_social && <p className="text-sm font-bold text-slate-700">{company.razao_social}</p>}
            <div className="mt-2 text-xs text-slate-500 space-y-0.5">
              {company?.cnpj && <p><span className="font-bold text-slate-700">CNPJ/CPF:</span> {company.cnpj}</p>}
              {(company?.telefone_fixo || company?.telefone_celular) && (
                <p>
                  <span className="font-bold text-slate-700">Fone:</span> {company.telefone_fixo} {company.telefone_fixo && company.telefone_celular ? ' / ' : ''} {company.telefone_celular}
                </p>
              )}
              {company?.email && <p><span className="font-bold text-slate-700">E-mail:</span> {company.email}</p>}
              {company?.endereco && (
                <p>
                  <span className="font-bold text-slate-700">Endereço:</span> {company.endereco}, {company.numero} - {company.cidade}/{company.estado} - CEP: {company.cep}
                </p>
              )}
            </div>
          </div>
          <div className="text-right shrink-0">
            <div className="bg-slate-900 text-white px-4 py-2 rounded-lg mb-2">
              <h1 className="text-xl font-black uppercase tracking-widest">{getTitle()}</h1>
            </div>
            <p className="text-slate-500 text-xs font-bold uppercase mt-1">Gerado em: {new Date().toLocaleDateString()} {new Date().toLocaleTimeString()}</p>
            <p className="text-slate-500 text-[10px] font-bold uppercase">Período: {new Date(startDate + 'T12:00:00').toLocaleDateString()} - {new Date(endDate + 'T12:00:00').toLocaleDateString()}</p>
          </div>
        </div>

        <div className="mb-8">
          {type === 'sales' && (
            <table className="w-full text-left text-sm">
              <thead className="border-b border-slate-200">
                <tr>
                  <th className="py-2 font-bold text-slate-900">Nº</th>
                  <th className="py-2 font-bold text-slate-900">Data</th>
                  <th className="py-2 font-bold text-slate-900">Cliente</th>
                  <th className="py-2 font-bold text-slate-900 text-right">Total</th>
                  <th className="py-2 font-bold text-slate-900 text-center">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filteredData.map(s => (
                  <tr key={`sale-${s.id}`}>
                    <td className="py-2 text-slate-700">#{s.id.toString().padStart(6, '0')}</td>
                    <td className="py-2 text-slate-700">{new Date(s.data_venda).toLocaleDateString()}</td>
                    <td className="py-2 text-slate-700">{s.cliente_nome || 'Consumidor Final'}</td>
                    <td className="py-2 text-slate-700 text-right font-bold">R$ {formatMoney(s.valor_total)}</td>
                    <td className="py-2 text-center">
                      <span className="text-[10px] font-bold uppercase">{s.status}</span>
                    </td>
                  </tr>
                ))}
              </tbody>
              <tbody className="border-t-2 border-slate-900 font-bold">
                <tr>
                  <td colSpan={3} className="py-4 text-right text-slate-600 uppercase text-xs tracking-wider">Totais:</td>
                  <td colSpan={2} className="py-4 text-right space-y-1">
                    <div className="flex justify-between text-xs">
                      <span className="text-slate-500">Qtd. Vendas:</span>
                      <span className="text-slate-900">{filteredData.length}</span>
                    </div>
                    <div className="flex justify-between text-sm">
                      <span className="text-slate-500">Valor Total:</span>
                      <span className="text-slate-900">R$ {formatMoney(filteredData.reduce((sum, s) => sum + (parseFloat(s.valor_total) || 0), 0))}</span>
                    </div>
                  </td>
                </tr>
              </tbody>
            </table>
          )}

          {type === 'inventory' && (
            <table className="w-full text-left text-sm">
              <thead className="border-b border-slate-200">
                <tr>
                  <th className="py-2 font-bold text-slate-900">Nome</th>
                  <th className="py-2 font-bold text-slate-900">Tipo</th>
                  <th className="py-2 font-bold text-slate-900 text-right">Preço</th>
                  <th className="py-2 font-bold text-slate-900 text-right">Estoque</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filteredData.map(p => (
                  <tr key={`inventory-${p.id}`}>
                    <td className="py-2 text-slate-700 font-medium">{p.nome}</td>
                    <td className="py-2 text-slate-700 capitalize">{p.tipo}</td>
                    <td className="py-2 text-slate-700 text-right">R$ {formatMoney(p.preco_venda)}</td>
                    <td className="py-2 text-slate-700 text-right font-bold">
                      <span className={
                        (p.estoque_atual || 0) < 0 ? 'text-rose-600' : 
                        (p.estoque_atual || 0) === 0 ? 'text-amber-600' : 
                        (p.estoque_atual || 0) <= (p.estoque_minimo || 0) ? 'text-orange-600' : 
                        'text-emerald-600'
                      }>
                        {p.estoque_atual} {p.unidade}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
              <tbody className="border-t-2 border-slate-900 font-bold">
                <tr>
                  <td colSpan={2} className="py-4 text-right text-slate-600 uppercase text-xs tracking-wider">Totais:</td>
                  <td colSpan={2} className="py-4 text-right space-y-1">
                    <div className="flex justify-between text-xs">
                      <span className="text-slate-500">Total de Itens:</span>
                      <span className="text-slate-900">{filteredData.reduce((sum, p) => sum + (p.estoque_atual || 0), 0)}</span>
                    </div>
                    <div className="flex justify-between text-xs">
                      <span className="text-slate-500">Total Valor Custo:</span>
                      <span className="text-slate-900">R$ {formatMoney(filteredData.reduce((sum, p) => sum + ((parseFloat(p.custo) || 0) * (parseFloat(p.estoque_atual) || 0)), 0))}</span>
                    </div>
                    <div className="flex justify-between text-sm">
                      <span className="text-slate-500">Total Valor Venda:</span>
                      <span className="text-indigo-600">R$ {formatMoney(filteredData.reduce((sum, p) => sum + ((parseFloat(p.preco_venda) || 0) * (parseFloat(p.estoque_atual) || 0)), 0))}</span>
                    </div>
                  </td>
                </tr>
              </tbody>
            </table>
          )}

          {type === 'finance' && (
            <>
              {groupBy !== 'nenhum' ? (() => {
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

                return Object.entries(groups).map(([groupTitle, items]) => (
                  <div key={groupTitle} className="mb-8 break-inside-avoid">
                    <h3 className="bg-slate-100 p-2 font-bold text-slate-800 text-sm mb-2">{groupTitle} ({items.length} registros)</h3>
                    <table className="w-full text-left text-sm">
                      <thead className="border-b border-slate-200">
                        <tr>
                          <th className="py-2 font-bold text-slate-900">Vencimento</th>
                          <th className="py-2 font-bold text-slate-900">Descrição</th>
                          <th className="py-2 font-bold text-slate-900">Categoria</th>
                          <th className="py-2 font-bold text-slate-900">Pessoa</th>
                          <th className="py-2 font-bold text-slate-900 text-right">Valor</th>
                          <th className="py-2 font-bold text-slate-900 text-center">Status</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {items.map(a => (
                          <tr key={`finance-print-grouped-${a.local}-${a.id}-${a.tipo}`}>
                            <td className="py-2 text-slate-700">{new Date(a.vencimento + (a.vencimento.includes('T') ? '' : 'T12:00:00')).toLocaleDateString()}</td>
                            <td className="py-2 text-slate-700 font-medium">{a.descricao}</td>
                            <td className="py-2 text-slate-700">{a.categoria_nome || '-'}</td>
                            <td className="py-2 text-slate-700">{a.pessoa_nome || '-'}</td>
                            <td className="py-2 text-slate-700 text-right">R$ {formatMoney(a.valor)}</td>
                            <td className="py-2 text-center text-[10px] font-bold uppercase">{a.pago ? 'Pago' : 'Pendente'}</td>
                          </tr>
                        ))}
                      </tbody>
                      <tfoot>
                        <tr className="bg-slate-50">
                          <td colSpan={4} className="py-2 text-right font-bold pr-2">Total do Grupo:</td>
                          <td className="py-2 text-right font-bold text-slate-900">R$ {formatMoney(items.reduce((acc, i) => acc + i.valor, 0))}</td>
                          <td></td>
                        </tr>
                      </tfoot>
                    </table>
                  </div>
                ));
              })() : (
                <table className="w-full text-left text-sm">
                  <thead className="border-b border-slate-200">
                    <tr>
                      <th className="py-2 font-bold text-slate-900">Vencimento</th>
                      <th className="py-2 font-bold text-slate-900">Descrição</th>
                      <th className="py-2 font-bold text-slate-900">Categoria</th>
                      <th className="py-2 font-bold text-slate-900">Pessoa</th>
                      <th className="py-2 font-bold text-slate-900 text-right">Valor</th>
                      <th className="py-2 font-bold text-slate-900 text-center">Status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {filteredData.map(a => (
                      <tr key={`finance-print-${a.local}-${a.id}-${a.tipo}`}>
                        <td className="py-2 text-slate-700">{new Date(a.vencimento + (a.vencimento.includes('T') ? '' : 'T12:00:00')).toLocaleDateString()}</td>
                        <td className="py-2 text-slate-700 font-medium">{a.descricao}</td>
                        <td className="py-2 text-slate-700">{a.categoria_nome || '-'}</td>
                        <td className="py-2 text-slate-700">{a.pessoa_nome || '-'}</td>
                        <td className="py-2 text-slate-700 text-right font-bold">R$ {formatMoney(a.valor)}</td>
                        <td className="py-2 text-center text-[10px] font-bold uppercase">{a.pago ? 'Pago' : 'Pendente'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}

              {/* Resumo Final */}
              <div className="mt-8 border-t-2 border-slate-200 pt-4 flex justify-end gap-12">
                <div className="text-right">
                  <span className="text-xs text-slate-500 uppercase block">Total Receitas</span>
                  <span className="text-emerald-700 font-bold">R$ {formatMoney(filteredData.reduce((sum, a) => sum + (a.tipo === 'receita' ? (parseFloat(a.valor) || 0) : 0), 0))}</span>
                </div>
                <div className="text-right">
                  <span className="text-xs text-slate-500 uppercase block">Total Despesas</span>
                  <span className="text-rose-700 font-bold">R$ {formatMoney(filteredData.reduce((sum, a) => sum + (a.tipo !== 'receita' ? (parseFloat(a.valor) || 0) : 0), 0))}</span>
                </div>
                <div className="text-right">
                  <span className="text-xs text-slate-500 uppercase block">Saldo Líquido</span>
                  <span className={`font-bold ${filteredData.reduce((sum, a) => sum + (a.tipo === 'receita' ? (parseFloat(a.valor) || 0) : -(parseFloat(a.valor) || 0)), 0) >= 0 ? 'text-indigo-700' : 'text-rose-700'}`}>
                    R$ {formatMoney(filteredData.reduce((sum, a) => sum + (a.tipo === 'receita' ? (parseFloat(a.valor) || 0) : -(parseFloat(a.valor) || 0)), 0))}
                  </span>
                </div>
              </div>
            </>
          )}

          {type === 'people' && (
            <table className="w-full text-left text-sm">
              <thead className="border-b border-slate-200">
                <tr>
                  <th className="py-2 font-bold text-slate-900">Nome / Razão Social</th>
                  <th className="py-2 font-bold text-slate-900">Tipo</th>
                  <th className="py-2 font-bold text-slate-900">CPF/CNPJ</th>
                  <th className="py-2 font-bold text-slate-900">Contato</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {data.map(p => (
                  <tr key={`people-${p.id}`}>
                    <td className="py-2 text-slate-700 font-medium">{p.razao_social || p.nome}</td>
                    <td className="py-2 text-slate-700 capitalize">{p.tipo_pessoa}</td>
                    <td className="py-2 text-slate-700 font-mono text-xs">{p.cpf_cnpj}</td>
                    <td className="py-2 text-slate-700">{p.telefone_celular || p.telefone}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        <div className="mt-12 text-center print:hidden">
          <button 
            onClick={() => window.print()}
            className="bg-indigo-600 text-white px-8 py-3 rounded-xl font-bold hover:bg-indigo-700 transition-all shadow-lg shadow-indigo-200 flex items-center gap-2 mx-auto cursor-pointer"
          >
            <Printer className="w-5 h-5" />
            Confirmar Impressão
          </button>
        </div>
      </div>
    </div>
  );
};

export default ReportPrint;
