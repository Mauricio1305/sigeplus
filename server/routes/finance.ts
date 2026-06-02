import { Router } from "express";
import { pool } from "../db";
import { authMiddleware, planMiddleware } from "../middleware";

const router = Router();

// Finance - Receivable (CR)
router.get("/receivable", authMiddleware, planMiddleware('financeiro'), async (req: any, res) => {
  const [data] = await pool.query(`
    SELECT l.*, p.nome as cliente_nome, tp.nome as tipo_pagamento_nome, tp.local_lancamento as tp_local
    FROM lancamentos l 
    LEFT JOIN pessoas p ON l.pessoa_id = p.id 
    LEFT JOIN tipos_pagamento tp ON l.tipo_pagamento_id = tp.id
    WHERE l.tenant_id = ? AND l.tipo = 'CR'
  `, [req.user.tenant_id]);
  res.json(data);
});

// Finance - Bank Movements
router.get("/movements/banco", authMiddleware, async (req: any, res) => {
  const [data] = await pool.query(`
    SELECT mb.*, c.nome as categoria_nome, p.nome as pessoa_nome, 'Banco' as local
    FROM movimentacoes_banco mb
    LEFT JOIN categorias_contas c ON mb.categoria_id = c.id
    LEFT JOIN lancamentos l ON mb.lancamento_id = l.id
    LEFT JOIN pessoas p ON l.pessoa_id = p.id
    WHERE mb.tenant_id = ?
    ORDER BY mb.data_movimentacao DESC
  `, [req.user.tenant_id]);
  res.json(data);
});

// Finance - Card Movements
router.get("/movements/cartao", authMiddleware, async (req: any, res) => {
  const [data] = await pool.query(`
    SELECT mc.*, c.nome as categoria_nome, p.nome as pessoa_nome, 'Cartão' as local
    FROM movimentacoes_cartao mc
    LEFT JOIN categorias_contas c ON mc.categoria_id = c.id
    LEFT JOIN lancamentos l ON mc.lancamento_id = l.id
    LEFT JOIN pessoas p ON l.pessoa_id = p.id
    WHERE mc.tenant_id = ?
    ORDER BY mc.data_movimentacao DESC
  `, [req.user.tenant_id]);
  res.json(data);
});

// Finance - Payable (CP)
router.get("/payable", authMiddleware, planMiddleware('financeiro'), async (req: any, res) => {
  const [data] = await pool.query(`
    SELECT l.*, p.nome as fornecedor_nome, tp.nome as tipo_pagamento_nome, tp.local_lancamento as tp_local
    FROM lancamentos l 
    LEFT JOIN pessoas p ON l.pessoa_id = p.id 
    LEFT JOIN tipos_pagamento tp ON l.tipo_pagamento_id = tp.id
    WHERE l.tenant_id = ? AND l.tipo = 'CP'
  `, [req.user.tenant_id]);
  res.json(data);
});

// Finance - Sales Movements (Report)
router.get("/sales-movements", authMiddleware, async (req: any, res) => {
  const { tenant_id } = req.user;
  
  const [receivables] = await pool.query(`
    SELECT 
      l.id, l.venda_id, l.valor, l.status, l.descricao, l.created_at,
      p.nome as cliente_nome, l.local
    FROM lancamentos l
    LEFT JOIN pessoas p ON l.pessoa_id = p.id
    WHERE l.tenant_id = ? AND l.venda_id IS NOT NULL AND l.tipo = 'CR'
  `, [tenant_id]) as any[];

  const [cashierMovements] = await pool.query(`
    SELECT 
      mc.id, mc.venda_id, mc.valor, 'paga' as status, mc.descricao, mc.created_at,
      p.nome as cliente_nome, 'Caixa' as local, mc.tipo, mc.origem
    FROM movimentacoes_caixa mc
    LEFT JOIN vendas v ON mc.venda_id = v.id
    LEFT JOIN pessoas p ON v.pessoa_id = p.id
    WHERE mc.tenant_id = ?
  `, [tenant_id]) as any[];

  const allMovements = [...(receivables as any[]), ...(cashierMovements as any[])].sort((a: any, b: any) => {
    return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
  });

  res.json(allMovements);
});

