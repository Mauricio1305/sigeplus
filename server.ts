import express from "express";
import { createServer as createViteServer } from "vite";
import cors from "cors";
import jwt from "jsonwebtoken";
import bcrypt from "bcryptjs";
import mysql from "mysql2/promise";
import nodemailer from "nodemailer";
import fs from "fs";
import path from "path";
import { fileURLToPath } from 'url';
import dotenv from "dotenv";
import Stripe from 'stripe';
import helmet from "helmet";
import rateLimit from "express-rate-limit";

dotenv.config();

let stripeClient: Stripe | null = null;
const getStripe = () => {
  if (!stripeClient) {
    const key = process.env.STRIPE_SECRET_KEY;
    if (!key) {
      throw new Error('STRIPE_SECRET_KEY environment variable is required');
    }
    stripeClient = new Stripe(key);
  }
  return stripeClient;
};

const requiredEnvVars = ['DB_HOST', 'DB_USER', 'DB_PASS', 'DB_NAME'];
const missingEnvVars = requiredEnvVars.filter(varName => !process.env[varName]);

if (missingEnvVars.length > 0) {
  console.error(`ERROR: Missing required environment variables in .env: ${missingEnvVars.join(', ')}`);
  console.error('Please check your .env file and ensure all database configuration is present.');
  // We don't exit here to allow the app to start, but it will fail on DB connection
}

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const pool = mysql.createPool({
  host: process.env.DB_HOST,
  user: process.env.DB_USER,
  password: process.env.DB_PASS,
  database: process.env.DB_NAME,
  port: parseInt(process.env.DB_PORT || "3306"),
  multipleStatements: true,
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0
});

const JWT_SECRET = process.env.JWT_SECRET || "saas-secret-key-123";

const transporter = nodemailer.createTransport({
  host: process.env.SMTP_HOST,
  port: parseInt(process.env.SMTP_PORT || "587"),
  secure: process.env.SMTP_SECURE === "S",
  auth: process.env.SMTP_AUTH === "S" ? {
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASS,
  } : undefined,
  tls: {
    rejectUnauthorized: false
  }
});

// Initialize DB
async function initDB() {
  try {
    // Test connection
    await pool.query("SELECT 1");
    console.log("Database connection successful.");

    const schemaPath = path.join(process.cwd(), "schema.sql");
    if (fs.existsSync(schemaPath)) {
      const schema = fs.readFileSync(schemaPath, "utf8");
      await pool.query(schema);
      console.log("Database initialized with schema.sql");
    } else {
      console.error("schema.sql not found at", schemaPath);
    }

    // Migrations for existing tables
    try {
      // Check if 'clientes' exists and rename to 'pessoas'
      const [tables] = await pool.query("SHOW TABLES LIKE 'clientes'");
      if ((tables as any[]).length > 0) {
        await pool.query("RENAME TABLE clientes TO pessoas");
        console.log("Renamed clientes to pessoas");
      }

      const [vendasColumns] = await pool.query("SHOW COLUMNS FROM vendas") as any[];
      const vendasColNames = (vendasColumns as any[]).map((c: any) => c.Field);
      
      if (!vendasColNames.includes('solicitacao')) {
        await pool.query("ALTER TABLE vendas ADD COLUMN solicitacao TEXT");
      }
      if (!vendasColNames.includes('laudo_tecnico')) {
        await pool.query("ALTER TABLE vendas ADD COLUMN laudo_tecnico TEXT");
      }
      if (!vendasColNames.includes('sequencial_id')) {
        await pool.query("ALTER TABLE vendas ADD COLUMN sequencial_id INTEGER");
      }
      if (!vendasColNames.includes('origem')) {
        await pool.query("ALTER TABLE vendas ADD COLUMN origem VARCHAR(50) DEFAULT 'Balcao'");
      }

      const [empresasColumns] = await pool.query("SHOW COLUMNS FROM empresas") as any[];
      const empresasColNames = (empresasColumns as any[]).map((c: any) => c.Field);
      
      if (!empresasColNames.includes('plano_id')) {
        await pool.query("ALTER TABLE empresas ADD COLUMN plano_id INTEGER");
      }
      if (!empresasColNames.includes('status_assinatura')) {
        await pool.query("ALTER TABLE empresas ADD COLUMN status_assinatura VARCHAR(50) DEFAULT 'ativo'");
      }
      if (!empresasColNames.includes('vencimento_assinatura')) {
        await pool.query("ALTER TABLE empresas ADD COLUMN vencimento_assinatura DATETIME");
      }
      if (!empresasColNames.includes('stripe_customer_id')) {
        await pool.query("ALTER TABLE empresas ADD COLUMN stripe_customer_id VARCHAR(255)");
      }
      if (!empresasColNames.includes('stripe_subscription_id')) {
        await pool.query("ALTER TABLE empresas ADD COLUMN stripe_subscription_id VARCHAR(255)");
      }

      // Migration: Populate sequencial_id for existing sales
      const [salesWithoutSequencial] = await pool.query("SELECT id, tenant_id FROM vendas WHERE sequencial_id IS NULL") as any[];
      if ((salesWithoutSequencial as any[]).length > 0) {
        console.log(`Populating sequencial_id for ${(salesWithoutSequencial as any[]).length} sales...`);
        for (const sale of (salesWithoutSequencial as any[])) {
          const [maxSequencialRow] = await pool.query("SELECT MAX(sequencial_id) as max_id FROM vendas WHERE tenant_id = ?", [sale.tenant_id]) as any[];
          const nextSequencial = (maxSequencialRow[0]?.max_id || 0) + 1;
          await pool.query("UPDATE vendas SET sequencial_id = ? WHERE id = ?", [nextSequencial, sale.id]);
        }
      }

      const [osColumns] = await pool.query("SHOW COLUMNS FROM ordens_servico") as any[];
      const osColNames = (osColumns as any[]).map((c: any) => c.Field);
      if (!osColNames.includes('sequencial_id')) {
        await pool.query("ALTER TABLE ordens_servico ADD COLUMN sequencial_id INTEGER");
      }

      // Migration: Populate sequencial_id for existing OS
      const [osWithoutSequencial] = await pool.query("SELECT id, tenant_id FROM ordens_servico WHERE sequencial_id IS NULL") as any[];
      if ((osWithoutSequencial as any[]).length > 0) {
        console.log(`Populating sequencial_id for ${(osWithoutSequencial as any[]).length} OS...`);
        for (const os of (osWithoutSequencial as any[])) {
          const [maxSequencialRow] = await pool.query("SELECT MAX(sequencial_id) as max_id FROM ordens_servico WHERE tenant_id = ?", [os.tenant_id]) as any[];
          const nextSequencial = (maxSequencialRow[0]?.max_id || 0) + 1;
          await pool.query("UPDATE ordens_servico SET sequencial_id = ? WHERE id = ?", [nextSequencial, os.id]);
        }
      }

      const tableList = ['empresas', 'pessoas', 'tipos_pagamento', 'lancamentos', 'vendas', 'vendas_itens', 'ordens_servico', 'produtos', 'movimentacoes_caixa', 'categorias_contas', 'usuarios'];
      for (const table of tableList) {
        const [info] = await pool.query(`SHOW COLUMNS FROM ${table}`) as any[];
        const columns = (info as any[]).map((c: any) => c.Field);
        
        if (table === 'usuarios') {
          if (!columns.includes('avatar')) {
            await pool.query("ALTER TABLE usuarios ADD COLUMN avatar LONGTEXT AFTER senha");
            console.log("Added avatar column to usuarios table");
          }
        }
        if (table === 'vendas') {
          if (!columns.includes('identificacao')) await pool.query("ALTER TABLE vendas ADD COLUMN identificacao VARCHAR(100)");
          if (!columns.includes('taxa_servico')) await pool.query("ALTER TABLE vendas ADD COLUMN taxa_servico DECIMAL(10,2) DEFAULT 0");
        }
        if (table === 'movimentacoes_caixa') {
          if (!columns.includes('venda_id')) await pool.query(`ALTER TABLE ${table} ADD COLUMN venda_id INTEGER`);
          if (!columns.includes('tipo_pagamento_id')) await pool.query(`ALTER TABLE ${table} ADD COLUMN tipo_pagamento_id INTEGER`);
          if (!columns.includes('origem')) await pool.query(`ALTER TABLE ${table} ADD COLUMN origem VARCHAR(50) DEFAULT 'Venda'`);
          if (!columns.includes('categoria_id')) await pool.query(`ALTER TABLE ${table} ADD COLUMN categoria_id INTEGER`);
        }
        if (table === 'empresas') {
          if (!columns.includes('telefone_fixo')) await pool.query("ALTER TABLE empresas ADD COLUMN telefone_fixo VARCHAR(20)");
          if (!columns.includes('telefone_celular')) await pool.query("ALTER TABLE empresas ADD COLUMN telefone_celular VARCHAR(20)");
          if (!columns.includes('endereco')) await pool.query("ALTER TABLE empresas ADD COLUMN endereco TEXT");
          if (!columns.includes('numero')) await pool.query("ALTER TABLE empresas ADD COLUMN numero VARCHAR(20)");
          if (!columns.includes('cep')) await pool.query("ALTER TABLE empresas ADD COLUMN cep VARCHAR(20)");
          if (!columns.includes('cidade')) await pool.query("ALTER TABLE empresas ADD COLUMN cidade VARCHAR(255)");
          if (!columns.includes('estado')) await pool.query("ALTER TABLE empresas ADD COLUMN estado VARCHAR(2)");
          if (!columns.includes('stripe_customer_id')) await pool.query("ALTER TABLE empresas ADD COLUMN stripe_customer_id VARCHAR(255)");
          if (!columns.includes('stripe_subscription_id')) await pool.query("ALTER TABLE empresas ADD COLUMN stripe_subscription_id VARCHAR(255)");
          if (!columns.includes('stripe_price_id')) await pool.query("ALTER TABLE empresas ADD COLUMN stripe_price_id VARCHAR(255)");
        }
        if (table === 'pessoas') {
          if (!columns.includes('tipo_pessoa')) await pool.query("ALTER TABLE pessoas ADD COLUMN tipo_pessoa VARCHAR(50) DEFAULT 'cliente'");
          if (!columns.includes('ativo')) await pool.query("ALTER TABLE pessoas ADD COLUMN ativo BOOLEAN DEFAULT 1");
          if (!columns.includes('razao_social')) await pool.query("ALTER TABLE pessoas ADD COLUMN razao_social VARCHAR(255)");
          if (!columns.includes('nome_fantasia')) await pool.query("ALTER TABLE pessoas ADD COLUMN nome_fantasia VARCHAR(255)");
          if (!columns.includes('telefone_fixo')) await pool.query("ALTER TABLE pessoas ADD COLUMN telefone_fixo VARCHAR(20)");
          if (!columns.includes('telefone_celular')) await pool.query("ALTER TABLE pessoas ADD COLUMN telefone_celular VARCHAR(20)");
          if (!columns.includes('numero')) await pool.query("ALTER TABLE pessoas ADD COLUMN numero VARCHAR(20)");
          if (!columns.includes('cep')) await pool.query("ALTER TABLE pessoas ADD COLUMN cep VARCHAR(20)");
        }
        if (table === 'tipos_pagamento') {
          if (!columns.includes('prazo_dias')) await pool.query("ALTER TABLE tipos_pagamento ADD COLUMN prazo_dias INTEGER DEFAULT 0");
          if (!columns.includes('qtd_parcelas')) await pool.query("ALTER TABLE tipos_pagamento ADD COLUMN qtd_parcelas INTEGER DEFAULT 1");
          if (!columns.includes('local_lancamento')) await pool.query("ALTER TABLE tipos_pagamento ADD COLUMN local_lancamento VARCHAR(50) DEFAULT 'Caixa'");
          if (!columns.includes('ativo')) await pool.query("ALTER TABLE tipos_pagamento ADD COLUMN ativo BOOLEAN DEFAULT 1");
          if (!columns.includes('eh_cartao')) await pool.query("ALTER TABLE tipos_pagamento ADD COLUMN eh_cartao BOOLEAN DEFAULT 0");
          if (!columns.includes('tipo_cartao')) await pool.query("ALTER TABLE tipos_pagamento ADD COLUMN tipo_cartao VARCHAR(20)");
          if (!columns.includes('valor_min_parcela')) await pool.query("ALTER TABLE tipos_pagamento ADD COLUMN valor_min_parcela DECIMAL(10, 2) DEFAULT 0");
        }
        if (table === 'lancamentos') {
          if (columns.includes('cliente_id')) await pool.query("ALTER TABLE lancamentos CHANGE COLUMN cliente_id pessoa_id INTEGER");
          if (!columns.includes('categoria_id')) await pool.query(`ALTER TABLE ${table} ADD COLUMN categoria_id INTEGER`);
          if (!columns.includes('valor_pago')) await pool.query(`ALTER TABLE ${table} ADD COLUMN valor_pago DECIMAL(10, 2) DEFAULT 0`);
          if (!columns.includes('descricao')) await pool.query(`ALTER TABLE ${table} ADD COLUMN descricao TEXT`);
          if (!columns.includes('local')) await pool.query(`ALTER TABLE ${table} ADD COLUMN local VARCHAR(50) DEFAULT 'Caixa'`);
          if (!columns.includes('tipo_pagamento_id')) await pool.query(`ALTER TABLE ${table} ADD COLUMN tipo_pagamento_id INTEGER`);
          if (!columns.includes('tipo')) await pool.query(`ALTER TABLE ${table} ADD COLUMN tipo VARCHAR(2) DEFAULT 'CR'`);
        }
        if (table === 'vendas' || table === 'ordens_servico') {
          if (columns.includes('cliente_id')) await pool.query(`ALTER TABLE ${table} CHANGE COLUMN cliente_id pessoa_id INTEGER`);
        }
        if (table === 'produtos') {
          if (!columns.includes('estoque_minimo')) await pool.query("ALTER TABLE produtos ADD COLUMN estoque_minimo DECIMAL(10, 2) DEFAULT 0");
          if (!columns.includes('ativo')) await pool.query("ALTER TABLE produtos ADD COLUMN ativo BOOLEAN DEFAULT 1");
          if (!columns.includes('codigo_barras')) await pool.query("ALTER TABLE produtos ADD COLUMN codigo_barras VARCHAR(13)");
        }
        if (table === 'categorias_contas') {
          if (!columns.includes('ativo')) await pool.query("ALTER TABLE categorias_contas ADD COLUMN ativo BOOLEAN DEFAULT 1");
        }
      }

      // Create vendas_pagamentos table
      await pool.query(`
        CREATE TABLE IF NOT EXISTS vendas_pagamentos (
          id INTEGER PRIMARY KEY AUTO_INCREMENT,
          tenant_id VARCHAR(50) NOT NULL,
          venda_id INTEGER NOT NULL,
          tipo_pagamento_id INTEGER,
          nome VARCHAR(100),
          valor DECIMAL(10, 2) NOT NULL,
          parcelas INTEGER DEFAULT 1,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          FOREIGN KEY (venda_id) REFERENCES vendas(id)
        )
      `);

      // Seed Plans if not exists
      const [existingPlans] = await pool.query("SELECT COUNT(*) as count FROM planos") as any[];
      if (existingPlans[0].count === 0) {
        const plansToSeed = [
          ['Bronze', 49.90, 3, 'price_1T9qwJD69xPL9EMAIzuI14xh'],
          ['Prata', 99.90, 10, 'price_1T9qwJD69xPL9EMAIzuI14xi'],
          ['Ouro', 199.90, 9999, 'price_1T9qwJD69xPL9EMAIzuI14xj'],
          ['System', 0.00, 9999, 'price_system']
        ];
        for (const plan of plansToSeed) {
          await pool.query("INSERT INTO planos (nome, valor_mensal, limite_usuarios, stripe_price_id) VALUES (?, ?, ?, ?)", plan);
        }
        console.log("Seeded initial plans.");
      }
    } catch (e) {
      console.log("Migration error:", e);
    }

    // Cleanup planos
    try {
      await pool.query("DELETE FROM planos WHERE id NOT IN (SELECT id FROM (SELECT MIN(id) as id FROM planos GROUP BY nome) as x)");
    } catch (e) {
      console.log("Database cleanup error", e);
    }

    // Seed SuperAdmin and System Company
    const salt = bcrypt.genSaltSync(10);
    const hashedAdminPass = bcrypt.hashSync("admin123", salt);

    const [existingSystemCompany] = await pool.query("SELECT * FROM empresas WHERE tenant_id = 'system'") as any[];
    if ((existingSystemCompany as any[]).length === 0) {
      await pool.query("INSERT INTO empresas (tenant_id, nome_fantasia, email, plano_id) VALUES (?, ?, ?, ?)", ['system', 'Sige Plus', 'admin@saas.com', 4]);
    }

    const [existingAdmin] = await pool.query("SELECT * FROM usuarios WHERE email = 'admin@saas.com'") as any[];
    if ((existingAdmin as any[]).length === 0) {
      await pool.query("INSERT INTO usuarios (tenant_id, nome, email, senha, perfil) VALUES (?, ?, ?, ?, ?)", ['system', 'Super Admin', 'admin@saas.com', hashedAdminPass, 'superadmin']);
    } else {
      await pool.query("UPDATE usuarios SET senha = ? WHERE email = 'admin@saas.com'", [hashedAdminPass]);
    }

    console.log("Database initialization and migrations completed successfully.");
  } catch (err) {
    console.error("Database initialization error:", err);
  }
}

