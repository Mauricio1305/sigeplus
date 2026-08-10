import { Router } from "express";
import { pool } from "../db";
import { authMiddleware, planMiddleware } from "../middleware";
import { processNotification } from "../services/notificationService";

const router = Router();

// Auto-migration: ensure is_encaixe column exists
pool.query("ALTER TABLE agendamentos ADD COLUMN IF NOT EXISTS is_encaixe BOOLEAN DEFAULT false;").catch(err => {
  console.error("Migration is_encaixe error:", err);
});

// Helper to shift overlapping appointments when an encaixe is placed
async function shiftOverlappingAppointmentsForEncaixe(
  connection: any,
  tenant_id: number,
  usuario_id: number,
  encaixeId: number,
  encaixeStartStr: string,
  encaixeEndStr: string
) {
  const formatDbTimestamp = (d: Date) => {
    const pad = (n: number) => n.toString().padStart(2, '0');
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
  };

  let currentStart = new Date(encaixeStartStr);
  let currentEnd = new Date(encaixeEndStr);

  if (isNaN(currentStart.getTime()) || isNaN(currentEnd.getTime())) {
    return;
  }

  const shiftedIds = new Set<number>([encaixeId]);

  let maxIterations = 20;
  while (maxIterations > 0) {
    maxIterations--;

    // We search for non-cancelled appointments for this professional where:
    // data_inicio >= currentStart AND data_inicio < currentEnd
    const [overlapping] = await connection.query(`
      SELECT id, data_inicio, data_fim 
      FROM agendamentos 
      WHERE tenant_id = ? 
        AND usuario_id = ? 
        AND (status IS NULL OR status != 'Cancelado') 
        AND data_inicio >= ? 
        AND data_inicio < ?
      ORDER BY data_inicio ASC
    `, [
      tenant_id, 
      usuario_id, 
      formatDbTimestamp(currentStart), 
      formatDbTimestamp(currentEnd)
    ]) as any[];

    if (!overlapping || overlapping.length === 0) {
      break;
    }

    const unshifted = overlapping.filter((a: any) => !shiftedIds.has(a.id));
    if (unshifted.length === 0) {
      break;
    }

    let nextWindowStart: Date | null = null;
    let nextWindowEnd: Date | null = null;

    for (const appt of unshifted) {
      shiftedIds.add(appt.id);

      const origStart = new Date(appt.data_inicio);
      const origEnd = new Date(appt.data_fim);
      const durationMs = origEnd.getTime() - origStart.getTime();

      // Desloca APENAS o horário inicial do agendamento seguinte para o término do encaixe
      const newStart = new Date(currentEnd);
      let newEnd = origEnd;

      // Se o novo início for >= término original, ajusta o término mantendo a duração
      if (newStart >= origEnd) {
        newEnd = new Date(newStart.getTime() + (durationMs > 0 ? durationMs : 15 * 60000));
      }

      await connection.query(`
        UPDATE agendamentos 
        SET data_inicio = ?, data_fim = ?, updated_at = CURRENT_TIMESTAMP
        WHERE id = ? AND tenant_id = ?
      `, [
        formatDbTimestamp(newStart), 
        formatDbTimestamp(newEnd), 
        appt.id, 
        tenant_id
      ]);

      if (!nextWindowStart || newStart < nextWindowStart) {
        nextWindowStart = newStart;
      }
      if (!nextWindowEnd || newEnd > nextWindowEnd) {
        nextWindowEnd = newEnd;
      }
    }

    if (nextWindowStart && nextWindowEnd && (nextWindowEnd.getTime() > currentEnd.getTime())) {
      currentStart = nextWindowStart;
      currentEnd = nextWindowEnd;
    } else {
      break;
    }
  }
}

// ==============================================================================
// AGENDA & AGENDAMENTOS
// ==============================================================================

