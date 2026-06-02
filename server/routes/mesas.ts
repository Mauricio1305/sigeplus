import { Router } from "express";
import { pool } from "../db";
import { authMiddleware, planMiddleware } from "../middleware";

const router = Router();

// Mesas List
router.get("/", authMiddleware, planMiddleware('mesas'), async (req: any, res) => {
  try {
    const [mesas] = await pool.query(`
      SELECT 
        v.*, 
        p.nome as cliente_nome,
        (SELECT COALESCE(SUM(quantidade), 0) FROM vendas_itens WHERE venda_id = v.id) as qtd_itens
      FROM vendas v 
      LEFT JOIN pessoas p ON v.pessoa_id = p.id 
      WHERE v.tenant_id = ? AND v.tipo = 'mesa'
      ORDER BY v.created_at DESC
    `, [req.user.tenant_id]) as any[];
    res.json(mesas);
  } catch (err: any) {
    console.error("Error fetching mesas:", err);
    res.status(500).json({ error: err.message });
  }
});

// Create Mesa
router.post("/", authMiddleware, planMiddleware('mesas'), async (req: any, res) => {
  const { pessoa_id, items, valor_total, desconto, frete, status = 'aberta', origem = 'Comanda', identificacao, taxa_servico } = req.body;
  const { tenant_id, id: usuario_id } = req.user;
  
  const pessoaIdToInsert = pessoa_id === '' ? null : pessoa_id;

  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();

    const [maxSequencialRow] = await connection.query("SELECT MAX(sequencial_id) as max_id FROM vendas WHERE tenant_id = ?", [tenant_id]) as any[];
    const sequencial_id = (maxSequencialRow[0]?.max_id || 0) + 1;

    const [mesaResult] = await connection.query(
      "INSERT INTO vendas (tenant_id, pessoa_id, usuario_id, valor_total, desconto, frete, status, tipo, origem, sequencial_id, identificacao, taxa_servico) VALUES (?, ?, ?, ?, ?, ?, ?, 'mesa', ?, ?, ?, ?)",
      [tenant_id, pessoaIdToInsert, usuario_id, valor_total, desconto || 0, frete || 0, status, origem, sequencial_id, identificacao || null, taxa_servico || 0]
    ) as any;
    
    const mesa_id = mesaResult.insertId;

    for (const item of items) {
      await connection.query(
        "INSERT INTO vendas_itens (tenant_id, venda_id, produto_id, quantidade, preco_unitario, subtotal) VALUES (?, ?, ?, ?, ?, ?)",
        [tenant_id, mesa_id, item.id, item.quantidade, item.preco_venda, item.subtotal]
      );
    }

    if (status === 'finalizada') {
      // Need to handle stock and financial if it's already finalized (unlikely for a new mesa but good to have)
      // ... same logic as sales ...
    }

    await connection.commit();
    res.json({ success: true, id: mesa_id, sequencial_id: sequencial_id });
  } catch (err: any) {
    await connection.rollback();
    console.error("Error creating mesa:", err);
    res.status(400).json({ error: err.message });
  } finally {
    connection.release();
  }
});

// Mesa Details
router.get("/:id", authMiddleware, async (req: any, res) => {
  const { id } = req.params;
  const { tenant_id } = req.user;

  try {
    let [results] = await pool.query(`
      SELECT 
        v.*, 
        p.nome as cliente_nome
      FROM vendas v 
      LEFT JOIN pessoas p ON v.pessoa_id = p.id 
      WHERE (v.sequencial_id = ? OR v.id = ?) AND v.tenant_id = ? AND v.tipo = 'mesa'
    `, [id, id, tenant_id]) as any[];

    const mesa = results[0];
    if (!mesa) return res.status(404).json({ error: "Mesa não encontrada" });

    const [items] = await pool.query(`
      SELECT vi.*, p.nome 
      FROM vendas_itens vi
      JOIN produtos p ON vi.produto_id = p.id
      WHERE vi.venda_id = ? AND vi.tenant_id = ?
    `, [mesa.id, tenant_id]) as any[];

    const [pagamentos] = await pool.query(`
      SELECT vp.* 
      FROM vendas_pagamentos vp
      WHERE vp.venda_id = ? AND vp.tenant_id = ?
    `, [mesa.id, tenant_id]) as any[];

    res.json({ 
      ...mesa, 
      items: (items as any[]).map((i: any) => ({
        id: i.produto_id,
        nome: i.nome,
        quantidade: i.quantidade,
        preco_venda: i.preco_unitario,
        subtotal: i.subtotal
      })), 
      pagamentos 
    });
  } catch (err: any) {
    console.error("Error fetching mesa details:", err);
    res.status(500).json({ error: err.message });
  }
});

