import { Router } from "express";
import { pool } from "../db";
import { authMiddleware, planMiddleware } from "../middleware";

const router = Router();

// Sales List
router.get("/", authMiddleware, planMiddleware('vendas'), async (req: any, res) => {
  try {
    const [sales] = await pool.query(`
      SELECT 
        v.*, 
        p.nome as cliente_nome,
        (SELECT COALESCE(SUM(quantidade), 0) FROM vendas_itens WHERE venda_id = v.id) as qtd_itens
      FROM vendas v 
      LEFT JOIN pessoas p ON v.pessoa_id = p.id 
      WHERE v.tenant_id = ? AND v.tipo IN ('venda', 'mesa', 'os')
      ORDER BY v.created_at DESC
    `, [req.user.tenant_id]) as any[];
    console.log(`Fetched ${(sales as any[]).length} sales for tenant ${req.user.tenant_id}`);
    res.json(sales);
  } catch (err: any) {
    console.error("Error fetching sales:", err);
    res.status(500).json({ error: err.message });
  }
});

// Create Sale
router.post("/", authMiddleware, planMiddleware('vendas'), async (req: any, res) => {
  const { pessoa_id, items, valor_total, desconto, frete, status = 'finalizada', tipo = 'venda', origem = 'Balcao', solicitacao, laudo_tecnico, pagamentos, identificacao, taxa_servico } = req.body;
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
    console.log(`Created sale #${venda_id} (sequencial #${sequencial_id}) for tenant ${tenant_id}`);


    // 2. Insert items
    for (const item of items) {
      await connection.query(
        "INSERT INTO vendas_itens (tenant_id, venda_id, produto_id, quantidade, preco_unitario, subtotal) VALUES (?, ?, ?, ?, ?, ?)",
        [tenant_id, venda_id, item.id, item.quantidade, item.preco_unitario || item.preco_venda, item.subtotal]
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
      // 4. Update Stock for each item (only for products, not services)
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

      // 5. Create financial entries based on local_lancamento
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
          } else if (pg.nome.toLowerCase().includes('cartão') || pg.nome.toLowerCase().includes('cartao')) {
            localLancamento = 'Cartão';
          }

          const descricao = `Pedido #${sequencial_id} | ${dataVenda} | ${pg.nome} | ${clienteNome}`;

          if (localLancamento === 'Caixa') {
            const [caixas] = await connection.query("SELECT id FROM caixa WHERE tenant_id = ? AND status = 'aberto' ORDER BY id DESC LIMIT 1", [tenant_id]) as any[];
            const caixaAberto = caixas[0];
            if (caixaAberto) {
              await connection.query(
                "INSERT INTO movimentacoes_caixa (tenant_id, caixa_id, tipo, valor, descricao, venda_id, tipo_pagamento_id, origem) VALUES (?, ?, 'entrada', ?, ?, ?, ?, ?)",
                [tenant_id, caixaAberto.id, pg.valor, descricao, venda_id, (!pg.tipo_pagamento_id || pg.tipo_pagamento_id === 'Dinheiro') ? null : pg.tipo_pagamento_id, 'Venda']
              );
            } else {
              // Fallback to lancamentos if cashier is closed but intended for Caixa
              await connection.query(
                "INSERT INTO lancamentos (tenant_id, tipo, pessoa_id, venda_id, vencimento, valor, valor_pago, status, data_pagamento, descricao, local, tipo_pagamento_id) VALUES (?, 'CR', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
                [tenant_id, pessoaIdToInsert, venda_id, new Date().toISOString().slice(0, 19).replace('T', ' '), pg.valor, 0, 'aberta', null, descricao + ' (Caixa Fechado)', 'Caixa', (!pg.tipo_pagamento_id || pg.tipo_pagamento_id === 'Dinheiro') ? null : pg.tipo_pagamento_id]
              );
            }
          } else {
            // Banco, Cartão or Contas a Receber
            const valorParcela = pg.valor / (pg.parcelas || 1);
            
            for (let i = 0; i < (pg.parcelas || 1); i++) {
              const vencimento = new Date();
              // First installment uses prazoDias, subsequent uses +30 days each
              const diasToAdd = prazoDias + (i * 30);
              vencimento.setDate(vencimento.getDate() + diasToAdd);
              
              // Status logic: if it's for today (prazo 0) and local is Banco/Cartão, mark as paid.
              // Otherwise, keep as open to be settled later.
              const statusCR = (diasToAdd === 0 && (localLancamento === 'Banco' || localLancamento === 'Cartão')) ? 'paga' : 'aberta';
              const valorPagoCR = statusCR === 'paga' ? valorParcela : 0;
              const dataPagamentoCR = statusCR === 'paga' ? new Date().toISOString() : null;

              await connection.query(
                "INSERT INTO lancamentos (tenant_id, tipo, pessoa_id, venda_id, vencimento, valor, valor_pago, status, data_pagamento, descricao, local, tipo_pagamento_id) VALUES (?, 'CR', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
                [
                  tenant_id, 
                  pessoaIdToInsert, 
                  venda_id, 
                  vencimento.toISOString().slice(0, 19).replace('T', ' '), 
                  valorParcela, 
                  valorPagoCR, 
                  statusCR, 
                  dataPagamentoCR ? dataPagamentoCR.slice(0, 19).replace('T', ' ') : null, 
                  descricao + (pg.parcelas > 1 ? ` (${i+1}/${pg.parcelas})` : ''), 
                  localLancamento, 
                  (typeof pg.tipo_pagamento_id === 'number' || (typeof pg.tipo_pagamento_id === 'string' && pg.tipo_pagamento_id !== 'Dinheiro')) ? pg.tipo_pagamento_id : null
                ]
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
    console.error("Error creating sale:", err);
    res.status(400).json({ error: err.message });
  } finally {
    connection.release();
  }
});

// Sale Details
router.get("/:id", authMiddleware, async (req: any, res) => {
  const { id } = req.params;
  const { tenant_id } = req.user;

  try {
    let [sales] = await pool.query(`
      SELECT 
        v.*, 
        p.nome as cliente_nome,
        p.razao_social as cliente_razao_social,
        p.nome_fantasia as cliente_nome_fantasia,
        p.cpf_cnpj as cliente_cpf_cnpj,
        p.telefone as cliente_telefone,
        p.telefone_fixo as cliente_telefone_fixo,
        p.telefone_celular as cliente_telefone_celular,
        p.email as cliente_email,
        p.endereco as cliente_endereco,
        p.numero as cliente_numero,
        p.cep as cliente_cep,
        p.cidade as cliente_cidade,
        p.uf as cliente_uf
      FROM vendas v 
      LEFT JOIN pessoas p ON v.pessoa_id = p.id 
      WHERE v.id = ? AND v.tenant_id = ? AND v.tipo IN ('venda', 'mesa')
    `, [id, tenant_id]) as any[];

    if (sales.length === 0) {
      [sales] = await pool.query(`
        SELECT 
          v.*, 
          p.nome as cliente_nome,
          p.razao_social as cliente_razao_social,
          p.nome_fantasia as cliente_nome_fantasia,
          p.cpf_cnpj as cliente_cpf_cnpj,
          p.telefone as cliente_telefone,
          p.telefone_fixo as cliente_telefone_fixo,
          p.telefone_celular as cliente_telefone_celular,
          p.email as cliente_email,
          p.endereco as cliente_endereco,
          p.numero as cliente_numero,
          p.cep as cliente_cep,
          p.cidade as cliente_cidade,
          p.uf as cliente_uf
        FROM vendas v 
        LEFT JOIN pessoas p ON v.pessoa_id = p.id 
        WHERE v.sequencial_id = ? AND v.tenant_id = ? AND v.tipo IN ('venda', 'mesa')
      `, [id, tenant_id]) as any[];
    }
    
    const sale = sales[0];
    if (!sale) return res.status(404).json({ error: "Venda não encontrada" });

    const [items] = await pool.query(`
      SELECT vi.*, p.nome 
      FROM vendas_itens vi
      JOIN produtos p ON vi.produto_id = p.id
      WHERE vi.venda_id = ? AND vi.tenant_id = ?
    `, [sale.id, tenant_id]) as any[];

    const [pagamentos] = await pool.query(`
      SELECT vp.* 
      FROM vendas_pagamentos vp
      WHERE vp.venda_id = ? AND vp.tenant_id = ?
    `, [sale.id, tenant_id]) as any[];

    res.json({ 
      ...sale, 
      items: (items as any[]).map((i: any) => ({
        id: i.produto_id,
        nome: i.nome,
        quantidade: i.quantidade,
        preco_unitario: i.preco_unitario,
        subtotal: i.subtotal
      })), 
      pagamentos 
    });
  } catch (err: any) {
    console.error("Error fetching sale details:", err);
    res.status(500).json({ error: err.message });
  }
});

// Update Sale
router.put("/:id", authMiddleware, async (req: any, res) => {
  const { id } = req.params; // This is now sequencial_id
  const { pessoa_id, items, valor_total, desconto, frete, status, solicitacao, laudo_tecnico, pagamentos, identificacao, taxa_servico, origem, tipo } = req.body;
  const { tenant_id } = req.user;
  
  const pessoaIdToInsert = pessoa_id === '' ? null : pessoa_id;

  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();

    let [existingSales] = await connection.query("SELECT * FROM vendas WHERE id = ? AND tenant_id = ?", [id, tenant_id]) as any[];
    if (existingSales.length === 0) {
      // Fallback to internal ID if sequencial not found (helps with old records or frontend mismatches)
      [existingSales] = await connection.query("SELECT * FROM vendas WHERE sequencial_id = ? AND tenant_id = ?", [id, tenant_id]) as any[];
    }
    
    const existingSale = existingSales[0];
    if (!existingSale) throw new Error("Venda não encontrada");
    if (existingSale.status === 'finalizada') throw new Error("Venda já finalizada não pode ser editada");

    // Update Sale
    await connection.query(
      "UPDATE vendas SET pessoa_id = ?, valor_total = ?, desconto = ?, frete = ?, status = ?, solicitacao = ?, laudo_tecnico = ?, identificacao = ?, taxa_servico = ?, origem = ?, tipo = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ? AND tenant_id = ?",
      [pessoaIdToInsert, valor_total, desconto || 0, frete || 0, status, solicitacao || null, laudo_tecnico || null, identificacao || existingSale.identificacao, taxa_servico || existingSale.taxa_servico, origem || existingSale.origem, tipo || existingSale.tipo, existingSale.id, tenant_id]
    );
    
    // Delete old items
    await connection.query("DELETE FROM vendas_itens WHERE venda_id = ? AND tenant_id = ?", [existingSale.id, tenant_id]);

    // Insert new items
    for (const item of items) {
      await connection.query(
        "INSERT INTO vendas_itens (tenant_id, venda_id, produto_id, quantidade, preco_unitario, subtotal) VALUES (?, ?, ?, ?, ?, ?)",
        [tenant_id, existingSale.id, item.id, item.quantidade, item.preco_unitario || item.preco_venda, item.subtotal]
      );
    }

    // Delete old payments
    await connection.query("DELETE FROM vendas_pagamentos WHERE venda_id = ? AND tenant_id = ?", [existingSale.id, tenant_id]);

    // Insert new payments
    if (pagamentos && pagamentos.length > 0) {
      for (const pg of pagamentos) {
        await connection.query(
          "INSERT INTO vendas_pagamentos (tenant_id, venda_id, tipo_pagamento_id, nome, valor, parcelas) VALUES (?, ?, ?, ?, ?, ?)",
          [tenant_id, existingSale.id, (!pg.tipo_pagamento_id || pg.tipo_pagamento_id === 'Dinheiro') ? null : pg.tipo_pagamento_id, pg.nome, pg.valor, pg.parcelas || 1]
        );
      }
    }

    if (status === 'finalizada') {
       // Update Stock for each item (only for products, not services)
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

      // Create financial entries based on local_lancamento
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
          } else if (pg.nome.toLowerCase().includes('cartão') || pg.nome.toLowerCase().includes('cartao')) {
            localLancamento = 'Cartão';
          }

          const descricao = `Pedido #${existingSale.sequencial_id} | ${dataVenda} | ${pg.nome} | ${clienteNome}`;

          if (localLancamento === 'Caixa') {
            const [caixas] = await connection.query("SELECT id FROM caixa WHERE tenant_id = ? AND status = 'aberto' ORDER BY id DESC LIMIT 1", [tenant_id]) as any[];
            const caixaAberto = caixas[0];
            if (caixaAberto) {
              await connection.query(
                "INSERT INTO movimentacoes_caixa (tenant_id, caixa_id, tipo, valor, descricao, venda_id, tipo_pagamento_id, origem) VALUES (?, ?, 'entrada', ?, ?, ?, ?, ?)",
                [tenant_id, caixaAberto.id, pg.valor, descricao, existingSale.id, (!pg.tipo_pagamento_id || pg.tipo_pagamento_id === 'Dinheiro') ? null : pg.tipo_pagamento_id, 'Venda']
              );
            } else {
              // Fallback to lancamentos if cashier is closed but intended for Caixa
              await connection.query(
                "INSERT INTO lancamentos (tenant_id, tipo, pessoa_id, venda_id, vencimento, valor, valor_pago, status, data_pagamento, descricao, local, tipo_pagamento_id) VALUES (?, 'CR', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
                [tenant_id, pessoaIdToInsert, existingSale.id, new Date().toISOString().slice(0, 19).replace('T', ' '), pg.valor, 0, 'aberta', null, descricao + ' (Caixa Fechado)', 'Caixa', (!pg.tipo_pagamento_id || pg.tipo_pagamento_id === 'Dinheiro') ? null : pg.tipo_pagamento_id]
              );
            }
          } else {
            // Banco, Cartão or Contas a Receber
            const valorParcela = pg.valor / (pg.parcelas || 1);
            
            for (let i = 0; i < (pg.parcelas || 1); i++) {
              const vencimento = new Date();
              // First installment uses prazoDias, subsequent uses +30 days each
              const diasToAdd = prazoDias + (i * 30);
              vencimento.setDate(vencimento.getDate() + diasToAdd);
              
              // Status logic: if it's for today (prazo 0) and local is Banco/Cartão, mark as paid.
              // Otherwise, keep as open to be settled later.
              const statusCR = (diasToAdd === 0 && (localLancamento === 'Banco' || localLancamento === 'Cartão')) ? 'paga' : 'aberta';
              const valorPagoCR = statusCR === 'paga' ? valorParcela : 0;
              const dataPagamentoCR = statusCR === 'paga' ? new Date().toISOString() : null;

              await connection.query(
                "INSERT INTO lancamentos (tenant_id, tipo, pessoa_id, venda_id, vencimento, valor, valor_pago, status, data_pagamento, descricao, local, tipo_pagamento_id) VALUES (?, 'CR', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
                [
                  tenant_id, 
                  pessoaIdToInsert, 
                  existingSale.id, 
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
    res.json({ success: true });
  } catch (err: any) {
    await connection.rollback();
    console.error("====== Error updating sale ======\n", err);
    res.status(400).json({ error: err.message });
  } finally {
    connection.release();
  }
});

// Cancel Sale
router.post("/:id/cancel", authMiddleware, async (req: any, res) => {
  const { id } = req.params;
  const { tenant_id } = req.user;
  console.log(`Cancel request received for sale ${id} (tenant ${tenant_id})`);

  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();

    // 1. Get Sale
    let [sales] = await connection.query("SELECT * FROM vendas WHERE id = ? AND tenant_id = ?", [id, tenant_id]) as any[];
    if (sales.length === 0) {
      [sales] = await connection.query("SELECT * FROM vendas WHERE sequencial_id = ? AND tenant_id = ?", [id, tenant_id]) as any[];
    }
    
    const sale = sales[0];
    if (!sale) throw new Error("Venda não encontrada");
    if (sale.status === 'cancelada') throw new Error("Esta venda já está cancelada");

    const saleId = sale.id; // Use primary key for internal operations

    // 2. If 'finalizada', reverse stock and financial impact
    if (sale.status === 'finalizada') {
      // Return items to stock
      const [items] = await connection.query("SELECT produto_id, quantidade FROM vendas_itens WHERE venda_id = ?", [saleId]) as any[];
      for (const item of items) {
        const [products] = await connection.query("SELECT tipo FROM produtos WHERE id = ?", [item.produto_id]) as any[];
        const product = products[0];
        if (product && product.tipo === 'produto') {
          await connection.query(
            "UPDATE produtos SET estoque_atual = estoque_atual + ? WHERE id = ?",
            [item.quantidade, item.produto_id]
          );
        }
      }

      // Delete linked financial movements
      await connection.query("DELETE FROM movimentacoes_caixa WHERE venda_id = ? AND tenant_id = ?", [saleId, tenant_id]);
      await connection.query("DELETE FROM lancamentos WHERE venda_id = ? AND tenant_id = ?", [saleId, tenant_id]);
    }

    // 3. Update Sale Status
    await connection.query("UPDATE vendas SET status = 'cancelada' WHERE id = ?", [saleId]);

    await connection.commit();
    res.json({ success: true });
  } catch (err: any) {
    await connection.rollback();
    console.error("Error cancelling sale:", err);
    res.status(400).json({ error: err.message });
  } finally {
    connection.release();
  }
});

export default router;
