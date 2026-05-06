import React, { useState, useEffect, useCallback } from 'react';
import { useAuthStore } from '../store/authStore';

const formatMoney = (v: number | string | undefined | null) => {
  if (v === undefined || v === null) return '0,00';
  const num = typeof v === 'string' ? parseFloat(v) : v;
  return isNaN(num) ? '0,00' : num.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
};

export const DRE = () => {
  const token = useAuthStore(state => state.token);
  const [startDate, setStartDate] = useState(() => {
    const now = new Date();
    return new Date(now.getFullYear(), now.getMonth(), 1).toISOString().split('T')[0];
  });
  const [endDate, setEndDate] = useState(() => {
    const now = new Date();
    return new Date(now.getFullYear(), now.getMonth() + 1, 0).toISOString().split('T')[0];
  });
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchDRE = useCallback(() => {
    if (!token) return;
    setLoading(true);
    fetch(`/api/finance/dre?start=${startDate}&end=${endDate}`, {
      headers: { 'Authorization': `Bearer ${token}` }
    })
    .then(res => res.json())
    .then(d => {
      if (d.error) throw new Error(d.error);
      setData(d);
      setLoading(false);
    })
    .catch(err => {
      setError(err.message);
      setLoading(false);
    });
  }, [token, startDate, endDate]);

  useEffect(() => {
    fetchDRE();
  }, [fetchDRE]);

  return (
    <div className="space-y-6">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <h1 className="text-3xl font-bold text-slate-900">DRE (Demonstração do Resultado)</h1>
        <div className="flex bg-white p-1 rounded-xl border border-slate-100 shadow-sm overflow-x-auto items-center gap-2">
           <input 
              type="date"
              className="px-3 py-2 rounded-lg border border-slate-200 outline-none focus:ring-2 focus:ring-indigo-500 text-sm"
              value={startDate}
              onChange={e => setStartDate(e.target.value)}
            />
            <span className="text-slate-400">até</span>
            <input 
              type="date"
              className="px-3 py-2 rounded-lg border border-slate-200 outline-none focus:ring-2 focus:ring-indigo-500 text-sm"
              value={endDate}
              onChange={e => setEndDate(e.target.value)}
            />
        </div>
      </div>

      {loading && <div className="text-center p-8 text-slate-500">Calculando DRE...</div>}
      {error && <div className="text-center p-8 text-rose-500 font-bold">{error}</div>}

      {!loading && !error && data && (
        <div className="bg-white rounded-2xl shadow-sm border border-slate-100 p-8 space-y-6 max-w-4xl mx-auto">
          <div className="text-center border-b border-slate-100 pb-4 mb-6">
            <h2 className="text-xl text-slate-900 font-black uppercase tracking-tight">Demonstração do Resultado do Exercício</h2>
            <p className="text-slate-500 text-sm">
              Período de {new Date(startDate + 'T12:00:00').toLocaleDateString()} a {new Date(endDate + 'T12:00:00').toLocaleDateString()}
            </p>
          </div>

          <div className="space-y-4 font-mono text-sm">
            {/* Receita Bruta */}
            <div className="flex justify-between items-center text-lg font-bold text-slate-900">
              <span>(=) Receita Operacional Bruta</span>
              <span>R$ {formatMoney(data.receita_bruta)}</span>
            </div>

            {/* Deduções */}
            <div className="pl-6 flex justify-between items-center text-slate-600">
              <span>(-) Descontos Concedidos</span>
              <span className="text-rose-600">R$ {formatMoney(data.descontos)}</span>
            </div>

            {/* Receita Líquida */}
            <div className="flex justify-between items-center text-lg font-bold text-slate-800 border-t border-slate-100 pt-4">
              <span>(=) Receita Operacional Líquida</span>
              <span>R$ {formatMoney(data.receita_liquida)}</span>
            </div>

            {/* CMV */}
            <div className="pl-6 flex justify-between items-center text-slate-600 mt-2">
              <span>(-) Custo das Mercadorias Vendidas (CMV)</span>
              <span className="text-amber-600">R$ {formatMoney(data.cmv)}</span>
            </div>

            {/* Lucro Bruto */}
            <div className="flex justify-between items-center text-lg font-bold text-slate-800 border-t border-slate-100 pt-4">
              <span>(=) Lucro Bruto</span>
              <span className="text-emerald-700">R$ {formatMoney(data.lucro_bruto)}</span>
            </div>

            {/* Outras Receitas */}
            <div className="pt-2">
              <span className="font-bold text-slate-700">(+) Outras Receitas</span>
              <div className="pl-6 space-y-2 mt-2">
                {data.outras_receitas && data.outras_receitas.length > 0 ? data.outras_receitas.map((d: any, idx: number) => (
                  <div key={idx} className="flex justify-between text-slate-600">
                    <span>+ {d.categoria}</span>
                    <span className="text-emerald-600">R$ {formatMoney(d.total)}</span>
                  </div>
                )) : (
                  <div className="text-slate-400 italic">Nenhuma outra receita registrada.</div>
                )}
              </div>
            </div>

            <div className="pl-6 flex justify-between items-center font-bold text-slate-700 border-t border-slate-100 pt-2">
              <span>Total de Outras Receitas</span>
              <span className="text-emerald-600">R$ {formatMoney(data.total_outras_receitas)}</span>
            </div>

            {/* Despesas Operacionais */}
            <div className="pt-2">
              <span className="font-bold text-slate-700">(-) Despesas Operacionais</span>
              <div className="pl-6 space-y-2 mt-2">
                {data.despesas && data.despesas.length > 0 ? data.despesas.map((d: any, idx: number) => (
                  <div key={idx} className="flex justify-between text-slate-600">
                    <span>- {d.categoria}</span>
                    <span className="text-rose-600">R$ {formatMoney(d.total)}</span>
                  </div>
                )) : (
                  <div className="text-slate-400 italic">Nenhuma despesa registrada.</div>
                )}
              </div>
            </div>

            <div className="pl-6 flex justify-between items-center font-bold text-slate-700 border-t border-slate-100 pt-2">
              <span>Total de Despesas Operacionais</span>
              <span className="text-rose-600">R$ {formatMoney(data.total_despesas)}</span>
            </div>

            {/* Lucro Líquido */}
            <div className="flex justify-between items-center text-xl font-black text-slate-900 border-t-2 border-slate-900 pt-4 mt-6">
              <span>(=) Resultado Líquido do Exercício</span>
              <span className={data.lucro_liquido >= 0 ? 'text-emerald-600' : 'text-rose-600'}>
                R$ {formatMoney(data.lucro_liquido)}
              </span>
            </div>
            
          </div>
        </div>
      )}
    </div>
  );
};
