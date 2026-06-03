import { Router } from "express";
import { pool } from "../db";
import { authMiddleware, planMiddleware } from "../middleware";

const router = Router();

// OS List
router.get("/", authMiddleware, planMiddleware('os'), async (req: any, res) => {
  try {
    const [os] = await pool.query(`
      SELECT 
        v.*, 
        p.nome as cliente_nome,
        (SELECT COALESCE(SUM(quantidade), 0) FROM vendas_itens WHERE venda_id = v.id) as qtd_itens
      FROM vendas v 
      LEFT JOIN pessoas p ON v.pessoa_id = p.id 
      WHERE v.tenant_id = ? AND v.tipo = 'os'
      ORDER BY v.created_at DESC
    `, [req.user.tenant_id]) as any[];
    res.json(os);
  } catch (err: any) {
    console.error("Error fetching OS:", err);
    res.status(500).json({ error: err.message });
  }
});

// Create OS
router.post("/", authMiddleware, planMiddleware('os'), async (req: any, res) => {
  const { pessoa_id, items, valor_total, desconto, frete, status = 'orcamento', origem = 'Balcao', solicitacao, laudo_tecnico, pagamentos, identificacao, taxa_servico } = req.body;
  const { tenant_id, id: usuario_id } = req.user;
  
  const pessoaIdToInsert = pessoa_id === '' ? null : pessoa_id;

  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();

    const [maxSequencialRow] = await connection.query("SELECT MAX(sequencial_id) as max_id FROM vendas WHERE tenant_id = ?", [tenant_id]) as any[];
    const sequencial_id = (maxSequencialRow[0]?.max_id || 0) + 1;

    const [osResult] = await connection.query(
      "INSERT INTO vendas (tenant_id, pessoa_id, usuario_id, valor_total, desconto, frete, status, tipo, origem, solicitacao, laudo_tecnico, sequencial_id, identificacao, taxa_servico) VALUES (?, ?, ?, ?, ?, ?, ?, 'os', ?, ?, ?, ?, ?, ?)",
      [tenant_id, pessoaIdToInsert, usuario_id, valor_total, desconto || 0, frete || 0, status, origem, solicitacao || null, laudo_tecnico || null, sequencial_id, identificacao || null, taxa_servico || 0]
    ) as any;
    
    const os_id = osResult.insertId;

    for (const item of items) {
      await connection.query(
        "INSERT INTO vendas_itens (tenant_id, venda_id, produto_id, quantidade, preco_unitario, subtotal) VALUES (?, ?, ?, ?, ?, ?)",
        [tenant_id, os_id, item.id, item.quantidade, item.preco_venda, item.subtotal]
      );
    }

    if (pagamentos && pagamentos.length > 0) {
      for (const pg of pagamentos) {
        await connection.query(
          "INSERT INTO vendas_pagamentos (tenant_id, venda_id, tipo_pagamento_id, nome, valor, parcelas) VALUES (?, ?, ?, ?, ?, ?)",
          [tenant_id, os_id, (!pg.tipo_pagamento_id || pg.tipo_pagamento_id === 'Dinheiro') ? null : pg.tipo_pagamento_id, pg.nome, pg.valor, pg.parcelas || 1]
        );
      }
    }

    if (status === 'finalizada') {
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

          const descricao = `O.S. #${sequencial_id} | ${dataVenda} | ${pg.nome} | ${clienteNome}`;

          if (localLancamento === 'Caixa') {
            const [caixas] = await connection.query("SELECT id FROM caixa WHERE tenant_id = ? AND status = 'aberto' ORDER BY id DESC LIMIT 1", [tenant_id]) as any[];
            const caixaAberto = caixas[0];
            if (caixaAberto) {
              await connection.query(
                "INSERT INTO movimentacoes_caixa (tenant_id, caixa_id, tipo, valor, descricao, venda_id, tipo_pagamento_id, origem) VALUES (?, ?, 'entrada', ?, ?, ?, ?, 'OS')",
                [tenant_id, caixaAberto.id, pg.valor, descricao, os_id, (!pg.tipo_pagamento_id || pg.tipo_pagamento_id === 'Dinheiro') ? null : pg.tipo_pagamento_id]
              );
            }
          } else {
            const valorParcela = pg.valor / (pg.parcelas || 1);
            for (let i = 0; i < (pg.parcelas || 1); i++) {
              const vencimento = new Date();
              const diasToAdd = prazoDias + (i * 30);
              vencimento.setDate(vencimento.getDate() + diasToAdd);
              
              const statusCR = (diasToAdd === 0 && (localLancamento === 'Banco' || localLancamento === 'Cartão')) ? 'paga' : 'aberta';
              const valorPagoCR = statusCR === 'paga' ? valorParcela : 0;
              const dataPagamentoCR = statusCR === 'paga' ? new Date().toISOString() : null;

              await connection.query(
                "INSERT INTO lancamentos (tenant_id, tipo, pessoa_id, venda_id, vencimento, valor, valor_pago, status, data_pagamento, descricao, local, tipo_pagamento_id) VALUES (?, 'CR', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
                [
                  tenant_id, 
                  pessoaIdToInsert, 
                  os_id, 
                  vencimento.toISOString().slice(0, 19).replace('T', ' '), 
                  valorParcela, 
                  valorPagoCR, 
                  statusCR, 
                  dataPagamentoCR ? dataPagamentoCR.slice(0, 19).replace('T', ' ') : null, 
                  descricao + (pg.parcelas > 1 ? ` (${i+1}/${pg.parcelas})` : ''), 
                  localLancamento, 
                  (!pg.tipo_pagamento_id || pg.tipo_pagamento_id === 'Dinheiro') ? null : pg.tipo_pagamento_id
                ]
              );
            }
          }
        }
      }
    }

    await connection.commit();
    res.json({ success: true, id: os_id, sequencial_id: sequencial_id });
  } catch (err: any) {
    await connection.rollback();
    console.error("Error creating OS:", err);
    res.status(400).json({ error: err.message });
  } finally {
    connection.release();
  }
});

