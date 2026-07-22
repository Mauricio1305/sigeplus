import { Router } from "express";
import { pool } from "../db";
import { authMiddleware, planMiddleware } from "../middleware";
import { processNotification } from "../services/notificationService";

const router = Router();

// ==============================================================================
// AGENDA & AGENDAMENTOS
// ==============================================================================

router.get("/", authMiddleware, planMiddleware('agenda'), async (req: any, res) => {
  const { tenant_id } = req.user;
  const { start, end, userId, includeCanceled } = req.query;

  try {
    const canViewOthers = req.user.perfil === 'admin' || (req.user.permissoes?.agenda?.ver_outros === true);

    let sql = `
      SELECT 
        a.*, 
        p.nome as cliente_nome,
        u.nome as profissional_nome
      FROM agendamentos a
      LEFT JOIN pessoas p ON a.pessoa_id = p.id
      LEFT JOIN usuarios u ON a.usuario_id = u.id
      WHERE a.tenant_id = ? ${includeCanceled ? '' : "AND (a.status IS NULL OR a.status != 'Cancelado')"}
    `;
    const params: any[] = [tenant_id];

    if (start && end) {
      sql += " AND a.data_inicio >= ? AND a.data_inicio <= ?";
      params.push(start, end);
    }

    if (!canViewOthers) {
      sql += " AND a.usuario_id = ?";
      params.push(req.user.id);
    } else if (userId) {
      sql += " AND a.usuario_id = ?";
      params.push(userId);
    }

    sql += " ORDER BY a.data_inicio ASC";

    const [rows] = await pool.query(sql, params) as any[];
    res.json(rows);
  } catch (err: any) {
    console.error("Error fetching agenda:", err);
    res.status(500).json({ error: err.message });
  }
});

