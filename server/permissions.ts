export const DEFAULT_MASTER_PERMISSOES = {
  home: { acessar: true },
  dashboard: { acessar: true, estatisticas: true },
  financeiro: { acessar: true, lancar: true, editar: true, cancelar: true, estornar: true },
  vendas: { acessar: true, lancar: true, cancelar: true, relatorios: true },
  pdv: { acessar: true, vender: true, cancelar: true },
  estoque: { acessar: true, editar: true, excluir: true },
  cadastros: { acessar: true, editar: true, excluir: true },
  agenda: { acessar: true, criar: true, cancelar: true, ver_outros: true },
  mesas: { acessar: true, lancar: true, fechar: true, cancelar: true },
  os: { acessar: true, lancar: true, editar: true, excluir: true },
  etiquetas: { acessar: true, imprimir: true },
  relatorios: { acessar: true, sales: true, inventory: true, finance: true, comissoes: true, dre: true, people: true, agenda: true, notifications: true },
  configuracoes: { acessar: true, editar: true }
};

export const parseJSON = (val: any, fallback: any = {}) => {
  if (!val) return fallback;
  let res = val;
  while (typeof res === 'string') {
    try {
      res = JSON.parse(res);
    } catch (e) {
      break;
    }
  }
  return (typeof res === 'object' && res !== null) ? res : fallback;
};
