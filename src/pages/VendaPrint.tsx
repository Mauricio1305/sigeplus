import React, { useState, useEffect } from 'react';
import { useParams, useSearchParams } from 'react-router-dom';
import { Printer, AlertCircle } from 'lucide-react';
import { useAuthStore } from '../store/authStore';
import { formatMoney } from '../utils/format';

export const VendaPrint = () => {
  const { id } = useParams();
  const [sale, setSale] = useState<any>(null);
  const [company, setCompany] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);
  const [searchParams] = useSearchParams();
  const urlToken = searchParams.get('t');
  const tokenStore = useAuthStore(state => state.token);
  const token = (urlToken && urlToken !== 'null' && urlToken !== 'undefined') ? urlToken : tokenStore;
  const user = useAuthStore(state => state.user);
  const logout = useAuthStore(state => state.logout);

  useEffect(() => {
    if (!id || !token || token === 'null' || token === 'undefined') {
      return;
    }
    
    // Fetch Sale
    fetch(`/api/sales/${id}`, { headers: { 'Authorization': `Bearer ${token}` } })
      .then(async res => {
        if (res.status === 401) {
          setError('Acesso expirado ou inválido. Por favor, faça login novamente no sistema e tente abrir a impressão de novo.');
          return;
        }
        const data = await res.json();
        if (!res.ok) {
          throw new Error(data.error || 'Erro ao carregar dados da venda');
        }
        setSale(data);
      })
      .catch(err => {
        console.error("Error fetching sale:", err);
        setError(err.message);
      });

    // Fetch Company Settings
    fetch('/api/company/settings', { headers: { 'Authorization': `Bearer ${token}` } })
      .then(res => res.json())
      .then(setCompany)
      .catch(err => console.error("Error fetching company settings:", err));
  }, [id, token, logout]);

  if (error) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4">
        <div className="bg-white p-8 rounded-2xl shadow-sm border border-slate-100 text-center max-w-md">
          <AlertCircle className="w-12 h-12 text-rose-500 mx-auto mb-4" />
          <h2 className="text-xl font-bold text-slate-900 mb-2">Erro ao Carregar</h2>
          <p className="text-slate-500 mb-6">{error}</p>
          <button 
            onClick={() => window.close()}
            className="bg-slate-100 text-slate-600 px-6 py-2 rounded-xl font-bold hover:bg-slate-200 transition-all"
          >
            Fechar Janela
          </button>
        </div>
      </div>
    );
  }

  if (!sale || !sale.id) return <div className="p-8 text-center text-slate-500">Carregando...</div>;

  return (
    <div className="bg-white min-h-screen p-8 text-slate-900 font-sans">
      <div className="max-w-3xl mx-auto border border-slate-200 p-8 rounded-lg shadow-sm print:shadow-none print:border-none print:p-0">
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
              <h1 className="text-xl font-black uppercase tracking-widest">{sale.tipo === 'os' ? 'Ordem de Serviço' : 'Pedido de Venda'}</h1>
            </div>
            <p className="text-2xl font-black text-slate-900">#{sale.id.toString().padStart(6, '0')}</p>
            <p className="text-slate-500 text-xs font-bold uppercase mt-1">Data: {sale.data_venda ? new Date(sale.data_venda).toLocaleDateString() : ''}</p>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-8 mb-8">
          <div>
            <h3 className="text-sm font-bold text-slate-400 uppercase tracking-wider mb-2">Cliente</h3>
            <p className="font-bold text-slate-900 text-lg">{sale.cliente_razao_social || sale.cliente_nome || 'Consumidor Final'}</p>
            {sale.cliente_nome_fantasia && <p className="text-sm text-slate-600 font-medium">{sale.cliente_nome_fantasia}</p>}
            <div className="mt-2 text-xs text-slate-500 space-y-0.5">
              {sale.cliente_cpf_cnpj && <p><span className="font-bold text-slate-700">CPF/CNPJ:</span> {sale.cliente_cpf_cnpj}</p>}
              {(sale.cliente_telefone_fixo || sale.cliente_telefone_celular || sale.cliente_telefone) && (
                <p>
                  <span className="font-bold text-slate-700">Fone:</span> {sale.cliente_telefone_fixo} {sale.cliente_telefone_fixo && (sale.cliente_telefone_celular || sale.cliente_telefone) ? ' / ' : ''} {sale.cliente_telefone_celular || sale.cliente_telefone}
                </p>
              )}
              {sale.cliente_email && <p><span className="font-bold text-slate-700">E-mail:</span> {sale.cliente_email}</p>}
              {sale.cliente_endereco && (
                <p>
                  <span className="font-bold text-slate-700">Endereço:</span> {sale.cliente_endereco}, {sale.cliente_numero} - {sale.cliente_cidade}/{sale.cliente_uf} - CEP: {sale.cliente_cep}
                </p>
              )}
            </div>
          </div>
          <div className="text-right">
            <h3 className="text-sm font-bold text-slate-400 uppercase tracking-wider mb-2">Detalhes do Pedido</h3>
            <p className="text-slate-700"><span className="font-semibold">Status:</span> <span className="uppercase">{sale.status}</span></p>
            <p className="text-slate-700"><span className="font-semibold">Tipo:</span> <span className="uppercase">{sale.tipo === 'os' ? 'Ordem de Serviço' : 'Pedido de Venda'}</span></p>
          </div>
        </div>

        {sale.tipo === 'os' && (sale.solicitacao || sale.laudo_tecnico) && (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-8 mb-8 border-t border-slate-200 pt-6">
            {sale.solicitacao && (
              <div>
                <h3 className="text-sm font-bold text-slate-400 uppercase tracking-wider mb-2">Solicitação</h3>
                <p className="text-slate-700 whitespace-pre-wrap">{sale.solicitacao}</p>
              </div>
            )}
            {sale.laudo_tecnico && (
              <div>
                <h3 className="text-sm font-bold text-slate-400 uppercase tracking-wider mb-2">Laudo Técnico</h3>
                <p className="text-slate-700 whitespace-pre-wrap">{sale.laudo_tecnico}</p>
              </div>
            )}
          </div>
        )}

        <table className="w-full text-left mb-8">
          <thead className="border-b border-slate-200">
            <tr>
              <th className="py-3 font-bold text-slate-900">Item</th>
              <th className="py-3 font-bold text-slate-900 text-center">Qtd</th>
              <th className="py-3 font-bold text-slate-900 text-right">Preço Unit.</th>
              <th className="py-3 font-bold text-slate-900 text-right">Subtotal</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {sale.items && sale.items.map((item: any, index: number) => (
              <tr key={index}>
                <td className="py-3 text-slate-700">{item.nome}</td>
                <td className="py-3 text-slate-700 text-center">{item.quantidade}</td>
                <td className="py-3 text-slate-700 text-right">R$ {formatMoney(item.preco_venda)}</td>
                <td className="py-3 text-slate-700 text-right font-medium">R$ {formatMoney(item.subtotal)}</td>
              </tr>
            ))}
          </tbody>
        </table>

        <div className="flex justify-between items-start mt-8 pt-8 border-t border-slate-100">
          <div className="flex-1">
            <h3 className="text-sm font-bold text-slate-400 uppercase tracking-wider mb-2">Pagamentos</h3>
            <div className="space-y-1">
              {sale.pagamentos && sale.pagamentos.map((p: any, index: number) => (
                <p key={index} className="text-slate-700 text-sm">
                  <span className="font-semibold">{p.nome}</span>: {p.parcelas}x de R$ {formatMoney(p.valor / (p.parcelas || 1))} (Total: R$ {formatMoney(p.valor)})
                </p>
              ))}
              {(!sale.pagamentos || sale.pagamentos.length === 0) && (
                <p className="text-slate-400 text-sm italic">Nenhum pagamento registrado</p>
              )}
            </div>
          </div>
          <div className="w-64 space-y-3">
            <div className="flex justify-between text-slate-600">
              <span>Subtotal:</span>
              <span>R$ {formatMoney((parseFloat(sale.valor_total) || 0) - (parseFloat(sale.frete) || 0) + (parseFloat(sale.desconto) || 0))}</span>
            </div>
            {(sale.desconto || 0) > 0 && (
              <div className="flex justify-between text-emerald-600">
                <span>Desconto:</span>
                <span>- R$ {formatMoney(sale.desconto)}</span>
              </div>
            )}
            {(sale.frete || 0) > 0 && (
              <div className="flex justify-between text-slate-600">
                <span>Frete:</span>
                <span>+ R$ {formatMoney(sale.frete)}</span>
              </div>
            )}
            <div className="flex justify-between text-xl font-bold text-slate-900 border-t border-slate-200 pt-3 mt-3">
              <span>Total:</span>
              <span>R$ {formatMoney(sale.valor_total)}</span>
            </div>
          </div>
        </div>

        <div className="mt-12 text-center print:hidden">
          <button 
            onClick={() => {
              window.print();
            }}
            className="bg-indigo-600 text-white px-8 py-3 rounded-xl font-bold hover:bg-indigo-700 transition-all shadow-lg shadow-indigo-200 flex items-center gap-2 mx-auto cursor-pointer"
          >
            <Printer className="w-5 h-5" />
            Imprimir Pedido
          </button>
        </div>
      </div>
    </div>
  );
};

export default VendaPrint;
