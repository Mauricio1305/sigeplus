import { Router } from "express";
import { pool } from "../db";
import { authMiddleware } from "../middleware";
import { getStripe } from "../utils";
import Stripe from "stripe";

const router = Router();

// --- PLANS ---
router.get("/plans", async (req, res) => {
  try {
    const [plans] = await pool.query("SELECT * FROM planos ORDER BY valor_mensal ASC") as any[];
    const parsedPlans = (plans as any[]).map(p => ({
      ...p,
      modulos: typeof p.modulos === 'string' ? JSON.parse(p.modulos) : (p.modulos || [])
    }));
    res.json(parsedPlans);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// --- STRIPE SESSION ROUTES ---

router.post("/stripe/create-checkout-session", authMiddleware, async (req: any, res) => {
  const { planoId } = req.body;
  const { tenant_id, id } = req.user;

  try {
    const stripe = getStripe();
    const [plans] = await pool.query("SELECT stripe_price_id FROM planos WHERE id = ?", [planoId]) as any[];
    const priceId = plans[0]?.stripe_price_id;

    if (!priceId) return res.status(400).json({ error: "ID do plano inválido ou não configurado no Stripe." });
    
    const [users] = await pool.query("SELECT email FROM usuarios WHERE id = ?", [id]) as any[];
    const userEmail = users[0]?.email;

    const [companies] = await pool.query("SELECT stripe_customer_id FROM empresas WHERE tenant_id = ?", [tenant_id]) as any[];
    let customerId = companies[0]?.stripe_customer_id;
    
    if (!customerId) {
      const customer = await stripe.customers.create({ email: userEmail, metadata: { tenant_id } });
      customerId = customer.id;
      await pool.query("UPDATE empresas SET stripe_customer_id = ? WHERE tenant_id = ?", [customerId, tenant_id]);
    }

    const session = await stripe.checkout.sessions.create({
      customer: customerId,
      payment_method_types: ['card'],
      line_items: [{ price: priceId, quantity: 1 }],
      mode: 'subscription',
      success_url: `${process.env.APP_URL || 'http://localhost:3000'}/stripe/success?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${process.env.APP_URL || 'http://localhost:3000'}/subscription?canceled=true`,
      client_reference_id: tenant_id,
    });

    res.json({ url: session.url });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

router.post("/stripe/create-portal-session", authMiddleware, async (req: any, res) => {
  const { tenant_id } = req.user;
  try {
    const stripe = getStripe();
    const [companies] = await pool.query("SELECT stripe_customer_id FROM empresas WHERE tenant_id = ?", [tenant_id]) as any[];
    const customerId = companies[0]?.stripe_customer_id;

    if (!customerId) return res.status(400).json({ error: "Nenhum cliente Stripe encontrado." });

    const session = await stripe.billingPortal.sessions.create({
      customer: customerId,
      return_url: `${process.env.APP_URL || 'http://localhost:3000'}/stripe-portal-return`,
    });
    res.json({ url: session.url });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

router.post("/stripe/verify-session", async (req: any, res) => {
  const { sessionId } = req.body;
  try {
    const stripe = getStripe();
    const session = await stripe.checkout.sessions.retrieve(sessionId);

    if (session.payment_status === 'paid') {
      const customerId = session.customer as string;
      const subscriptionId = session.subscription as string;
      let tenant_id = session.client_reference_id;

      let vencimento = new Date();
      vencimento.setDate(vencimento.getDate() + 30);
      let priceId = '';
      
      if (subscriptionId) {
        const subscription = await stripe.subscriptions.retrieve(subscriptionId) as any;
        priceId = subscription.items.data[0].price.id;
        if (subscription.current_period_end) vencimento = new Date(subscription.current_period_end * 1000);
      }

      const [plans] = await pool.query("SELECT id FROM planos WHERE stripe_price_id = ?", [priceId]) as any[];
      let plano_id = plans[0]?.id || 1;

      if (tenant_id) {
        await pool.query(
          "UPDATE empresas SET stripe_customer_id = ?, stripe_subscription_id = ?, stripe_price_id = ?, plano_id = ?, status_assinatura = 'ativo', vencimento_assinatura = ? WHERE tenant_id = ?",
          [customerId, subscriptionId, priceId, plano_id, vencimento, tenant_id]
        );
        res.json({ success: true, message: "Assinatura verificada e ativada!" });
      } else {
        res.status(400).json({ error: "Tenant não identificado." });
      }
    } else {
      res.status(400).json({ error: "Pagamento não confirmado." });
    }
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// --- ADMIN / CRON ---

router.post("/admin/cron/process-notifications", async (req: any, res) => {
  const authHeader = req.headers['x-cron-auth'];
  if (process.env.CRON_SECRET && authHeader !== process.env.CRON_SECRET) {
    return res.status(401).json({ error: "Unauthorized" });
  }

  let processed = 0;
  try {
    const { processNotification } = await import("../services/notificationService");
    
    // 1. Create missing reminder records (Scheduled 2h before)
    const [empresas] = await pool.query(`
      SELECT tenant_id, whatsapp_automatico, email_automatico
      FROM empresas 
      WHERE (whatsapp_automatico = 1 OR email_automatico = 1)
    `) as any[];

    for (const emp of empresas) {
      const [agendamentos] = await pool.query(`
        SELECT a.id, a.data_inicio
        FROM agendamentos a
        LEFT JOIN notificacoes n ON a.id = n.agenda_id AND n.contexto = 'lembrete'
        WHERE a.tenant_id = ? 
        AND a.status = 'Agendado'
        AND a.data_inicio >= CURRENT_TIMESTAMP
        AND a.data_inicio <= (CURRENT_TIMESTAMP + INTERVAL '150 minutes')
        AND n.id IS NULL
      `, [emp.tenant_id]) as any[];

      for (const ag of agendamentos) {
        const scheduledDate = new Date(new Date(ag.data_inicio).getTime() - 2 * 60 * 60 * 1000);
        if (emp.whatsapp_automatico) {
          await processNotification(emp.tenant_id, ag.id, 'whatsapp', 'lembrete', scheduledDate, true);
        }
        if (emp.email_automatico) {
          await processNotification(emp.tenant_id, ag.id, 'email', 'lembrete', scheduledDate, true);
        }
      }
    }

    // 2. Process all pending notifications that are due
    const [pendingLogs] = await pool.query(`
      SELECT n.id, n.tenant_id, n.agenda_id, n.tipo, n.contexto
      FROM notificacoes n
      WHERE n.status = 'pendente'
      AND (n.data_prevista IS NULL OR n.data_prevista <= (CURRENT_TIMESTAMP + INTERVAL '1 minute'))
      LIMIT 100
    `) as any[];

    for (const log of pendingLogs) {
      try {
        await processNotification(log.tenant_id, log.agenda_id, log.tipo, log.contexto);
        processed++;
      } catch (e) {}
    }

    await pool.query("INSERT INTO cron_logs (status, processed_count) VALUES (?, ?)", ['sucesso', processed]);
    res.json({ success: true, processed });
  } catch (err: any) {
    console.error("Cron error:", err);
    await pool.query("INSERT INTO cron_logs (status, processed_count, error_message) VALUES (?, ?, ?)", ['erro', processed, err.message]);
    res.status(500).json({ error: err.message });
  }
});

router.get("/admin/cron/logs", authMiddleware, async (req: any, res) => {
  if (req.user.perfil !== 'superadmin') return res.status(403).json({ error: "Forbidden" });
  try {
    const [logs] = await pool.query("SELECT * FROM cron_logs ORDER BY created_at DESC LIMIT 50");
    res.json(logs);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
