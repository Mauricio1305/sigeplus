import { Router } from "express";
import { pool } from "../db";
import { authMiddleware, planMiddleware } from "../middleware";
import { transporter, getStripe } from "../utils";
import bcrypt from "bcryptjs";

const router = Router();

// --- GROUPS ---

router.get("/settings/groups", authMiddleware, async (req: any, res) => {
  const { tenant_id } = req.user;
  try {
    const [groups] = await pool.query("SELECT * FROM grupos_usuarios WHERE tenant_id = ?", [tenant_id]) as any[];
    const parsedGroups = groups.map((g: any) => ({
      ...g,
      permissoes: typeof g.permissoes === 'string' ? JSON.parse(g.permissoes) : (g.permissoes || {})
    }));
    res.json(parsedGroups);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

router.post("/settings/groups", authMiddleware, async (req: any, res) => {
  const { tenant_id } = req.user;
  const { nome, permissoes } = req.body;
  try {
    const [result] = await pool.query(
      "INSERT INTO grupos_usuarios (tenant_id, nome, permissoes) VALUES (?, ?, ?)",
      [tenant_id, nome, JSON.stringify(permissoes)]
    ) as any[];
    res.json({ id: result.insertId, nome, permissoes, is_master: 0 });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

router.put("/settings/groups/:id", authMiddleware, async (req: any, res) => {
  const { tenant_id } = req.user;
  const groupId = req.params.id;
  const { nome, permissoes } = req.body;

  try {
    const [group] = await pool.query("SELECT is_master FROM grupos_usuarios WHERE id = ? AND tenant_id = ?", [groupId, tenant_id]) as any[];
    if (!group[0]) return res.status(404).json({ error: "Grupo não encontrado" });
    if (group[0].is_master) return res.status(400).json({ error: "Grupo Master não pode ser alterado" });

    await pool.query(
      "UPDATE grupos_usuarios SET nome = ?, permissoes = ? WHERE id = ? AND tenant_id = ?",
      [nome, JSON.stringify(permissoes), groupId, tenant_id]
    );
    res.json({ success: true });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

router.delete("/settings/groups/:id", authMiddleware, async (req: any, res) => {
  const { tenant_id } = req.user;
  const groupId = req.params.id;
  try {
    const [group] = await pool.query("SELECT is_master FROM grupos_usuarios WHERE id = ? AND tenant_id = ?", [groupId, tenant_id]) as any[];
    if (!group[0]) return res.status(404).json({ error: "Grupo não encontrado" });
    if (group[0].is_master) return res.status(400).json({ error: "Grupo Master não pode ser excluído" });

    const [users] = await pool.query("SELECT COUNT(*) as count FROM usuarios WHERE grupo_id = ?", [groupId]) as any[];
    if (users[0].count > 0) return res.status(400).json({ error: "Não é possível excluir um grupo que possui usuários vinculados." });

    await pool.query("DELETE FROM grupos_usuarios WHERE id = ? AND tenant_id = ?", [groupId, tenant_id]);
    res.json({ success: true });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// --- USERS ---

router.get("/settings/users", authMiddleware, planMiddleware('configuracoes'), async (req: any, res) => {
  const { tenant_id } = req.user;
  try {
    const [users] = await pool.query(`
      SELECT u.id, u.nome, u.email, u.ativo, u.perfil, u.grupo_id, g.nome as grupo_nome 
      FROM usuarios u 
      LEFT JOIN grupos_usuarios g ON u.grupo_id = g.id 
      WHERE u.tenant_id = ?
    `, [tenant_id]);
    res.json(users);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

router.get("/users", authMiddleware, async (req: any, res) => {
  const { tenant_id } = req.user;
  try {
    const [users] = await pool.query("SELECT id, nome, email, perfil, avatar, ativo FROM usuarios WHERE tenant_id = ? AND ativo = 1", [tenant_id]) as any[];
    res.json(users);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

router.post("/settings/users", authMiddleware, async (req: any, res) => {
  const { tenant_id } = req.user;
  const { nome, email, grupo_id } = req.body;
  
  try {
    const [empresa] = await pool.query(`
      SELECT p.limite_usuarios 
      FROM empresas e 
      JOIN planos p ON e.plano_id = p.id 
      WHERE e.tenant_id = ?
    `, [tenant_id]) as any[];
    
    const limit = empresa[0]?.limite_usuarios || 1;
    const [userCount] = await pool.query("SELECT COUNT(*) as count FROM usuarios WHERE tenant_id = ?", [tenant_id]) as any[];
    
    if (userCount[0].count >= limit) {
      return res.status(400).json({ error: `Seu plano atual permite até ${limit} usuários.` });
    }
    
    const [exist] = await pool.query("SELECT id FROM usuarios WHERE email = ?", [email]) as any[];
    if (exist.length > 0) return res.status(400).json({ error: "E-mail já está em uso." });
    
    const [group] = await pool.query("SELECT id FROM grupos_usuarios WHERE id = ? AND tenant_id = ?", [grupo_id, tenant_id]) as any[];
    if (group.length === 0) return res.status(400).json({ error: "Grupo inválido." });

    const hashedPassword = await bcrypt.hash("TempPassword123!", 10);
    const [result] = await pool.query(
      "INSERT INTO usuarios (tenant_id, nome, email, senha, grupo_id, perfil) VALUES (?, ?, ?, ?, ?, 'usuario')",
      [tenant_id, nome, email, hashedPassword, grupo_id]
    ) as any[];

    if (transporter) {
      try {
        await transporter.sendMail({
          from: process.env.SMTP_FROM,
          to: email,
          subject: "Bem-vindo ao Sistema! Crie sua senha.",
          text: `Olá ${nome}, Você foi cadastrado no sistema. Acesse a tela de login e utilize a opção "Esqueci minha senha" para criar sua senha de acesso.`,
          html: `<p>Olá <strong>${nome}</strong>,</p><p>Você foi cadastrado no sistema. Acesse a tela de login e utilize a opção <strong>Esqueci minha senha</strong> para criar sua senha de acesso.</p>`,
        });
      } catch(e) { console.error('Error sending welcome email to new user', e); }
    }

    res.json({ id: result.insertId, nome, email, grupo_id, ativo: 1 });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

router.put("/settings/users/:id", authMiddleware, async (req: any, res) => {
  const { tenant_id } = req.user;
  const userId = req.params.id;
  const { nome, grupo_id, ativo } = req.body;

  try {
    const [userRow] = await pool.query("SELECT perfil FROM usuarios WHERE id = ? AND tenant_id = ?", [userId, tenant_id]) as any[];
    if (userRow.length === 0) return res.status(404).json({ error: "Usuário não encontrado" });
    if (userRow[0].perfil === 'superadmin') return res.status(400).json({ error: "Não é permitido alterar este usuário." });

    await pool.query(
      "UPDATE usuarios SET nome = ?, grupo_id = ?, ativo = ? WHERE id = ? AND tenant_id = ?",
      [nome, grupo_id, ativo, userId, tenant_id]
    );

    res.json({ success: true });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// --- COMPANY SETTINGS ---

router.get("/company/settings", authMiddleware, planMiddleware('configuracoes'), async (req: any, res) => {
  try {
    const { tenant_id } = req.user;
    let [companies] = await pool.query(`
      SELECT e.*, p.nome as plano_nome 
      FROM empresas e 
      LEFT JOIN planos p ON e.plano_id = p.id 
      WHERE e.tenant_id = ?
    `, [tenant_id]) as any[];

    if (!companies || (Array.isArray(companies) && companies.length === 0)) {
      const [allPlans] = await pool.query("SELECT id FROM planos ORDER BY id ASC LIMIT 1") as any[];
      const defaultPlanId = allPlans[0]?.id || 1;
      
      try {
        await pool.query(
          "INSERT INTO empresas (tenant_id, nome_fantasia, email, status_assinatura, plano_id) VALUES (?, ?, ?, ?, ?)",
          [tenant_id, 'Minha Empresa', req.user.email || 'contato@empresa.com', 'ativo', defaultPlanId]
        );
      } catch (insertErr: any) {
        console.error(`Failed to repair company record for tenant: ${tenant_id}:`, insertErr.message);
      }
      
      const [refetched] = await pool.query(`
        SELECT e.*, p.nome as plano_nome 
        FROM empresas e 
        LEFT JOIN planos p ON e.plano_id = p.id 
        WHERE e.tenant_id = ?
      `, [tenant_id]) as any[];
      companies = refetched;
    }

    if (!companies || companies.length === 0) {
      return res.status(404).json({ error: "Empresa não encontrada" });
    }
    res.json(companies[0]);
  } catch (err: any) {
    console.error("Error fetching company settings:", err);
    res.status(500).json({ error: err.message });
  }
});

router.put("/company/settings", authMiddleware, async (req: any, res) => {
  const { tenant_id } = req.user;
  const { 
    nome_fantasia, razao_social, cnpj, email, whatsapp,
    telefone_fixo, telefone_celular, endereco, 
    numero, cep, cidade, estado, logo,
    whatsapp_api_url, whatsapp_api_key, whatsapp_instance, whatsapp_msg_agendamento,
    email_host, email_port, email_user, email_pass, email_from, email_msg_agendamento,
    whatsapp_automatico, email_automatico
  } = req.body;

  try {
    await pool.query(`
      UPDATE empresas 
      SET nome_fantasia = ?, razao_social = ?, cnpj = ?, email = ?, whatsapp = ?, 
          telefone_fixo = ?, telefone_celular = ?, endereco = ?, 
          numero = ?, cep = ?, cidade = ?, estado = ?, logo = ?,
          whatsapp_api_url = ?, whatsapp_api_key = ?, whatsapp_instance = ?, whatsapp_msg_agendamento = ?,
          email_host = ?, email_port = ?, email_user = ?, email_pass = ?, email_from = ?, email_msg_agendamento = ?,
          whatsapp_automatico = ?, email_automatico = ?,
          updated_at = CURRENT_TIMESTAMP 
      WHERE tenant_id = ?
    `, [
      nome_fantasia, razao_social, cnpj, email, whatsapp, 
      telefone_fixo, telefone_celular, endereco, 
      numero, cep, cidade, estado, logo,
      whatsapp_api_url, whatsapp_api_key, whatsapp_instance, whatsapp_msg_agendamento,
      email_host, email_port, email_user, email_pass, email_from, email_msg_agendamento,
      whatsapp_automatico ? 1 : 0, email_automatico ? 1 : 0,
      tenant_id
    ]);
    res.json({ success: true });
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});

// --- TESTS ---

router.post("/whatsapp/test", authMiddleware, async (req: any, res) => {
  const { number, url, key, instance, message } = req.body;
  if (!number || !url || !key || !instance) {
    return res.status(400).json({ error: "Todos os campos são obrigatórios para o teste." });
  }
  try {
    let phone = number.replace(/\D/g, '');
    if ((phone.length === 10 || phone.length === 11) && !phone.startsWith('55')) phone = '55' + phone;
    const msg = message || `Teste de conexão WhatsApp - ${new Date().toLocaleString('pt-BR')}`;
    let cleanUrl = url.trim();
    if (!cleanUrl.startsWith('http')) cleanUrl = 'https://' + cleanUrl;
    if (cleanUrl.endsWith('/')) cleanUrl = cleanUrl.slice(0, -1);
    const pathsToRemove = ['/message/sendText', '/message/sendMedia', '/instance/view', '/instance/list', '/instance/connect', '/group/create'];
    for (const p of pathsToRemove) { if (cleanUrl.includes(p)) cleanUrl = cleanUrl.split(p)[0]; }
    if (cleanUrl.endsWith(`/${instance}`)) cleanUrl = cleanUrl.slice(0, -(instance.length + 1));
    const fullUrl = `${cleanUrl}/message/sendText/${encodeURIComponent(instance)}`;
    const response = await fetch(fullUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'apikey': key },
      body: JSON.stringify({ number: phone, text: msg })
    });
    let data;
    try { data = await response.json(); } catch (e) { data = { message: "Servidor não retornou um JSON válido." }; }
    if (!response.ok) throw new Error(`Erro ${response.status}: ${data.message || data.error || "Erro na API"}`);
    res.json({ success: true, data });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

router.post("/email/test", authMiddleware, async (req: any, res) => {
  const { host, port, user, pass, from, to, message } = req.body;
  if (!host || !user || !pass || !to) return res.status(400).json({ error: "Campos obrigatórios faltando." });
  try {
    const nodemailer = require('nodemailer');
    const customTransporter = nodemailer.createTransport({
      host, port: parseInt(port || '587'), secure: parseInt(port) === 465,
      auth: { user, pass }
    });
    const emailMsg = message || `Teste de e-mail enviado em ${new Date().toLocaleString('pt-BR')}`;
    const info = await customTransporter.sendMail({
      from: from || user, to, subject: "Teste de Configuração", text: emailMsg,
      html: emailMsg.includes('<') ? emailMsg : `<p>${emailMsg.replace(/\n/g, '<br>')}</p>`
    });
    res.json({ success: true, info });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// --- SUPERADMIN / ADMIN ROUTES ---

router.get("/admin/companies", authMiddleware, async (req: any, res) => {
  if (req.user.perfil !== 'superadmin') return res.status(403).json({ error: "Forbidden" });
  const [companies] = await pool.query(`
    SELECT e.*, p.nome as plano_nome 
    FROM empresas e 
    LEFT JOIN planos p ON e.plano_id = p.id
  `);
  res.json(companies);
});

router.get("/admin/companies/:id/stripe-status", authMiddleware, async (req: any, res) => {
  if (req.user.perfil !== 'superadmin') return res.status(403).json({ error: "Forbidden" });
  const { id } = req.params;
  
  try {
    const [companies] = await pool.query("SELECT stripe_customer_id, stripe_subscription_id FROM empresas WHERE id = ?", [id]) as any[];
    const company = companies[0];

    if (!company) return res.status(404).json({ error: "Empresa não encontrada" });
    if (!company.stripe_customer_id && !company.stripe_subscription_id) {
       return res.status(400).json({ error: "Empresa não possui ID do Stripe vinculado" });
    }

    const stripe = getStripe();
    let subscription;

    try {
      if (company.stripe_customer_id && company.stripe_customer_id !== 'null') {
        const activeSubs = await stripe.subscriptions.list({ customer: company.stripe_customer_id, limit: 1, status: 'active' });
        if (activeSubs.data.length > 0) {
          subscription = activeSubs.data[0];
        } else {
          const allSubs = await stripe.subscriptions.list({ customer: company.stripe_customer_id, limit: 1, status: 'all' });
          subscription = allSubs.data[0];
        }
      } else if (company.stripe_subscription_id && company.stripe_subscription_id !== 'null') {
        subscription = await stripe.subscriptions.retrieve(company.stripe_subscription_id);
      }
    } catch (err: any) {
      if (err.type === 'StripeInvalidRequestError' && (err.message.includes('No such customer') || err.message.includes('No such subscription'))) {
         return res.status(404).json({ error: "Cliente ou assinatura não encontrado no Stripe." });
      }
      throw err;
    }

    if (!subscription) return res.status(404).json({ error: "Nenhuma assinatura encontrada no Stripe" });

    const subObj = subscription as any;
    let status = subObj.status === 'active' ? 'ativo' : 'suspenso';
    if (subObj.cancel_at_period_end) status = 'Cancelamento Solicitado';
    if (subObj.status === 'canceled') status = 'cancelado';

    let vencimento = '';
    if (subObj.current_period_end) {
      vencimento = new Date(subObj.current_period_end * 1000).toISOString().split('T')[0];
    } else {
      const fallbackDate = new Date();
      fallbackDate.setDate(fallbackDate.getDate() + 30);
      vencimento = fallbackDate.toISOString().split('T')[0];
    }

    await pool.query(
      "UPDATE empresas SET status_assinatura = ?, vencimento_assinatura = ?, stripe_customer_id = ?, stripe_subscription_id = ? WHERE id = ?",
      [status, vencimento, subscription.customer as string, subscription.id, id]
    );

    res.json({
      status_assinatura: status,
      vencimento_assinatura: vencimento,
      stripe_subscription_id: subscription.id,
      stripe_customer_id: subscription.customer as string
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

router.put("/admin/companies/:id", authMiddleware, async (req: any, res) => {
  if (req.user.perfil !== 'superadmin') return res.status(403).json({ error: "Forbidden" });
  const { id } = req.params;
  const { status_assinatura, vencimento_assinatura, stripe_customer_id } = req.body;
  try {
    await pool.query(
      "UPDATE empresas SET status_assinatura = ?, vencimento_assinatura = ?, stripe_customer_id = ? WHERE id = ?", 
      [status_assinatura, vencimento_assinatura, stripe_customer_id || null, id]
    );
    res.json({ success: true });
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});

router.post("/admin/plans", authMiddleware, async (req: any, res) => {
  if (req.user.perfil !== 'superadmin') return res.status(403).json({ error: "Forbidden" });
  const { nome, valor_mensal, limite_usuarios, stripe_price_id, modulos, is_trial, trial_days } = req.body;
  try {
    await pool.query("INSERT INTO planos (nome, valor_mensal, limite_usuarios, stripe_price_id, modulos, is_trial, trial_days) VALUES (?, ?, ?, ?, ?, ?, ?)", 
      [nome, valor_mensal, limite_usuarios, stripe_price_id, JSON.stringify(modulos || []), is_trial ? 1 : 0, trial_days || null]);
    res.json({ success: true });
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});

router.put("/admin/plans/:id", authMiddleware, async (req: any, res) => {
  if (req.user.perfil !== 'superadmin') return res.status(403).json({ error: "Forbidden" });
  const { id } = req.params;
  const { nome, valor_mensal, limite_usuarios, stripe_price_id, modulos, is_trial, trial_days } = req.body;
  await pool.query("UPDATE planos SET nome = ?, valor_mensal = ?, limite_usuarios = ?, stripe_price_id = ?, modulos = ?, is_trial = ?, trial_days = ? WHERE id = ?", 
    [nome, valor_mensal, limite_usuarios, stripe_price_id, JSON.stringify(modulos || []), is_trial ? 1 : 0, trial_days || null, id]);
  res.json({ success: true });
});

export default router;