initDB();

process.on('unhandledRejection', (reason, promise) => {
  console.error('Unhandled Rejection at:', promise, 'reason:', reason);
  // Don't crash the server
});

const app = express();
app.set("trust proxy", 1);

app.use(helmet({
  contentSecurityPolicy: false,
  crossOriginEmbedderPolicy: false
}));
app.use(cors());

const globalLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 300, // Limit each IP to 300 requests per window
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => req.ip as string,
});

const authLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: 20, // Limit each IP to 20 auth attempts per hour
  message: { error: "Muitas tentativas dessa IP, favor tentar novamente após uma hora." },
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => req.ip as string,
});

app.use("/api/", globalLimiter);
app.use("/api/auth/", authLimiter);

// Stripe Webhook (must be before express.json())
app.post("/api/stripe/webhook", express.raw({ type: 'application/json' }), async (req, res) => {
  const sig = req.headers['stripe-signature'];
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;

  if (!sig || !webhookSecret) {
    return res.status(400).send('Webhook Error: Missing signature or secret');
  }

  let event;

  try {
    const stripe = getStripe();
    event = stripe.webhooks.constructEvent(req.body, sig, webhookSecret);
  } catch (err: any) {
    console.error(`Webhook Error: ${err.message}`);
    return res.status(400).send(`Webhook Error: ${err.message}`);
  }

  // Handle the event
  try {
    const stripe = getStripe();
    switch (event.type) {
      case 'checkout.session.completed': {
        try {
          const session = event.data.object as Stripe.Checkout.Session;
          let tenant_id = session.client_reference_id;
          const customerId = session.customer as string;
          const subscriptionId = session.subscription as string;

          if (!tenant_id && customerId) {
            const [companies] = await pool.query("SELECT tenant_id FROM empresas WHERE stripe_customer_id = ?", [customerId]) as any[];
            if (companies.length > 0) {
              tenant_id = companies[0].tenant_id;
            }
          }

          if (tenant_id) {
            const subscription = await stripe.subscriptions.retrieve(subscriptionId) as any;
            const priceId = subscription.items.data[0].price.id;

            // Map price ID to plan ID from database
            const [plans] = await pool.query("SELECT id FROM planos WHERE stripe_price_id = ?", [priceId]) as any[];
            let plano_id = plans[0]?.id || 1;

            if (plans.length === 0) {
              console.warn(`Webhook: Price ID "${priceId}" not found in database. Defaulting to plan 1.`);
            }

            const vencimento = new Date(subscription.current_period_end * 1000);

            await pool.query(
              "UPDATE empresas SET stripe_customer_id = ?, stripe_subscription_id = ?, stripe_price_id = ?, plano_id = ?, status_assinatura = 'ativo', vencimento_assinatura = ? WHERE tenant_id = ?",
              [customerId, subscriptionId, priceId, plano_id, vencimento, tenant_id]
            );
            console.log(`Webhook: Updated company ${tenant_id} to plan ${plano_id} with expiry ${vencimento}`);
          } else {
            console.warn("Webhook: checkout.session.completed missing client_reference_id (tenant_id)");
          }
        } catch (err: any) {
          console.error("Webhook Error in checkout.session.completed:", err.message);
        }
        break;
      }
      case 'invoice.payment_succeeded': {
        try {
          const invoice = event.data.object as any;
          if (invoice.subscription) {
            const subscriptionId = invoice.subscription as string;
            const subscription = await stripe.subscriptions.retrieve(subscriptionId) as any;
            const vencimento = new Date(subscription.current_period_end * 1000);
            
            await pool.query(
              "UPDATE empresas SET status_assinatura = 'ativo', vencimento_assinatura = ? WHERE stripe_subscription_id = ?",
              [vencimento, subscriptionId]
            );
            console.log(`Webhook: Payment succeeded for subscription ${subscriptionId}. Expiry updated to ${vencimento}`);
          }
        } catch (err: any) {
          console.error("Webhook Error in invoice.payment_succeeded:", err.message);
        }
        break;
      }
      case 'customer.subscription.updated':
      case 'customer.subscription.deleted': {
        try {
          const subscription = event.data.object as any;
          let status = subscription.status === 'active' ? 'ativo' : 'suspenso';
          
          if (subscription.cancel_at_period_end) {
            status = 'Cancelamento Solicitado';
          }

          const vencimento = new Date(subscription.current_period_end * 1000);

          if (subscription.status === 'canceled') {
            await pool.query(
              "UPDATE empresas SET status_assinatura = 'cancelado', stripe_subscription_id = NULL WHERE stripe_subscription_id = ?",
              [subscription.id]
            );
          } else {
            await pool.query(
              "UPDATE empresas SET status_assinatura = ?, vencimento_assinatura = ? WHERE stripe_subscription_id = ?",
              [status, vencimento, subscription.id]
            );
          }
        } catch (err: any) {
          console.error(`Webhook Error in ${event.type}:`, err.message);
        }
        break;
      }
    }
    res.json({ received: true });
  } catch (err: any) {
    console.error(`Error processing webhook: ${err.message}`);
    res.status(500).send('Internal Server Error');
  }
});

