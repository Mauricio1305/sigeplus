export const validatePayment = (
  paymentMethod: any, 
  value: number, 
  installments: number
): { valid: boolean; message?: string } => {
  if (!paymentMethod) return { valid: true };

  // 1. Check max installments
  const maxInstallments = paymentMethod.qtd_parcelas || 1;
  if (installments > maxInstallments) {
    return { 
      valid: false, 
      message: `Este método de pagamento permite no máximo ${maxInstallments} parcela(s).` 
    };
  }

  // 2. Check min installment value
  const minInstallmentValue = parseFloat(paymentMethod.valor_min_parcela || 0);
  if (minInstallmentValue > 0 && installments > 1) {
    const installmentValue = value / installments;
    if (installmentValue < minInstallmentValue) {
      return { 
        valid: false, 
        message: `O valor mínimo por parcela para este método é de R$ ${minInstallmentValue.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}. Atualmente a parcela está em R$ ${installmentValue.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}.` 
      };
    }
  }

  return { valid: true };
};
