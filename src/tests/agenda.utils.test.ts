import { describe, it, expect } from 'vitest';

export const isPastDate = (dateStr: string | Date): boolean => {
  return new Date(dateStr) < new Date();
};

export const getStatusColorCategory = (status: string): string => {
  switch (status) {
    case 'Confirmado': return 'bg-emerald-100 text-emerald-700 border-emerald-200';
    case 'Check-in Realizado': return 'bg-indigo-100 text-indigo-700 border-indigo-200';
    case 'Concluido': return 'bg-blue-100 text-blue-700 border-blue-200';
    case 'Cancelado': return 'bg-rose-100 text-rose-700 border-rose-200';
    default: return 'bg-amber-100 text-amber-700 border-amber-200';
  }
};

export const formatTimeForInput = (dateStr: string): string => {
  if (!dateStr) return '';
  return dateStr.replace(' ', 'T').substring(0, 16);
};

describe('Agenda Utils Library', () => {
  it('getStatusColorCategory returns correct styles', () => {
    expect(getStatusColorCategory('Confirmado')).toContain('bg-emerald');
    expect(getStatusColorCategory('Cancelado')).toContain('bg-rose');
    expect(getStatusColorCategory('OutroStatusQualquer')).toContain('bg-amber');
  });

  it('isPastDate correctly identifies past dates', () => {
    const yesterday = new Date(Date.now() - 86400000).toISOString();
    const tomorrow = new Date(Date.now() + 86400000).toISOString();
    
    expect(isPastDate(yesterday)).toBe(true);
    expect(isPastDate(tomorrow)).toBe(false);
  });

  it('formatTimeForInput outputs correct datetime local format', () => {
    const input = '2026-05-29 10:30:00';
    const output = formatTimeForInput(input);
    expect(output).toBe('2026-05-29T10:30');
  });
});
