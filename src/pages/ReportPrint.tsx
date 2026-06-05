import React, { useState, useEffect } from 'react';
import { useParams, useSearchParams } from 'react-router-dom';
import { Printer } from 'lucide-react';
import { useAuthStore } from '../store/authStore';
import { formatMoney, formatDate, formatTime, formatDateTime } from '../utils/format';

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
  const stockGroupFilter = searchParams.get('stockGroup') || 'todos';
  const stockTypeFilter = searchParams.get('stockType') || 'todos';
  const stockSearchTerm = searchParams.get('stockSearch') || '';
  const stockBrandFilter = searchParams.get('stockBrand') || '';
  const peopleStatusFilter = searchParams.get('peopleStatus') || 'todos';
  const groupBy = searchParams.get('groupBy') || 'nenhum';

  const professionalFilter = searchParams.get('professional') || 'todos';
  const agendaStatusFilter = searchParams.get('aStatus') || 'todos';

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
      case 'agenda': url = '/api/agenda?includeCanceled=true'; break;
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
      // Permite Venda, Mesa (Comanda) e OS
      if (s.tipo !== 'venda' && s.tipo !== 'mesa' && s.tipo !== 'os') return false;
      const dateStr = s.data_venda.includes('T') ? s.data_venda : s.data_venda.replace(' ', 'T');
      const d = new Date(dateStr);
      if (isNaN(d.getTime())) return false;
      const saleDate = d.toISOString().split('T')[0];
      const matchesDate = saleDate >= startDate && saleDate <= endDate;
      const matchesStatus = statusFilter === 'todos' || s.status === statusFilter;
      
      // Normalização da origem similar ao Reports.tsx
      const normalizeOrigem = (o: string | null, tipo: string) => {
          if (tipo === 'os') return "OS";
          if (!o) return "Balcão";
          const upper = o.toUpperCase();
          if (upper === "BALCAO" || upper === "BALCÃO") return "Balcão";
          if (upper === "MESA" || upper === "COMANDA") return "Mesa";
          return o;
      };

      const matchesOrigem = origemFilter === 'Todas' || normalizeOrigem(s.origem, s.tipo) === origemFilter;
      const matchesPerson = personFilter === 'todos' || s.pessoa_id?.toString() === personFilter;
      return matchesDate && matchesStatus && matchesOrigem && matchesPerson;
    });
  } else if (type === 'finance') {
    filteredData = data.filter(a => {
      if (!a.vencimento) return false;
      const dateStr = a.vencimento.includes('T') ? a.vencimento : a.vencimento + 'T12:00:00';
      const d = new Date(dateStr);
      if (isNaN(d.getTime())) return false;
      const dueDate = d.toISOString().split('T')[0];
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
      
      let matchesStatus = true;
      switch (stockStatusFilter) {
        case 'minimo': matchesStatus = estoque > 0 && estoque <= minimo; break;
        case 'regular': matchesStatus = estoque > minimo; break;
        case 'negativo': matchesStatus = estoque < 0; break;
        case 'zerado': matchesStatus = estoque === 0; break;
        default: matchesStatus = true;
      }
      
      const matchesGroup = stockGroupFilter === "todos" || p.grupo_id?.toString() === stockGroupFilter;
      const matchesType = stockTypeFilter === "todos" || p.tipo === stockTypeFilter;
      const matchesBrand = !stockBrandFilter || p.marca?.toLowerCase().includes(stockBrandFilter.toLowerCase());
      
      let matchesSearchTerm = true;
      if (stockSearchTerm) {
        const lowerTerm = stockSearchTerm.toLowerCase();
        matchesSearchTerm = (p.nome && p.nome.toLowerCase().includes(lowerTerm)) || 
                            (p.codigo_barras && p.codigo_barras.toLowerCase().includes(lowerTerm));
      }

      return matchesStatus && matchesGroup && matchesType && matchesBrand && matchesSearchTerm;
    });
  } else if (type === 'people') {
    filteredData = data.filter(p => {
      if (peopleStatusFilter === 'aniversariantes') {
        if (!p.data_aniversario) return false;
        const dateStr = p.data_aniversario.includes('T') ? p.data_aniversario : p.data_aniversario + 'T12:00:00';
        const bday = new Date(dateStr);
        if (isNaN(bday.getTime())) return false;
        
        const sDate = startDate ? new Date(startDate + 'T00:00:00') : new Date(new Date().getFullYear(), new Date().getMonth(), 1);
        const eDate = endDate ? new Date(endDate + 'T23:59:59') : new Date();
        
        // Translated birthday to the current year
        const currentYear = sDate.getFullYear();
        const bdayThisYear = new Date(currentYear, bday.getMonth(), bday.getDate(), 12, 0, 0);
        
        return bdayThisYear >= sDate && bdayThisYear <= eDate;
      }
      return true;
    });
  } else if (type === 'agenda') {
    filteredData = data.filter((a) => {
      if (!a.data_inicio) return false;
      
      let dateStr = a.data_inicio;
      if (!dateStr.includes("T")) {
        dateStr = dateStr.replace(" ", "T");
        if (!dateStr.includes("T")) dateStr += "T00:00:00";
      }
      
      const d = new Date(dateStr);
      if (isNaN(d.getTime())) return false;
      
      const agendaDate = d.toISOString().split("T")[0];
      const matchesDate = agendaDate >= startDate && agendaDate <= endDate;
      
      const isAgendado = !a.status || ['Pendente', 'Confirmado', 'Check-in Realizado'].includes(a.status);
      const mappedStatus = isAgendado ? 'Agendado' : a.status;
      const matchesStatus = agendaStatusFilter === "todos" || mappedStatus === agendaStatusFilter;

      const matchesProfessional = professionalFilter === "todos" || a.usuario_id?.toString() === professionalFilter;
      const matchesPerson = personFilter === "todos" || a.pessoa_id?.toString() === personFilter;
      return matchesDate && matchesStatus && matchesProfessional && matchesPerson;
    });
  }

  const getTitle = () => {
    switch (type) {
      case 'sales': return 'Relatório de Vendas';
      case 'inventory': return 'Relatório de Estoque';
      case 'finance': return 'Relatório Financeiro';
      case 'people': return 'Relatório de Pessoas';
      case 'agenda': return 'Relatório de Agendamentos';
      default: return 'Relatório';
    }
  };

  return (
    <div className="bg-white min-h-screen p-8 text-slate-900 font-sans">
      <div className="max-w-4xl mx-auto border border-slate-200 p-8 rounded-lg shadow-sm print:shadow-none print:border-none print:p-0">
        <div className="flex justify-between items-start border-b-2 border-slate-900 pb-6 mb-6">
          <div className="flex-1 flex items-start gap-4">
            {company?.logo && (
              <img src={company.logo} alt="Logo" className="h-16 object-contain" />
            )}
            <div>
              <h2 className="text-xl font-black text-slate-900 uppercase tracking-tight">{company?.nome_fantasia || user?.nome}</h2>
            </div>
          </div>
          <div className="text-right shrink-0">
            <div className="bg-slate-900 text-white px-4 py-2 rounded-lg mb-2">
              <h1 className="text-xl font-black uppercase tracking-widest">{getTitle()}</h1>
            </div>
            <p className="text-slate-500 text-xs font-bold uppercase mt-1">Gerado em: {formatDateTime(new Date())}</p>
            <p className="text-slate-500 text-[10px] font-bold uppercase">Período: {formatDate(startDate)} - {formatDate(endDate)}</p>
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
                    <td className="py-2 text-slate-700">{formatDate(s.data_venda)}</td>
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
                      <span className="text-slate-900">
                        {filteredData.reduce((sum, p) => sum + (parseFloat(p.estoque_atual) || 0), 0).toLocaleString('pt-BR', { minimumFractionDigits: 0, maximumFractionDigits: 3 })}
                      </span>
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
                  if (groupBy === 'data') key = formatDate(item.vencimento);
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
                            <td className="py-2 text-slate-700">{formatDate(a.vencimento)}</td>
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
                        <td className="py-2 text-slate-700">{formatDate(a.vencimento)}</td>
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
                  <th className="py-2 font-bold text-slate-900 text-right">Aniversário</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filteredData.map(p => (
                  <tr key={`people-${p.id}`}>
                    <td className="py-2 text-slate-700 font-medium">{p.razao_social || p.nome}</td>
                    <td className="py-2 text-slate-700 capitalize">{p.tipo_pessoa}</td>
                    <td className="py-2 text-slate-700 font-mono text-xs">{p.cpf_cnpj}</td>
                    <td className="py-2 text-slate-700">{p.telefone_celular || p.telefone}</td>
                    <td className="py-2 text-slate-700 text-right">
                      {p.data_aniversario ? formatDate(p.data_aniversario) : '-'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}

          {type === 'agenda' && (
            <table className="w-full text-left text-sm">
              <thead className="border-b border-slate-200">
                <tr>
                  <th className="py-2 font-bold text-slate-900">Data/Hora</th>
                  <th className="py-2 font-bold text-slate-900">Cliente</th>
                  <th className="py-2 font-bold text-slate-900">Profissional</th>
                  <th className="py-2 font-bold text-slate-900 text-right">Valor</th>
                  <th className="py-2 font-bold text-slate-900 text-center">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filteredData.map(a => (
                  <tr key={`agenda-${a.id}`}>
                    <td className="py-2 text-slate-700 whitespace-nowrap">
                      {(() => {
                        const datePart = formatDate(a.data_inicio);
                        const timeStart = formatTime(a.data_inicio);
                        const timeEnd = formatTime(a.data_fim);
                        
                        return (
                          <div className="flex flex-col">
                            <span className="font-bold text-slate-900">{datePart}</span>
                            <span className="text-[10px] text-slate-500">{timeStart}{timeEnd !== '-' ? ` - ${timeEnd}` : ""}</span>
                          </div>
                        );
                      })()}
                    </td>
                    <td className="py-2 text-slate-700 font-medium">{a.cliente_nome || '-'}</td>
                    <td className="py-2 text-slate-700">{a.profissional_nome || '-'}</td>
                    <td className="py-2 text-slate-700 text-right font-bold">R$ {formatMoney(a.valor_total || 0)}</td>
                    <td className="py-2 text-center text-[10px] font-bold uppercase">{a.status || 'Agendado'}</td>
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
