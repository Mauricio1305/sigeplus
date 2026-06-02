import nodemailer from "nodemailer";
import { pool } from "../db";

export async function processNotification(tenant_id: any, agenda_id: number, type: 'whatsapp' | 'email', contexto: 'confirmacao' | 'lembrete' = 'confirmacao', scheduledDate?: Date, enqueueOnly: boolean = false) {
  let logId: number | null = null;
  try {
    // Check if already sent for this specific context to avoid duplicates
    const [exists] = await pool.query(`
      SELECT id FROM notificacoes 
      WHERE tenant_id = ? AND agenda_id = ? AND tipo = ? AND contexto = ? AND status = 'enviado'
      AND created_at > (CURRENT_TIMESTAMP - INTERVAL '24 hours')
    `, [tenant_id, agenda_id, type, contexto]) as any[];
    
    if (exists.length > 0) return { success: true, message: 'Já enviado recentemente para este contexto' };
    
    // Find if there's a pending log to reuse
    const [pending] = await pool.query(`
      SELECT id FROM notificacoes 
      WHERE tenant_id = ? AND agenda_id = ? AND tipo = ? AND contexto = ? AND status = 'pendente'
      LIMIT 1
    `, [tenant_id, agenda_id, type, contexto]) as any[];

    // 1. Get company settings and appointment details
    const [companies] = await pool.query(`
      SELECT p.modulos, e.* 
      FROM empresas e 
      LEFT JOIN planos p ON e.plano_id = p.id 
      WHERE e.tenant_id = ?
    `, [tenant_id]) as any[];
    const company = companies[0];
    if (!company) throw new Error("Empresa não encontrada");
    
    let modulos = company?.modulos || [];
    if (typeof modulos === 'string') {
      try { modulos = JSON.parse(modulos); } catch(e) { modulos = []; }
    }

    // Bypass check for 'system' tenant
    const isSpecialTenant = tenant_id === 'system';
    
    if (!isSpecialTenant) {
      if (type === 'email' && !modulos.includes('lembrete_email')) throw new Error("Plano não inclui lembretes por e-mail.");
      if (type === 'whatsapp' && !modulos.includes('lembrete_whatsapp')) throw new Error("Plano não inclui lembretes por WhatsApp.");
    }

    const [ags] = await pool.query(`
      SELECT a.*, p.nome as cliente_nome, p.telefone as cliente_telefone, p.email as cliente_email, u.nome as profissional_nome
      FROM agendamentos a
      LEFT JOIN pessoas p ON a.pessoa_id = p.id
      JOIN usuarios u ON a.usuario_id = u.id
      WHERE a.id = ? AND a.tenant_id = ?
    `, [agenda_id, tenant_id]) as any[];
    const agenda = ags[0];
    if (!agenda) throw new Error("Agendamento não encontrado");

    const dataFormatada = new Date(agenda.data_inicio).toLocaleString('pt-BR');
    let msg = "";
    
    if (contexto === 'confirmacao') {
      msg = `Olá ${agenda.cliente_nome}, confirmamos seu agendamento com ${agenda.profissional_nome} no dia ${dataFormatada}.`;
    } else {
      msg = `Olá ${agenda.cliente_nome}, lembrete do seu agendamento hoje às ${new Date(agenda.data_inicio).toLocaleTimeString('pt-BR', {hour:'2-digit', minute:'2-digit'})}.`;
    }
    
    if (type === 'whatsapp' && company.whatsapp_msg_agendamento) {
      msg = company.whatsapp_msg_agendamento
        .replace(/{nome_cliente}/g, agenda.cliente_nome)
        .replace(/{data_agendamento}/g, dataFormatada);
    } else if (type === 'email' && company.email_msg_agendamento) {
      msg = company.email_msg_agendamento
        .replace(/{nome_cliente}/g, agenda.cliente_nome)
        .replace(/{data_agendamento}/g, dataFormatada);
    }

    let destino = '';

    // Record initial pending log or update existing one
    if (pending.length > 0) {
      logId = pending[0].id;
      await pool.query("UPDATE notificacoes SET mensagem = ?, data_prevista = ?, created_at = CURRENT_TIMESTAMP WHERE id = ?", [msg, scheduledDate || null, logId]);
    } else {
      const [logResult] = await pool.query(`
        INSERT INTO notificacoes (tenant_id, agenda_id, tipo, status, mensagem, contexto, data_prevista)
        VALUES (?, ?, ?, 'pendente', ?, ?, ?)
      `, [tenant_id, agenda_id, type, msg, contexto, scheduledDate || null]) as any[];
      logId = logResult.insertId;
    }

    // If it's for future or enqueueOnly is true, stop here
    const now = new Date();
    if (enqueueOnly || (scheduledDate && scheduledDate > now)) {
      return { success: true, scheduled: !!scheduledDate, enqueued: enqueueOnly };
    }

    if (type === 'email') {
      if (!agenda.cliente_email) {
        await pool.query("UPDATE notificacoes SET status = 'erro', erro_log = 'Cliente sem e-mail' WHERE id = ?", [logId]);
        throw new Error("Cliente não possui e-mail cadastrado.");
      }
      destino = agenda.cliente_email;
      
      const smtpHost = company.email_host || process.env.SMTP_HOST || process.env.EMAIL_HOST;
      const smtpPort = parseInt(company.email_port || process.env.SMTP_PORT || process.env.EMAIL_PORT || '587');
      const smtpUser = company.email_user || process.env.SMTP_USER || process.env.EMAIL_USER;
      const smtpPass = company.email_pass || process.env.SMTP_PASS || process.env.EMAIL_PASS;
      const smtpFrom = company.email_from || smtpUser || process.env.EMAIL_FROM;

      if (!smtpHost || !smtpUser || !smtpPass) {
        await pool.query("UPDATE notificacoes SET status = 'erro', erro_log = 'Config SMTP ausente' WHERE id = ?", [logId]);
        throw new Error("Configurações de e-mail (SMTP) não encontradas.");
      }

      const companyTransporter = nodemailer.createTransport({
        host: smtpHost,
        port: smtpPort,
        secure: smtpPort === 465,
        auth: {
          user: smtpUser,
          pass: smtpPass,
        },
      });

      let emailMsg = msg;
      if (company.email_msg_agendamento) {
        emailMsg = company.email_msg_agendamento
          .replace(/{nome_cliente}/g, agenda.cliente_nome)
          .replace(/{data_agendamento}/g, dataFormatada);
      }

      await companyTransporter.sendMail({
        from: `"${company.nome_fantasia}" <${smtpFrom}>`,
        to: agenda.cliente_email,
        subject: `Confirmação de Agendamento - ${company.nome_fantasia}`,
        text: emailMsg,
        html: `<div style="font-family: sans-serif; padding: 20px; color: #333;">${emailMsg.replace(/\\n/g, '<br>')}</div>`
      });

      await pool.query("UPDATE notificacoes SET status = 'enviado', destino = ?, enviado_at = CURRENT_TIMESTAMP WHERE id = ?", [destino, logId]);
      
    } else if (type === 'whatsapp') {
      if (!agenda.cliente_telefone) {
        await pool.query("UPDATE notificacoes SET status = 'erro', erro_log = 'Cliente sem telefone' WHERE id = ?", [logId]);
        throw new Error("Cliente não possui WhatsApp cadastrado.");
      }
      destino = agenda.cliente_telefone;
      if (!company.whatsapp_api_url || !company.whatsapp_api_key) {
        await pool.query("UPDATE notificacoes SET status = 'erro', erro_log = 'Config Evolution ausente' WHERE id = ?", [logId]);
        throw new Error("Configurações da API WhatsApp não encontradas.");
      }
      
      let phone = agenda.cliente_telefone.replace(/\D/g, '');
      if ((phone.length === 10 || phone.length === 11) && !phone.startsWith('55')) {
        phone = '55' + phone;
      }
      
      let cleanUrl = company.whatsapp_api_url.trim();
      if (!cleanUrl.startsWith('http')) cleanUrl = 'https://' + cleanUrl;
      cleanUrl = cleanUrl.replace(/\/$/, "");
      
      const pathsToRemove = ['/message/sendText', '/message/sendMedia', '/instance/view', '/instance/list', '/instance/connect', '/group/create'];
      for (const p of pathsToRemove) {
        if (cleanUrl.includes(p)) cleanUrl = cleanUrl.split(p)[0];
      }
      if (cleanUrl.endsWith(`/${company.whatsapp_instance}`)) {
        cleanUrl = cleanUrl.slice(0, -(company.whatsapp_instance.length + 1));
      }
 
      const response = await fetch(`${cleanUrl}/message/sendText/${encodeURIComponent(company.whatsapp_instance)}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'apikey': company.whatsapp_api_key
        },
        body: JSON.stringify({
          number: phone,
          text: msg
        })
      });

      if (!response.ok) {
        let errorData;
        try { errorData = await response.json(); } catch (e) { errorData = { message: response.statusText }; }
        const errMsg = `Erro na Evolution API (${response.status}): ${errorData.message || errorData.error || response.statusText}`;
        await pool.query("UPDATE notificacoes SET status = 'erro', erro_log = ? WHERE id = ?", [errMsg, logId]);
        throw new Error(errMsg);
      }

      await pool.query("UPDATE notificacoes SET status = 'enviado', destino = ?, enviado_at = CURRENT_TIMESTAMP WHERE id = ?", [destino, logId]);
    }
    
    return { success: true };
  } catch (err: any) {
    console.error("processNotification error:", err);
    if (logId) {
      await pool.query("UPDATE notificacoes SET status = 'erro', erro_log = ?, tentativas = tentativas + 1 WHERE id = ?", [err.message, logId]);
    }
    throw err;
  }
}
