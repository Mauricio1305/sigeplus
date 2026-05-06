export const formatMoney = (v: number | string | undefined | null) => {
  if (v === undefined || v === null) return '0,00';
  const num = typeof v === 'string' ? parseFloat(v) : v;
  return isNaN(num) ? '0,00' : num.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
};

export const formatDate = (date: string | Date) => {
  if (!date) return '';
  return new Date(date).toLocaleDateString();
};