// Finance - DRE
router.get("/dre", authMiddleware, planMiddleware('financeiro'), async (req: any, res) => {
  const { tenant_id } = req.user;
  const { start, end } = req.query as any;

  try {
    let dateFilterVendas = "";
    let dateFilterLanc = "";
    let dateFilterCaixa = "";
    const paramsVendas = [tenant_id];
    const paramsLanc = [tenant_id];
    const paramsCaixa = [tenant_id];

    if (start && end) {
      dateFilterVendas = " AND DATE(v.data_venda) >= ? AND DATE(v.data_venda) <= ?";
      paramsVendas.push(start, end);
      
      dateFilterLanc = " AND DATE(l.vencimento) >= ? AND DATE(l.vencimento) <= ?";
      paramsLanc.push(start, end);

      dateFilterCaixa = " AND DATE(m.data_movimentacao) >= ? AND DATE(m.data_movimentacao) <= ?";
      paramsCaixa.push(start, end);
    }

    const [vendasRaw] = await pool.query(`
      SELECT SUM(v.valor_total) as liquido, SUM(v.desconto) as descontos, SUM(v.frete) as frete
      FROM vendas v
      WHERE v.tenant_id = ? AND v.status = 'finalizada' ${dateFilterVendas}
    `, paramsVendas) as any[];

    const [cmvRaw] = await pool.query(`
      SELECT SUM(vi.quantidade * COALESCE(p.custo, 0)) as cmv
      FROM vendas_itens vi
      JOIN vendas v ON vi.venda_id = v.id
      LEFT JOIN produtos p ON vi.produto_id = p.id
      WHERE v.tenant_id = ? AND v.status = 'finalizada' ${dateFilterVendas}
    `, paramsVendas) as any[];

    const [despesasRaw] = await pool.query(`
      SELECT COALESCE(c.nome, 'Sem Categoria') as categoria, SUM(l.valor) as total
      FROM lancamentos l
      LEFT JOIN categorias_contas c ON l.categoria_id = c.id
      WHERE l.tenant_id = ? AND l.status != 'cancelada'
        AND l.tipo = 'CP' 
        AND (l.descricao IS NULL OR l.descricao NOT LIKE 'Pagamento conta #%')
        ${dateFilterLanc}
      GROUP BY c.nome
    `, paramsLanc) as any[];

    const [caixaDespesasRaw] = await pool.query(`
      SELECT COALESCE(c.nome, 'Saídas Caixa (Não Categorizadas)') as categoria, SUM(m.valor) as total
      FROM movimentacoes_caixa m
      LEFT JOIN categorias_contas c ON m.categoria_id = c.id
      WHERE m.tenant_id = ? AND (m.status != 'cancelada' OR m.status IS NULL) AND m.tipo = 'saida' 
        AND m.descricao NOT LIKE 'Pagamento conta %' 
        AND m.venda_id IS NULL AND m.origem = 'Lançamento Manual'
        ${dateFilterCaixa}
      GROUP BY c.nome
    `, paramsCaixa) as any[];

    const [outrasReceitasLancRaw] = await pool.query(`
      SELECT COALESCE(c.nome, 'Outras Receitas') as categoria, SUM(l.valor) as total
      FROM lancamentos l
      LEFT JOIN categorias_contas c ON l.categoria_id = c.id
      WHERE l.tenant_id = ? AND l.status != 'cancelada'
        AND l.tipo = 'CR' 
        AND l.venda_id IS NULL 
        AND (l.descricao IS NULL OR l.descricao NOT LIKE 'Recebimento conta #%')
        ${dateFilterLanc}
      GROUP BY c.nome
    `, paramsLanc) as any[];

    const [outrasReceitasCaixaRaw] = await pool.query(`
      SELECT COALESCE(c.nome, 'Entradas Caixa (Não Categorizadas)') as categoria, SUM(m.valor) as total
      FROM movimentacoes_caixa m
      LEFT JOIN categorias_contas c ON m.categoria_id = c.id
      WHERE m.tenant_id = ? AND (m.status != 'cancelada' OR m.status IS NULL) AND m.tipo = 'entrada' 
        AND m.descricao NOT LIKE 'Recebimento conta %' 
        AND m.venda_id IS NULL AND m.origem = 'Lançamento Manual'
        ${dateFilterCaixa}
      GROUP BY c.nome
    `, paramsCaixa) as any[];
    
    const despesasMap = new Map();
    for (const d of despesasRaw as any[]) {
      if (d.total) despesasMap.set(d.categoria, (despesasMap.get(d.categoria) || 0) + Number(d.total));
    }
    for (const d of caixaDespesasRaw as any[]) {
      if (d.total) despesasMap.set(d.categoria, (despesasMap.get(d.categoria) || 0) + Number(d.total));
    }

    const outrasReceitasMap = new Map();
    for (const d of outrasReceitasLancRaw as any[]) {
      if (d.total) outrasReceitasMap.set(d.categoria, (outrasReceitasMap.get(d.categoria) || 0) + Number(d.total));
    }
    for (const d of outrasReceitasCaixaRaw as any[]) {
      if (d.total) outrasReceitasMap.set(d.categoria, (outrasReceitasMap.get(d.categoria) || 0) + Number(d.total));
    }

    const despesas = Array.from(despesasMap.entries()).map(([categoria, total]) => ({ categoria, total }));
    const total_despesas = despesas.reduce((acc, curr) => acc + curr.total, 0);

    const outras_receitas_lista = Array.from(outrasReceitasMap.entries()).map(([categoria, total]) => ({ categoria, total }));
    const total_outras_receitas = outras_receitas_lista.reduce((acc, curr) => acc + curr.total, 0);

    const desconto = Number(vendasRaw[0]?.descontos || 0);
    const liquido = Number(vendasRaw[0]?.liquido || 0);
    const bruto = liquido + desconto;
    const cmv = Number(cmvRaw[0]?.cmv || 0);
    
    // Lucro Bruto = Receita Liquida - CMV
    const receita_liquida = bruto - desconto;
    const lucro_bruto = receita_liquida - cmv;
    const lucro_liquido = lucro_bruto + total_outras_receitas - total_despesas;

    res.json({
      receita_bruta: bruto,
      descontos: desconto,
      receita_liquida: receita_liquida,
      cmv: cmv,
      lucro_bruto: lucro_bruto,
      outras_receitas: outras_receitas_lista,
      total_outras_receitas: total_outras_receitas,
      despesas: despesas,
      total_despesas: total_despesas,
      lucro_liquido: lucro_liquido
    });
  } catch (err: any) {
    console.error("Error generating DRE:", err);
    res.status(500).json({ error: "Erro ao gerar DRE: " + err.message });
  }
});