app.use(express.json());

// Middleware: Auth & Multi-tenant
const authMiddleware = (req: any, res: any, next: any) => {
  const token = req.headers.authorization?.split(" ")[1];
  if (!token) return res.status(401).json({ error: "No token provided" });

  try {
    const decoded = jwt.verify(token, JWT_SECRET) as any;
    req.user = decoded;
    next();
  } catch (err) {
    res.status(401).json({ error: "Invalid token" });
  }
};

// --- AUTH ROUTES ---

const sendWelcomeEmail = async (toEmail: string, userName: string, companyName: string) => {
  try {
    const mailOptions = {
      from: process.env.SMTP_FROM || `"Equipe de Sucesso" <${process.env.SMTP_USER}>`,
      to: toEmail,
      subject: `Bem-vindo à nossa plataforma, ${userName}!`,
      html: `
        <div style="font-family: 'Inter', sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; background-color: #f8fafc; border-radius: 12px; border: 1px solid #e2e8f0;">
          <div style="text-align: center; margin-bottom: 30px;">
            <h1 style="color: #4f46e5; margin: 0; font-size: 28px;">Bem-vindo(a)!</h1>
          </div>
          
          <div style="background-color: #ffffff; padding: 30px; border-radius: 8px; box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.1), 0 2px 4px -1px rgba(0, 0, 0, 0.06);">
            <h2 style="color: #1e293b; font-size: 20px; margin-top: 0;">Olá, ${userName}!</h2>
            
            <p style="color: #475569; font-size: 16px; line-height: 1.6;">
              Parabéns por dar este passo importante! Estamos muito felizes em ter a <strong>${companyName}</strong> conosco.
            </p>
            
            <p style="color: #475569; font-size: 16px; line-height: 1.6;">
              A partir de agora, a sua empresa está caminhando em direção ao sucesso. Nossa plataforma foi desenvolvida para oferecer as melhores ferramentas para impulsionar o seu negócio, com profissionalismo, segurança e confiabilidade.
            </p>
            
            <div style="text-align: center; margin: 40px 0;">
              <a href="${process.env.APP_URL || 'http://localhost:3000'}/login" style="background-color: #4f46e5; color: #ffffff; padding: 12px 24px; text-decoration: none; border-radius: 6px; font-weight: bold; font-size: 16px; display: inline-block;">
                Acessar minha conta
              </a>
            </div>
            
            <p style="color: #475569; font-size: 16px; line-height: 1.6;">
              Se precisar de qualquer ajuda durante a sua jornada, nossa equipe de suporte está sempre à disposição.
            </p>
            
            <p style="color: #475569; font-size: 16px; line-height: 1.6; margin-bottom: 0;">
              Um grande abraço,<br>
              <strong>Equipe de Sucesso</strong>
            </p>
          </div>
          
          <div style="text-align: center; margin-top: 20px; color: #94a3b8; font-size: 12px;">
            <p>Este é um e-mail automático, por favor não responda.</p>
          </div>
        </div>
      `
    };

    await transporter.sendMail(mailOptions);
    console.log(`Welcome email sent to ${toEmail}`);
  } catch (error) {
    console.error('Error sending welcome email:', error);
  }
};

app.post("/api/auth/register", async (req, res) => {
  const { companyName, email, password, name, plano_id } = req.body;
  const tenant_id = `tenant_${Date.now()}`;
  
  const connection = await pool.getConnection();
  try {
    const hashedPassword = await bcrypt.hash(password, 10);
    
    await connection.beginTransaction();
    
    // Set default expiration date to force payment
    const formattedExpirationDate = '1999-01-01';

    // Create Company
    if (!plano_id) {
      return res.status(400).json({ error: "Por favor, selecione um plano." });
    }

    await connection.query(
      "INSERT INTO empresas (tenant_id, nome_fantasia, email, plano_id, status_assinatura, vencimento_assinatura) VALUES (?, ?, ?, ?, ?, ?)",
      [tenant_id, companyName, email, plano_id, 'inativo', formattedExpirationDate]
    );
    
    // Create Admin User
    await connection.query(
      "INSERT INTO usuarios (tenant_id, nome, email, senha, perfil) VALUES (?, ?, ?, ?, ?)",
      [tenant_id, name, email, hashedPassword, 'admin']
    );

    await connection.commit();
    
    // Fetch the created user to return in response
    const [users] = await pool.query("SELECT * FROM usuarios WHERE email = ?", [email]) as any[];
    const user = users[0];

    const token = jwt.sign(
      { 
        id: user.id, 
        tenant_id: user.tenant_id, 
        perfil: user.perfil, 
        nome: user.nome,
        status_assinatura: 'inativo',
        vencimento_assinatura: formattedExpirationDate,
        plano_id: plano_id
      },
      JWT_SECRET,
      { expiresIn: "1d" }
    );

    // Send welcome email asynchronously (don't block the response)
    sendWelcomeEmail(email, name, companyName);
    
    res.json({ 
      success: true, 
      token,
      user: {
        id: user.id,
        nome: user.nome,
        email: user.email,
        perfil: user.perfil,
        tenant_id: user.tenant_id,
        status_assinatura: 'inativo',
        vencimento_assinatura: formattedExpirationDate,
        plano_id: plano_id
      }
    });
  } catch (err: any) {
    await connection.rollback();
    res.status(400).json({ error: err.message });
  } finally {
    connection.release();
  }
});

app.get("/api/plans", async (req, res) => {
  const [plans] = await pool.query("SELECT * FROM planos");
  res.json(plans);
});

app.post("/api/auth/login", async (req, res) => {
  const { email, password } = req.body;
  console.log(`Login attempt for: ${email}`);
  try {
    const [users] = await pool.query("SELECT * FROM usuarios WHERE email = ?", [email]) as any[];
    const user = users[0];

    if (!user) {
      console.log(`User not found: ${email}`);
      return res.status(401).json({ error: "Credenciais inválidas" });
    }

    const passwordMatch = await bcrypt.compare(password, user.senha);
    if (!passwordMatch) {
      console.log(`Invalid password for: ${email}`);
      return res.status(401).json({ error: "Credenciais inválidas" });
    }

    const [companies] = await pool.query("SELECT status_assinatura, vencimento_assinatura, plano_id FROM empresas WHERE tenant_id = ?", [user.tenant_id]) as any[];
    const company = companies[0] || { status_assinatura: 'ativo', vencimento_assinatura: null, plano_id: 1 };

    const token = jwt.sign(
      { 
        id: user.id, 
        tenant_id: user.tenant_id, 
        perfil: user.perfil, 
        nome: user.nome,
        status_assinatura: company.status_assinatura,
        vencimento_assinatura: company.vencimento_assinatura,
        plano_id: company.plano_id
      },
      JWT_SECRET,
      { expiresIn: "1d" }
    );

    console.log(`Login successful: ${email}`);
    res.json({ 
      token, 
      user: { 
        id: user.id, 
        nome: user.nome, 
        email: user.email, 
        perfil: user.perfil, 
        tenant_id: user.tenant_id, 
        avatar: user.avatar,
        status_assinatura: company.status_assinatura,
        vencimento_assinatura: company.vencimento_assinatura,
        plano_id: company.plano_id
      } 
    });
  } catch (err: any) {
    console.error(`Detailed login error for ${email}:`, err);
    res.status(500).json({ error: "Erro interno do servidor", details: err.message });
  }
});

