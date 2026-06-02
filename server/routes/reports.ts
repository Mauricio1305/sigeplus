import { Router } from "express";
import { pool } from "../db";
import { authMiddleware, planMiddleware } from "../middleware";

const router = Router();

// Notification Logs (used in Reports page)
router.get("/notifications", authMiddleware, async (req: any, res) => {
  const { tenant_id } = req.user;
  const { date, time } = req.query;

  try {
    let whereClause = "n.tenant_id = ?";
    const queryParams: any[] = [tenant_id];

    if (date) {
      if (time === "1h") {
        const fromTime = new Date();
        fromTime.setHours(fromTime.getHours() - 1);
        whereClause += " AND n.created_at >= ?";
        queryParams.push(fromTime);
      } else if (time === "24h") {
        const fromTime = new Date();
        fromTime.setHours(fromTime.getHours() - 24);
        whereClause += " AND n.created_at >= ?";
        queryParams.push(fromTime);
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
