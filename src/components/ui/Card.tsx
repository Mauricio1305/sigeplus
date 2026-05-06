import React from 'react';
import { LucideIcon } from 'lucide-react';

interface CardProps {
  title: string;
  value: string | number;
  icon: LucideIcon;
  color: string;
  trend?: number;
}

export const Card = ({ title, value, icon: Icon, color, trend }: CardProps) => (
  <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-100">
    <div className="flex justify-between items-start">
      <div>
        <p className="text-slate-500 text-sm font-medium">{title}</p>
        <h3 className="text-2xl font-bold mt-1 text-slate-900">{value}</h3>
        {trend !== undefined && (
          <p className={`text-xs mt-2 font-medium ${trend > 0 ? 'text-emerald-600' : 'text-rose-600'}`}>
            {trend > 0 ? '+' : ''}{trend}% em relação ao mês anterior
          </p>
        )}
      </div>
      <div className={`p-3 rounded-xl ${color}`}>
        <Icon className="w-6 h-6 text-white" />
      </div>
    </div>
  </div>
);
