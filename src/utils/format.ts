export const formatMoney = (v: number | string | undefined | null) => {
  if (v === undefined || v === null) return '0,00';
  const num = typeof v === 'string' ? parseFloat(v) : v;
  return isNaN(num) ? '0,00' : num.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
};

export const formatDate = (date: string | Date | undefined | null) => {
  if (!date) return '-';
  const d = new Date(typeof date === 'string' ? date.replace(' ', 'T') : date);
  if (isNaN(d.getTime())) return '-';
  return d.toLocaleDateString('pt-BR');
};

export const formatDateTime = (date: string | Date | undefined | null) => {
  if (!date) return '-';
  const d = new Date(typeof date === 'string' ? date.replace(' ', 'T') : date);
  if (isNaN(d.getTime())) return '-';
  return `${d.toLocaleDateString('pt-BR')} ${d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}`;
};

export const formatTime = (date: string | Date | undefined | null) => {
  if (!date) return '-';
  const d = new Date(typeof date === 'string' ? date.replace(' ', 'T') : date);
  if (isNaN(d.getTime())) return '-';
  return d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
};