// Finance - Accounts Combined Report
router.get("/accounts", authMiddleware, async (req: any, res) => {
  const { tenant_id } = req.user;
  
  try {
    const [accounts] = await pool.query(`
      SELECT l.id, l.vencimento as vencimento, COALESCE(l.descricao, p.nome) as descricao, 
             CASE WHEN l.tipo = 'CR' THEN 'receita' ELSE 'despesa' END as tipo, 
             l.valor as valor, CASE WHEN l.status = 'paga' THEN 1 ELSE 0 END as pago, l.pessoa_id as pessoa_id, p.nome as pessoa_nome,
             l.local as local, ct.nome as categoria_nome
      FROM lancamentos l
      LEFT JOIN pessoas p ON l.pessoa_id = p.id
      LEFT JOIN categorias_contas ct ON l.categoria_id = ct.id
      WHERE l.tenant_id = ?
      
      UNION ALL
      
      SELECT m.id, DATE(m.data_movimentacao) as vencimento, m.descricao as descricao,
             CASE WHEN m.tipo = 'entrada' THEN 'receita' ELSE 'despesa' END as tipo,
             m.valor as valor, 1 as pago, NULL as pessoa_id, 'Caixa PDV/Manual' as pessoa_nome,
             'Caixa' as local, ct.nome as categoria_nome
      FROM movimentacoes_caixa m
      LEFT JOIN categorias_contas ct ON m.categoria_id = ct.id
      WHERE m.tenant_id = ? 
        AND m.origem = 'Lançamento Manual'
      
      UNION ALL

      SELECT mb.id, DATE(mb.data_movimentacao) as vencimento, mb.descricao as descricao,
             CASE WHEN mb.tipo = 'entrada' THEN 'receita' ELSE 'despesa' END as tipo,
             mb.valor as valor, 1 as pago, NULL as pessoa_id, 'Banco/Transf' as pessoa_nome,
             'Banco' as local, ct.nome as categoria_nome
      FROM movimentacoes_banco mb
      LEFT JOIN categorias_contas ct ON mb.categoria_id = ct.id
      WHERE mb.tenant_id = ? 

      UNION ALL

      SELECT mc.id, DATE(mc.data_movimentacao) as vencimento, mc.descricao as descricao,
             CASE WHEN mc.tipo = 'entrada' THEN 'receita' ELSE 'despesa' END as tipo,
             mc.valor as valor, 1 as pago, NULL as pessoa_id, 'Cartão' as pessoa_nome,
             'Cartão' as local, ct.nome as categoria_nome
      FROM movimentacoes_cartao mc
      LEFT JOIN categorias_contas ct ON mc.categoria_id = ct.id
      WHERE mc.tenant_id = ? 
      
      ORDER BY vencimento DESC
    `, [tenant_id, tenant_id, tenant_id, tenant_id]) as any[];

    res.json(accounts);
  } catch (err: any) {
    console.error("Error in /api/finance/accounts:", err);
    res.status(500).json({ error: "Erro ao buscar dados financeiros: " + err.message });
  }
});

