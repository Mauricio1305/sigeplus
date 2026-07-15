import { pool } from "../db";

export async function processCommissions(
  connection: any,
  tenant_id: string,
  sale_id: number,
  atendente_id: any,
  valor_total: number,
  items: any[],
  status: string,
  usuario_id: any,
  origem: string
) {
  // 1. Delete existing commissions for this sale to avoid duplicates or orphaned rows
  await connection.query("DELETE FROM comissoes WHERE venda_id = ? AND tenant_id = ?", [sale_id, tenant_id]);

  // If status is 'cancelada', we keep it deleted (or could insert Estorno, but deleting or doing estorno are both options).
  // Let's implement the estorno option: if status is 'cancelada' and there was a previous commission,
  // we can either delete them (which keeps report clean) or write an estorno.
  // Actually, let's keep it deleted to have clean, accurate reports when canceled,
  // or if they want to see "Estornos", let's create a negative line if there was an active commission.
  // But wait, since we just deleted it, let's only generate if status is 'finalizada'.
  if (status !== 'finalizada') {
    return;
  }

  // 2. Fetch company configs to check if automatic commission is enabled
  const [empresaConfigs] = await connection.query(
    "SELECT comissao_automatica, comissao_tipo FROM empresas WHERE tenant_id = ?",
    [tenant_id]
  ) as any[];

  if (!empresaConfigs || !empresaConfigs[0]?.comissao_automatica) {
    return;
  }

  const comissaoTipo = empresaConfigs[0].comissao_tipo || 'pedido';

  if (comissaoTipo === 'pedido') {
    // Commission is based on the entire sale total
    const targetUserId = atendente_id || usuario_id;
    if (!targetUserId) return;

    const [atendente] = await connection.query(
      "SELECT is_profissional, perc_comissao FROM usuarios WHERE id = ? AND tenant_id = ?",
      [targetUserId, tenant_id]
    ) as any[];

    if (atendente && atendente[0] && (atendente[0].is_profissional === true || atendente[0].is_profissional == 1)) {
      const perc = parseFloat(atendente[0].perc_comissao) || 0;
      if (perc > 0) {
        const valorComissao = (parseFloat(valor_total as any) * perc) / 100;
        await connection.query(
          "INSERT INTO comissoes (tenant_id, venda_id, usuario_id, valor_base, perc_comissao, valor_comissao, origem, status) VALUES (?, ?, ?, ?, ?, ?, ?, 'Liberado')",
          [tenant_id, sale_id, targetUserId, valor_total, perc, valorComissao, origem]
        );
      }
    }
  } else if (comissaoTipo === 'item') {
    // Commission is based on individual items
    for (const item of items) {
      const itemProfissionalId = item.profissional_id || atendente_id || usuario_id;
      if (!itemProfissionalId) continue;

      const [prof] = await connection.query(
        "SELECT is_profissional, perc_comissao FROM usuarios WHERE id = ? AND tenant_id = ?",
        [itemProfissionalId, tenant_id]
      ) as any[];

      const [prod] = await connection.query(
        "SELECT perc_comissao FROM produtos WHERE id = ? AND tenant_id = ?",
        [item.produto_id || item.id, tenant_id]
      ) as any[];

      if (prof && prof[0] && (prof[0].is_profissional === true || prof[0].is_profissional == 1)) {
        const prodPerc = parseFloat(prod && prod[0]?.perc_comissao) || 0;
        const profPerc = parseFloat(prof[0].perc_comissao) || 0;
        
        // If product has a specific commission percentage, it takes priority; otherwise use professional percentage
        const finalPerc = prodPerc > 0 ? prodPerc : profPerc;

        if (finalPerc > 0) {
          const subtotal = parseFloat(item.subtotal) || ((parseFloat(item.preco_unitario || item.preco_venda || 0) || 0) * (parseFloat(item.quantidade || 1) || 1));
          const valorComissao = (subtotal * finalPerc) / 100;
          await connection.query(
            "INSERT INTO comissoes (tenant_id, venda_id, produto_id, usuario_id, valor_base, perc_comissao, valor_comissao, origem, status) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'Liberado')",
            [tenant_id, sale_id, item.produto_id || item.id, itemProfissionalId, subtotal, finalPerc, valorComissao, origem + '/Item']
          );
        }
      }
    }
  }
}
