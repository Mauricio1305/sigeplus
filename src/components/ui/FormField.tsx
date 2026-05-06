import React from 'react';

export const FormField = ({ 
  label, 
  error, 
  children, 
  required 
}: { 
  label: string; 
  error?: string; 
  children: React.ReactNode; 
  required?: boolean;
}) => (
  <div className="space-y-1">
    <label className="block text-sm font-semibold text-slate-700">
      {label} {required && <span className="text-rose-500">*</span>}
    </label>
    <div className="relative">
      {children}
    </div>
    {error && (
      <p className="text-xs text-rose-500 font-medium mt-1">{error}</p>
    )}
  </div>
);

export default FormField;