// Finance - Payment Types
router.get("/payment-types", authMiddleware, async (req: any, res) => {
  const [data] = await pool.query("SELECT * FROM tipos_pagamento WHERE tenant_id = ?", [req.user.tenant_id]);
  res.json(data);
});

router.post("/payment-types", authMiddleware, async (req: any, res) => {
  const { nome, prazo_dias, qtd_parcelas, local_lancamento, ativo, eh_cartao, tipo_cartao, valor_min_parcela } = req.body;
  await pool.query(
    "INSERT INTO tipos_pagamento (tenant_id, nome, prazo_dias, qtd_parcelas, local_lancamento, ativo, eh_cartao, tipo_cartao, valor_min_parcela) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
    [
      req.user.tenant_id, 
      nome, 
      prazo_dias || 0, 
      qtd_parcelas || 1, 
      local_lancamento, 
      ativo === undefined ? 1 : (ativo ? 1 : 0),
      eh_cartao ? 1 : 0,
      tipo_cartao || null,
      valor_min_parcela || 0
    ]
  );
  res.json({ success: true });
});

router.put("/payment-types/:id", authMiddleware, async (req: any, res) => {
  const { id } = req.params;
  const { nome, prazo_dias, qtd_parcelas, local_lancamento, ativo, eh_cartao, tipo_cartao, valor_min_parcela } = req.body;
  await pool.query(
    "UPDATE tipos_pagamento SET nome = ?, prazo_dias = ?, qtd_parcelas = ?, local_lancamento = ?, ativo = ?, eh_cartao = ?, tipo_cartao = ?, valor_min_parcela = ? WHERE id = ? AND tenant_id = ?",
    [
      nome, 
      prazo_dias || 0, 
      qtd_parcelas || 1, 
      local_lancamento, 
      ativo ? 1 : 0, 
      eh_cartao ? 1 : 0,
      tipo_cartao || null,
      valor_min_parcela || 0,
      id, 
      req.user.tenant_id
    ]
  );
  res.json({ success: true });
});

// Finance - Account Categories
router.get("/categories", authMiddleware, async (req: any, res) => {
  const { tenant_id } = req.user;
  const [data] = await pool.query("SELECT * FROM categorias_contas WHERE tenant_id = ?", [tenant_id]) as any[];

  if (data.length === 0) {
    const defaults = [
      { nome: 'Outras Receitas Operacionais', tipo: 'receita' },
      { nome: 'Água e Esgoto', tipo: 'despesa' },
      { nome: 'Energia Elétrica', tipo: 'despesa' },
      { nome: 'Internet e Telefone', tipo: 'despesa' },
      { nome: 'Aluguel e Condomínio', tipo: 'despesa' },
      { nome: 'Material de Consumo e Limpeza', tipo: 'despesa' },
      { nome: 'Salários e Encargos', tipo: 'despesa' },
      { nome: 'Pró-Labore', tipo: 'despesa' },
      { nome: 'Impostos e Taxas', tipo: 'despesa' },
      { nome: 'Marketing e Publicidade', tipo: 'despesa' },
      { nome: 'Manutenção e Reparos', tipo: 'despesa' },
      { nome: 'Despesas Bancárias', tipo: 'despesa' },
      { nome: 'Outras Despesas Operacionais', tipo: 'despesa' }
    ];

    for (const d of defaults) {
      await pool.query(
        "INSERT INTO categorias_contas (tenant_id, nome, tipo, ativo) VALUES (?, ?, ?, 1)",
        [tenant_id, d.nome, d.tipo]
      );
    }

    const [newData] = await pool.query("SELECT * FROM categorias_contas WHERE tenant_id = ?", [tenant_id]);
    return res.json(newData);
  }

  res.json(data);
});