app.get("/api/auth/me", authMiddleware, async (req: any, res) => {
  try {
    const [users] = await pool.query("SELECT id, tenant_id, nome, email, perfil, avatar FROM usuarios WHERE id = ?", [req.user.id]) as any[];
    const user = users[0];
    if (!user) return res.status(404).json({ error: "Usuário não encontrado" });

    const [companies] = await pool.query("SELECT status_assinatura, vencimento_assinatura, plano_id FROM empresas WHERE tenant_id = ?", [user.tenant_id]) as any[];
    const company = companies[0] || { status_assinatura: 'ativo', vencimento_assinatura: null, plano_id: 1 };

    res.json({
      user: {
        ...user,
        status_assinatura: company.status_assinatura,
        vencimento_assinatura: company.vencimento_assinatura,
        plano_id: company.plano_id
      }
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

app.post("/api/auth/forgot-password", async (req, res) => {
  const { email } = req.body;
  try {
    const [users] = await pool.query("SELECT * FROM usuarios WHERE email = ?", [email]) as any[];
    if (users.length === 0) {
      return res.status(404).json({ error: "E-mail não encontrado" });
    }

    const codigo = Math.floor(100000 + Math.random() * 900000).toString();
    const expiraEm = new Date(Date.now() + 120 * 1000); // 120 seconds

    await pool.query(
      "INSERT INTO recuperacao_senha (email, codigo, expira_em) VALUES (?, ?, ?)",
      [email, codigo, expiraEm]
    );

    const mailOptions = {
      from: process.env.SMTP_FROM,
      to: email,
      subject: "Código de Recuperação de Senha",
      text: `Seu código de recuperação de senha é: ${codigo}. Ele expira em 120 segundos.`,
      html: `<p>Seu código de recuperação de senha é: <strong>${codigo}</strong></p><p>Ele expira em 120 segundos.</p>`,
    };

    await transporter.sendMail(mailOptions);
    res.json({ message: "Código enviado com sucesso" });
  } catch (err: any) {
    console.error("Forgot password error:", err);
    res.status(500).json({ error: "Erro ao enviar e-mail de recuperação" });
  }
});

app.post("/api/auth/reset-password", async (req, res) => {
  const { email, codigo, novaSenha } = req.body;
  try {
    const [rows] = await pool.query(
      "SELECT * FROM recuperacao_senha WHERE email = ? AND codigo = ? AND usado = 0 AND expira_em > NOW()",
      [email, codigo]
    ) as any[];

    if (rows.length === 0) {
      return res.status(400).json({ error: "Código inválido ou expirado" });
    }

    const hashedPassword = await bcrypt.hash(novaSenha, 10);
    await pool.query("UPDATE usuarios SET senha = ? WHERE email = ?", [hashedPassword, email]);
    await pool.query("UPDATE recuperacao_senha SET usado = 1 WHERE id = ?", [rows[0].id]);

    res.json({ message: "Senha alterada com sucesso" });
  } catch (err: any) {
    console.error("Reset password error:", err);
    res.status(500).json({ error: "Erro ao resetar senha" });
  }
});

app.put("/api/auth/profile", authMiddleware, async (req: any, res) => {
  const { nome, avatar, senha } = req.body;
  const userId = req.user.id;

  try {
    let query = "UPDATE usuarios SET nome = ?, avatar = ? WHERE id = ?";
    let params = [nome, avatar, userId];

    if (senha) {
      const hashedPassword = await bcrypt.hash(senha, 10);
      query = "UPDATE usuarios SET nome = ?, avatar = ?, senha = ? WHERE id = ?";
      params = [nome, avatar, hashedPassword, userId];
    }

    await pool.query(query, params);

    // Fetch updated user
    const [users] = await pool.query("SELECT id, tenant_id, nome, email, perfil, avatar FROM usuarios WHERE id = ?", [userId]) as any[];
    res.json({ success: true, user: users[0] });
  } catch (err: any) {
    console.error("Profile update error:", err);
    res.status(500).json({ error: "Erro ao atualizar perfil" });
  }
});

// --- TENANT ROUTES (Protected) ---

// Dashboard Stats
// --- STRIPE ROUTES ---

app.post("/api/stripe/create-checkout-session", authMiddleware, async (req: any, res) => {
  const { planoId } = req.body;
  const { tenant_id, id } = req.user;

  try {
    const stripe = getStripe();
    
    // Map planoId to Price ID
    const [plans] = await pool.query("SELECT stripe_price_id FROM planos WHERE id = ?", [planoId]) as any[];
    const plan = plans[0];
    const priceId = plan?.stripe_price_id;

    if (!priceId) {
      return res.status(400).json({ error: "ID do plano inválido ou não configurado no Stripe." });
    }
    
    // Get user email
    const [users] = await pool.query("SELECT email FROM usuarios WHERE id = ?", [id]) as any[];
    const userEmail = users[0]?.email;

    // Check if company already has a stripe_customer_id
    const [companies] = await pool.query("SELECT stripe_customer_id FROM empresas WHERE tenant_id = ?", [tenant_id]) as any[];
    const company = companies[0];
    
    let customerId = company?.stripe_customer_id;
    
    if (!customerId) {
      const customer = await stripe.customers.create({
        email: userEmail,
        metadata: { tenant_id }
      });
      customerId = customer.id;
      await pool.query("UPDATE empresas SET stripe_customer_id = ? WHERE tenant_id = ?", [customerId, tenant_id]);
    }

    const session = await stripe.checkout.sessions.create({
      customer: customerId,
      payment_method_types: ['card'],
      line_items: [{ price: priceId, quantity: 1 }],
      mode: 'subscription',
      success_url: `${process.env.APP_URL || 'http://localhost:3000'}/stripe-success?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${process.env.APP_URL || 'http://localhost:3000'}/settings?canceled=true`,
      client_reference_id: tenant_id,
    });

    console.log(`Stripe Checkout Session created for tenant ${tenant_id}: ${session.url}`);
    res.json({ url: session.url });
  } catch (err: any) {
    console.error("Stripe Checkout Error:", err);
    res.status(500).json({ error: err.message });
  }
});

app.post("/api/stripe/create-portal-session", authMiddleware, async (req: any, res) => {
  const { tenant_id } = req.user;

  try {
    const stripe = getStripe();
    const [companies] = await pool.query("SELECT stripe_customer_id FROM empresas WHERE tenant_id = ?", [tenant_id]) as any[];
    const company = companies[0];

    if (!company?.stripe_customer_id) {
      return res.status(400).json({ error: "Nenhum cliente Stripe encontrado para esta empresa." });
    }

    const session = await stripe.billingPortal.sessions.create({
      customer: company.stripe_customer_id,
      return_url: `${process.env.APP_URL || 'http://localhost:3000'}/stripe-portal-return`,
    });

    res.json({ url: session.url });
  } catch (err: any) {
    console.error("Stripe Portal Error:", err);
    res.status(500).json({ error: err.message });
  }
});

app.post("/api/stripe/verify-session", authMiddleware, async (req: any, res) => {
  const { sessionId } = req.body;
  const { tenant_id } = req.user;

  try {
    const stripe = getStripe();
    const session = await stripe.checkout.sessions.retrieve(sessionId);

    if (session.payment_status === 'paid') {
      const customerId = session.customer as string;
      const subscriptionId = session.subscription as string;
      
      const subscription = await stripe.subscriptions.retrieve(subscriptionId) as any;
      const priceId = subscription.items.data[0].price.id;

      // Map price ID to plan ID from database
      const [plans] = await pool.query("SELECT id FROM planos WHERE stripe_price_id = ?", [priceId]) as any[];
      let plano_id = plans[0]?.id || 1;

      if (plans.length === 0) {
        console.warn(`Verify Session: Price ID "${priceId}" not found in database. Defaulting to plan 1.`);
      }

      const vencimento = new Date(subscription.current_period_end * 1000);

      await pool.query(
        "UPDATE empresas SET stripe_customer_id = ?, stripe_subscription_id = ?, stripe_price_id = ?, plano_id = ?, status_assinatura = 'ativo', vencimento_assinatura = ? WHERE tenant_id = ?",
        [customerId, subscriptionId, priceId, plano_id, vencimento, tenant_id]
      );
      
      console.log(`Verify Session: Updated company ${tenant_id} to plan ${plano_id} with expiry ${vencimento}`);

      res.json({ success: true, message: "Assinatura verificada e ativada!" });
    } else {
      res.status(400).json({ error: "Pagamento ainda não confirmado." });
    }
  } catch (err: any) {
    console.error("Verify Session Error:", err);
    res.status(500).json({ error: err.message });
  }
});

app.get("/api/dashboard/stats", authMiddleware, async (req: any, res) => {
  try {
    const { tenant_id } = req.user;
    
    const [totalSalesRow] = await pool.query("SELECT SUM(valor_total) as total FROM vendas WHERE tenant_id = ? AND status = 'finalizada'", [tenant_id]) as any[];
    const [totalReceivableRow] = await pool.query("SELECT SUM(valor) as total FROM lancamentos WHERE tenant_id = ? AND status = 'aberta' AND tipo = 'CR'", [tenant_id]) as any[];
    const [totalPayableRow] = await pool.query("SELECT SUM(valor) as total FROM lancamentos WHERE tenant_id = ? AND status = 'aberta' AND tipo = 'CP'", [tenant_id]) as any[];
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

app.get("/api/dashboard/chart-data", authMiddleware, async (req: any, res) => {
  try {
    const { tenant_id } = req.user;
    
    // Get receivables by month (from lancamentos)
    const [receivablesByMonth] = await pool.query(`
      SELECT 
        DATE_FORMAT(created_at, '%m') as month_num,
        SUM(valor) as total 
      FROM lancamentos 
      WHERE tenant_id = ? AND created_at >= DATE_SUB(NOW(), INTERVAL 6 MONTH) AND tipo = 'CR'
      GROUP BY month_num
    `, [tenant_id]) as any[];

    // Get expenses by month (from lancamentos)
    const [expensesByMonth] = await pool.query(`
      SELECT 
        DATE_FORMAT(created_at, '%m') as month_num,
        SUM(valor) as total 
      FROM lancamentos 
      WHERE tenant_id = ? AND created_at >= DATE_SUB(NOW(), INTERVAL 6 MONTH) AND tipo = 'CP'
      GROUP BY month_num
    `, [tenant_id]) as any[];

    // Merge data for the last 6 months
    const months = [];
    for (let i = 5; i >= 0; i--) {
      const d = new Date();
      d.setMonth(d.getMonth() - i);
      const monthNum = (d.getMonth() + 1).toString().padStart(2, '0');
      const monthName = d.toLocaleDateString('pt-BR', { month: 'short' });
      
      const receivables = (receivablesByMonth as any[]).find(s => s.month_num === monthNum)?.total || 0;
      const expenses = (expensesByMonth as any[]).find(e => e.month_num === monthNum)?.total || 0;
      
      months.push({
        name: monthName.charAt(0).toUpperCase() + monthName.slice(1),
        receivables,
        expenses
      });
    }

    res.json(months);
  } catch (err: any) {
    console.error("Error fetching chart data:", err);
    // Return empty array instead of error object to prevent frontend issues
    res.json([]);
  }
});

// Products
app.get("/api/products", authMiddleware, async (req: any, res) => {
  const [products] = await pool.query("SELECT * FROM produtos WHERE tenant_id = ?", [req.user.tenant_id]);
  res.json(products);
});

app.post("/api/products", authMiddleware, async (req: any, res) => {
  try {
    const { nome, tipo, unidade, custo, preco_venda, estoque_atual, estoque_minimo, categoria, codigo_barras, ativo } = req.body;
    await pool.query(
      "INSERT INTO produtos (tenant_id, nome, tipo, unidade, custo, preco_venda, estoque_atual, estoque_minimo, categoria, codigo_barras, ativo) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
      [req.user.tenant_id, nome, tipo, unidade, custo, preco_venda, estoque_atual, estoque_minimo || 0, categoria, codigo_barras || null, ativo === undefined ? 1 : (ativo ? 1 : 0)]
    );
    res.json({ success: true });
  } catch (error: any) {
    console.error("Error creating product:", error);
    res.status(500).json({ error: error.message });
  }
});

app.put("/api/products/:id", authMiddleware, async (req: any, res) => {
  try {
    const { id } = req.params;
    const productId = parseInt(id);
    const { nome, tipo, unidade, custo, preco_venda, estoque_atual, estoque_minimo, categoria, codigo_barras, ativo } = req.body;
    
    const [result] = await pool.query(`
      UPDATE produtos 
      SET nome = ?, tipo = ?, unidade = ?, custo = ?, preco_venda = ?, estoque_atual = ?, estoque_minimo = ?, categoria = ?, codigo_barras = ?, ativo = ?, updated_at = CURRENT_TIMESTAMP
      WHERE id = ? AND tenant_id = ?
    `, [nome, tipo, unidade, custo, preco_venda, estoque_atual, estoque_minimo || 0, categoria, codigo_barras || null, ativo ? 1 : 0, productId, req.user.tenant_id]) as any;
    
    if (result.affectedRows === 0) {
      return res.status(404).json({ error: "Produto não encontrado ou sem permissão." });
    }
    
    res.json({ success: true });
  } catch (error: any) {
    console.error("Error updating product:", error);
    res.status(500).json({ error: error.message });
  }
});

// Pessoas (Clients/Suppliers)
app.get("/api/pessoas", authMiddleware, async (req: any, res) => {
  const [pessoas] = await pool.query("SELECT * FROM pessoas WHERE tenant_id = ?", [req.user.tenant_id]);
  res.json(pessoas);
});

app.post("/api/pessoas", authMiddleware, async (req: any, res) => {
  const { 
    nome, tipo_pessoa, cpf_cnpj, telefone, email, endereco, cidade, uf, ativo,
    razao_social, nome_fantasia, telefone_fixo, telefone_celular, numero, cep
  } = req.body;
  
  await pool.query(`
    INSERT INTO pessoas (
      tenant_id, nome, tipo_pessoa, cpf_cnpj, telefone, email, endereco, cidade, uf, ativo,
      razao_social, nome_fantasia, telefone_fixo, telefone_celular, numero, cep
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `, [
    req.user.tenant_id, nome, tipo_pessoa || 'cliente', cpf_cnpj, telefone, email, endereco, cidade, uf, 
    ativo === undefined ? 1 : (ativo ? 1 : 0),
    razao_social, nome_fantasia, telefone_fixo, telefone_celular, numero, cep
  ]);
  res.json({ success: true });
});

app.put("/api/pessoas/:id", authMiddleware, async (req: any, res) => {
  const { id } = req.params;
  const { 
    nome, tipo_pessoa, cpf_cnpj, telefone, email, endereco, cidade, uf, ativo,
    razao_social, nome_fantasia, telefone_fixo, telefone_celular, numero, cep
  } = req.body;
  
  await pool.query(`
    UPDATE pessoas 
    SET nome = ?, tipo_pessoa = ?, cpf_cnpj = ?, telefone = ?, email = ?, endereco = ?, cidade = ?, uf = ?, ativo = ?, 
        razao_social = ?, nome_fantasia = ?, telefone_fixo = ?, telefone_celular = ?, numero = ?, cep = ?,
        updated_at = CURRENT_TIMESTAMP 
    WHERE id = ? AND tenant_id = ?
  `, [
    nome, tipo_pessoa, cpf_cnpj, telefone, email, endereco, cidade, uf, ativo ? 1 : 0, 
    razao_social, nome_fantasia, telefone_fixo, telefone_celular, numero, cep,
    id, req.user.tenant_id
  ]);
  res.json({ success: true });
});

// Backward compatibility for clients endpoint
app.get("/api/clients", authMiddleware, async (req: any, res) => {
  const [clients] = await pool.query("SELECT * FROM pessoas WHERE tenant_id = ? AND (tipo_pessoa = 'cliente' OR tipo_pessoa = 'ambos')", [req.user.tenant_id]);
  res.json(clients);
});

// Sales
app.post("/api/sales", authMiddleware, async (req: any, res) => {
  const { pessoa_id, items, valor_total, desconto, frete, status = 'finalizada', tipo = 'venda', origem = 'Balcao', solicitacao, laudo_tecnico, pagamentos, identificacao, taxa_servico } = req.body;
  const { tenant_id, id: usuario_id } = req.user;
  
  const pessoaIdToInsert = pessoa_id === '' ? null : pessoa_id;

  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();

    // Calculate next sequencial_id
    const [maxSequencialRow] = await connection.query("SELECT MAX(sequencial_id) as max_id FROM vendas WHERE tenant_id = ?", [tenant_id]) as any[];
    const sequencial_id = (maxSequencialRow[0]?.max_id || 0) + 1;

    // 1. Create Sale
    const [saleResult] = await connection.query(
      "INSERT INTO vendas (tenant_id, pessoa_id, usuario_id, valor_total, desconto, frete, status, tipo, origem, solicitacao, laudo_tecnico, sequencial_id, identificacao, taxa_servico) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
      [tenant_id, pessoaIdToInsert, usuario_id, valor_total, desconto || 0, frete || 0, status, tipo, origem, solicitacao || null, laudo_tecnico || null, sequencial_id, identificacao || null, taxa_servico || 0]
    ) as any;
    
    const venda_id = saleResult.insertId;
    console.log(`Created sale #${venda_id} (sequencial #${sequencial_id}) for tenant ${tenant_id}`);


    // 2. Insert items
    for (const item of items) {
      await connection.query(
        "INSERT INTO vendas_itens (tenant_id, venda_id, produto_id, quantidade, preco_unitario, subtotal) VALUES (?, ?, ?, ?, ?, ?)",
        [tenant_id, venda_id, item.id, item.quantidade, item.preco_venda, item.subtotal]
      );
    }

    // 3. Insert Payments
    if (pagamentos && pagamentos.length > 0) {
      for (const pg of pagamentos) {
        await connection.query(
          "INSERT INTO vendas_pagamentos (tenant_id, venda_id, tipo_pagamento_id, nome, valor, parcelas) VALUES (?, ?, ?, ?, ?, ?)",
          [tenant_id, venda_id, pg.tipo_pagamento_id === 'Dinheiro' ? null : pg.tipo_pagamento_id, pg.nome, pg.valor, pg.parcelas || 1]
        );
      }
    }

    if (status === 'finalizada') {
      // 4. Update Stock for each item (only for products, not services)
      for (const item of items) {
        const [products] = await connection.query("SELECT tipo FROM produtos WHERE id = ? AND tenant_id = ?", [item.id, tenant_id]) as any[];
        const product = products[0];
        if (product && product.tipo === 'produto') {
          await connection.query(
            "UPDATE produtos SET estoque_atual = estoque_atual - ? WHERE id = ? AND tenant_id = ?",
            [item.quantidade, item.id, tenant_id]
          );
        }
      }

      // 5. Create financial entries based on local_lancamento
      if (pagamentos && pagamentos.length > 0) {
        let clienteNome = 'Consumidor Final';
        if (pessoaIdToInsert) {
          const [pessoas] = await connection.query("SELECT nome FROM pessoas WHERE id = ?", [pessoaIdToInsert]) as any[];
          clienteNome = pessoas[0]?.nome || 'Consumidor Final';
        }
        const dataVenda = new Date().toLocaleDateString('pt-BR');

        for (const pg of pagamentos) {
          let localLancamento = 'Caixa';
          let prazoDias = 0;
          if (pg.tipo_pagamento_id && pg.tipo_pagamento_id !== 'Dinheiro') {
            const [tps] = await connection.query("SELECT local_lancamento, prazo_dias FROM tipos_pagamento WHERE id = ? AND tenant_id = ?", [pg.tipo_pagamento_id, tenant_id]) as any[];
            const tp = tps[0];
            if (tp) {
              localLancamento = tp.local_lancamento;
              prazoDias = tp.prazo_dias || 0;
            }
          } else if (pg.nome.toLowerCase().includes('cartão') || pg.nome.toLowerCase().includes('cartao')) {
            localLancamento = 'Cartão';
          }

          const descricao = `Pedido #${sequencial_id} | ${dataVenda} | ${pg.nome} | ${clienteNome}`;

          if (localLancamento === 'Caixa') {
            const [caixas] = await connection.query("SELECT id FROM caixa WHERE tenant_id = ? AND status = 'aberto' ORDER BY id DESC LIMIT 1", [tenant_id]) as any[];
            const caixaAberto = caixas[0];
            if (caixaAberto) {
              await connection.query(
                "INSERT INTO movimentacoes_caixa (tenant_id, caixa_id, tipo, valor, descricao, venda_id, tipo_pagamento_id, origem) VALUES (?, ?, 'entrada', ?, ?, ?, ?, ?)",
                [tenant_id, caixaAberto.id, pg.valor, descricao, venda_id, (typeof pg.tipo_pagamento_id === 'number' || (typeof pg.tipo_pagamento_id === 'string' && pg.tipo_pagamento_id !== 'Dinheiro')) ? pg.tipo_pagamento_id : null, 'Venda']
              );
            } else {
              // Fallback to lancamentos if cashier is closed but intended for Caixa
              await connection.query(
                "INSERT INTO lancamentos (tenant_id, tipo, pessoa_id, venda_id, vencimento, valor, valor_pago, status, data_pagamento, descricao, local, tipo_pagamento_id) VALUES (?, 'CR', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
                [tenant_id, pessoaIdToInsert, venda_id, new Date().toISOString().slice(0, 19).replace('T', ' '), pg.valor, 0, 'aberta', null, descricao + ' (Caixa Fechado)', 'Caixa', (typeof pg.tipo_pagamento_id === 'number' || (typeof pg.tipo_pagamento_id === 'string' && pg.tipo_pagamento_id !== 'Dinheiro')) ? pg.tipo_pagamento_id : null]
              );
            }
          } else {
            // Banco, Cartão or Contas a Receber
            const valorParcela = pg.valor / (pg.parcelas || 1);
            
            for (let i = 0; i < (pg.parcelas || 1); i++) {
              const vencimento = new Date();
              // First installment uses prazoDias, subsequent uses +30 days each
              const diasToAdd = prazoDias + (i * 30);
              vencimento.setDate(vencimento.getDate() + diasToAdd);
              
              // Status logic: if it's for today (prazo 0) and local is Banco/Cartão, mark as paid.
              // Otherwise, keep as open to be settled later.
              const statusCR = (diasToAdd === 0 && (localLancamento === 'Banco' || localLancamento === 'Cartão')) ? 'paga' : 'aberta';
              const valorPagoCR = statusCR === 'paga' ? valorParcela : 0;
              const dataPagamentoCR = statusCR === 'paga' ? new Date().toISOString() : null;

              await connection.query(
                "INSERT INTO lancamentos (tenant_id, tipo, pessoa_id, venda_id, vencimento, valor, valor_pago, status, data_pagamento, descricao, local, tipo_pagamento_id) VALUES (?, 'CR', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
                [
                  tenant_id, 
                  pessoaIdToInsert, 
                  venda_id, 
                  vencimento.toISOString().slice(0, 19).replace('T', ' '), 
                  valorParcela, 
                  valorPagoCR, 
                  statusCR, 
                  dataPagamentoCR ? dataPagamentoCR.slice(0, 19).replace('T', ' ') : null, 
                  descricao + (pg.parcelas > 1 ? ` (${i+1}/${pg.parcelas})` : ''), 
                  localLancamento, 
                  (typeof pg.tipo_pagamento_id === 'number' || (typeof pg.tipo_pagamento_id === 'string' && pg.tipo_pagamento_id !== 'Dinheiro')) ? pg.tipo_pagamento_id : null
                ]
              );
            }
          }
        }
      }
    }

    await connection.commit();
    res.json({ success: true, id: venda_id, sequencial_id: sequencial_id });
  } catch (err: any) {
    await connection.rollback();
    console.error("Error creating sale:", err);
    res.status(400).json({ error: err.message });
  } finally {
    connection.release();
  }
});

app.post("/api/sales/:id/cancel", authMiddleware, async (req: any, res) => {
  const { id } = req.params;
  const { tenant_id } = req.user;
  console.log(`Cancel request received for sale ${id} (tenant ${tenant_id})`);

  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();

    // 1. Get Sale
    const [sales] = await connection.query("SELECT * FROM vendas WHERE id = ? AND tenant_id = ?", [id, tenant_id]) as any[];
    const sale = sales[0];
    if (!sale) throw new Error("Venda não encontrada");
    if (sale.status === 'cancelada') throw new Error("Esta venda já está cancelada");

    // 2. If 'finalizada', reverse stock and financial impact
    if (sale.status === 'finalizada') {
      // Return items to stock
      const [items] = await connection.query("SELECT produto_id, quantidade FROM vendas_itens WHERE venda_id = ?", [id]) as any[];
      for (const item of items) {
        const [products] = await connection.query("SELECT tipo FROM produtos WHERE id = ?", [item.produto_id]) as any[];
        const product = products[0];
        if (product && product.tipo === 'produto') {
          await connection.query(
            "UPDATE produtos SET estoque_atual = estoque_atual + ? WHERE id = ?",
            [item.quantidade, item.produto_id]
          );
        }
      }

      // Delete linked financial movements
      await connection.query("DELETE FROM movimentacoes_caixa WHERE venda_id = ? AND tenant_id = ?", [id, tenant_id]);
      await connection.query("DELETE FROM lancamentos WHERE venda_id = ? AND tenant_id = ?", [id, tenant_id]);
    }

    // 3. Update Sale Status
    await connection.query("UPDATE vendas SET status = 'cancelada' WHERE id = ?", [id]);

    await connection.commit();
    res.json({ success: true });
  } catch (err: any) {
    await connection.rollback();
    console.error("Error cancelling sale:", err);
    res.status(400).json({ error: err.message });
  } finally {
    connection.release();
  }
});

app.get("/api/sales/:id", authMiddleware, async (req: any, res) => {
  const { id } = req.params;
  const { tenant_id } = req.user;

  const [sales] = await pool.query(`
    SELECT 
      v.*, 
      p.nome as cliente_nome,
      p.razao_social as cliente_razao_social,
      p.nome_fantasia as cliente_nome_fantasia,
      p.cpf_cnpj as cliente_cpf_cnpj,
      p.telefone as cliente_telefone,
      p.telefone_fixo as cliente_telefone_fixo,
      p.telefone_celular as cliente_telefone_celular,
      p.email as cliente_email,
      p.endereco as cliente_endereco,
      p.numero as cliente_numero,
      p.cep as cliente_cep,
      p.cidade as cliente_cidade,
      p.uf as cliente_uf
    FROM vendas v 
    LEFT JOIN pessoas p ON v.pessoa_id = p.id 
    WHERE v.sequencial_id = ? AND v.tenant_id = ?
  `, [id, tenant_id]) as any[];
  const sale = sales[0];

  if (!sale) return res.status(404).json({ error: "Venda não encontrada" });

  const [items] = await pool.query(`
    SELECT vi.*, p.nome 
    FROM vendas_itens vi
    JOIN produtos p ON vi.produto_id = p.id
    WHERE vi.venda_id = (SELECT id FROM vendas WHERE sequencial_id = ? AND tenant_id = ?) AND vi.tenant_id = ?
  `, [id, tenant_id, tenant_id]) as any[];

  const [pagamentos] = await pool.query(`
    SELECT vp.* 
    FROM vendas_pagamentos vp
    JOIN vendas v ON vp.venda_id = v.id
    WHERE v.sequencial_id = ? AND vp.tenant_id = ?
  `, [id, tenant_id]) as any[];

  res.json({ ...sale, items: (items as any[]).map((i: any) => ({
    id: i.produto_id,
    nome: i.nome,
    quantidade: i.quantidade,
    preco_venda: i.preco_unitario,
    subtotal: i.subtotal
  })), pagamentos });
});

app.put("/api/sales/:id", authMiddleware, async (req: any, res) => {
  const { id } = req.params; // This is now sequencial_id
  const { pessoa_id, items, valor_total, desconto, frete, status, solicitacao, laudo_tecnico, pagamentos, identificacao, taxa_servico, origem, tipo } = req.body;
  const { tenant_id } = req.user;
  
  const pessoaIdToInsert = pessoa_id === '' ? null : pessoa_id;

  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();

    const [existingSales] = await connection.query("SELECT * FROM vendas WHERE sequencial_id = ? AND tenant_id = ?", [id, tenant_id]) as any[];
    const existingSale = existingSales[0];
    if (!existingSale) throw new Error("Venda não encontrada");
    if (existingSale.status === 'finalizada') throw new Error("Venda já finalizada não pode ser editada");

    // Update Sale
    await connection.query(
      "UPDATE vendas SET pessoa_id = ?, valor_total = ?, desconto = ?, frete = ?, status = ?, solicitacao = ?, laudo_tecnico = ?, identificacao = ?, taxa_servico = ?, origem = ?, tipo = ?, updated_at = CURRENT_TIMESTAMP WHERE sequencial_id = ? AND tenant_id = ?",
      [pessoaIdToInsert, valor_total, desconto || 0, frete || 0, status, solicitacao || null, laudo_tecnico || null, identificacao || existingSale.identificacao, taxa_servico || existingSale.taxa_servico, origem || existingSale.origem, tipo || existingSale.tipo, id, tenant_id]
    );
    
    // Delete old items
    await connection.query("DELETE FROM vendas_itens WHERE venda_id = ? AND tenant_id = ?", [existingSale.id, tenant_id]);

    // Insert new items
    for (const item of items) {
      await connection.query(
        "INSERT INTO vendas_itens (tenant_id, venda_id, produto_id, quantidade, preco_unitario, subtotal) VALUES (?, ?, ?, ?, ?, ?)",
        [tenant_id, existingSale.id, item.id, item.quantidade, item.preco_venda, item.subtotal]
      );
    }

    // Delete old payments
    await connection.query("DELETE FROM vendas_pagamentos WHERE venda_id = ? AND tenant_id = ?", [existingSale.id, tenant_id]);

    // Insert new payments
    if (pagamentos && pagamentos.length > 0) {
      for (const pg of pagamentos) {
        await connection.query(
          "INSERT INTO vendas_pagamentos (tenant_id, venda_id, tipo_pagamento_id, nome, valor, parcelas) VALUES (?, ?, ?, ?, ?, ?)",
          [tenant_id, existingSale.id, pg.tipo_pagamento_id === 'Dinheiro' ? null : pg.tipo_pagamento_id, pg.nome, pg.valor, pg.parcelas || 1]
        );
      }
    }

    if (status === 'finalizada') {
      // Update Stock for each item (only for products, not services)
      for (const item of items) {
        const [products] = await connection.query("SELECT tipo FROM produtos WHERE id = ? AND tenant_id = ?", [item.id, tenant_id]) as any[];
        const product = products[0];
        if (product && product.tipo === 'produto') {
          await connection.query(
            "UPDATE produtos SET estoque_atual = estoque_atual - ? WHERE id = ? AND tenant_id = ?",
            [item.quantidade, item.id, tenant_id]
          );
        }
      }

      // Create financial entries based on local_lancamento
      if (pagamentos && pagamentos.length > 0) {
        let clienteNome = 'Consumidor Final';
        if (pessoaIdToInsert) {
          const [pessoas] = await connection.query("SELECT nome FROM pessoas WHERE id = ?", [pessoaIdToInsert]) as any[];
          clienteNome = pessoas[0]?.nome || 'Consumidor Final';
        }
        const dataVenda = new Date().toLocaleDateString('pt-BR');

        for (const pg of pagamentos) {
          let localLancamento = 'Caixa';
          let prazoDias = 0;
          if (pg.tipo_pagamento_id && pg.tipo_pagamento_id !== 'Dinheiro') {
            const [tps] = await connection.query("SELECT local_lancamento, prazo_dias FROM tipos_pagamento WHERE id = ? AND tenant_id = ?", [pg.tipo_pagamento_id, tenant_id]) as any[];
            const tp = tps[0];
            if (tp) {
              localLancamento = tp.local_lancamento;
              prazoDias = tp.prazo_dias || 0;
            }
          } else if (pg.nome.toLowerCase().includes('cartão') || pg.nome.toLowerCase().includes('cartao')) {
            localLancamento = 'Cartão';
          }

          const descricao = `Pedido #${id} | ${dataVenda} | ${pg.nome} | ${clienteNome}`;

          if (localLancamento === 'Caixa') {
            const [caixas] = await connection.query("SELECT id FROM caixa WHERE tenant_id = ? AND status = 'aberto' ORDER BY id DESC LIMIT 1", [tenant_id]) as any[];
            const caixaAberto = caixas[0];
            if (caixaAberto) {
              await connection.query(
                "INSERT INTO movimentacoes_caixa (tenant_id, caixa_id, tipo, valor, descricao, venda_id, tipo_pagamento_id, origem) VALUES (?, ?, 'entrada', ?, ?, ?, ?, ?)",
                [tenant_id, caixaAberto.id, pg.valor, descricao, existingSale.id, (typeof pg.tipo_pagamento_id === 'number' || (typeof pg.tipo_pagamento_id === 'string' && pg.tipo_pagamento_id !== 'Dinheiro')) ? pg.tipo_pagamento_id : null, 'Venda']
              );
            } else {
              // Fallback to lancamentos if cashier is closed
              await connection.query(
                "INSERT INTO lancamentos (tenant_id, tipo, pessoa_id, venda_id, vencimento, valor, valor_pago, status, data_pagamento, descricao, local, tipo_pagamento_id) VALUES (?, 'CR', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
                [tenant_id, pessoaIdToInsert, existingSale.id, new Date().toISOString().slice(0, 19).replace('T', ' '), pg.valor, 0, 'aberta', null, descricao + ' (Caixa Fechado)', 'Caixa', (typeof pg.tipo_pagamento_id === 'number' || (typeof pg.tipo_pagamento_id === 'string' && pg.tipo_pagamento_id !== 'Dinheiro')) ? pg.tipo_pagamento_id : null]
              );
            }
          } else {
            // Banco, Cartão or Contas a Receber
            const valorParcela = pg.valor / (pg.parcelas || 1);
            
            for (let i = 0; i < (pg.parcelas || 1); i++) {
              const vencimento = new Date();
              const diasToAdd = prazoDias + (i * 30);
              vencimento.setDate(vencimento.getDate() + diasToAdd);
              
              const statusCR = (diasToAdd === 0 && (localLancamento === 'Banco' || localLancamento === 'Cartão')) ? 'paga' : 'aberta';
              const valorPagoCR = statusCR === 'paga' ? valorParcela : 0;
              const dataPagamentoCR = statusCR === 'paga' ? new Date().toISOString() : null;

              await connection.query(
                "INSERT INTO lancamentos (tenant_id, tipo, pessoa_id, venda_id, vencimento, valor, valor_pago, status, data_pagamento, descricao, local, tipo_pagamento_id) VALUES (?, 'CR', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
                [
                  tenant_id, 
                  pessoaIdToInsert, 
                  existingSale.id, 
                  vencimento.toISOString().slice(0, 19).replace('T', ' '), 
                  valorParcela, 
                  valorPagoCR, 
                  statusCR, 
                  dataPagamentoCR ? dataPagamentoCR.slice(0, 19).replace('T', ' ') : null, 
                  descricao + (pg.parcelas > 1 ? ` (${i+1}/${pg.parcelas})` : ''), 
                  localLancamento, 
                  (typeof pg.tipo_pagamento_id === 'number' || (typeof pg.tipo_pagamento_id === 'string' && pg.tipo_pagamento_id !== 'Dinheiro')) ? pg.tipo_pagamento_id : null
                ]
              );
            }
          }
        }
      }
    }

    await connection.commit();
    res.json({ success: true, id: existingSale.id, sequencial_id: id });
  } catch (err: any) {
    await connection.rollback();
    console.error("Error updating sale:", err);
    res.status(400).json({ error: err.message });
  } finally {
    connection.release();
  }
});
app.get("/api/company/settings", authMiddleware, async (req: any, res) => {
  try {
    const { tenant_id } = req.user;
    const [companies] = await pool.query(`
      SELECT e.*, p.nome as plano_nome 
      FROM empresas e 
      LEFT JOIN planos p ON e.plano_id = p.id 
      WHERE e.tenant_id = ?
    `, [tenant_id]) as any[];
    res.json(companies[0]);
  } catch (err: any) {
    console.error("Error fetching company settings:", err);
    res.status(500).json({ error: err.message });
  }
});

app.put("/api/company/settings", authMiddleware, async (req: any, res) => {
  const { tenant_id } = req.user;
  const { 
    nome_fantasia, razao_social, cnpj, email, 
    telefone_fixo, telefone_celular, endereco, 
    numero, cep, cidade, estado 
  } = req.body;

  try {
    await pool.query(`
      UPDATE empresas 
      SET nome_fantasia = ?, razao_social = ?, cnpj = ?, email = ?, 
          telefone_fixo = ?, telefone_celular = ?, endereco = ?, 
          numero = ?, cep = ?, cidade = ?, estado = ?, 
          updated_at = CURRENT_TIMESTAMP 
      WHERE tenant_id = ?
    `, [
      nome_fantasia, razao_social, cnpj, email, 
      telefone_fixo, telefone_celular, endereco, 
      numero, cep, cidade, estado, 
      tenant_id
    ]);
    res.json({ success: true });
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});

// --- SUPERADMIN ROUTES ---

app.get("/api/admin/companies", authMiddleware, async (req: any, res) => {
  if (req.user.perfil !== 'superadmin') return res.status(403).json({ error: "Forbidden" });
  const [companies] = await pool.query(`
    SELECT e.*, p.nome as plano_nome 
    FROM empresas e 
    LEFT JOIN planos p ON e.plano_id = p.id
  `);
  res.json(companies);
});

app.get("/api/admin/companies/:id/stripe-status", authMiddleware, async (req: any, res) => {
  if (req.user.perfil !== 'superadmin') return res.status(403).json({ error: "Forbidden" });
  const { id } = req.params;
  
  try {
    const [companies] = await pool.query("SELECT stripe_customer_id, stripe_subscription_id FROM empresas WHERE id = ?", [id]) as any[];
    const company = companies[0];

    if (!company) {
      return res.status(404).json({ error: "Empresa não encontrada" });
    }

    if (!company.stripe_customer_id && !company.stripe_subscription_id) {
      return res.status(400).json({ error: "Empresa não possui ID do Stripe vinculado" });
    }

    const stripe = getStripe();
    let subscription;

    if (company.stripe_customer_id && company.stripe_customer_id !== 'null') {
      // First, try to get the latest ACTIVE subscription
      const activeSubs = await stripe.subscriptions.list({
        customer: company.stripe_customer_id,
        limit: 1,
        status: 'active'
      });
      
      if (activeSubs.data.length > 0) {
        subscription = activeSubs.data[0];
      } else {
        // Fallback to any subscription if no active ones exist
        const allSubs = await stripe.subscriptions.list({
          customer: company.stripe_customer_id,
          limit: 1,
          status: 'all'
        });
        subscription = allSubs.data[0];
      }
    } else if (company.stripe_subscription_id && company.stripe_subscription_id !== 'null') {
      subscription = await stripe.subscriptions.retrieve(company.stripe_subscription_id);
    }

    if (!subscription) {
      return res.status(404).json({ error: "Nenhuma assinatura encontrada no Stripe para este cliente" });
    }

    let status = subscription.status === 'active' ? 'ativo' : 'suspenso';
    if (subscription.cancel_at_period_end) {
      status = 'Cancelamento Solicitado';
    }
    if (subscription.status === 'canceled') {
      status = 'cancelado';
    }

    let vencimento = '';
    try {
      if (subscription.current_period_end) {
        vencimento = new Date(subscription.current_period_end * 1000).toISOString().split('T')[0];
      } else {
        console.warn("Stripe subscription missing current_period_end:", subscription);
        // Fallback to today + 30 days if missing
        const fallbackDate = new Date();
        fallbackDate.setDate(fallbackDate.getDate() + 30);
        vencimento = fallbackDate.toISOString().split('T')[0];
      }
    } catch (dateErr) {
      console.error("Error parsing date from subscription:", subscription.current_period_end, dateErr);
      const fallbackDate = new Date();
      fallbackDate.setDate(fallbackDate.getDate() + 30);
      vencimento = fallbackDate.toISOString().split('T')[0];
    }

    // Automatically update the database with the verified status
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
    console.error("Error fetching stripe status:", err);
    res.status(500).json({ error: err.message });
  }
});

app.put("/api/admin/companies/:id", authMiddleware, async (req: any, res) => {
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

app.post("/api/admin/plans", authMiddleware, async (req: any, res) => {
  if (req.user.perfil !== 'superadmin') return res.status(403).json({ error: "Forbidden" });
  const { nome, valor_mensal, limite_usuarios, stripe_price_id } = req.body;
  
  if (stripe_price_id && !stripe_price_id.startsWith('price_')) {
    return res.status(400).json({ error: "O ID do Stripe deve ser um Price ID (começar com 'price_'). Você informou um Product ID." });
  }

  try {
    await pool.query("INSERT INTO planos (nome, valor_mensal, limite_usuarios, stripe_price_id) VALUES (?, ?, ?, ?)", [nome, valor_mensal, limite_usuarios, stripe_price_id]);
    res.json({ success: true });
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});

app.put("/api/admin/plans/:id", authMiddleware, async (req: any, res) => {
  if (req.user.perfil !== 'superadmin') return res.status(403).json({ error: "Forbidden" });
  const { id } = req.params;
  const { nome, valor_mensal, limite_usuarios, stripe_price_id } = req.body;
  
  if (stripe_price_id && !stripe_price_id.startsWith('price_')) {
    return res.status(400).json({ error: "O ID do Stripe deve ser um Price ID (começar com 'price_'). Você informou um Product ID." });
  }

  await pool.query("UPDATE planos SET nome = ?, valor_mensal = ?, limite_usuarios = ?, stripe_price_id = ? WHERE id = ?", [nome, valor_mensal, limite_usuarios, stripe_price_id, id]);
    
  res.json({ success: true });
});

app.delete("/api/admin/plans/:id", authMiddleware, async (req: any, res) => {
  if (req.user.perfil !== 'superadmin') {
    console.log(`Unauthorized delete attempt by: ${req.user.email}`);
    return res.status(403).json({ error: "Forbidden" });
  }
  const { id } = req.params;
  console.log(`Delete attempt for plan ID: ${id}`);
  
  try {
    // Check if any company is using this plan
    const [inUseRows] = await pool.query("SELECT COUNT(*) as count FROM empresas WHERE plano_id = ?", [id]) as any[];
    const inUse = inUseRows[0];
    if (inUse.count > 0) {
      console.log(`Plan ${id} is in use by ${inUse.count} companies`);
      return res.status(400).json({ error: "Este plano está em uso por uma ou mais empresas e não pode ser excluído." });
    }

    const [result] = await pool.query("DELETE FROM planos WHERE id = ?", [id]) as any;
    if (result.affectedRows === 0) {
      console.log(`Plan ${id} not found for deletion`);
      return res.status(404).json({ error: "Plano não encontrado" });
    }
    console.log(`Plan ${id} deleted successfully`);
    res.json({ success: true });
  } catch (err: any) {
    console.error(`Error deleting plan ${id}:`, err);
    res.status(500).json({ error: "Erro ao excluir plano" });
  }
});

// Finance
app.get("/api/finance/receivable", authMiddleware, async (req: any, res) => {
  const [data] = await pool.query(`
    SELECT l.*, p.nome as cliente_nome, tp.nome as tipo_pagamento_nome, tp.local_lancamento as tp_local
    FROM lancamentos l 
    LEFT JOIN pessoas p ON l.pessoa_id = p.id 
    LEFT JOIN tipos_pagamento tp ON l.tipo_pagamento_id = tp.id
    WHERE l.tenant_id = ? AND l.tipo = 'CR'
  `, [req.user.tenant_id]);
  res.json(data);
});

app.get("/api/finance/movements/banco", authMiddleware, async (req: any, res) => {
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

app.get("/api/finance/movements/cartao", authMiddleware, async (req: any, res) => {
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

app.get("/api/finance/payable", authMiddleware, async (req: any, res) => {
  const [data] = await pool.query(`
    SELECT l.*, p.nome as fornecedor_nome, tp.nome as tipo_pagamento_nome, tp.local_lancamento as tp_local
    FROM lancamentos l 
    LEFT JOIN pessoas p ON l.pessoa_id = p.id 
    LEFT JOIN tipos_pagamento tp ON l.tipo_pagamento_id = tp.id
    WHERE l.tenant_id = ? AND l.tipo = 'CP'
  `, [req.user.tenant_id]);
  res.json(data);
});

// Sales List
app.get("/api/sales", authMiddleware, async (req: any, res) => {
  try {
    const [sales] = await pool.query(`
      SELECT 
        v.*, 
        p.nome as cliente_nome,
        (SELECT COALESCE(SUM(quantidade), 0) FROM vendas_itens WHERE venda_id = v.id) as qtd_itens
      FROM vendas v 
      LEFT JOIN pessoas p ON v.pessoa_id = p.id 
      WHERE v.tenant_id = ?
    `, [req.user.tenant_id]) as any[];
    console.log(`Fetched ${(sales as any[]).length} sales for tenant ${req.user.tenant_id}`);
    res.json(sales);
  } catch (err: any) {
    console.error("Error fetching sales:", err);
    res.status(500).json({ error: err.message });
  }
});

// Sales Movements (Finance Report)
app.get("/api/finance/sales-movements", authMiddleware, async (req: any, res) => {
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

// DRE Endpoint
app.get("/api/finance/dre", authMiddleware, async (req: any, res) => {
  const { tenant_id } = req.user;
  const { start, end } = req.query;

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
      WHERE l.tenant_id = ? 
        AND l.tipo = 'CP' 
        AND (l.descricao IS NULL OR l.descricao NOT LIKE 'Pagamento conta #%')
        ${dateFilterLanc}
      GROUP BY c.nome
    `, paramsLanc) as any[];

    const [caixaDespesasRaw] = await pool.query(`
      SELECT COALESCE(c.nome, 'Saídas Caixa (Não Categorizadas)') as categoria, SUM(m.valor) as total
      FROM movimentacoes_caixa m
      LEFT JOIN categorias_contas c ON m.categoria_id = c.id
      WHERE m.tenant_id = ? AND m.tipo = 'saida' 
        AND m.descricao NOT LIKE 'Pagamento conta %' 
        AND m.venda_id IS NULL AND m.origem = 'Lançamento Manual'
        ${dateFilterCaixa}
      GROUP BY c.nome
    `, paramsCaixa) as any[];

    const [outrasReceitasLancRaw] = await pool.query(`
      SELECT COALESCE(c.nome, 'Outras Receitas') as categoria, SUM(l.valor) as total
      FROM lancamentos l
      LEFT JOIN categorias_contas c ON l.categoria_id = c.id
      WHERE l.tenant_id = ? 
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
      WHERE m.tenant_id = ? AND m.tipo = 'entrada' 
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

// Financial Accounts (Combined Report)
app.get("/api/finance/accounts", authMiddleware, async (req: any, res) => {
  const { tenant_id } = req.user;
  console.log(`Fetching finance accounts for tenant: ${tenant_id}`);
  
  try {
    const [accounts] = await pool.query(`
      SELECT l.id, l.vencimento as vencimento, COALESCE(l.descricao, p.nome) as descricao, 
             CASE WHEN l.tipo = 'CR' THEN 'receita' ELSE 'despesa' END as tipo, 
             l.valor as valor, (l.status = 'paga') as pago, l.pessoa_id as pessoa_id, p.nome as pessoa_nome,
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

// --- FINANCIAL ROUTES ---

// Payment Types
app.get("/api/finance/payment-types", authMiddleware, async (req: any, res) => {
  const [data] = await pool.query("SELECT * FROM tipos_pagamento WHERE tenant_id = ?", [req.user.tenant_id]);
  res.json(data);
});

app.post("/api/finance/payment-types", authMiddleware, async (req: any, res) => {
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

app.put("/api/finance/payment-types/:id", authMiddleware, async (req: any, res) => {
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

// Account Categories
app.get("/api/finance/categories", authMiddleware, async (req: any, res) => {
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

app.post("/api/finance/categories", authMiddleware, async (req: any, res) => {
  const { nome, tipo, ativo } = req.body;
  await pool.query(
    "INSERT INTO categorias_contas (tenant_id, nome, tipo, ativo) VALUES (?, ?, ?, ?)",
    [req.user.tenant_id, nome, tipo, ativo !== undefined ? (ativo ? 1 : 0) : 1]
  );
  res.json({ success: true });
});

app.put("/api/finance/categories/:id", authMiddleware, async (req: any, res) => {
  const { id } = req.params;
  const { nome, tipo, ativo } = req.body;
  await pool.query(
    "UPDATE categorias_contas SET nome = ?, tipo = ?, ativo = ? WHERE id = ? AND tenant_id = ?",
    [nome, tipo, ativo ? 1 : 0, id, req.user.tenant_id]
  );
  res.json({ success: true });
});

// Accounts Receivable Settlement (Baixa)
app.post("/api/finance/receivable/:id/pay", authMiddleware, async (req: any, res) => {
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

// Accounts Payable Settlement (Baixa)
app.post("/api/finance/payable/:id/pay", authMiddleware, async (req: any, res) => {
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

// Cashier Management
app.get("/api/finance/cashier/current", authMiddleware, async (req: any, res) => {
  const [caixas] = await pool.query("SELECT * FROM caixa WHERE tenant_id = ? AND status = 'aberto' ORDER BY id DESC LIMIT 1", [req.user.tenant_id]) as any[];
  res.json(caixas[0] || null);
});

app.post("/api/finance/cashier/open", authMiddleware, async (req: any, res) => {
  const { valor_inicial } = req.body;
  const { tenant_id, id: usuario_id } = req.user;

  const [abertoRows] = await pool.query("SELECT id FROM caixa WHERE tenant_id = ? AND status = 'aberto'", [tenant_id]) as any[];
  if (abertoRows.length > 0) return res.status(400).json({ error: "Já existe um caixa aberto" });

  await pool.query(
    "INSERT INTO caixa (tenant_id, usuario_id, valor_inicial, status) VALUES (?, ?, ?, 'aberto')",
    [tenant_id, usuario_id, valor_inicial]
  );
  res.json({ success: true });
});

app.post("/api/finance/cashier/close", authMiddleware, async (req: any, res) => {
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

app.post("/api/finance/cashier/manual-entry", authMiddleware, async (req: any, res) => {
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

app.get("/api/finance/cashier/:id/report", authMiddleware, async (req: any, res) => {
  const { id } = req.params;
  const { tenant_id } = req.user;

  const [caixas] = await pool.query("SELECT * FROM caixa WHERE id = ? AND tenant_id = ?", [id, tenant_id]) as any[];
  const cashier = caixas[0];
  const [movements] = await pool.query("SELECT * FROM movimentacoes_caixa WHERE caixa_id = ? AND tenant_id = ?", [id, tenant_id]);
  
  res.json({ cashier, movements });
});

// Accounts Receivable Registration
app.post("/api/finance/receivable", authMiddleware, async (req: any, res) => {
  const { pessoa_id, categoria_id, vencimento, valor, descricao, local } = req.body;
  const pId = pessoa_id === '' ? null : pessoa_id;
  const cId = categoria_id === '' ? null : categoria_id;
  await pool.query(
    "INSERT INTO lancamentos (tenant_id, tipo, pessoa_id, categoria_id, vencimento, valor, descricao, local) VALUES (?, 'CR', ?, ?, ?, ?, ?, ?)",
    [req.user.tenant_id, pId, cId, vencimento.slice(0, 19).replace('T', ' '), valor, descricao, local || 'Contas a Receber']
  );
  res.json({ success: true });
});

// Accounts Payable Registration
app.post("/api/finance/payable", authMiddleware, async (req: any, res) => {
  const { pessoa_id, categoria_id, vencimento, valor, descricao, local } = req.body;
  const pId = pessoa_id === '' ? null : pessoa_id;
  const cId = categoria_id === '' ? null : categoria_id;
  await pool.query(
    "INSERT INTO lancamentos (tenant_id, tipo, pessoa_id, categoria_id, vencimento, valor, descricao, local) VALUES (?, 'CP', ?, ?, ?, ?, ?, ?)",
    [req.user.tenant_id, pId, cId, vencimento.slice(0, 19).replace('T', ' '), valor, descricao, local || 'Caixa']
  );
  res.json({ success: true });
});

// Vite Integration
async function startServer() {
  const PORT = 3000;

  if (process.env.NODE_ENV !== "production") {
    try {
      const vite = await createViteServer({
        server: { middlewareMode: true },
        appType: "spa",
      });
      app.use(vite.middlewares);

      // SPA Fallback for Dev
      app.use("*", async (req, res, next) => {
        const url = req.originalUrl;
        if (url.startsWith("/api")) return next();
        try {
          let template = fs.readFileSync(path.resolve(process.cwd(), "index.html"), "utf-8");
          template = await vite.transformIndexHtml(url, template);
          res.status(200).set({ "Content-Type": "text/html" }).end(template);
        } catch (e) {
          vite.ssrFixStacktrace(e as Error);
          next(e);
        }
      });
    } catch (err) {
      console.error("Vite failed to start:", err);
    }
  } else {
    // Production static serving
    const distPath = path.resolve(process.cwd(), "dist");
    if (fs.existsSync(distPath)) {
      app.use(express.static(distPath));
      app.get("*", (req, res) => {
        res.sendFile(path.resolve(distPath, "index.html"));
      });
    } else {
      console.warn("Production build (dist/) not found. Serving index.html from root.");
      app.use(express.static(process.cwd()));
      app.get("*", (req, res) => {
        res.sendFile(path.resolve(process.cwd(), "index.html"));
      });
    }
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://0.0.0.0:${PORT} in ${process.env.NODE_ENV || 'development'} mode`);
  });
}

startServer().catch(err => {
  console.error("Failed to start server:", err);
  process.exit(1);
});
