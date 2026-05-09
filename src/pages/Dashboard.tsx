import React, { useState, useEffect } from 'react';
import { ShoppingCart, TrendingUp, DollarSign, AlertCircle } from 'lucide-react';
import { 
  LineChart, 
  Line, 
  XAxis, 
  YAxis, 
  CartesianGrid, 
  Tooltip, 
  ResponsiveContainer,
  BarChart,
  Bar
} from 'recharts';
import { useAuthStore } from '../store/authStore';
import { Card } from '../components/ui/Card';
import { formatMoney } from '../utils/format';

export const Dashboard = () => {
  const [stats, setStats] = useState<any>(null);
  const [chartData, setChartData] = useState<any[]>([]);
  const [topProducts, setTopProducts] = useState<any[]>([]);
  const token = useAuthStore(state => state.token);

  const currentYear = new Date().getFullYear();
  const [selectedYear, setSelectedYear] = useState<string>(currentYear.toString());
  const [selectedMonth, setSelectedMonth] = useState<string>('todos');

  // Generate an array of years, e.g., from 5 years ago to 1 year in the future
  const years = Array.from({ length: 7 }, (_, i) => currentYear - 5 + i);

  useEffect(() => {
    const headers = { 'Authorization': `Bearer ${token}` };
    const params = new URLSearchParams({ year: selectedYear, month: selectedMonth }).toString();
    
    fetch(`/api/dashboard/stats?${params}`, { headers })
      .then(res => {
        if (res.status === 401) {
          useAuthStore.getState().logout();
          return;
        }
        return res.json();
      })
      .then(setStats);

    fetch(`/api/dashboard/chart-data?${params}`, { headers })
      .then(res => {
        if (res.status === 401) {
          useAuthStore.getState().logout();
          return;
        }
        return res.json();
      })
      .then(data => {
        if (Array.isArray(data)) {
          setChartData(data);
        } else {
          console.error("chart-data API returned non-array:", data);
          setChartData([]);
        }
      })
      .catch(err => {
        console.error("Error fetching chart data:", err);
        setChartData([]);
      });

    fetch(`/api/dashboard/top-products?${params}`, { headers })
      .then(res => {
        if (res.ok) return res.json();
        return [];
      })
      .then(data => {
        if (Array.isArray(data)) setTopProducts(data);
      })
      .catch(err => console.error("Error fetching top products:", err));

  }, [token, selectedYear, selectedMonth]);

  if (!stats) return <div className="p-8 text-slate-500">Carregando dashboard...</div>;

  return (
    <div className="space-y-8">
      <div className="flex justify-between items-end">
        <div>
          <h1 className="text-3xl font-bold text-slate-900">Dashboard</h1>
          <p className="text-slate-500">Visão geral do seu negócio.</p>
        </div>
        <div className="flex gap-3">
          <div className="bg-white px-3 py-2 rounded-xl border border-slate-200 flex items-center gap-2">
            <span className="text-sm font-medium text-slate-500">Mês:</span>
            <select 
              value={selectedMonth}
              onChange={e => setSelectedMonth(e.target.value)}
              className="bg-transparent text-sm font-bold text-slate-700 outline-none cursor-pointer"
            >
              <option value="todos">Todos</option>
              <option value="01">Janeiro</option>
              <option value="02">Fevereiro</option>
              <option value="03">Março</option>
              <option value="04">Abril</option>
              <option value="05">Maio</option>
              <option value="06">Junho</option>
              <option value="07">Julho</option>
              <option value="08">Agosto</option>
              <option value="09">Setembro</option>
              <option value="10">Outubro</option>
              <option value="11">Novembro</option>
              <option value="12">Dezembro</option>
            </select>
          </div>
          
          <div className="bg-white px-3 py-2 rounded-xl border border-slate-200 flex items-center gap-2">
            <span className="text-sm font-medium text-slate-500">Ano:</span>
            <select 
              value={selectedYear}
              onChange={e => setSelectedYear(e.target.value)}
              className="bg-transparent text-sm font-bold text-slate-700 outline-none cursor-pointer"
            >
              {years.map(y => (
                <option key={y} value={y}>{y}</option>
              ))}
            </select>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        <Card title="Vendas Totais" value={`R$ ${formatMoney(stats.sales)}`} icon={ShoppingCart} color="bg-indigo-600" />
        <Card title="Contas a Receber" value={`R$ ${formatMoney(stats.receivable)}`} icon={TrendingUp} color="bg-emerald-600" />
        <Card title="Contas a Pagar" value={`R$ ${formatMoney(stats.payable)}`} icon={DollarSign} color="bg-rose-600" />
        <Card title="Estoque Baixo" value={stats.lowStock} icon={AlertCircle} color="bg-amber-500" />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-100">
          <h3 className="text-lg font-bold mb-6 text-slate-900">Fluxo de Caixa</h3>
          <div className="h-80">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={chartData}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{ fill: '#94a3b8', fontSize: 12 }} />
                <YAxis axisLine={false} tickLine={false} tick={{ fill: '#94a3b8', fontSize: 12 }} />
                <Tooltip 
                  contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 10px 15px -3px rgb(0 0 0 / 0.1)' }}
                />
                <Line name="A Receber" type="monotone" dataKey="receivables" stroke="#4f46e5" strokeWidth={3} dot={{ r: 4, fill: '#4f46e5' }} activeDot={{ r: 6 }} />
                <Line name="A Pagar" type="monotone" dataKey="expenses" stroke="#f43f5e" strokeWidth={3} dot={{ r: 4, fill: '#f43f5e' }} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-100">
          <h3 className="text-lg font-bold mb-6 text-slate-900">Top 10 Produtos/Serviços mais vendidos</h3>
          <div className="h-80">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={topProducts} layout="vertical">
                <CartesianGrid strokeDasharray="3 3" horizontal={true} vertical={false} stroke="#f1f5f9" />
                <XAxis type="number" axisLine={false} tickLine={false} tick={{ fill: '#94a3b8', fontSize: 12 }} />
                <YAxis dataKey="name" type="category" width={120} axisLine={false} tickLine={false} tick={{ fill: '#475569', fontSize: 12, width: 110, wordWrap: 'break-word' }} />
                <Tooltip contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 10px 15px -3px rgb(0 0 0 / 0.1)' }} />
                <Bar name="Quantidade" dataKey="qtd" fill="#4f46e5" radius={[0, 4, 4, 0]} barSize={20} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Dashboard;