router.post("/categories", authMiddleware, async (req: any, res) => {
  const { nome, tipo, ativo } = req.body;
  await pool.query(
    "INSERT INTO categorias_contas (tenant_id, nome, tipo, ativo) VALUES (?, ?, ?, ?)",
    [req.user.tenant_id, nome, tipo, ativo !== undefined ? (ativo ? 1 : 0) : 1]
  );
  res.json({ success: true });
});

router.put("/categories/:id", authMiddleware, async (req: any, res) => {
  const { id } = req.params;
  const { nome, tipo, ativo } = req.body;
  await pool.query(
    "UPDATE categorias_contas SET nome = ?, tipo = ?, ativo = ? WHERE id = ? AND tenant_id = ?",
    [nome, tipo, ativo ? 1 : 0, id, req.user.tenant_id]
  );
  res.json({ success: true });
});

// Finance - Receivable Settlement (Baixa)
router.post("/receivable/:id/pay", authMiddleware, async (req: any, res) => {
  const { id } = req.params;
  const { valor_pago, data_pagamento, local, categoria_id } = req.body;
  const { tenant_id } = req.user;

  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();

    const [contas] = await connection.query("SELECT * FROM lancamentos WHERE id = ? AND tenant_id = ? AND tipo = 'CR'", [id, tenant_id]) as any[];
    const conta = contas[0];
    if (!conta) throw new Error("Conta não encontrada");

    const valorRecebido = parseFloat(valor_pago) || 0;
    const novoValorPago = parseFloat(conta.valor_pago || 0) + valorRecebido;
    const status = novoValorPago >= (parseFloat(conta.valor) - 0.01) ? 'paga' : 'parcial';

    const effectiveCategoriaId = categoria_id || conta.categoria_id;

    await connection.query(
      "UPDATE lancamentos SET valor_pago = ?, status = ?, data_pagamento = ?, categoria_id = ? WHERE id = ?",
      [novoValorPago, status, data_pagamento.slice(0, 19).replace('T', ' '), effectiveCategoriaId, id]
    );

    if (local === 'Caixa') {
      const [caixas] = await connection.query("SELECT id FROM caixa WHERE tenant_id = ? AND status = 'aberto' ORDER BY id DESC LIMIT 1", [tenant_id]) as any[];
      const caixaAberto = caixas[0];
      if (caixaAberto) {
        await connection.query(
          "INSERT INTO movimentacoes_caixa (tenant_id, caixa_id, tipo, valor, descricao, categoria_id) VALUES (?, ?, 'entrada', ?, ?, ?)",
          [tenant_id, caixaAberto.id, valorRecebido, `Recebimento conta #${id} via ${local}`, effectiveCategoriaId]
        );
      }
    } else if (local === 'Banco') {
      await connection.query(
        "INSERT INTO movimentacoes_banco (tenant_id, lancamento_id, tipo, valor, descricao, categoria_id) VALUES (?, ?, 'entrada', ?, ?, ?)",
        [tenant_id, id, valorRecebido, `Recebimento conta #${id} via ${local}`, effectiveCategoriaId]
      );
    } else if (local === 'Cartão' || local === 'Cartao') {
      await connection.query(
        "INSERT INTO movimentacoes_cartao (tenant_id, lancamento_id, tipo, valor, descricao, categoria_id) VALUES (?, ?, 'entrada', ?, ?, ?)",
        [tenant_id, id, valorRecebido, `Recebimento conta #${id} via ${local}`, effectiveCategoriaId]
      );
    }

    await connection.commit();
    res.json({ success: true });
  } catch (err: any) {
    await connection.rollback();
    res.status(400).json({ error: err.message });
  } finally {
    connection.release();
  }
});