router.get("/", authMiddleware, planMiddleware('agenda'), async (req: any, res) => {
  const { tenant_id } = req.user;
  const { start, end, userId, usuario_id, pessoa_id, includeCanceled } = req.query;

  try {
    const canViewOthers = req.user.perfil === 'admin' || (req.user.permissoes?.agenda?.ver_outros === true);

    let sql = `
      SELECT 
        a.*, 
        COALESCE(
          NULLIF(a.valor_total, 0), 
          (SELECT SUM(ai.subtotal) FROM agendamentos_itens ai WHERE ai.agendamento_id = a.id), 
          0
        ) as valor_total,
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

    if (pessoa_id) {
      sql += " AND a.pessoa_id = ?";
      params.push(pessoa_id);
    }

    const targetUser = userId || usuario_id;
    if (!canViewOthers) {
      sql += " AND a.usuario_id = ?";
      params.push(req.user.id);
    } else if (targetUser) {
      sql += " AND a.usuario_id = ?";
      params.push(targetUser);
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

    let calculatedValorTotal = parseFloat(rows[0].valor_total) || 0;
    if (items && items.length > 0) {
      const itemsSum = items.reduce((acc: number, it: any) => acc + (parseFloat(it.subtotal) || 0), 0);
      if (itemsSum > 0) {
        calculatedValorTotal = itemsSum;
      }
    }

    res.json({ ...rows[0], valor_total: calculatedValorTotal, items });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

router.post("/", authMiddleware, planMiddleware('agenda'), async (req: any, res) => {
  const { tenant_id } = req.user;
  const { usuario_id, pessoa_id, data_inicio, data_fim, valor_total, status, observacao, is_encaixe, items } = req.body;

  if (req.user.perfil !== 'admin' && !req.user.permissoes?.agenda?.criar) {
    return res.status(403).json({ error: "Seu usuário não possui permissão para criar agendamentos." });
  }

  const canViewOthers = req.user.perfil === 'admin' || (req.user.permissoes?.agenda?.ver_outros === true);
  if (!canViewOthers && Number(usuario_id) !== Number(req.user.id)) {
    return res.status(403).json({ error: "Seu usuário não possui permissão para criar agendamentos para outros profissionais." });
  }

  const isEncaixe = Boolean(is_encaixe);

  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();

    // Prevent rapid duplicate appointment insertion
    const targetPessoa = pessoa_id ? parseInt(pessoa_id) : null;
    const [existingDup] = await connection.query(`
      SELECT id FROM agendamentos 
      WHERE tenant_id = ? 
        AND usuario_id = ? 
        AND (pessoa_id IS NOT DISTINCT FROM ?) 
        AND data_inicio = ? 
        AND data_fim = ?
        AND created_at >= CURRENT_TIMESTAMP - INTERVAL '15 seconds'
      LIMIT 1
    `, [tenant_id, usuario_id, targetPessoa, data_inicio, data_fim]) as any[];

    if (existingDup && existingDup.length > 0) {
      await connection.commit();
      return res.json({ success: true, id: existingDup[0].id, duplicatePrevented: true });
    }

    if (!isEncaixe && items && items.length > 0) {
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
          throw new Error(`O tempo selecionado (${Math.round(diffMinutos)}min) é inferior ao tempo mínimo dos serviços (${totalServicoMinutos}min). Para horários reduzidos ou sobrepostos, marque como Agendamento de Encaixe.`);
        }
      }
    }

    let totalCalc = parseFloat(valor_total);
    if (isNaN(totalCalc) || totalCalc === 0) {
      if (items && items.length > 0) {
        totalCalc = items.reduce((acc: number, item: any) => {
          const qtd = parseFloat(item.quantidade) || 1;
          const price = parseFloat(item.preco_unitario) || 0;
          return acc + (parseFloat(item.subtotal) || (qtd * price));
        }, 0);
      } else {
        totalCalc = 0;
      }
    }
    const [resAg] = await connection.query(`
      INSERT INTO agendamentos (tenant_id, usuario_id, pessoa_id, data_inicio, data_fim, valor_total, observacao, status, is_encaixe)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `, [tenant_id, usuario_id, pessoa_id || null, data_inicio, data_fim, totalCalc, observacao || null, status || 'Agendado', isEncaixe]) as any[];

    const agendaId = resAg.insertId;

    if (items && items.length > 0) {
      for (const item of items) {
        const qtd = parseFloat(item.quantidade) || 1;
        const price = parseFloat(item.preco_unitario) || 0;
        const sub = parseFloat(item.subtotal) || (qtd * price);
        await connection.query(`
          INSERT INTO agendamentos_itens (tenant_id, agendamento_id, produto_id, quantidade, preco_unitario, subtotal)
          VALUES (?, ?, ?, ?, ?, ?)
        `, [tenant_id, agendaId, item.produto_id, qtd, price, sub]);
      }
    }

    if (isEncaixe) {
      await shiftOverlappingAppointmentsForEncaixe(connection, tenant_id, usuario_id, agendaId, data_inicio, data_fim);
    }

    await connection.commit();
    
    // Process notifications asynchronously in background
    setTimeout(async () => {
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
    }, 10);

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
  const { usuario_id, pessoa_id, data_inicio, data_fim, valor_total, status, observacao, is_encaixe, items } = req.body;

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

    let totalCalc = valor_total !== undefined ? parseFloat(valor_total) : undefined;
    if (items && items.length > 0) {
      const itemsSum = items.reduce((acc: number, item: any) => {
        const qtd = parseFloat(item.quantidade) || 1;
        const price = parseFloat(item.preco_unitario) || 0;
        return acc + (parseFloat(item.subtotal) || (qtd * price));
      }, 0);
      if (totalCalc === undefined || totalCalc === 0) {
        totalCalc = itemsSum;
      }
    } else if (totalCalc === undefined) {
      totalCalc = parseFloat(appointment?.valor_total) || 0;
    }
    // Original update query
    await connection.query(`
      UPDATE agendamentos 
      SET usuario_id = ?, pessoa_id = ?, data_inicio = ?, data_fim = ?, valor_total = ?, status = ?, observacao = ?, is_encaixe = ?, updated_at = CURRENT_TIMESTAMP
      WHERE id = ? AND tenant_id = ?
    `, [
      usuario_id !== undefined ? usuario_id : (appointment?.usuario_id),
      pessoa_id !== undefined ? (pessoa_id || null) : (appointment?.pessoa_id),
      data_inicio || (appointment?.data_inicio),
      data_fim || (appointment?.data_fim),
      totalCalc,
      status || (appointment?.status),
      observacao !== undefined ? (observacao || null) : (appointment?.observacao),
      is_encaixe !== undefined ? Boolean(is_encaixe) : (appointment?.is_encaixe || false),
      id, 
      tenant_id
    ]);

    if (items) {
      await connection.query("DELETE FROM agendamentos_itens WHERE agendamento_id = ? AND tenant_id = ?", [id, tenant_id]);
      for (const item of items) {
        const qtd = parseFloat(item.quantidade) || 1;
        const price = parseFloat(item.preco_unitario) || 0;
        const sub = parseFloat(item.subtotal) || (qtd * price);
        await connection.query(`
          INSERT INTO agendamentos_itens (tenant_id, agendamento_id, produto_id, quantidade, preco_unitario, subtotal)
          VALUES (?, ?, ?, ?, ?, ?)
        `, [tenant_id, id, item.produto_id, qtd, price, sub]);
      }
    }

    const effStart = data_inicio || (appointment?.data_inicio);
    const effEnd = data_fim || (appointment?.data_fim);
    const effUserId = usuario_id !== undefined ? usuario_id : (appointment?.usuario_id);
    const effIsEncaixe = is_encaixe !== undefined ? Boolean(is_encaixe) : Boolean(appointment?.is_encaixe);

    if (effIsEncaixe && effStart && effEnd) {
      await shiftOverlappingAppointmentsForEncaixe(connection, tenant_id, Number(effUserId), Number(id), effStart, effEnd);
    }

    await connection.commit();

    if (status === 'Agendado') {
      setTimeout(async () => {
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
      }, 10);
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
    await pool.query("DELETE FROM notificacoes WHERE agenda_id = ? AND tenant_id = ?", [id, tenant_id]);
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

    let totalVenda = parseFloat(agenda.valor_total) || 0;
    if (items && items.length > 0) {
      const itemsSum = items.reduce((acc: number, item: any) => {
        const qtd = parseFloat(item.quantidade) || 1;
        const price = parseFloat(item.preco_unitario) || 0;
        return acc + (parseFloat(item.subtotal) || (qtd * price));
      }, 0);
      if (itemsSum > 0) {
        totalVenda = itemsSum;
      }
    }

    // Create Sale
    const [maxSequencialRow] = await connection.query("SELECT MAX(sequencial_id) as max_id FROM vendas WHERE tenant_id = ?", [tenant_id]) as any[];
    const nextSequencial = (maxSequencialRow[0]?.max_id || 0) + 1;

    const [resVenda] = await connection.query(`
      INSERT INTO vendas (tenant_id, sequencial_id, pessoa_id, usuario_id, atendente_id, valor_total, status, origem, tipo)
      VALUES (?, ?, ?, ?, ?, ?, 'orcamento', 'Agenda', 'venda')
    `, [tenant_id, nextSequencial, agenda.pessoa_id, authUserId, agenda.usuario_id || null, totalVenda]) as any[];

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
