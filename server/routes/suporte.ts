import express from 'express';
import { pool } from '../db';
import { authMiddleware } from '../middleware';

const router = express.Router();

// Public start route - doesn't require auth (for login/register pages)
router.post('/start', async (req: any, res) => {
  const { tenant_id, email, usuario_id } = req.body;
  try {
    const [result] = await pool.query(
      "INSERT INTO chamados (tenant_id, email, usuario_id, status) VALUES (?, ?, ?, 'Rascunho')",
      [tenant_id || null, email || null, usuario_id || null]
    );
    res.json({ id: (result as any).insertId });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// Update/confirm a drafted ticket
router.post('/:id/confirm', async (req: any, res) => {
  const { mensagem } = req.body;
  const { id } = req.params;
  try {
    await pool.query(
      "UPDATE chamados SET status = 'Aguardando Análise', assunto = ?, unread_admin = TRUE WHERE id = ?",
      [mensagem.substring(0, 250), id]
    );
    await pool.query(
      "INSERT INTO chamados_mensagens (chamado_id, sender_type, mensagem) VALUES (?, 'user', ?)",
      [id, mensagem]
    );
    res.json({ success: true });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// Public interaction from widget (if needed)

// Below endpoints require auth (they are for the user profile and SaaS management)
router.use(authMiddleware);

// Get unread notification counts
router.get('/unread_count', async (req: any, res) => {
  const { tenant_id, email, perfil } = req.user;
  try {
    let result: any = [{ count: 0 }];
    if (perfil === 'superadmin' || tenant_id === 'system') {
      [result] = await pool.query("SELECT COUNT(*) as count FROM chamados WHERE unread_admin = TRUE");
    } else {
      [result] = await pool.query("SELECT COUNT(*) as count FROM chamados WHERE (tenant_id = ? OR email = ?) AND unread_user = TRUE", [tenant_id, email]);
    }
    res.json({ unread: parseInt((result as any)[0].count) });
  } catch(err: any) {
    res.status(500).json({ error: err.message });
  }
});

// Get tickets for logged-in user
router.get('/my_tickets', async (req: any, res) => {
  const { usuario_id, perfil, tenant_id } = req.user;
  try {
    let sql = "";
    let params: any[] = [];
    
    // For logged in user, query by tenant_id or user email
    sql = "SELECT * FROM chamados WHERE tenant_id = ? OR email = ? ORDER BY created_at DESC";
    params = [tenant_id, req.user.email];

    const [tickets] = await pool.query(sql, params) as any[];
    res.json(tickets);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// Get tickets for SaaS admin
router.get('/admin', async (req: any, res) => {
  if (req.user.perfil !== 'superadmin' && req.user.tenant_id !== 'system') {
    return res.status(403).json({ error: 'Acesso negado' });
  }
  try {
    const [tickets] = await pool.query(`
      SELECT c.*, e.nome_fantasia as empresa_nome 
      FROM chamados c 
      LEFT JOIN empresas e ON c.tenant_id = e.tenant_id 
      WHERE c.status != 'Rascunho'
      ORDER BY c.created_at DESC
    `) as any[];
    res.json(tickets);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/:id/messages', async (req: any, res) => {
  const { id } = req.params;
  try {
    if (req.user.perfil === 'superadmin' || req.user.tenant_id === 'system') {
      await pool.query("UPDATE chamados SET unread_admin = FALSE WHERE id = ?", [id]);
    } else {
      await pool.query("UPDATE chamados SET unread_user = FALSE WHERE id = ?", [id]);
    }

    const [messages] = await pool.query(
      "SELECT * FROM chamados_mensagens WHERE chamado_id = ? ORDER BY created_at ASC",
      [id]
    ) as any[];
    res.json(messages);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/:id/reply', async (req: any, res) => {
  const { id } = req.params;
  const { mensagem, sender_type } = req.body;
  
  if (!mensagem) {
      return res.status(400).json({error: 'Mensagem inválida'});
  }

  try {
    await pool.query(
      "INSERT INTO chamados_mensagens (chamado_id, sender_type, mensagem) VALUES (?, ?, ?)",
      [id, sender_type, mensagem]
    );

    // Update status based on sender
    const status = sender_type === 'support' ? 'Aguardando Interação' : 'Aguardando Análise';
    const unread_user = sender_type === 'support';
    const unread_admin = sender_type !== 'support';

    await pool.query(
      "UPDATE chamados SET status = ?, unread_user = (unread_user OR ?), unread_admin = (unread_admin OR ?), updated_at = CURRENT_TIMESTAMP WHERE id = ?", 
      [status, unread_user, unread_admin, id]
    );

    res.json({ success: true });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/:id/complete', async (req: any, res) => {
  const { id } = req.params;
  try {
    await pool.query("UPDATE chamados SET status = 'Finalizado', unread_user = TRUE, unread_admin = FALSE, updated_at = CURRENT_TIMESTAMP WHERE id = ?", [id]);
    res.json({ success: true });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
