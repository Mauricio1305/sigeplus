import { Router } from "express";
import { pool } from "../db";
import { authMiddleware, planMiddleware } from "../middleware";

const router = Router();

// Create PDV Sale
router.post("/", authMiddleware, planMiddleware('pdv'), async (req: any, res) => {
  const { pessoa_id, items, valor_total, desconto, frete, status = 'finalizada', tipo = 'venda', origem = 'PDV', solicitacao, laudo_tecnico, pagamentos, identificacao, taxa_servico } = req.body;
  const { tenant_id, id: usuario_id } = req.user;
  
  const pessoaIdToInsert = pessoa_id === '' ? null : pessoa_id;

  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();

    // Calculate next sequencial_id
    const [maxSequencialRow] = await connection.query("SELECT MAX(sequencial_id) as max_id FROM vendas WHERE tenant_id = ?", [tenant_id]) as any[];
    const sequencial_id = (maxSequencialRow[0]?.max_id || 0) + 1;

    // 1. Create Sale
    const [saleResult] = await connection.query(
      "INSERT INTO vendas (tenant_id, pessoa_id, usuario_id, valor_total, desconto, frete, status, tipo, origem, solicitacao, laudo_tecnico, sequencial_id, identificacao, taxa_servico) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
      [tenant_id, pessoaIdToInsert, usuario_id, valor_total, desconto || 0, frete || 0, status, tipo, origem, solicitacao || null, laudo_tecnico || null, sequencial_id, identificacao || null, taxa_servico || 0]
    ) as any;
    
    const venda_id = saleResult.insertId;

    // 2. Insert items
    for (const item of items) {
      await connection.query(
        "INSERT INTO vendas_itens (tenant_id, venda_id, produto_id, quantidade, preco_unitario, subtotal) VALUES (?, ?, ?, ?, ?, ?)",
        [tenant_id, venda_id, item.id, item.quantidade, item.preco_venda, item.subtotal]
      );
    }

    // 3. Insert Payments
    if (pagamentos && pagamentos.length > 0) {
      for (const pg of pagamentos) {
        await connection.query(
          "INSERT INTO vendas_pagamentos (tenant_id, venda_id, tipo_pagamento_id, nome, valor, parcelas) VALUES (?, ?, ?, ?, ?, ?)",
          [tenant_id, venda_id, pg.tipo_pagamento_id === 'Dinheiro' ? null : pg.tipo_pagamento_id, pg.nome, pg.valor, pg.parcelas || 1]
        );
      }
    }

    if (status === 'finalizada') {
      // 4. Update Stock
      for (const item of items) {
        const [products] = await connection.query("SELECT tipo FROM produtos WHERE id = ? AND tenant_id = ?", [item.id, tenant_id]) as any[];
        const product = products[0];
        if (product && product.tipo === 'produto') {
          await connection.query(
            "UPDATE produtos SET estoque_atual = estoque_atual - ? WHERE id = ? AND tenant_id = ?",
            [item.quantidade, item.id, tenant_id]
          );
        }
      }

      // 5. Create financial entries
      if (pagamentos && pagamentos.length > 0) {
        let clienteNome = 'Consumidor Final';
        if (pessoaIdToInsert) {
          const [pessoas] = await connection.query("SELECT nome FROM pessoas WHERE id = ?", [pessoaIdToInsert]) as any[];
          clienteNome = pessoas[0]?.nome || 'Consumidor Final';
        }
        const dataVenda = new Date().toLocaleDateString('pt-BR');

        for (const pg of pagamentos) {
          let localLancamento = 'Caixa';
          let prazoDias = 0;
          if (pg.tipo_pagamento_id && pg.tipo_pagamento_id !== 'Dinheiro') {
            const [tps] = await connection.query("SELECT local_lancamento, prazo_dias FROM tipos_pagamento WHERE id = ? AND tenant_id = ?", [pg.tipo_pagamento_id, tenant_id]) as any[];
            const tp = tps[0];
            if (tp) {
              localLancamento = tp.local_lancamento;
              prazoDias = tp.prazo_dias || 0;
            }
          }

          const descricao = `PDV #${sequencial_id} | ${dataVenda} | ${pg.nome} | ${clienteNome}`;

          if (localLancamento === 'Caixa') {
            const [caixas] = await connection.query("SELECT id FROM caixa WHERE tenant_id = ? AND status = 'aberto' ORDER BY id DESC LIMIT 1", [tenant_id]) as any[];
            const caixaAberto = caixas[0];
            if (caixaAberto) {
              await connection.query(
                "INSERT INTO movimentacoes_caixa (tenant_id, caixa_id, tipo, valor, descricao, venda_id, tipo_pagamento_id, origem) VALUES (?, ?, 'entrada', ?, ?, ?, ?, ?)",
                [tenant_id, caixaAberto.id, pg.valor, descricao, venda_id, pg.tipo_pagamento_id !== 'Dinheiro' ? pg.tipo_pagamento_id : null, 'PDV']
              );
            } else {
              await connection.query(
                "INSERT INTO lancamentos (tenant_id, tipo, pessoa_id, venda_id, vencimento, valor, valor_pago, status, data_pagamento, descricao, local, tipo_pagamento_id) VALUES (?, 'CR', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
                [tenant_id, pessoaIdToInsert, venda_id, new Date().toISOString().slice(0, 19).replace('T', ' '), pg.valor, 0, 'aberta', null, descricao + ' (Caixa Fechado)', 'Caixa', pg.tipo_pagamento_id !== 'Dinheiro' ? pg.tipo_pagamento_id : null]
              );
            }
          } else {
            const valorParcela = pg.valor / (pg.parcelas || 1);
            for (let i = 0; i < (pg.parcelas || 1); i++) {
              const vencimento = new Date();
              const diasToAdd = prazoDias + (i * 30);
              vencimento.setDate(vencimento.getDate() + diasToAdd);
              const statusCR = (diasToAdd === 0 && (localLancamento === 'Banco' || localLancamento === 'Cartão')) ? 'paga' : 'aberta';

              await connection.query(
                "INSERT INTO lancamentos (tenant_id, tipo, pessoa_id, venda_id, vencimento, valor, valor_pago, status, data_pagamento, descricao, local, tipo_pagamento_id) VALUES (?, 'CR', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
                [tenant_id, pessoaIdToInsert, venda_id, vencimento.toISOString().slice(0, 19).replace('T', ' '), valorParcela, statusCR === 'paga' ? valorParcela : 0, statusCR, statusCR === 'paga' ? new Date().toISOString().slice(0, 19).replace('T', ' ') : null, descricao + (pg.parcelas > 1 ? ` (${i+1}/${pg.parcelas})` : ''), localLancamento, pg.tipo_pagamento_id !== 'Dinheiro' ? pg.tipo_pagamento_id : null]
              );
            }
          }
        }
      }
    }

    await connection.commit();
    res.json({ success: true, id: venda_id, sequencial_id: sequencial_id });
  } catch (err: any) {
    await connection.rollback();
    console.error("Error creating PDV sale:", err);
    res.status(400).json({ error: err.message });
  } finally {
    connection.release();
  }
});

export default router;