// Finance - Payable Settlement (Baixa)
router.post("/payable/:id/pay", authMiddleware, async (req: any, res) => {
  const { id } = req.params;
  const { valor_pago, data_pagamento, local, categoria_id } = req.body;
  const { tenant_id } = req.user;

  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();

    const [contas] = await connection.query("SELECT * FROM lancamentos WHERE id = ? AND tenant_id = ? AND tipo = 'CP'", [id, tenant_id]) as any[];
    const conta = contas[0];
    if (!conta) throw new Error("Conta não encontrada");

    const valorPagoReq = parseFloat(valor_pago) || 0;
    const novoValorPago = parseFloat(conta.valor_pago || 0) + valorPagoReq;
    const status = novoValorPago >= (parseFloat(conta.valor) - 0.01) ? 'paga' : 'parcial';

    const effectiveCategoriaId = categoria_id || conta.categoria_id;

    await connection.query(
      "UPDATE lancamentos SET valor_pago = ?, status = ?, data_pagamento = ?, categoria_id = ? WHERE id = ?",
      [novoValorPago, status, data_pagamento.slice(0, 19).replace('T', ' '), effectiveCategoriaId, id]
    );

    if (local === 'Caixa') {
      const [caixas] = await connection.query("SELECT id FROM caixa WHERE tenant_id = ? AND status = 'aberto' ORDER BY id DESC LIMIT 1", [tenant_id]) as any[];
      const caixaAberto = caixas[0];
      if (caixaAberto) {
        await connection.query(
          "INSERT INTO movimentacoes_caixa (tenant_id, caixa_id, tipo, valor, descricao, categoria_id) VALUES (?, ?, 'saida', ?, ?, ?)",
          [tenant_id, caixaAberto.id, valorPagoReq, `Pagamento conta #${id} via ${local}`, effectiveCategoriaId]
        );
      }
    } else if (local === 'Banco') {
      await connection.query(
        "INSERT INTO movimentacoes_banco (tenant_id, lancamento_id, tipo, valor, descricao, categoria_id) VALUES (?, ?, 'saida', ?, ?, ?)",
        [tenant_id, id, valorPagoReq, `Pagamento conta #${id} via ${local}`, effectiveCategoriaId]
      );
    } else if (local === 'Cartão' || local === 'Cartao') {
      await connection.query(
        "INSERT INTO movimentacoes_cartao (tenant_id, lancamento_id, tipo, valor, descricao, categoria_id) VALUES (?, ?, 'saida', ?, ?, ?)",
        [tenant_id, id, valorPagoReq, `Pagamento conta #${id} via ${local}`, effectiveCategoriaId]
      );
    }

    await connection.commit();
    res.json({ success: true });
  } catch (err: any) {
    await connection.rollback();
    res.status(400).json({ error: err.message });
  } finally {
    connection.release();
  }
});

// Finance - Movement Cancellation
router.post("/movements/:table/:id/cancel", authMiddleware, async (req: any, res) => {
  const { table, id } = req.params;
  const { motivo } = req.body;
  const { tenant_id, id: user_id } = req.user;
  try {
    const tableName = table === 'caixa' ? 'movimentacoes_caixa' : 'lancamentos';
    const [rows] = await pool.query(`SELECT status FROM ${tableName} WHERE id = ? AND tenant_id = ?`, [id, tenant_id]) as any[];
    if (rows.length === 0) return res.status(404).json({ error: "Lançamento não encontrado" });
    
    if (rows[0].status !== 'aberta') return res.status(400).json({ error: "Apenas lançamentos com status Aberta podem ser cancelados" });

    await pool.query(`UPDATE ${tableName} SET status = 'cancelada', cancelado_em = NOW(), cancelado_por = ?, motivo_cancelamento = ? WHERE id = ?`, [user_id, motivo, id]);
    res.json({ success: true, message: "Cancelado com sucesso" });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Erro ao cancelar" });
  }
});