router.get("/:id", authMiddleware, planMiddleware('agenda'), async (req: any, res) => {
  const { id } = req.params;
  const { tenant_id } = req.user;

  try {
    const canViewOthers = req.user.perfil === 'admin' || (req.user.permissoes?.agenda?.ver_outros === true);

    let sql = `
      SELECT 
        a.*, 
        p.nome as cliente_nome,
        p.telefone as cliente_telefone,
        p.email as cliente_email,
        u.nome as profissional_nome
      FROM agendamentos a
      LEFT JOIN pessoas p ON a.pessoa_id = p.id
      LEFT JOIN usuarios u ON a.usuario_id = u.id
      WHERE a.id = ? AND a.tenant_id = ?
    `;
    const params: any[] = [id, tenant_id];

    if (!canViewOthers) {
      sql += " AND a.usuario_id = ?";
      params.push(req.user.id);
    }

    const [rows] = await pool.query(sql, params) as any[];

    if (rows.length === 0) return res.status(404).json({ error: "Agendamento não encontrado ou acesso não autorizado" });

    const [items] = await pool.query(`
      SELECT ai.*, pr.nome, pr.tipo, pr.tempo_execucao
      FROM agendamentos_itens ai
      JOIN produtos pr ON ai.produto_id = pr.id
      WHERE ai.agendamento_id = ? AND ai.tenant_id = ?
    `, [id, tenant_id]) as any[];

    res.json({ ...rows[0], items });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

router.post("/", authMiddleware, planMiddleware('agenda'), async (req: any, res) => {
  const { tenant_id } = req.user;
  const { usuario_id, pessoa_id, data_inicio, data_fim, valor_total, status, observacao, items } = req.body;

  if (req.user.perfil !== 'admin' && !req.user.permissoes?.agenda?.criar) {
    return res.status(403).json({ error: "Seu usuário não possui permissão para criar agendamentos." });
  }

  const canViewOthers = req.user.perfil === 'admin' || (req.user.permissoes?.agenda?.ver_outros === true);
  if (!canViewOthers && Number(usuario_id) !== Number(req.user.id)) {
    return res.status(403).json({ error: "Seu usuário não possui permissão para criar agendamentos para outros profissionais." });
  }

  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();

    if (items && items.length > 0) {
      let totalServicoMinutos = 0;
      for (const item of items) {
        const [prod] = await connection.query("SELECT tipo, tempo_execucao FROM produtos WHERE id = ?", [item.produto_id]) as any[];
        if (prod[0]?.tipo === 'servico') {
          totalServicoMinutos += (prod[0].tempo_execucao || 0);
        }
      }

      if (totalServicoMinutos > 0) {
        const diffMs = new Date(data_fim).getTime() - new Date(data_inicio).getTime();
        const diffMinutos = diffMs / 60000;
        if (diffMinutos < totalServicoMinutos) {
          throw new Error(`O tempo selecionado (${Math.round(diffMinutos)}min) é inferior ao tempo mínimo dos serviços (${totalServicoMinutos}min).`);
        }
      }
    }

    const [resAg] = await connection.query(`
      INSERT INTO agendamentos (tenant_id, usuario_id, pessoa_id, data_inicio, data_fim, valor_total, observacao, status)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `, [tenant_id, usuario_id, pessoa_id || null, data_inicio, data_fim, valor_total || 0, observacao || null, status || 'Agendado']) as any[];

    const agendaId = resAg.insertId;

    if (items && items.length > 0) {
      for (const item of items) {
        await connection.query(`
          INSERT INTO agendamentos_itens (tenant_id, agendamento_id, produto_id, quantidade, preco_unitario, subtotal)
          VALUES (?, ?, ?, ?, ?, ?)
        `, [tenant_id, agendaId, item.produto_id, item.quantidade || 1, item.preco_unitario, item.subtotal]);
      }
    }

    await connection.commit();
    
    try {
      const [emp] = await pool.query("SELECT whatsapp_automatico, email_automatico FROM empresas WHERE tenant_id = ?", [tenant_id]) as any[];

      if (emp[0]?.whatsapp_automatico) {
        const [ag] = await pool.query("SELECT data_inicio FROM agendamentos WHERE id = ?", [agendaId]) as any[];
        if (ag[0]) {
          const scheduledDate = new Date(new Date(ag[0].data_inicio).getTime() - 2 * 60 * 60 * 1000);
          await processNotification(tenant_id, agendaId, 'whatsapp', 'lembrete', scheduledDate, true);
        }
      }
      if (emp[0]?.email_automatico) {
        const [ag] = await pool.query("SELECT data_inicio FROM agendamentos WHERE id = ?", [agendaId]) as any[];
        if (ag[0]) {
          const scheduledDate = new Date(new Date(ag[0].data_inicio).getTime() - 2 * 60 * 60 * 1000);
          await processNotification(tenant_id, agendaId, 'email', 'lembrete', scheduledDate, true);
        }
      }
    } catch (e) {
      console.error("Auto-notify on create error:", e);
    }

    res.json({ success: true, id: agendaId });
  } catch (err: any) {
    await connection.rollback();
    res.status(500).json({ error: err.message });
  } finally {
    connection.release();
  }
});

router.put("/:id", authMiddleware, planMiddleware('agenda'), async (req: any, res) => {
  const { id } = req.params;
  const { tenant_id } = req.user;
  const { usuario_id, pessoa_id, data_inicio, data_fim, valor_total, status, observacao, items } = req.body;

  const isCancelling = status === 'Cancelado';
  if (req.user.perfil !== 'admin') {
    if (isCancelling) {
      if (!req.user.permissoes?.agenda?.cancelar) {
        return res.status(403).json({ error: "Seu usuário não possui permissão para cancelar agendamentos." });
      }
    } else {
      if (!req.user.permissoes?.agenda?.criar) {
        return res.status(403).json({ error: "Seu usuário não possui permissão para editar/criar agendamentos." });
      }
    }
  }

  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();

    const [existing] = await connection.query("SELECT * FROM agendamentos WHERE id = ? AND tenant_id = ?", [id, tenant_id]) as any[];
    const appointment = existing?.[0];

    const canViewOthers = req.user.perfil === 'admin' || (req.user.permissoes?.agenda?.ver_outros === true);
    if (!canViewOthers) {
      if (appointment && Number(appointment.usuario_id) !== Number(req.user.id)) {
        throw new Error("Seu usuário não possui permissão para alterar agendamentos de outros profissionais.");
      }
      if (usuario_id !== undefined && Number(usuario_id) !== Number(req.user.id)) {
        throw new Error("Seu usuário não possui permissão para delegar agendamentos para outros profissionais.");
      }
    }

    if (appointment && status === 'Cancelado' && appointment.status !== 'Cancelado') {
      // If there's an associated sale, check its status
      if (appointment.venda_id) {
        const [vendas] = await connection.query("SELECT status FROM vendas WHERE id = ? AND tenant_id = ?", [appointment.venda_id, tenant_id]) as any[];
        const venda = vendas?.[0];
        
        if (venda) {
          if (venda.status === 'orcamento') {
            // Cancel the budget sale
            await connection.query("UPDATE vendas SET status = 'cancelada' WHERE id = ? AND tenant_id = ?", [appointment.venda_id, tenant_id]);
          } else if (venda.status !== 'cancelada') {
            // If it's finalized or something else, block cancellation
            throw new Error("Não é possível cancelar o agendamento pois existe um Pedido de Venda finalizado associado. Cancele o Pedido de Venda primeiro.");
          }
        }
      }
      
      // Remove pending notifications
      await connection.query("DELETE FROM notificacoes WHERE agenda_id = ? AND tenant_id = ? AND status = 'pendente'", [id, tenant_id]);
    }

    // Original update query
    await connection.query(`
      UPDATE agendamentos 
      SET usuario_id = ?, pessoa_id = ?, data_inicio = ?, data_fim = ?, valor_total = ?, status = ?, observacao = ?, updated_at = CURRENT_TIMESTAMP
      WHERE id = ? AND tenant_id = ?
    `, [
      usuario_id !== undefined ? usuario_id : (appointment?.usuario_id),
      pessoa_id !== undefined ? (pessoa_id || null) : (appointment?.pessoa_id),
      data_inicio || (appointment?.data_inicio),
      data_fim || (appointment?.data_fim),
      valor_total !== undefined ? valor_total : (appointment?.valor_total),
      status || (appointment?.status),
      observacao !== undefined ? (observacao || null) : (appointment?.observacao),
      id, 
      tenant_id
    ]);

    if (items) {
      await connection.query("DELETE FROM agendamentos_itens WHERE agendamento_id = ? AND tenant_id = ?", [id, tenant_id]);
      for (const item of items) {
        await connection.query(`
          INSERT INTO agendamentos_itens (tenant_id, agendamento_id, produto_id, quantidade, preco_unitario, subtotal)
          VALUES (?, ?, ?, ?, ?, ?)
        `, [tenant_id, id, item.produto_id, item.quantidade || 1, item.preco_unitario, item.subtotal]);
      }
    }

    await connection.commit();

    if (status === 'Agendado') {
      try {
        const [emp] = await pool.query("SELECT whatsapp_automatico, email_automatico FROM empresas WHERE tenant_id = ?", [tenant_id]) as any[];

        if (emp[0]?.whatsapp_automatico) {
          const [ag] = await pool.query("SELECT data_inicio FROM agendamentos WHERE id = ?", [id]) as any[];
          if (ag[0]) {
            const scheduledDate = new Date(new Date(ag[0].data_inicio).getTime() - 2 * 60 * 60 * 1000);
            await processNotification(tenant_id, parseInt(id), 'whatsapp', 'lembrete', scheduledDate, true);
          }
        }
        if (emp[0]?.email_automatico) {
          const [ag] = await pool.query("SELECT data_inicio FROM agendamentos WHERE id = ?", [id]) as any[];
          if (ag[0]) {
            const scheduledDate = new Date(new Date(ag[0].data_inicio).getTime() - 2 * 60 * 60 * 1000);
            await processNotification(tenant_id, parseInt(id), 'email', 'lembrete', scheduledDate, true);
          }
        }
      } catch (e) {
        console.error("Auto-notify on update error:", e);
      }
    }

    res.json({ success: true });
  } catch (err: any) {
    await connection.rollback();
    res.status(500).json({ error: err.message });
  } finally {
    connection.release();
  }
});

router.delete("/:id", authMiddleware, planMiddleware('agenda'), async (req: any, res) => {
  const { id } = req.params;
  const { tenant_id } = req.user;

  if (req.user.perfil !== 'admin' && !req.user.permissoes?.agenda?.cancelar) {
    return res.status(403).json({ error: "Seu usuário não possui permissão para cancelar/excluir agendamentos." });
  }

  const canViewOthers = req.user.perfil === 'admin' || (req.user.permissoes?.agenda?.ver_outros === true);
  if (!canViewOthers) {
    const [existing] = await pool.query("SELECT usuario_id FROM agendamentos WHERE id = ? AND tenant_id = ?", [id, tenant_id]) as any[];
    if (existing[0] && Number(existing[0].usuario_id) !== Number(req.user.id)) {
      return res.status(403).json({ error: "Seu usuário não possui permissão para excluir agendamentos de outros profissionais." });
    }
  }

  try {
    await pool.query("DELETE FROM agendamentos WHERE id = ? AND tenant_id = ?", [id, tenant_id]);
    res.json({ success: true });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

router.post("/:id/concluir", authMiddleware, planMiddleware('agenda'), async (req: any, res) => {
  const { id } = req.params;
  const { tenant_id, id: authUserId } = req.user;

  const canViewOthers = req.user.perfil === 'admin' || (req.user.permissoes?.agenda?.ver_outros === true);
  if (!canViewOthers) {
    const [existing] = await pool.query("SELECT usuario_id FROM agendamentos WHERE id = ? AND tenant_id = ?", [id, tenant_id]) as any[];
    if (existing[0] && Number(existing[0].usuario_id) !== Number(req.user.id)) {
      return res.status(403).json({ error: "Seu usuário não possui permissão para concluir agendamentos de outros profissionais." });
    }
  }

  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();

    const [ags] = await connection.query("SELECT * FROM agendamentos WHERE id = ? AND tenant_id = ?", [id, tenant_id]) as any[];
    const agenda = ags[0];
    if (!agenda) throw new Error("Agendamento não encontrado");
    if (agenda.venda_id) throw new Error("Este agendamento já foi convertido em venda");

    const [items] = await connection.query("SELECT * FROM agendamentos_itens WHERE agendamento_id = ?", [id]) as any[];

    // Create Sale
    const [maxSequencialRow] = await connection.query("SELECT MAX(sequencial_id) as max_id FROM vendas WHERE tenant_id = ?", [tenant_id]) as any[];
    const nextSequencial = (maxSequencialRow[0]?.max_id || 0) + 1;

    const [resVenda] = await connection.query(`
      INSERT INTO vendas (tenant_id, sequencial_id, pessoa_id, usuario_id, atendente_id, valor_total, status, origem, tipo)
      VALUES (?, ?, ?, ?, ?, ?, 'orcamento', 'Agenda', 'venda')
    `, [tenant_id, nextSequencial, agenda.pessoa_id, authUserId, agenda.usuario_id || null, agenda.valor_total]) as any[];

    const vendaId = resVenda.insertId;

    for (const item of items) {
      await connection.query(`
        INSERT INTO vendas_itens (tenant_id, venda_id, produto_id, quantidade, preco_unitario, subtotal, profissional_id)
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `, [tenant_id, vendaId, item.produto_id, item.quantidade, item.preco_unitario, item.subtotal, agenda.usuario_id || null]);
    }

    // Update appointment
    await connection.query("UPDATE agendamentos SET status = 'Concluido', venda_id = ? WHERE id = ?", [vendaId, id]);

    await connection.commit();
    res.json({ success: true, sequencial_id: nextSequencial });
  } catch (err: any) {
    await connection.rollback();
    res.status(500).json({ error: err.message });
  } finally {
    connection.release();
  }
});

router.post("/:id/notify/:type", authMiddleware, async (req: any, res) => {
  const { id, type } = req.params;
  const { tenant_id } = req.user;
  try {
    const result = await processNotification(tenant_id, parseInt(id), type as any, 'confirmacao');
    res.json(result);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