// Update Mesa
router.put("/:id", authMiddleware, async (req: any, res) => {
  const { id } = req.params; 
  const { pessoa_id, items, valor_total, desconto, frete, status, pagamentos, identificacao, taxa_servico } = req.body;
  const { tenant_id } = req.user;
  
  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();

    let [existingMesaRows] = await connection.query("SELECT * FROM vendas WHERE sequencial_id = ? AND tenant_id = ? AND tipo = 'mesa'", [id, tenant_id]) as any[];
    if (existingMesaRows.length === 0) {
      [existingMesaRows] = await connection.query("SELECT * FROM vendas WHERE id = ? AND tenant_id = ? AND tipo = 'mesa'", [id, tenant_id]) as any[];
    }
    
    const existingMesa = existingMesaRows[0];
    if (!existingMesa) throw new Error("Mesa não encontrada");
    if (existingMesa.status === 'finalizada') throw new Error("Mesa já finalizada não pode ser editada");

    await connection.query(
      "UPDATE vendas SET pessoa_id = ?, valor_total = ?, desconto = ?, frete = ?, status = ?, identificacao = ?, taxa_servico = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?",
      [pessoa_id || null, valor_total, desconto || 0, frete || 0, status, identificacao || existingMesa.identificacao, taxa_servico || existingMesa.taxa_servico, existingMesa.id]
    );
    
    await connection.query("DELETE FROM vendas_itens WHERE venda_id = ?", [existingMesa.id]);
    for (const item of items) {
      await connection.query(
        "INSERT INTO vendas_itens (tenant_id, venda_id, produto_id, quantidade, preco_unitario, subtotal) VALUES (?, ?, ?, ?, ?, ?)",
        [tenant_id, existingMesa.id, item.id, item.quantidade, item.preco_venda, item.subtotal]
      );
    }

    if (status === 'finalizada') {
      // Stock and Financial
       for (const item of items) {
        const [products] = await connection.query("SELECT tipo FROM produtos WHERE id = ?", [item.id]) as any[];
        const product = products[0];
        if (product && product.tipo === 'produto') {
          await connection.query("UPDATE produtos SET estoque_atual = estoque_atual - ? WHERE id = ?", [item.quantidade, item.id]);
        }
      }

      if (pagamentos && pagamentos.length > 0) {
        let clienteNome = 'Consumidor Final';
        if (pessoa_id) {
          const [pessoas] = await connection.query("SELECT nome FROM pessoas WHERE id = ?", [pessoa_id]) as any[];
          clienteNome = pessoas[0]?.nome || 'Consumidor Final';
        }
        const dataMesa = new Date().toLocaleDateString('pt-BR');

        for (const pg of pagamentos) {
          let localLancamento = 'Caixa';
          let prazoDias = 0;
          if (pg.tipo_pagamento_id && pg.tipo_pagamento_id !== 'Dinheiro') {
            const [tps] = await connection.query("SELECT local_lancamento, prazo_dias FROM tipos_pagamento WHERE id = ?", [pg.tipo_pagamento_id]) as any[];
            const tp = tps[0];
            if (tp) {
              localLancamento = tp.local_lancamento;
              prazoDias = tp.prazo_dias || 0;
            }
          }

          const descricao = `Comanda #${existingMesa.sequencial_id} (${existingMesa.identificacao}) | ${dataMesa} | ${pg.nome} | ${clienteNome}`;

          if (localLancamento === 'Caixa') {
            const [caixas] = await connection.query("SELECT id FROM caixa WHERE tenant_id = ? AND status = 'aberto' ORDER BY id DESC LIMIT 1", [tenant_id]) as any[];
            if (caixas[0]) {
              await connection.query(
                "INSERT INTO movimentacoes_caixa (tenant_id, caixa_id, tipo, valor, descricao, venda_id, tipo_pagamento_id, origem) VALUES (?, ?, 'entrada', ?, ?, ?, ?, 'Mesa')",
                [tenant_id, caixas[0].id, pg.valor, descricao, existingMesa.id, pg.tipo_pagamento_id !== 'Dinheiro' ? pg.tipo_pagamento_id : null]
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
                [tenant_id, pessoa_id || null, existingMesa.id, vencimento.toISOString().slice(0, 19).replace('T', ' '), valorParcela, statusCR === 'paga' ? valorParcela : 0, statusCR, statusCR === 'paga' ? new Date().toISOString().slice(0, 19).replace('T', ' ') : null, descricao, localLancamento, pg.tipo_pagamento_id !== 'Dinheiro' ? pg.tipo_pagamento_id : null]
              );
            }
          }
        }
      }
    }

    await connection.commit();
    res.json({ success: true });
  } catch (err: any) {
    await connection.rollback();
    console.error("Error updating mesa:", err);
    res.status(400).json({ error: err.message });
  } finally {
    connection.release();
  }
});

// Cancel Mesa
router.post("/:id/cancel", authMiddleware, async (req: any, res) => {
  const { id } = req.params;
  const { tenant_id } = req.user;

  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();

    let [mesaResults] = await connection.query("SELECT * FROM vendas WHERE (id = ? OR sequencial_id = ?) AND tenant_id = ? AND tipo = 'mesa'", [id, id, tenant_id]) as any[];
    const mesa = mesaResults[0];
    if (!mesa) throw new Error("Mesa não encontrada");
    if (mesa.status === 'cancelada') throw new Error("Esta mesa já está cancelada");

    if (mesa.status === 'finalizada') {
      const [items] = await connection.query("SELECT produto_id, quantidade FROM vendas_itens WHERE venda_id = ?", [mesa.id]) as any[];
      for (const item of items) {
        await connection.query("UPDATE produtos SET estoque_atual = estoque_atual + ? WHERE id = ?", [item.quantidade, item.produto_id]);
      }
      await connection.query("DELETE FROM movimentacoes_caixa WHERE venda_id = ?", [mesa.id]);
      await connection.query("DELETE FROM lancamentos WHERE venda_id = ?", [mesa.id]);
    }

    await connection.query("UPDATE vendas SET status = 'cancelada' WHERE id = ?", [mesa.id]);

    await connection.commit();
    res.json({ success: true });
  } catch (err: any) {
    await connection.rollback();
    console.error("Error cancelling mesa:", err);
    res.status(400).json({ error: err.message });
  } finally {
    connection.release();
  }
});

export default router;
