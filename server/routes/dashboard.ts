import { Router } from "express";
import { pool } from "../db";
import { authMiddleware, planMiddleware } from "../middleware";

const router = Router();

// Dashboard Stats
router.get("/stats", authMiddleware, planMiddleware('dashboard'), async (req: any, res) => {
  try {
    const { tenant_id } = req.user;
    const { year, month } = req.query;
    
    let dateFilterVendas = '';
    let dateFilterLancamentos = '';
    const queryParamsVendas: any[] = [tenant_id];
    const queryParamsLancamentosCR: any[] = [tenant_id];
    const queryParamsLancamentosCP: any[] = [tenant_id];

    if (year) {
      dateFilterVendas += ' AND YEAR(data_venda) = ?';
      dateFilterLancamentos += ' AND YEAR(l.vencimento) = ?';
      queryParamsVendas.push(year);
      queryParamsLancamentosCR.push(year);
      queryParamsLancamentosCP.push(year);
    }
    
    if (month && month !== 'todos') {
      dateFilterVendas += ' AND MONTH(data_venda) = ?';
      dateFilterLancamentos += ' AND MONTH(l.vencimento) = ?';
      queryParamsVendas.push(month);
      queryParamsLancamentosCR.push(month);
      queryParamsLancamentosCP.push(month);
    }

    const [totalSalesRow] = await pool.query(
      `SELECT SUM(valor_total) as total FROM vendas WHERE tenant_id = ? AND status = 'finalizada'${dateFilterVendas}`, 
      queryParamsVendas
    ) as any[];
    
    const [totalReceivableRow] = await pool.query(`
      SELECT SUM(l.valor - COALESCE(l.valor_pago, 0)) as total 
      FROM lancamentos l
      LEFT JOIN tipos_pagamento tp ON l.tipo_pagamento_id = tp.id
      WHERE l.tenant_id = ? AND l.status IN ('aberta', 'parcial') AND l.tipo = 'CR' 
      AND COALESCE(tp.local_lancamento, l.local, 'Receber') IN ('Receber', 'Contas a Receber')${dateFilterLancamentos}
    `, queryParamsLancamentosCR) as any[];
    
    const [totalPayableRow] = await pool.query(`
      SELECT SUM(l.valor - COALESCE(l.valor_pago, 0)) as total 
      FROM lancamentos l
      LEFT JOIN tipos_pagamento tp ON l.tipo_pagamento_id = tp.id
      WHERE l.tenant_id = ? AND l.status IN ('aberta', 'parcial') AND l.tipo = 'CP' 
      AND COALESCE(tp.local_lancamento, l.local, 'Pagar') IN ('Pagar', 'Contas a Pagar')${dateFilterLancamentos}
    `, queryParamsLancamentosCP) as any[];
    const [lowStockRow] = await pool.query("SELECT COUNT(*) as count FROM produtos WHERE tenant_id = ? AND estoque_atual < estoque_minimo", [tenant_id]) as any[];

    res.json({
      sales: totalSalesRow[0]?.total || 0,
      receivable: totalReceivableRow[0]?.total || 0,
      payable: totalPayableRow[0]?.total || 0,
      lowStock: lowStockRow[0]?.count || 0
    });
  } catch (err: any) {
    console.error("Error fetching dashboard stats:", err);
    res.status(500).json({ error: err.message });
  }
});

// Dashboard Chart Data
router.get("/chart-data", authMiddleware, planMiddleware('dashboard'), async (req: any, res) => {
  try {
    const { tenant_id } = req.user;
    const { year } = req.query;
    
    const targetYear = year || new Date().getFullYear().toString();
    
    // Get receivables by month (from lancamentos)
    const [receivablesByMonth] = await pool.query(`
      SELECT 
        DATE_FORMAT(l.vencimento, '%m') as month_num,
        SUM(l.valor - COALESCE(l.valor_pago, 0)) as total 
      FROM lancamentos l
      LEFT JOIN tipos_pagamento tp ON l.tipo_pagamento_id = tp.id
      WHERE l.tenant_id = ? AND YEAR(l.vencimento) = ? AND l.status IN ('aberta', 'parcial') AND l.tipo = 'CR'
      AND COALESCE(tp.local_lancamento, l.local, 'Receber') IN ('Receber', 'Contas a Receber')
      GROUP BY month_num
    `, [tenant_id, targetYear]) as any[];

    // Get expenses by month (from lancamentos)
    const [expensesByMonth] = await pool.query(`
      SELECT 
        DATE_FORMAT(l.vencimento, '%m') as month_num,
        SUM(l.valor - COALESCE(l.valor_pago, 0)) as total 
      FROM lancamentos l
      LEFT JOIN tipos_pagamento tp ON l.tipo_pagamento_id = tp.id
      WHERE l.tenant_id = ? AND YEAR(l.vencimento) = ? AND l.status IN ('aberta', 'parcial') AND l.tipo = 'CP'
      AND COALESCE(tp.local_lancamento, l.local, 'Pagar') IN ('Pagar', 'Contas a Pagar')
      GROUP BY month_num
    `, [tenant_id, targetYear]) as any[];

    const monthsData = [];
    const monthNames = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'];
    
    for (let i = 1; i <= 12; i++) {
      const monthNumStr = i.toString().padStart(2, '0');
      const receivables = (receivablesByMonth as any[]).find(s => s.month_num === monthNumStr)?.total || 0;
      const expenses = (expensesByMonth as any[]).find(e => e.month_num === monthNumStr)?.total || 0;
      
      monthsData.push({
        name: monthNames[i - 1],
        receivables,
        expenses
      });
    }

    res.json(monthsData);
  } catch (err: any) {
    console.error("Error fetching chart data:", err);
    res.json([]);
  }
});

// Top Products
router.get("/top-products", authMiddleware, planMiddleware('dashboard'), async (req: any, res) => {
  try {
    const { tenant_id } = req.user;
    const { year, month } = req.query;

    let dateFilter = '';
    const queryParams: any[] = [tenant_id];

    if (year) {
      dateFilter += ' AND YEAR(v.data_venda) = ?';
      queryParams.push(year);
    }
    
    if (month && month !== 'todos') {
      dateFilter += ' AND MONTH(v.data_venda) = ?';
      queryParams.push(month);
    }
    
    const [topProducts] = await pool.query(`
      SELECT 
        p.nome as name,
        SUM(vi.quantidade) as qtd
      FROM vendas_itens vi
      JOIN vendas v ON v.id = vi.venda_id
      JOIN produtos p ON p.id = vi.produto_id
      WHERE v.tenant_id = ? AND v.status = 'finalizada'${dateFilter}
      GROUP BY p.id, p.nome
      ORDER BY qtd DESC
      LIMIT 10
    `, queryParams);

    res.json(topProducts);
  } catch (err: any) {
    console.error("Error fetching top products:", err);
    res.json([]);
  }
});

export default router;
