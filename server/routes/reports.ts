import { Router } from "express";
import { pool } from "../db";
import { authMiddleware, planMiddleware } from "../middleware";

const router = Router();

// Notification Logs (used in Reports page)
router.get("/notifications", authMiddleware, async (req: any, res) => {
  if (req.user.perfil !== 'admin' && req.user.perfil !== 'superadmin') {
    const perm = req.user.permissoes;
    if (!perm?.relatorios?.acessar || !perm?.relatorios?.notifications) {
      return res.status(403).json({ error: "Acesso negado. Você não tem permissão para acessar o relatório de logs de notificações." });
    }
  }

  const { tenant_id } = req.user;
  const { date, time } = req.query;

  try {
    let whereClause = "n.tenant_id = ?";
    const queryParams: any[] = [tenant_id];

    if (date) {
      if (time === "1h") {
        whereClause += " AND n.created_at >= NOW() - INTERVAL '1 hour'";
      } else if (time === "24h") {
        whereClause += " AND n.created_at >= NOW() - INTERVAL '24 hours'";
      } else {
        whereClause += " AND DATE(n.created_at) = ?";
        queryParams.push(date);
      }
    }

    const [logs] = await pool.query(`
      SELECT n.*, p.nome as cliente_nome, a.data_inicio
      FROM notificacoes n
      LEFT JOIN agendamentos a ON n.agenda_id = a.id
      LEFT JOIN pessoas p ON a.pessoa_id = p.id
      WHERE ${whereClause}
      ORDER BY n.created_at DESC
      LIMIT 1000
    `, queryParams) as any[];
    res.json(logs);
  } catch (err: any) {
    console.error("Error fetching notification logs:", err);
    res.status(500).json({ error: err.message });
  }
});

// Generic reports could be added here
// For now, it handles the notification logs and potentially others in the future

export default router;

router.get("/comissoes", authMiddleware, async (req: any, res) => {
  if (req.user.perfil !== 'admin' && req.user.perfil !== 'superadmin') {
    const perm = req.user.permissoes;
    if (!perm?.relatorios?.acessar || !perm?.relatorios?.comissoes) {
      return res.status(403).json({ error: "Acesso negado. Você não tem permissão para acessar o relatório de comissões." });
    }
  }

  const { tenant_id } = req.user;
  const { data_inicio, data_fim, usuario_id, status } = req.query;

  let query = `
    SELECT 
      c.id as id_lancamento,
      c.venda_id as id_pedido,
      c.produto_id,
      c.usuario_id,
      u.nome as usuario,
      p.nome as desc_produto,
      c.data_lancamento as data,
      c.origem,
      c.status,
      c.valor_base,
      c.perc_comissao,
      c.valor_comissao
    FROM comissoes c
    JOIN usuarios u ON c.usuario_id = u.id
    LEFT JOIN produtos p ON c.produto_id = p.id
    WHERE c.tenant_id = ?
  `;
  const params: any[] = [tenant_id];

  if (data_inicio && data_fim) {
    query += " AND DATE(c.data_lancamento) >= ? AND DATE(c.data_lancamento) <= ?";
    params.push(data_inicio, data_fim);
  }
  if (usuario_id) {
    query += " AND c.usuario_id = ?";
    params.push(usuario_id);
  }
  if (status) {
    query += " AND c.status = ?";
    params.push(status);
  }

  query += " ORDER BY c.data_lancamento DESC";

  try {
    const [rows] = await pool.query(query, params);
    res.json(rows);
  } catch (err: any) {
    console.error("Error fetching comissoes:", err);
    res.status(500).json({ error: err.message });
  }
});
