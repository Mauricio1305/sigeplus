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
  const token = useAuthStore(state => state.token);

  useEffect(() => {
    const headers = { 'Authorization': `Bearer ${token}` };
    
    fetch('/api/dashboard/stats', { headers })
      .then(res => {
        if (res.status === 401) {
          useAuthStore.getState().logout();
          return;
        }
        return res.json();
      })
      .then(setStats);

    fetch('/api/dashboard/chart-data', { headers })
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
  }, [token]);

  if (!stats) return <div className="p-8 text-slate-500">Carregando dashboard...</div>;

  return (
    <div className="space-y-8">
      <div className="flex justify-between items-end">
        <div>
          <h1 className="text-3xl font-bold text-slate-900">Dashboard</h1>
          <p className="text-slate-500">Visão geral do seu negócio hoje.</p>
        </div>
        <div className="bg-white px-4 py-2 rounded-xl border border-slate-200 text-sm font-medium text-slate-600">
          {new Date().toLocaleDateString('pt-BR', { day: 'numeric', month: 'long', year: 'numeric' })}
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
          <h3 className="text-lg font-bold mb-6 text-slate-900">Recebíveis Mensais</h3>
          <div className="h-80">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={chartData}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{ fill: '#94a3b8', fontSize: 12 }} />
                <YAxis axisLine={false} tickLine={false} tick={{ fill: '#94a3b8', fontSize: 12 }} />
                <Tooltip contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 10px 15px -3px rgb(0 0 0 / 0.1)' }} />
                <Bar name="A Receber" dataKey="receivables" fill="#4f46e5" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Dashboard;