// OS Details
router.get("/:id", authMiddleware, async (req: any, res) => {
  const { id } = req.params;
  const { tenant_id } = req.user;

  try {
    let [results] = await pool.query(`
      SELECT 
        v.*, 
        p.nome as cliente_nome,
        p.razao_social as cliente_razao_social,
        p.cpf_cnpj as cliente_cpf_cnpj,
        p.telefone as cliente_telefone,
        p.email as cliente_email,
        p.endereco as cliente_endereco
      FROM vendas v 
      LEFT JOIN pessoas p ON v.pessoa_id = p.id 
      WHERE (v.sequencial_id = ? OR v.id = ?) AND v.tenant_id = ? AND v.tipo = 'os'
    `, [id, id, tenant_id]) as any[];

    const os = results[0];
    if (!os) return res.status(404).json({ error: "OS não encontrada" });

    const [items] = await pool.query(`
      SELECT vi.*, p.nome 
      FROM vendas_itens vi
      JOIN produtos p ON vi.produto_id = p.id
      WHERE vi.venda_id = ? AND vi.tenant_id = ?
    `, [os.id, tenant_id]) as any[];

    const [pagamentos] = await pool.query(`
      SELECT vp.* 
      FROM vendas_pagamentos vp
      WHERE vp.venda_id = ? AND vp.tenant_id = ?
    `, [os.id, tenant_id]) as any[];

    res.json({ 
      ...os, 
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
    console.error("Error fetching OS details:", err);
    res.status(500).json({ error: err.message });
  }
});

// Update OS
router.put("/:id", authMiddleware, async (req: any, res) => {
  const { id } = req.params; 
  const { pessoa_id, items, valor_total, desconto, frete, status, solicitacao, laudo_tecnico, pagamentos, identificacao, taxa_servico } = req.body;
  const { tenant_id } = req.user;
  
  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();

    let [existingOsRows] = await connection.query("SELECT * FROM vendas WHERE sequencial_id = ? AND tenant_id = ? AND tipo = 'os'", [id, tenant_id]) as any[];
    if (existingOsRows.length === 0) {
      [existingOsRows] = await connection.query("SELECT * FROM vendas WHERE id = ? AND tenant_id = ? AND tipo = 'os'", [id, tenant_id]) as any[];
    }
    
    const existingOs = existingOsRows[0];
    if (!existingOs) throw new Error("OS não encontrada");
    if (existingOs.status === 'finalizada') throw new Error("OS já finalizada não pode ser editada");

    await connection.query(
      "UPDATE vendas SET pessoa_id = ?, valor_total = ?, desconto = ?, frete = ?, status = ?, solicitacao = ?, laudo_tecnico = ?, identificacao = ?, taxa_servico = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?",
      [pessoa_id || null, valor_total, desconto || 0, frete || 0, status, solicitacao || null, laudo_tecnico || null, identificacao || existingOs.identificacao, taxa_servico || existingOs.taxa_servico, existingOs.id]
    );
    
    await connection.query("DELETE FROM vendas_itens WHERE venda_id = ?", [existingOs.id]);
    for (const item of items) {
      await connection.query(
        "INSERT INTO vendas_itens (tenant_id, venda_id, produto_id, quantidade, preco_unitario, subtotal) VALUES (?, ?, ?, ?, ?, ?)",
        [tenant_id, existingOs.id, item.id, item.quantidade, item.preco_venda, item.subtotal]
      );
    }

    await connection.query("DELETE FROM vendas_pagamentos WHERE venda_id = ?", [existingOs.id]);
    if (pagamentos && pagamentos.length > 0) {
      for (const pg of pagamentos) {
        await connection.query(
          "INSERT INTO vendas_pagamentos (tenant_id, venda_id, tipo_pagamento_id, nome, valor, parcelas) VALUES (?, ?, ?, ?, ?, ?)",
          [tenant_id, existingOs.id, (!pg.tipo_pagamento_id || pg.tipo_pagamento_id === 'Dinheiro') ? null : pg.tipo_pagamento_id, pg.nome, pg.valor, pg.parcelas || 1]
        );
      }
    }

    if (status === 'finalizada') {
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
        const dataOS = new Date().toLocaleDateString('pt-BR');

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

          const descricao = `O.S. #${existingOs.sequencial_id} | ${dataOS} | ${pg.nome} | ${clienteNome}`;

          if (localLancamento === 'Caixa') {
            const [caixas] = await connection.query("SELECT id FROM caixa WHERE tenant_id = ? AND status = 'aberto' ORDER BY id DESC LIMIT 1", [tenant_id]) as any[];
            const caixaAberto = caixas[0];
            if (caixaAberto) {
              await connection.query(
                "INSERT INTO movimentacoes_caixa (tenant_id, caixa_id, tipo, valor, descricao, venda_id, tipo_pagamento_id, origem) VALUES (?, ?, 'entrada', ?, ?, ?, ?, 'OS')",
                [tenant_id, caixaAberto.id, pg.valor, descricao, existingOs.id, (!pg.tipo_pagamento_id || pg.tipo_pagamento_id === 'Dinheiro') ? null : pg.tipo_pagamento_id]
              );
            }
          } else {
            const valorParcela = pg.valor / (pg.parcelas || 1);
            for (let i = 0; i < (pg.parcelas || 1); i++) {
              const vencimento = new Date();
              const diasToAdd = prazoDias + (i * 30);
              vencimento.setDate(vencimento.getDate() + diasToAdd);
              const statusCR = (diasToAdd === 0 && (localLancamento === 'Banco' || localLancamento === 'Cartão')) ? 'paga' : 'aberta';
              const valorPagoCR = statusCR === 'paga' ? valorParcela : 0;
              const dataPagamentoCR = statusCR === 'paga' ? new Date().toISOString() : null;

              await connection.query(
                "INSERT INTO lancamentos (tenant_id, tipo, pessoa_id, venda_id, vencimento, valor, valor_pago, status, data_pagamento, descricao, local, tipo_pagamento_id) VALUES (?, 'CR', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
                [tenant_id, pessoa_id || null, existingOs.id, vencimento.toISOString().slice(0, 19).replace('T', ' '), valorParcela, valorPagoCR, statusCR, dataPagamentoCR ? dataPagamentoCR.slice(0, 19).replace('T', ' ') : null, descricao + (pg.parcelas > 1 ? ` (${i+1}/${pg.parcelas})` : ''), localLancamento, (!pg.tipo_pagamento_id || pg.tipo_pagamento_id === 'Dinheiro') ? null : pg.tipo_pagamento_id]
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
    console.error("Error updating OS:", err);
    res.status(400).json({ error: err.message });
  } finally {
    connection.release();
  }
});

// Cancel OS
router.post("/:id/cancel", authMiddleware, async (req: any, res) => {
  const { id } = req.params;
  const { tenant_id } = req.user;

  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();

    let [osResults] = await connection.query("SELECT * FROM vendas WHERE (id = ? OR sequencial_id = ?) AND tenant_id = ? AND tipo = 'os'", [id, id, tenant_id]) as any[];
    const os = osResults[0];
    if (!os) throw new Error("OS não encontrada");
    if (os.status === 'cancelada') throw new Error("Esta OS já está cancelada");

    if (os.status === 'finalizada') {
      const [items] = await connection.query("SELECT produto_id, quantidade FROM vendas_itens WHERE venda_id = ?", [os.id]) as any[];
      for (const item of items) {
        const [products] = await connection.query("SELECT tipo FROM produtos WHERE id = ?", [item.produto_id]) as any[];
        if (products[0]?.tipo === 'produto') {
          await connection.query("UPDATE produtos SET estoque_atual = estoque_atual + ? WHERE id = ?", [item.quantidade, item.produto_id]);
        }
      }
      await connection.query("DELETE FROM movimentacoes_caixa WHERE venda_id = ?", [os.id]);
      await connection.query("DELETE FROM lancamentos WHERE venda_id = ?", [os.id]);
    }

    await connection.query("UPDATE vendas SET status = 'cancelada' WHERE id = ?", [os.id]);

    await connection.commit();
    res.json({ success: true });
  } catch (err: any) {
    await connection.rollback();
    console.error("Error cancelling OS:", err);
    res.status(400).json({ error: err.message });
  } finally {
    connection.release();
  }
});

export default router;