// Finance - Movement Reversal (Estorno)
router.post("/movements/:table/:id/estorno", authMiddleware, async (req: any, res) => {
  const { table, id } = req.params;
  const { motivo } = req.body;
  const { tenant_id, id: user_id } = req.user;
  try {
    const tableName = table === 'caixa' ? 'movimentacoes_caixa' : 'lancamentos';
    const [rows] = await pool.query(`SELECT * FROM ${tableName} WHERE id = ? AND tenant_id = ?`, [id, tenant_id]) as any[];
    if (rows.length === 0) return res.status(404).json({ error: "Lançamento não encontrado" });
    const row = rows[0];
    
    if (row.status !== 'paga' && row.status !== 'parcial') return res.status(400).json({ error: "Apenas lançamentos pagos ou parcialmente pagos podem ser estornados" });

    if (tableName === 'lancamentos') {
      if (row.local === 'Banco' || row.local === 'Caixa' || row.local === 'Cartão' || row.local === 'Cartao') {
         const isCr = row.tipo === 'CR';
         if (row.local === 'Banco') {
             await pool.query(
                 `INSERT INTO movimentacoes_banco (tenant_id, lancamento_id, tipo, valor, descricao, categoria_id) VALUES (?, ?, ?, ?, ?, ?)`,
                 [tenant_id, id, isCr ? 'saida' : 'entrada', row.valor_pago, `Estorno ref. Lançamento #${id}`, row.categoria_id]
             );
         } else if (row.local === 'Cartão' || row.local === 'Cartao') {
             await pool.query(
                 `INSERT INTO movimentacoes_cartao (tenant_id, lancamento_id, tipo, valor, descricao, categoria_id) VALUES (?, ?, ?, ?, ?, ?)`,
                 [tenant_id, id, isCr ? 'saida' : 'entrada', row.valor_pago, `Estorno ref. Lançamento #${id}`, row.categoria_id]
             );
         } else if (row.local === 'Caixa') {
             const [caixas] = await pool.query("SELECT id FROM caixa WHERE tenant_id = ? AND status = 'aberto' ORDER BY id DESC LIMIT 1", [tenant_id]) as any[];
             if (caixas[0]) {
                 await pool.query(
                     `INSERT INTO movimentacoes_caixa (tenant_id, caixa_id, tipo, valor, descricao, categoria_id) VALUES (?, ?, ?, ?, ?, ?)`,
                     [tenant_id, caixas[0].id, isCr ? 'saida' : 'entrada', row.valor_pago, `Estorno ref. Lançamento #${id}`, row.categoria_id]
                 );
             }
         }
      }
      await pool.query(
        `UPDATE lancamentos SET status = 'aberta', valor_pago = 0, data_pagamento = NULL, estornado_em = NOW(), estornado_por = ?, motivo_estorno = ? WHERE id = ?`,
        [user_id, motivo, id]
      );
    } else {
      const reverseCaixaTipo = row.tipo === 'entrada' ? 'saida' : 'entrada';
      const [caixas] = await pool.query("SELECT id FROM caixa WHERE tenant_id = ? AND status = 'aberto' ORDER BY id DESC LIMIT 1", [tenant_id]) as any[];
      if (caixas[0]) {
         await pool.query(
             `INSERT INTO movimentacoes_caixa (tenant_id, caixa_id, tipo, valor, descricao, origem, status) VALUES (?, ?, ?, ?, ?, 'Estorno', 'paga')`,
             [tenant_id, caixas[0].id, reverseCaixaTipo, row.valor, `Estorno ref. Caixa #${id}`]
         );
      }
      await pool.query(
        `UPDATE movimentacoes_caixa SET status = 'aberta', estornado_em = NOW(), estornado_por = ?, motivo_estorno = ? WHERE id = ?`,
        [user_id, motivo, id] 
      );
    }
    res.json({ success: true, message: "Estornado com sucesso" });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Erro ao estornar" });
  }
});

// Finance - Cashier Current
router.get("/cashier/current", authMiddleware, planMiddleware('financeiro'), async (req: any, res) => {
  const [caixas] = await pool.query("SELECT * FROM caixa WHERE tenant_id = ? AND status = 'aberto' ORDER BY id DESC LIMIT 1", [req.user.tenant_id]) as any[];
  res.json(caixas[0] || null);
});

// Finance - Cashier Open
router.post("/cashier/open", authMiddleware, planMiddleware('financeiro'), async (req: any, res) => {
  const { valor_inicial } = req.body;
  const { tenant_id, id: usuario_id } = req.user;

  try {
    const [abertoRows] = await pool.query("SELECT id FROM caixa WHERE tenant_id = ? AND status = 'aberto'", [tenant_id]) as any[];
    if (abertoRows.length > 0) return res.status(400).json({ error: "Já existe um caixa aberto" });

    await pool.query(
      "INSERT INTO caixa (tenant_id, usuario_id, valor_inicial, status) VALUES (?, ?, ?, 'aberto')",
      [tenant_id, usuario_id, valor_inicial || 0]
    );
    res.json({ success: true });
  } catch (err: any) {
    console.error("Error opening cashier:", err);
    res.status(500).json({ error: "Erro interno ao abrir o caixa: " + err.message });
  }
});

// Finance - Cashier Close
router.post("/cashier/close", authMiddleware, async (req: any, res) => {
  const { valor_final } = req.body;
  const { tenant_id } = req.user;

  const [caixas] = await pool.query("SELECT id FROM caixa WHERE tenant_id = ? AND status = 'aberto' ORDER BY id DESC LIMIT 1", [tenant_id]) as any[];
  const caixa = caixas[0];
  if (!caixa) return res.status(400).json({ error: "Nenhum caixa aberto encontrado" });

  await pool.query(
    "UPDATE caixa SET valor_final = ?, status = 'fechado', data_fechamento = CURRENT_TIMESTAMP WHERE id = ?",
    [valor_final, caixa.id]
  );
  res.json({ success: true });
});

// Finance - Cashier Manual Entry
router.post("/cashier/manual-entry", authMiddleware, async (req: any, res) => {
  const { tipo, valor, descricao, categoria_id } = req.body;
  const { tenant_id } = req.user;

  try {
    const [caixas] = await pool.query("SELECT id FROM caixa WHERE tenant_id = ? AND status = 'aberto' ORDER BY id DESC LIMIT 1", [tenant_id]) as any[];
    const caixaAberto = caixas[0];
    if (!caixaAberto) return res.status(400).json({ error: "Nenhum caixa aberto encontrado" });

    await pool.query(
      "INSERT INTO movimentacoes_caixa (tenant_id, caixa_id, tipo, valor, descricao, origem, categoria_id) VALUES (?, ?, ?, ?, ?, ?, ?)",
      [tenant_id, caixaAberto.id, tipo, valor, descricao, 'Lançamento Manual', categoria_id || null]
    );

    res.json({ success: true });
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});

// Finance - Cashier Report
router.get("/cashier/:id/report", authMiddleware, async (req: any, res) => {
  const { id } = req.params;
  const { tenant_id } = req.user;

  const [caixas] = await pool.query("SELECT * FROM caixa WHERE id = ? AND tenant_id = ?", [id, tenant_id]) as any[];
  const cashier = caixas[0];
  const [movements] = await pool.query("SELECT * FROM movimentacoes_caixa WHERE caixa_id = ? AND tenant_id = ?", [id, tenant_id]);
  
  res.json({ cashier, movements });
});

// Finance - Registration Receivable
router.post("/receivable", authMiddleware, async (req: any, res) => {
  const { pessoa_id, categoria_id, vencimento, valor, descricao, local } = req.body;
  const pId = pessoa_id === '' ? null : pessoa_id;
  const cId = categoria_id === '' ? null : categoria_id;
  await pool.query(
    "INSERT INTO lancamentos (tenant_id, tipo, pessoa_id, categoria_id, vencimento, valor, descricao, local) VALUES (?, 'CR', ?, ?, ?, ?, ?, ?)",
    [req.user.tenant_id, pId, cId, vencimento.slice(0, 19).replace('T', ' '), valor, descricao, local || 'Contas a Receber']
  );
  res.json({ success: true });
});

// Finance - Registration Payable
router.post("/payable", authMiddleware, async (req: any, res) => {
  const { pessoa_id, categoria_id, vencimento, valor, descricao, local } = req.body;
  const pId = pessoa_id === '' ? null : pessoa_id;
  const cId = categoria_id === '' ? null : categoria_id;
  await pool.query(
    "INSERT INTO lancamentos (tenant_id, tipo, pessoa_id, categoria_id, vencimento, valor, descricao, local) VALUES (?, 'CP', ?, ?, ?, ?, ?, ?)",
    [req.user.tenant_id, pId, cId, vencimento.slice(0, 19).replace('T', ' '), valor, descricao, local || 'Caixa']
  );
  res.json({ success: true });
});

export default router;
