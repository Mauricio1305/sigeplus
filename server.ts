import express from "express";
import { createServer as createViteServer } from "vite";
import cors from "cors";
import jwt from "jsonwebtoken";
import bcrypt from "bcryptjs";
import pg from "pg";
import nodemailer from "nodemailer";
import fs from "fs";

// Fix for timestamp timezone issues: return raw strings from PG
pg.types.setTypeParser(1114, (stringValue) => stringValue);
import path from "path";
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
  throw new Error(`Critical: Missing database environment variables: ${missingEnvVars.join(', ')}`);
}

const pgPool = new pg.Pool({
  host: process.env.DB_HOST,
  user: process.env.DB_USER,
  password: process.env.DB_PASS,
  database: process.env.DB_NAME,
  port: parseInt(process.env.DB_PORT || "5432"),
  max: 20,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 5000,
});
console.log("PostgreSQL pool initialized.");

const processQuery = (sql: string) => {
  let processed = sql;
  
  // Year/Month extraction
  processed = processed.replace(/\bYEAR\s*\((.*?)\)/gi, 'EXTRACT(YEAR FROM $1)');
  processed = processed.replace(/\bMONTH\s*\((.*?)\)/gi, 'EXTRACT(MONTH FROM $1)');
  
  // Date formatting
  processed = processed.replace(/\bDATE_FORMAT\s*\(([^,]+),\s*(['"][^'"]+['"])\)/gi, (match, col, fmt) => {
    const cleanFmt = fmt.replace(/['"]/g, '');
    const map: Record<string, string> = {
      '%m': 'MM',
      '%Y-%m': 'YYYY-MM',
      '%d/%m/%Y': 'DD/MM/YYYY',
      '%Y': 'YYYY',
      '%H:%i': 'HH24:MI',
      '%H:%i:%s': 'HH24:MI:SS'
    };
    return `TO_CHAR(${col}, '${map[cleanFmt] || cleanFmt}')`;
  });
  
  // Current date/time
  processed = processed.replace(/\bCURDATE\s*\(\)/gi, 'CURRENT_DATE');
  processed = processed.replace(/\bNOW\s*\(\)/gi, 'CURRENT_TIMESTAMP');
  
  // Conversions for migrations
  processed = processed.replace(/AUTOINCREMENT/gi, 'SERIAL');
  processed = processed.replace(/DATETIME/gi, 'TIMESTAMP');
  processed = processed.replace(/INTEGER PRIMARY KEY AUTO_INCREMENT/gi, 'SERIAL PRIMARY KEY');
  processed = processed.replace(/BOOLEAN DEFAULT 1/gi, 'BOOLEAN DEFAULT true');
  processed = processed.replace(/BOOLEAN DEFAULT 0/gi, 'BOOLEAN DEFAULT false');

  // Metadata queries for PG
  const trimmed = processed.trim().toUpperCase();
  if (trimmed.startsWith('SHOW COLUMNS FROM ')) {
    const tableMatch = processed.match(/FROM\s+([a-zA-Z0-9_]+)/i);
    if (tableMatch) {
      processed = `SELECT column_name as "Field", data_type as "Type", is_nullable as "Null", column_default as "Default" FROM information_schema.columns WHERE table_name = '${tableMatch[1]}'`;
    }
  }
  if (trimmed.startsWith('SHOW TABLES LIKE ')) {
    const tableMatch = processed.match(/LIKE\s+'([^']+)'/i);
    if (tableMatch) {
      processed = `SELECT table_name FROM information_schema.tables WHERE table_name = '${tableMatch[1]}'`;
    }
  }
  
  return processed;
};

const pool = {
  async query(sql: string, params?: any[]) {
    const processedSql = processQuery(sql);
    let idx = 1;
    const finalSqlWithParams = processedSql.replace(/\?/g, () => `$${idx++}`);
    
    // Auto-append RETURNING id for simple SINGLE INSERTs if not present
    let finalSql = finalSqlWithParams;
    const isSingleInsert = finalSqlWithParams.trim().toUpperCase().startsWith('INSERT ') && !finalSqlWithParams.includes(';');
    if (isSingleInsert && !finalSqlWithParams.toUpperCase().includes('RETURNING')) {
      finalSql = `${finalSqlWithParams} RETURNING id`;
    }

    try {
      const result = await pgPool.query(finalSql, params);
      if (isSingleInsert) {
        return [{ insertId: result.rows[0]?.id || 0, affectedRows: result.rowCount }, result.fields];
      }
      return [result.rows, result.fields];
    } catch (err: any) {
      // Avoid printing repetitive migration errors for existing columns
      if (err.message.includes('already exists')) {
        return [[], []];
      }
      throw err;
    }
  },
  async getConnection() {
    const client = await pgPool.connect();
    return {
      async query(sql: string, params?: any[]) {
        const processedSql = processQuery(sql);
        let idx = 1;
        const finalSqlWithParams = processedSql.replace(/\?/g, () => `$${idx++}`);
        
        let finalSql = finalSqlWithParams;
        const isSingleInsert = finalSqlWithParams.trim().toUpperCase().startsWith('INSERT ') && !finalSqlWithParams.includes(';');
        if (isSingleInsert && !finalSqlWithParams.toUpperCase().includes('RETURNING')) {
          finalSql = `${finalSqlWithParams} RETURNING id`;
        }

        const result = await client.query(finalSql, params);
        if (isSingleInsert) {
          return [{ insertId: result.rows[0]?.id || 0, affectedRows: result.rowCount }, result.fields];
        }
        return [result.rows, result.fields];
      },
      async beginTransaction() { await client.query('BEGIN'); },
      async commit() { await client.query('COMMIT'); },
      async rollback() { await client.query('ROLLBACK'); },
      release() { client.release(); }
    };
  }
};


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

    const schemaPath = path.join(process.cwd(), "schema-pg.sql");
    if (fs.existsSync(schemaPath)) {
      const schema = fs.readFileSync(schemaPath, "utf8");
      await pool.query(schema);
      console.log("Database initialized with schema-pg.sql");
    } else {
      console.error("schema-pg.sql not found at", schemaPath);
    }

    // Migrations for existing tables
    try {
      // Helper to check columns
      const getColumns = async (tableName: string) => {
        const [rows] = await pool.query("SELECT column_name as field FROM information_schema.columns WHERE table_name = ?", [tableName]) as any[];
        return (rows as any[]).map(r => r.field);
      };

      // Check if 'clientes' exists and rename to 'pessoas'
      const checkTable = async (tableName: string) => {
        const [rows] = await pool.query("SELECT table_name FROM information_schema.tables WHERE table_name = ?", [tableName]) as any[];
        return (rows as any[]).length > 0;
      };

      if (await checkTable('clientes')) {
        await pool.query("ALTER TABLE clientes RENAME TO pessoas");
        console.log("Renamed clientes to pessoas");
      }

      const vendasColNames = await getColumns('vendas');
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
        await pool.query(`ALTER TABLE vendas ADD COLUMN origem VARCHAR(50) DEFAULT 'Balcao'`);
      }

      const empresasColNames = await getColumns('empresas');
      if (!empresasColNames.includes('whatsapp')) {
        await pool.query("ALTER TABLE empresas ADD COLUMN whatsapp VARCHAR(20)");
      }
      if (!empresasColNames.includes('whatsapp_api_url')) {
        await pool.query("ALTER TABLE empresas ADD COLUMN whatsapp_api_url VARCHAR(255)");
      }
      if (!empresasColNames.includes('whatsapp_api_key')) {
        await pool.query("ALTER TABLE empresas ADD COLUMN whatsapp_api_key VARCHAR(255)");
      }
      if (!empresasColNames.includes('whatsapp_instance')) {
        await pool.query("ALTER TABLE empresas ADD COLUMN whatsapp_instance VARCHAR(100)");
      }
      if (!empresasColNames.includes('whatsapp_msg_agendamento')) {
        await pool.query("ALTER TABLE empresas ADD COLUMN whatsapp_msg_agendamento TEXT");
      }
      if (!empresasColNames.includes('email_host')) {
        await pool.query("ALTER TABLE empresas ADD COLUMN email_host VARCHAR(255)");
      }
      if (!empresasColNames.includes('email_port')) {
        await pool.query("ALTER TABLE empresas ADD COLUMN email_port INTEGER");
      }
      if (!empresasColNames.includes('email_user')) {
        await pool.query("ALTER TABLE empresas ADD COLUMN email_user VARCHAR(255)");
      }
      if (!empresasColNames.includes('email_pass')) {
        await pool.query("ALTER TABLE empresas ADD COLUMN email_pass VARCHAR(255)");
      }
      if (!empresasColNames.includes('email_from')) {
        await pool.query("ALTER TABLE empresas ADD COLUMN email_from VARCHAR(255)");
      }
      if (!empresasColNames.includes('email_msg_agendamento')) {
        await pool.query("ALTER TABLE empresas ADD COLUMN email_msg_agendamento TEXT");
      }
      if (!empresasColNames.includes('whatsapp_automatico')) {
        await pool.query("ALTER TABLE empresas ADD COLUMN whatsapp_automatico BOOLEAN DEFAULT FALSE");
      }
      if (!empresasColNames.includes('email_automatico')) {
        await pool.query("ALTER TABLE empresas ADD COLUMN email_automatico BOOLEAN DEFAULT FALSE");
      }
      
      // Tabela de Log de Notificações
      await pool.query(`
        CREATE TABLE IF NOT EXISTS notificacoes (
          id SERIAL PRIMARY KEY,
          tenant_id VARCHAR(255) NOT NULL,
          agenda_id INTEGER,
          tipo VARCHAR(20) NOT NULL, -- 'whatsapp', 'email'
          destino VARCHAR(100),
          status VARCHAR(20) DEFAULT 'pendente', -- 'pendente', 'enviado', 'erro'
          mensagem TEXT,
          erro_log TEXT,
          contexto VARCHAR(20), -- 'confirmacao', 'lembrete'
          data_prevista TIMESTAMP,
          tentativas INTEGER DEFAULT 0,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          enviado_at TIMESTAMP
        )
      `);

      await pool.query(`
        CREATE TABLE IF NOT EXISTS cron_logs (
          id SERIAL PRIMARY KEY,
          status VARCHAR(20),
          processed_count INTEGER,
          error_message TEXT,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
      `);
      
      // Fix tenant_id type if it was created as INTEGER
      try {
        await pool.query("ALTER TABLE notificacoes ALTER COLUMN tenant_id TYPE VARCHAR(255)");
        await pool.query("ALTER TABLE notificacoes ADD COLUMN IF NOT EXISTS contexto VARCHAR(20)");
        await pool.query("ALTER TABLE notificacoes ADD COLUMN IF NOT EXISTS data_prevista TIMESTAMP");
      } catch (e) {
        // Migration might fail if already exists or other reasons, but it's safe to try
      }
      
      if (!empresasColNames.includes('plano_id')) {
        await pool.query("ALTER TABLE empresas ADD COLUMN plano_id INTEGER");
      }
      if (!empresasColNames.includes('status_assinatura')) {
        await pool.query(`ALTER TABLE empresas ADD COLUMN status_assinatura VARCHAR(50) DEFAULT 'ativo'`);
      }
      if (!empresasColNames.includes('vencimento_assinatura')) {
        await pool.query(`ALTER TABLE empresas ADD COLUMN vencimento_assinatura TIMESTAMP`);
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

      // Stripe Logs table migration
      await pool.query(`
        CREATE TABLE IF NOT EXISTS stripe_logs (
          id SERIAL PRIMARY KEY,
          tenant_id VARCHAR(255),
          stripe_event_id VARCHAR(255) UNIQUE,
          event_type VARCHAR(255) NOT NULL,
          status VARCHAR(50),
          payload JSONB,
          previous_attributes JSONB,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
      `);

      const stripeLogCols = await getColumns('stripe_logs');
      if (!stripeLogCols.includes('stripe_event_id')) {
        await pool.query(`ALTER TABLE stripe_logs ADD COLUMN stripe_event_id VARCHAR(255) UNIQUE`);
      }
      if (!stripeLogCols.includes('tenant_id')) {
        await pool.query("ALTER TABLE stripe_logs ADD COLUMN tenant_id VARCHAR(255)");
      }
      console.log("Verified stripe_logs table existence and columns");

      const osColNames = await getColumns('ordens_servico');
      if (!osColNames.includes('sequencial_id')) {
        await pool.query(`ALTER TABLE ordens_servico ADD COLUMN sequencial_id INTEGER`);
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

      await pool.query(`
        CREATE TABLE IF NOT EXISTS grupos_usuarios (
          id SERIAL PRIMARY KEY,
          tenant_id VARCHAR(255) NOT NULL,
          nome VARCHAR(255) NOT NULL,
          is_master SMALLINT DEFAULT 0,
          permissoes JSONB,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          FOREIGN KEY (tenant_id) REFERENCES empresas(tenant_id) ON DELETE CASCADE
        )
      `);

      await pool.query(`
        CREATE TABLE IF NOT EXISTS grupos_produtos (
          id SERIAL PRIMARY KEY,
          tenant_id VARCHAR(255) NOT NULL,
          nome VARCHAR(255) NOT NULL,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          FOREIGN KEY (tenant_id) REFERENCES empresas(tenant_id) ON DELETE CASCADE
        )
      `);

      await pool.query(`
        CREATE TABLE IF NOT EXISTS layouts_etiquetas (
          id SERIAL PRIMARY KEY,
          tenant_id VARCHAR(255) NOT NULL,
          nome VARCHAR(255) NOT NULL,
          largura DECIMAL(10,2) DEFAULT 0,
          altura DECIMAL(10,2) DEFAULT 0,
          colunas INTEGER DEFAULT 1,
          json_config JSONB,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          FOREIGN KEY (tenant_id) REFERENCES empresas(tenant_id) ON DELETE CASCADE
        )
      `);

      const tableList = ['planos', 'empresas', 'pessoas', 'tipos_pagamento', 'lancamentos', 'vendas', 'vendas_itens', 'ordens_servico', 'produtos', 'movimentacoes_caixa', 'categorias_contas', 'usuarios'];
      for (const table of tableList) {
        const [info] = await pool.query(`SHOW COLUMNS FROM ${table}`) as any[];
        const columns = (info as any[]).map((c: any) => c.Field);
        
        if (table === 'planos') {
          if (!columns.includes('modulos')) {
            await pool.query("ALTER TABLE planos ADD COLUMN modulos JSON");
            console.log("Added modulos column to planos table");
          }
          if (!columns.includes('is_trial')) {
            await pool.query("ALTER TABLE planos ADD COLUMN is_trial SMALLINT DEFAULT 0");
            console.log("Added is_trial column to planos table");
          }
          if (!columns.includes('trial_days')) {
            await pool.query("ALTER TABLE planos ADD COLUMN trial_days INTEGER DEFAULT NULL");
            console.log("Added trial_days column to planos table");
          }
          // Always ensure NULL modulos are set to a default (helpful for existing data)
          const defaultModules = JSON.stringify([
            'financeiro', 'vendas', 'pdv', 'estoque', 'cadastros', 'configuracoes', 
            'agenda', 'os', 'mesas', 'export_excel', 'import_produtos', 'lembrete_email', 'lembrete_whatsapp'
          ]);
          await pool.query("UPDATE planos SET modulos = ? WHERE modulos IS NULL", [defaultModules]);
          // Also update existing plans that have modulos but are missing the new ones
          const [currentPlans] = await pool.query("SELECT id, modulos FROM planos") as any[];
          for (const p of currentPlans) {
            let mods = [];
            try { 
              mods = typeof p.modulos === 'string' ? JSON.parse(p.modulos) : (p.modulos || []);
            } catch (e) { mods = []; }
            
            let updated = false;
            if (!mods.includes('lembrete_email')) { mods.push('lembrete_email'); updated = true; }
            if (!mods.includes('lembrete_whatsapp')) { mods.push('lembrete_whatsapp'); updated = true; }
            if (!mods.includes('os')) { mods.push('os'); updated = true; }
            if (!mods.includes('mesas')) { mods.push('mesas'); updated = true; }

            if (updated) {
              await pool.query("UPDATE planos SET modulos = ? WHERE id = ?", [JSON.stringify(mods), p.id]);
            }
          }
        }
        if (table === 'produtos') {
          if (!columns.includes('tempo_execucao')) {
            await pool.query("ALTER TABLE produtos ADD COLUMN tempo_execucao INTEGER DEFAULT 0");
            console.log("Added tempo_execucao to produtos table");
          }
        }
        if (table === 'usuarios') {
          if (!columns.includes('avatar')) {
            try {
              await pool.query("ALTER TABLE usuarios ADD COLUMN avatar LONGTEXT");
            } catch (e: any) { console.warn("Failed to add avatar:", e.message); }
          }
          if (!columns.includes('grupo_id')) {
            try {
              await pool.query('ALTER TABLE usuarios ADD COLUMN grupo_id INTEGER');
              await pool.query('ALTER TABLE usuarios ADD FOREIGN KEY (grupo_id) REFERENCES grupos_usuarios(id) ON DELETE SET NULL');
            } catch (e: any) { console.warn("Failed to add grupo_id:", e.message); }

            const masterPermissoes = JSON.stringify({
              financeiro: { acessar: true, lancar: true, editar: true, cancelar: true, estornar: true },
              vendas: { acessar: true, lancar: true, cancelar: true, relatorios: true },
              pdv: { acessar: true, vender: true, cancelar: true },
              estoque: { acessar: true, editar: true, excluir: true },
              cadastros: { acessar: true, editar: true, excluir: true },
              configuracoes: { acessar: true, editar: true }
            });

            // Seed master groups
            const [empresas] = await pool.query('SELECT tenant_id FROM empresas');
            for (const emp of (empresas as any[])) {
              try {
                // Check if already exists to avoid unique constraint if any (id) or duplicates
                const [existing] = await pool.query("SELECT id FROM grupos_usuarios WHERE tenant_id = ? AND is_master = 1", [emp.tenant_id]);
                if ((existing as any[]).length === 0) {
                  const [res] = await pool.query(
                    "INSERT INTO grupos_usuarios (tenant_id, nome, is_master, permissoes) VALUES (?, 'Master', 1, ?)",
                    [emp.tenant_id, masterPermissoes]
                  ) as any[];
                  await pool.query("UPDATE usuarios SET grupo_id = ? WHERE tenant_id = ? AND perfil IN ('admin', 'superadmin')", [res.insertId, emp.tenant_id]);
                }
              } catch (e: any) { console.warn(`Failed to seed master group for ${emp.tenant_id}:`, e.message); }
            }
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
          if (!columns.includes('status')) await pool.query(`ALTER TABLE ${table} ADD COLUMN status VARCHAR(20) DEFAULT 'paga'`);
          if (!columns.includes('cancelado_em')) await pool.query(`ALTER TABLE ${table} ADD COLUMN cancelado_em TIMESTAMP NULL DEFAULT NULL`);
          if (!columns.includes('cancelado_por')) await pool.query(`ALTER TABLE ${table} ADD COLUMN cancelado_por INTEGER`);
          if (!columns.includes('motivo_cancelamento')) await pool.query(`ALTER TABLE ${table} ADD COLUMN motivo_cancelamento TEXT`);
        }
        if (table === 'empresas') {
          if (!columns.includes('logo')) await pool.query("ALTER TABLE empresas ADD COLUMN logo LONGTEXT");
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
          if (!columns.includes('data_aniversario')) await pool.query("ALTER TABLE pessoas ADD COLUMN data_aniversario DATE");
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
          if (!columns.includes('cancelado_em')) await pool.query(`ALTER TABLE ${table} ADD COLUMN cancelado_em TIMESTAMP NULL DEFAULT NULL`);
          if (!columns.includes('cancelado_por')) await pool.query(`ALTER TABLE ${table} ADD COLUMN cancelado_por INTEGER`);
          if (!columns.includes('motivo_cancelamento')) await pool.query(`ALTER TABLE ${table} ADD COLUMN motivo_cancelamento TEXT`);
          if (!columns.includes('estornado_em')) await pool.query(`ALTER TABLE ${table} ADD COLUMN estornado_em TIMESTAMP NULL DEFAULT NULL`);
          if (!columns.includes('estornado_por')) await pool.query(`ALTER TABLE ${table} ADD COLUMN estornado_por INTEGER`);
          if (!columns.includes('motivo_estorno')) await pool.query(`ALTER TABLE ${table} ADD COLUMN motivo_estorno TEXT`);
        }
        if (table === 'vendas' || table === 'ordens_servico') {
          if (columns.includes('cliente_id')) await pool.query(`ALTER TABLE ${table} CHANGE COLUMN cliente_id pessoa_id INTEGER`);
        }
        if (table === 'produtos') {
          if (!columns.includes('grupo_id')) {
            await pool.query("ALTER TABLE produtos ADD COLUMN grupo_id INTEGER");
            await pool.query("ALTER TABLE produtos ADD FOREIGN KEY (grupo_id) REFERENCES grupos_produtos(id) ON DELETE SET NULL");
          }
          if (!columns.includes('foto')) await pool.query("ALTER TABLE produtos ADD COLUMN foto LONGTEXT");
          if (!columns.includes('marca')) await pool.query("ALTER TABLE produtos ADD COLUMN marca VARCHAR(255)");
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
          id SERIAL PRIMARY KEY,
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
    try {
      const [plans] = await pool.query("SELECT id FROM planos") as any[];
      if (plans.length === 0) {
        console.log("Seeding default plans...");
        const defaultModules = JSON.stringify([
          'financeiro', 'vendas', 'pdv', 'estoque', 'cadastros', 'configuracoes', 
          'agenda', 'os', 'mesas', 'export_excel', 'import_produtos', 'lembrete_email', 'lembrete_whatsapp'
        ]);
        await pool.query("INSERT INTO planos (nome, valor_mensal, limite_usuarios, modulos, is_trial, trial_days) VALUES (?, ?, ?, ?, ?, ?)", 
          ['Plano Trial', 0, 1, defaultModules, 1, 7]);
        await pool.query("INSERT INTO planos (nome, valor_mensal, limite_usuarios, modulos, is_trial) VALUES (?, ?, ?, ?, ?)", 
          ['Plano Pro', 99.90, 10, defaultModules, 0]);
        console.log("Default plans seeded.");
      }
    } catch (e: any) {
      console.error("Error seeding plans:", e.message);
    }

      // Ensure "Grupo Padrão" exists for all tenants
      const [tenantsQuery] = await pool.query("SELECT DISTINCT tenant_id FROM empresas") as any[];
      for (const t of tenantsQuery) {
        const [grupos] = await pool.query("SELECT id FROM grupos_produtos WHERE tenant_id = ? AND nome = 'Grupo Padrão'", [t.tenant_id]) as any[];
        if (grupos.length === 0) {
          const [result] = await pool.query("INSERT INTO grupos_produtos (tenant_id, nome) VALUES (?, ?)", [t.tenant_id, 'Grupo Padrão']) as any[];
          // update existing products without a group to this group
          await pool.query("UPDATE produtos SET grupo_id = ? WHERE tenant_id = ? AND grupo_id IS NULL", [result.insertId, t.tenant_id]);
        }
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
      await pool.query("INSERT INTO empresas (tenant_id, nome_fantasia, email, status_assinatura) VALUES (?, ?, ?, ?)", ['system', 'Sige Plus', 'admin@saas.com', 'ativo']);
    }

    const [existingAdmin] = await pool.query("SELECT * FROM usuarios WHERE email = 'admin@saas.com'") as any[];
    if ((existingAdmin as any[]).length === 0) {
      await pool.query("INSERT INTO usuarios (tenant_id, nome, email, senha, perfil) VALUES (?, ?, ?, ?, ?)", ['system', 'Super Admin', 'admin@saas.com', hashedAdminPass, 'superadmin']);
    } else {
      // Fix potential profile override from previous turns
      await pool.query("UPDATE usuarios SET perfil = 'superadmin' WHERE email = 'admin@saas.com'");
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
});

const authLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: 20, // Limit each IP to 20 auth attempts per hour
  message: { error: "Muitas tentativas desse IP, favor tentar novamente após uma hora." },
  standardHeaders: true,
  legacyHeaders: false,
  skipSuccessfulRequests: true,
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
    const payloadStr = JSON.stringify(event);
    const previousAttributesStr = event.data.previous_attributes ? JSON.stringify(event.data.previous_attributes) : null;
    let tenant_id = null;
    let logStatus = 'processado';
    
    const obj = event.data.object as any;
    if (obj.client_reference_id) {
       tenant_id = obj.client_reference_id;
    } else if (obj.customer) {
       const [companies] = await pool.query("SELECT tenant_id FROM empresas WHERE stripe_customer_id = ?", [obj.customer]) as any[];
       if (companies.length > 0) {
         tenant_id = companies[0].tenant_id;
       }
    }

    // Identify special status
    if (event.type === 'customer.subscription.deleted') {
      logStatus = 'cancelamento_efetivado';
    } else if (
      (event.type === 'customer.subscription.updated' || event.type === 'customer.subscription.created') && 
      (obj.cancel_at_period_end || obj.cancel_at || obj.cancellation_details?.reason === 'cancellation_requested')
    ) {
      logStatus = 'cancelamento_solicitado';
    } else if (event.type === 'customer.subscription.updated' && event.data.previous_attributes) {
      const prev = event.data.previous_attributes as any;
      if (prev.cancel_at_period_end || prev.cancel_at || prev.cancellation_details?.reason === 'cancellation_requested') {
        logStatus = 'renovacao_assinatura';
      }
    }

    console.log(`Stripe Webhook: Processing ${event.type} for tenant ${tenant_id}. Status detected: ${logStatus}`);
    
    // Log details about the event for debugging
    if (!tenant_id) {
       console.warn(`Stripe Webhook Warning: Could not resolve tenant_id for event ${event.id} (${event.type})`);
    }

    try {
      // Use standard JSON.stringify but wrap in try-catch to avoid blocking the whole webhook
      let safePayload = null;
      let safePrev = null;
      try {
        safePayload = JSON.stringify(event);
        safePrev = event.data.previous_attributes ? JSON.stringify(event.data.previous_attributes) : null;
      } catch (jsonErr: any) {
        console.error("Stripe Webhook Error serializing event data:", jsonErr.message);
        // Fallback to simple description if full stringification fails
        safePayload = JSON.stringify({ id: event.id, type: event.type, error: "Failed to stringify full event" });
      }

      await pool.query(
        "INSERT INTO stripe_logs (tenant_id, stripe_event_id, event_type, status, payload, previous_attributes) VALUES (?, ?, ?, ?, ?, ?)",
        [tenant_id, event.id, event.type, logStatus, safePayload, safePrev]
      );
      console.log(`Stripe Webhook: Log record created in database (Event: ${event.id})`);
    } catch(e: any) {
      if (e.message.includes('unique') || e.message.includes('Duplicate')) {
        console.warn(`Stripe Webhook: Event ${event.id} is a duplicate, skipping log entry.`);
        return res.json({ received: true, ignored: 'duplicate' });
      } else {
        console.error("Stripe Webhook CRITICAL: Database error inserting log:", e.message);
        console.error("Stack trace:", e.stack);
      }
    }

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

            // Prefer subscription current_period_end if available, fallback to 30 days
            let vencimento = new Date();
            if (subscription && subscription.current_period_end) {
              vencimento = new Date(subscription.current_period_end * 1000);
            } else {
              vencimento.setDate(vencimento.getDate() + 30);
            }

            let status = 'ativo';
            if (subscription.cancel_at_period_end || subscription.cancel_at || (subscription.cancellation_details && subscription.cancellation_details.reason === 'cancellation_requested')) {
              status = 'Cancelamento Solicitado';
            }

            await pool.query(
              "UPDATE empresas SET stripe_customer_id = ?, stripe_subscription_id = ?, stripe_price_id = ?, plano_id = ?, status_assinatura = ?, vencimento_assinatura = ? WHERE tenant_id = ?",
              [customerId, subscriptionId, priceId, plano_id, status, vencimento, tenant_id]
            );
            console.log(`Webhook: Updated company ${tenant_id} to plan ${plano_id} with status ${status} and expiry ${vencimento}`);
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
            let vencimento = new Date();
            if (subscription.current_period_end) {
               vencimento = new Date(subscription.current_period_end * 1000);
            }
            if (isNaN(vencimento.getTime())) {
               vencimento = new Date();
               vencimento.setDate(vencimento.getDate() + 30);
            }
            
            let status = 'ativo';
            if (subscription.cancel_at_period_end || subscription.cancel_at) {
              status = 'Cancelamento Solicitado';
            }

            await pool.query(
              "UPDATE empresas SET status_assinatura = ?, vencimento_assinatura = ? WHERE stripe_subscription_id = ?",
              [status, vencimento, subscriptionId]
            );
            console.log(`Webhook: Payment succeeded for subscription ${subscriptionId}. Status: ${status}, Expiry: ${vencimento}`);
          }
        } catch (err: any) {
          console.error("Webhook Error in invoice.payment_succeeded:", err.message);
        }
        break;
      }
      case 'invoice.payment_failed': {
        try {
          const invoice = event.data.object as any;
          if (invoice.subscription) {
            const subscriptionId = invoice.subscription as string;
            await pool.query(
              "UPDATE empresas SET status_assinatura = 'pagamento_falhou' WHERE stripe_subscription_id = ?",
              [subscriptionId]
            );
            console.log(`Webhook: Payment failed for subscription ${subscriptionId}. Status set to pagamento_falhou`);
          }
        } catch (err: any) {
          console.error("Webhook Error in invoice.payment_failed:", err.message);
        }
        break;
      }
      case 'customer.subscription.updated':
      case 'customer.subscription.deleted': {
        try {
          const subscription = event.data.object as any;
          let status = subscription.status === 'active' ? 'ativo' : 'suspenso';
          
          if (subscription.cancel_at_period_end || subscription.cancel_at || subscription.cancellation_details?.reason === 'cancellation_requested') {
            status = 'Cancelamento Solicitado';
          }

          if (subscription.status === 'canceled' || event.type === 'customer.subscription.deleted') {
            status = 'cancelado';
          }

          // Check for renewal (undoing cancellation)
          if (event.type === 'customer.subscription.updated' && event.data.previous_attributes) {
            const prev = event.data.previous_attributes as any;
            const wasCancelling = prev.cancel_at_period_end || prev.cancel_at || prev.cancellation_details?.reason === 'cancellation_requested';
            const isNotCancelling = !subscription.cancel_at_period_end && !subscription.cancel_at && subscription.cancellation_details?.reason !== 'cancellation_requested';
            
            if (wasCancelling && isNotCancelling && subscription.status === 'active') {
              console.log(`Webhook: Subscription renewal (undo cancellation) detected for ${subscription.id}`);
              status = 'ativo';
            }
          }

          let vencimento = new Date();
          if (subscription.current_period_end) {
             vencimento = new Date(subscription.current_period_end * 1000);
          }
          if (isNaN(vencimento.getTime())) {
             vencimento = new Date();
             vencimento.setDate(vencimento.getDate() + 30);
          }

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
            console.log(`Webhook: Subscription ${subscription.id} updated. Status: ${status}, Vencimento: ${vencimento}`);
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

app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ limit: '50mb', extended: true }));

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

const planMiddleware = (module: string) => {
  return async (req: any, res: any, next: any) => {
    try {
      // Superadmins bypass all restrictions
      if (req.user.perfil === 'superadmin') return next();

      // SYSTEM tenant always has access to everything
      if (req.user.tenant_id === 'system') return next();

      // Dynamic module resolution based on type (for shared routes like sales)
      let currentModule = module;
      if (module === 'vendas' && req.body && req.body.tipo) {
        if (req.body.tipo === 'os') currentModule = 'os';
        if (req.body.tipo === 'comanda') currentModule = 'mesas';
      } else if (module === 'vendas' && req.query && req.query.tipo) {
        if (req.query.tipo === 'os') currentModule = 'os';
        if (req.query.tipo === 'comanda') currentModule = 'mesas';
      }

      const { tenant_id } = req.user;
      const [companies] = await pool.query(`
        SELECT p.modulos, e.status_assinatura, e.vencimento_assinatura 
        FROM empresas e 
        LEFT JOIN planos p ON e.plano_id = p.id 
        WHERE e.tenant_id = ?
      `, [tenant_id]) as any[];
      
      const company = companies[0];
      if (!company) return res.status(404).json({ error: "Empresa não encontrada" });

      // Subscription block logic: 10 days grace period
      let daysSinceExpiration = -1;
      if (company.vencimento_assinatura) {
        const expirationDate = new Date(company.vencimento_assinatura);
        const today = new Date();
        daysSinceExpiration = Math.floor((today.getTime() - expirationDate.getTime()) / (1000 * 60 * 60 * 24));
      }

      // Block if canceled OR if overdue by more than 10 days
      const isBlocked = company.status_assinatura === 'cancelado' || daysSinceExpiration > 10;
      
      if (isBlocked) {
        return res.status(403).json({ 
          error: "Assinatura expirada ou bloqueada. Por favor, regularize seu pagamento para continuar acessando este recurso.",
          blocked: true
        });
      }

      // Check Plan level: verify if the module is allowed in the user's plan
      const allowedModules = company.modulos || [];
      
      let planHasModule = true;
      if (currentModule !== 'dashboard') {
         planHasModule = allowedModules.includes(currentModule);
      }

      if (!planHasModule) {
        return res.status(403).json({ 
          error: `O seu plano atual não possui acesso ao módulo ${currentModule}.`,
          code: 'PLAN_RESTRICTION',
          module: currentModule 
        });
      }

      // Check User level (group permissions)
      // Admins bypass user group restrictions
      if (req.user.perfil === 'admin') return next();

      const userPerms = req.user.permissoes || {};
      
      // We check if the user has `{currentModule}.acessar` == true
      if (!userPerms[currentModule] || !userPerms[currentModule].acessar) {
        return res.status(403).json({ 
          error: `Seu usuário não possui permissão para acessar o módulo ${currentModule}. Contate o administrador.`,
          code: 'USER_RESTRICTION',
          module: currentModule 
        });
      }

      next();
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  };
};

// --- USERS ---
app.get("/api/users", authMiddleware, async (req: any, res) => {
  const { tenant_id } = req.user;
  try {
    const [users] = await pool.query("SELECT id, nome, email, perfil, avatar, ativo FROM usuarios WHERE tenant_id = ? AND ativo = 1", [tenant_id]) as any[];
    res.json(users);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

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
  const { companyName, email, password, name, whatsapp, plano_id } = req.body;

  if (!whatsapp) {
    return res.status(400).json({ error: "O número de WhatsApp é obrigatório para o cadastro." });
  }

  if (!password || password.length < 6) {
    return res.status(400).json({ error: "A senha deve ter pelo menos 6 caracteres." });
  }

  const tenant_id = `tenant_${Date.now()}`;
  
  const connection = await pool.getConnection();
  try {
    const hashedPassword = await bcrypt.hash(password, 10);
    
    await connection.beginTransaction();
    
    if (!plano_id) {
      return res.status(400).json({ error: "Por favor, selecione um plano." });
    }

    const [plans] = await connection.query("SELECT * FROM planos WHERE id = ?", [plano_id]) as any[];
    const plan = plans[0];
    if (!plan) {
      return res.status(400).json({ error: "Plano inválido." });
    }

    let status_assinatura = 'inativo';
    let formattedExpirationDate = '1999-01-01';

    if (plan.is_trial) {
       status_assinatura = 'ativo';
       const expireDate = new Date();
       expireDate.setDate(expireDate.getDate() + (plan.trial_days || 7));
       formattedExpirationDate = expireDate.toISOString().split('T')[0];
    }
    
    // Create Company
    await connection.query(
      "INSERT INTO empresas (tenant_id, nome_fantasia, email, whatsapp, plano_id, status_assinatura, vencimento_assinatura) VALUES (?, ?, ?, ?, ?, ?, ?)",
      [tenant_id, companyName, email, whatsapp || null, plano_id, status_assinatura, formattedExpirationDate]
    );
    
    // Create Admin User
    await connection.query(
      "INSERT INTO usuarios (tenant_id, nome, email, senha, perfil) VALUES (?, ?, ?, ?, ?)",
      [tenant_id, name, email, hashedPassword, 'admin']
    );

    // Create default product group
    await connection.query(
      "INSERT INTO grupos_produtos (tenant_id, nome) VALUES (?, ?)",
      [tenant_id, 'Grupo Padrão']
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
        status_assinatura: status_assinatura,
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
        status_assinatura: status_assinatura,
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

    const [companies] = await pool.query(`
      SELECT e.status_assinatura, e.vencimento_assinatura, e.plano_id, e.stripe_subscription_id, p.modulos 
      FROM empresas e 
      LEFT JOIN planos p ON e.plano_id = p.id 
      WHERE e.tenant_id = ?
    `, [user.tenant_id]) as any[];
    
    let company = companies[0];

    // Auto-repair missing company record
    if (!company) {
      console.log(`Company not found for tenant: ${user.tenant_id}. Repairing...`);
      const [allPlans] = await pool.query("SELECT id FROM planos ORDER BY id ASC LIMIT 1") as any[];
      const defaultPlanId = allPlans[0]?.id || 1;
      
      await pool.query(
        "INSERT INTO empresas (tenant_id, nome_fantasia, email, status_assinatura, plano_id) VALUES (?, ?, ?, ?, ?)",
        [user.tenant_id, 'Minha Empresa', email, 'ativo', defaultPlanId]
      );
      
      const [refetchedCompanies] = await pool.query(`
        SELECT e.status_assinatura, e.vencimento_assinatura, e.plano_id, e.stripe_subscription_id, p.modulos 
        FROM empresas e 
        LEFT JOIN planos p ON e.plano_id = p.id 
        WHERE e.tenant_id = ?
      `, [user.tenant_id]) as any[];
      company = refetchedCompanies[0];
    }

    if (company.stripe_subscription_id) {
      try {
        const stripe = getStripe();
        const subscription = (await stripe.subscriptions.retrieve(company.stripe_subscription_id)) as any;
        
        const stripeStatus = subscription.status;
        const currentPeriodEnd = subscription.current_period_end;
        
        let newVencimento = new Date(currentPeriodEnd * 1000);
        if (isNaN(newVencimento.getTime())) {
          newVencimento = company.vencimento_assinatura ? new Date(company.vencimento_assinatura) : new Date();
        }

        let newStatus = company.status_assinatura;

        if (stripeStatus === 'active' || stripeStatus === 'trialing') {
          if (subscription.cancel_at_period_end) {
            newStatus = 'Cancelamento Solicitado';
          } else {
            newStatus = 'ativo';
          }
        } else if (stripeStatus === 'past_due') {
          newStatus = 'pagamento_pendente';
        } else {
          // Se cancelado no Stripe, verificamos se o vencimento local ainda é válido
          const localVencimento = company.vencimento_assinatura ? new Date(company.vencimento_assinatura) : null;
          if (localVencimento && localVencimento > new Date()) {
            newStatus = 'Cancelamento Solicitado'; // Mantém acesso até expirar
          } else {
            newStatus = 'cancelado';
          }
        }

        if (newStatus !== company.status_assinatura || Math.abs(newVencimento.getTime() - (company.vencimento_assinatura ? new Date(company.vencimento_assinatura).getTime() : 0)) > 3600000) {
          await pool.query(
            "UPDATE empresas SET status_assinatura = ?, vencimento_assinatura = ? WHERE tenant_id = ?",
            [newStatus, newVencimento, user.tenant_id]
          );
          company.status_assinatura = newStatus;
          company.vencimento_assinatura = newVencimento;
        }
      } catch (stripeErr: any) {
        console.warn(`Stripe auto-verification failed for tenant ${user.tenant_id} during login:`, stripeErr.message);
      }
    }

    let permissoes = {};
    if (user.grupo_id) {
      const [grupos] = await pool.query("SELECT permissoes FROM grupos_usuarios WHERE id = ?", [user.grupo_id]) as any[];
      if (grupos.length > 0 && grupos[0].permissoes) {
        permissoes = typeof grupos[0].permissoes === 'string' ? JSON.parse(grupos[0].permissoes) : grupos[0].permissoes;
      }
    }

    const token = jwt.sign(
      { 
        id: user.id, 
        tenant_id: user.tenant_id, 
        perfil: user.perfil, 
        nome: user.nome,
        status_assinatura: company.status_assinatura,
        vencimento_assinatura: company.vencimento_assinatura,
        plano_id: company.plano_id,
        modulos: company.modulos || [],
        permissoes
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
        plano_id: company.plano_id,
        modulos: company.modulos || [],
        permissoes
      } 
    });
  } catch (err: any) {
    console.error(`Detailed login error for ${email}:`, err);
    res.status(500).json({ error: "Erro interno do servidor", details: err.message });
  }
});

app.get("/api/auth/me", authMiddleware, async (req: any, res) => {
  try {
    const [users] = await pool.query("SELECT id, tenant_id, nome, email, perfil, avatar, grupo_id FROM usuarios WHERE id = ?", [req.user.id]) as any[];
    const user = users[0];
    if (!user) return res.status(404).json({ error: "Usuário não encontrado" });

    const [companies] = await pool.query(`
      SELECT e.status_assinatura, e.vencimento_assinatura, e.plano_id, e.stripe_subscription_id, p.modulos 
      FROM empresas e 
      LEFT JOIN planos p ON e.plano_id = p.id 
      WHERE e.tenant_id = ?
    `, [user.tenant_id]) as any[];
    let company = companies[0] || { status_assinatura: 'ativo', vencimento_assinatura: null, plano_id: 1, stripe_subscription_id: null, modulos: [] };

    if (company.stripe_subscription_id) {
       try {
         const stripe = getStripe();
         const subscription = (await stripe.subscriptions.retrieve(company.stripe_subscription_id)) as any;
         
         const nowTime = Math.floor(Date.now() / 1000);
         const stripeStatus = subscription.status;
         const currentPeriodEnd = subscription.current_period_end;
         
         let newVencimento = new Date(currentPeriodEnd * 1000);
         if (isNaN(newVencimento.getTime())) {
           newVencimento = company.vencimento_assinatura ? new Date(company.vencimento_assinatura) : new Date();
         }

         let newStatus = company.status_assinatura;

         if (stripeStatus === 'active' || stripeStatus === 'trialing') {
           if (subscription.cancel_at_period_end) {
             newStatus = 'Cancelamento Solicitado';
           } else {
             newStatus = 'ativo';
           }
         } else if (stripeStatus === 'past_due') {
           newStatus = 'pagamento_pendente';
         } else {
           const localVencimento = company.vencimento_assinatura ? new Date(company.vencimento_assinatura) : null;
           if (localVencimento && localVencimento > new Date()) {
             newStatus = 'Cancelamento Solicitado';
           } else {
             newStatus = 'cancelado';
           }
         }

         if (newStatus !== company.status_assinatura || Math.abs(newVencimento.getTime() - (company.vencimento_assinatura ? new Date(company.vencimento_assinatura).getTime() : 0)) > 3600000) {
           await pool.query(
             "UPDATE empresas SET status_assinatura = ?, vencimento_assinatura = ? WHERE tenant_id = ?",
             [newStatus, newVencimento, user.tenant_id]
           );
           company.status_assinatura = newStatus;
           company.vencimento_assinatura = newVencimento;
         }
       } catch (stripeErr: any) {
         console.warn(`Stripe auto-verification failed for tenant ${user.tenant_id} during auth/me:`, stripeErr.message);
       }
    }

    let permissoes = {};
    if (user.grupo_id) {
      const [grupos] = await pool.query("SELECT permissoes FROM grupos_usuarios WHERE id = ?", [user.grupo_id]) as any[];
      if (grupos.length > 0 && grupos[0].permissoes) {
        permissoes = typeof grupos[0].permissoes === 'string' ? JSON.parse(grupos[0].permissoes) : grupos[0].permissoes;
      }
    }

    res.json({
      user: {
        ...user,
        status_assinatura: company.status_assinatura,
        vencimento_assinatura: company.vencimento_assinatura,
        plano_id: company.plano_id,
        modulos: company.modulos || [],
        permissoes
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
    
    if (customerId) {
      try {
        await stripe.customers.retrieve(customerId);
      } catch (err: any) {
        if (err.type === 'StripeInvalidRequestError' && err.message.includes('No such customer')) {
          customerId = null;
        } else {
          throw err;
        }
      }
    }
    
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
      success_url: `${process.env.APP_URL || 'http://localhost:3000'}/stripe/success?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${process.env.APP_URL || 'http://localhost:3000'}/subscription?canceled=true`,
      client_reference_id: tenant_id,
    });

    console.log(`Stripe Checkout Session created for tenant ${tenant_id}: ${session.url}`);
    res.json({ url: session.url });
  } catch (err: any) {
    if (err.type === 'StripeInvalidRequestError' && err.message.includes('No such price')) {
      return res.status(400).json({ error: "O plano selecionado não existe no Stripe. Verifique as configurações de preço no painel administrativo." });
    }
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

    try {
      const session = await stripe.billingPortal.sessions.create({
        customer: company.stripe_customer_id,
        return_url: `${process.env.APP_URL || 'http://localhost:3000'}/stripe-portal-return`,
      });

      res.json({ url: session.url });
    } catch (err: any) {
      if (err.type === 'StripeInvalidRequestError' && err.message.includes('No such customer')) {
        await pool.query("UPDATE empresas SET stripe_customer_id = NULL, stripe_subscription_id = NULL, status_assinatura = 'cancelado' WHERE tenant_id = ?", [tenant_id]);
        return res.status(400).json({ error: "Cliente não encontrado no Stripe. A assinatura foi cancelada localmente." });
      }
      throw err;
    }
  } catch (err: any) {
    console.error("Stripe Portal Error:", err);
    res.status(500).json({ error: err.message });
  }
});

app.post("/api/stripe/verify-session", async (req: any, res) => {
  const { sessionId } = req.body;

  try {
    const stripe = getStripe();
    const session = await stripe.checkout.sessions.retrieve(sessionId);

    if (session.payment_status === 'paid') {
      const customerId = session.customer as string;
      const subscriptionId = session.subscription as string;
      
      let tenant_id = session.client_reference_id;

      if (!tenant_id && session.customer_details?.email) {
        const [users] = await pool.query("SELECT tenant_id FROM usuarios WHERE email = ?", [session.customer_details.email]) as any[];
        if (users.length > 0) {
          tenant_id = users[0].tenant_id;
        }
      }

      if (!tenant_id && customerId) {
        const [empresas] = await pool.query("SELECT tenant_id FROM empresas WHERE stripe_customer_id = ?", [customerId]) as any[];
        if (empresas.length > 0) {
          tenant_id = empresas[0].tenant_id;
        }
      }

      if (!tenant_id) {
        // Fallback: Check if there's an authenticated user via optional auth header
        const authHeader = req.headers.authorization;
        if (authHeader) {
           try {
             const token = authHeader.split(' ')[1];
             const decoded = jwt.verify(token, process.env.JWT_SECRET || 'secret') as any;
             tenant_id = decoded.tenant_id;
           } catch(e) {}
        }
      }

      let priceId: string;
      let vencimento = new Date();
      vencimento.setDate(vencimento.getDate() + 30); // fallback of 30 days
      
      if (subscriptionId) {
        const subscription = await stripe.subscriptions.retrieve(subscriptionId) as any;
        priceId = subscription.items.data[0].price.id;
        if (subscription.current_period_end) {
          vencimento = new Date(subscription.current_period_end * 1000);
        }
      } else {
        const lineItems = await stripe.checkout.sessions.listLineItems(sessionId);
        priceId = lineItems.data[0]?.price?.id || '';
      }

      // Map price ID to plan ID from database
      const [plans] = await pool.query("SELECT id FROM planos WHERE stripe_price_id = ?", [priceId]) as any[];
      let plano_id = plans[0]?.id || 1;

      if (plans.length === 0) {
        console.warn(`Verify Session: Price ID "${priceId}" not found in database. Defaulting to plan 1.`);
      }

      let tokenToReturn = null;
      let userObj = null;

      if (!tenant_id && session.customer_details?.email) {
        // Auto create tenant and user if not found
        const email = session.customer_details.email;
        const nome = session.customer_details.name || email.split('@')[0];
        tenant_id = `t_${Date.now()}`;
        
        await pool.query(
          "INSERT INTO empresas (tenant_id, nome_fantasia, razao_social, email, status_assinatura) VALUES (?, ?, ?, ?, 'ativo')",
          [tenant_id, nome, nome, email]
        );

        const salt = bcrypt.genSaltSync(10);
        const hashed = bcrypt.hashSync('mudar@123', salt);
        
        // We do insert
        await pool.query(
          "INSERT INTO usuarios (tenant_id, nome, email, senha, perfil) VALUES (?, ?, ?, ?, 'admin')",
          [tenant_id, nome, email, hashed]
        );
      }

      if (tenant_id) {
        // format the date explicitly for pg so that we do not send invalid Date strings.
        // Even if vencimento is invalid we fall back to a valid date
        if (isNaN(vencimento.getTime())) {
             vencimento = new Date();
             vencimento.setDate(vencimento.getDate() + 30);
        }

        await pool.query(
          "UPDATE empresas SET stripe_customer_id = ?, stripe_subscription_id = ?, stripe_price_id = ?, plano_id = ?, status_assinatura = 'ativo', vencimento_assinatura = ? WHERE tenant_id = ?",
          [customerId, subscriptionId, priceId, plano_id, vencimento, tenant_id]
        );
        
        console.log(`Verify Session: Updated company ${tenant_id} to plan ${plano_id} with expiry ${vencimento}`);

        // Try to autologin if no token passed
        if (!req.headers.authorization) {
          const [adminUsers] = await pool.query("SELECT id, email, nome, perfil, tenant_id, avatar, grupo_id FROM usuarios WHERE tenant_id = ? ORDER BY id ASC LIMIT 1", [tenant_id]) as any[];
          if (adminUsers.length > 0) {
            const au = adminUsers[0];
            tokenToReturn = jwt.sign(
              { id: au.id, email: au.email, tenant_id: au.tenant_id, perfil: au.perfil },
              process.env.JWT_SECRET || "secret",
              { expiresIn: "24h" }
            );
            userObj = { ...au, status_assinatura: 'ativo', plano_id };
          }
        }

        res.json({ success: true, message: "Assinatura verificada e ativada!", token: tokenToReturn, user: userObj });
      } else {
        res.status(400).json({ error: "Não foi possível vincular o pagamento à sua conta. Entre em contato com o suporte." });
      }
    } else {
      res.status(400).json({ error: "Pagamento ainda não confirmado." });
    }
  } catch (err: any) {
    console.error("Verify Session Error:", err);
    res.status(500).json({ error: err.message });
  }
});

app.get("/api/dashboard/stats", authMiddleware, planMiddleware('dashboard'), async (req: any, res) => {
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

app.get("/api/dashboard/chart-data", authMiddleware, planMiddleware('dashboard'), async (req: any, res) => {
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

app.get("/api/dashboard/top-products", authMiddleware, planMiddleware('dashboard'), async (req: any, res) => {
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
    
    // Get top 10 products
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

// Products
app.get("/api/products", authMiddleware, planMiddleware('estoque'), async (req: any, res) => {
  const [products] = await pool.query(`
    SELECT p.*, g.nome as grupo_nome 
    FROM produtos p 
    LEFT JOIN grupos_produtos g ON p.grupo_id = g.id 
    WHERE p.tenant_id = ?
  `, [req.user.tenant_id]);
  res.json(products);
});

app.post("/api/products", authMiddleware, planMiddleware('estoque'), async (req: any, res) => {
  try {
    const { nome, tipo, unidade, custo, preco_venda, estoque_atual, estoque_minimo, categoria, codigo_barras, ativo, grupo_id, foto, marca } = req.body;
    await pool.query(
      "INSERT INTO produtos (tenant_id, nome, tipo, unidade, custo, preco_venda, estoque_atual, estoque_minimo, categoria, codigo_barras, ativo, grupo_id, foto, marca) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
      [req.user.tenant_id, nome, tipo, unidade, custo, preco_venda, estoque_atual, estoque_minimo || 0, categoria, codigo_barras || null, ativo === undefined ? 1 : (ativo ? 1 : 0), grupo_id || null, foto || null, marca || null]
    );
    res.json({ success: true });
  } catch (error: any) {
    console.error("Error creating product:", error);
    res.status(500).json({ error: error.message });
  }
});

app.put("/api/products/:id", authMiddleware, planMiddleware('estoque'), async (req: any, res) => {
  try {
    const { id } = req.params;
    const productId = parseInt(id);
    const { nome, tipo, unidade, custo, preco_venda, estoque_atual, estoque_minimo, categoria, codigo_barras, ativo, grupo_id, foto, marca } = req.body;
    
    const [result] = await pool.query(`
      UPDATE produtos 
      SET nome = ?, tipo = ?, unidade = ?, custo = ?, preco_venda = ?, estoque_atual = ?, estoque_minimo = ?, categoria = ?, codigo_barras = ?, ativo = ?, grupo_id = ?, foto = ?, marca = ?, updated_at = CURRENT_TIMESTAMP
      WHERE id = ? AND tenant_id = ?
    `, [nome, tipo, unidade, custo, preco_venda, estoque_atual, estoque_minimo || 0, categoria, codigo_barras || null, ativo ? 1 : 0, grupo_id || null, foto || null, marca || null, productId, req.user.tenant_id]) as any;
    
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
app.get("/api/pessoas", authMiddleware, planMiddleware('cadastros'), async (req: any, res) => {
  const { tipo, ativo } = req.query;
  let sql = "SELECT * FROM pessoas WHERE tenant_id = ?";
  const params: any[] = [req.user.tenant_id];

  if (tipo) {
    if (tipo === 'cliente_or_ambos') {
      sql += " AND (tipo_pessoa = 'cliente' OR tipo_pessoa = 'ambos')";
    } else {
      sql += " AND tipo_pessoa = ?";
      params.push(tipo);
    }
  }

  if (ativo !== undefined) {
    sql += " AND ativo = ?";
    params.push(ativo === 'true' || ativo === '1' ? 1 : 0);
  }

  sql += " ORDER BY nome ASC";

  const [pessoas] = await pool.query(sql, params);
  res.json(pessoas);
});

app.post("/api/pessoas", authMiddleware, async (req: any, res) => {
  const { 
    nome, tipo_pessoa, cpf_cnpj, telefone, email, endereco, cidade, uf, ativo,
    razao_social, nome_fantasia, telefone_fixo, telefone_celular, numero, cep, data_aniversario
  } = req.body;
  
  await pool.query(`
    INSERT INTO pessoas (
      tenant_id, nome, tipo_pessoa, cpf_cnpj, telefone, email, endereco, cidade, uf, ativo,
      razao_social, nome_fantasia, telefone_fixo, telefone_celular, numero, cep, data_aniversario
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `, [
    req.user.tenant_id, nome, tipo_pessoa || 'cliente', cpf_cnpj, telefone, email, endereco, cidade, uf, 
    ativo === undefined ? 1 : (ativo ? 1 : 0),
    razao_social, nome_fantasia, telefone_fixo, telefone_celular, numero, cep, data_aniversario || null
  ]);
  res.json({ success: true });
});

app.put("/api/pessoas/:id", authMiddleware, async (req: any, res) => {
  const { id } = req.params;
  const { 
    nome, tipo_pessoa, cpf_cnpj, telefone, email, endereco, cidade, uf, ativo,
    razao_social, nome_fantasia, telefone_fixo, telefone_celular, numero, cep, data_aniversario
  } = req.body;
  
  await pool.query(`
    UPDATE pessoas 
    SET nome = ?, tipo_pessoa = ?, cpf_cnpj = ?, telefone = ?, email = ?, endereco = ?, cidade = ?, uf = ?, ativo = ?, 
        razao_social = ?, nome_fantasia = ?, telefone_fixo = ?, telefone_celular = ?, numero = ?, cep = ?, data_aniversario = ?,
        updated_at = CURRENT_TIMESTAMP 
    WHERE id = ? AND tenant_id = ?
  `, [
    nome, tipo_pessoa, cpf_cnpj, telefone, email, endereco, cidade, uf, ativo ? 1 : 0, 
    razao_social, nome_fantasia, telefone_fixo, telefone_celular, numero, cep, data_aniversario || null,
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
app.post("/api/sales", authMiddleware, planMiddleware('vendas'), async (req: any, res) => {
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
    let [sales] = await connection.query("SELECT * FROM vendas WHERE id = ? AND tenant_id = ?", [id, tenant_id]) as any[];
    if (sales.length === 0) {
      [sales] = await connection.query("SELECT * FROM vendas WHERE sequencial_id = ? AND tenant_id = ?", [id, tenant_id]) as any[];
    }
    
    const sale = sales[0];
    if (!sale) throw new Error("Venda não encontrada");
    if (sale.status === 'cancelada') throw new Error("Esta venda já está cancelada");

    const saleId = sale.id; // Use primary key for internal operations

    // 2. If 'finalizada', reverse stock and financial impact
    if (sale.status === 'finalizada') {
      // Return items to stock
      const [items] = await connection.query("SELECT produto_id, quantidade FROM vendas_itens WHERE venda_id = ?", [saleId]) as any[];
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
      await connection.query("DELETE FROM movimentacoes_caixa WHERE venda_id = ? AND tenant_id = ?", [saleId, tenant_id]);
      await connection.query("DELETE FROM lancamentos WHERE venda_id = ? AND tenant_id = ?", [saleId, tenant_id]);
    }

    // 3. Update Sale Status
    await connection.query("UPDATE vendas SET status = 'cancelada' WHERE id = ?", [saleId]);

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

  try {
    let [sales] = await pool.query(`
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

    if (sales.length === 0) {
      [sales] = await pool.query(`
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
        WHERE v.id = ? AND v.tenant_id = ?
      `, [id, tenant_id]) as any[];
    }
    
    const sale = sales[0];
    if (!sale) return res.status(404).json({ error: "Venda não encontrada" });

    const [items] = await pool.query(`
      SELECT vi.*, p.nome 
      FROM vendas_itens vi
      JOIN produtos p ON vi.produto_id = p.id
      WHERE vi.venda_id = ? AND vi.tenant_id = ?
    `, [sale.id, tenant_id]) as any[];

    const [pagamentos] = await pool.query(`
      SELECT vp.* 
      FROM vendas_pagamentos vp
      WHERE vp.venda_id = ? AND vp.tenant_id = ?
    `, [sale.id, tenant_id]) as any[];

    res.json({ 
      ...sale, 
      items: (items as any[]).map((i: any) => ({
        id: i.produto_id,
        nome: i.nome,
        quantidade: i.quantidade,
        preco_venda: i.preco_unitario,
        subtotal: i.subtotal
      })), 
      pagamentos 
    });
  } catch (err: any) {
    console.error("Error fetching sale details:", err);
    res.status(500).json({ error: err.message });
  }
});

// ==============================================================================
// AGENDA & AGENDAMENTOS
// ==============================================================================

app.get("/api/agenda", authMiddleware, planMiddleware('agenda'), async (req: any, res) => {
  const { tenant_id } = req.user;
  const { start, end, userId, includeCanceled } = req.query;

  try {
    let sql = `
      SELECT 
        a.*, 
        p.nome as cliente_nome,
        u.nome as profissional_nome
      FROM agendamentos a
      LEFT JOIN pessoas p ON a.pessoa_id = p.id
      JOIN usuarios u ON a.usuario_id = u.id
      WHERE a.tenant_id = ? ${includeCanceled ? '' : "AND (a.status IS NULL OR a.status != 'Cancelado')"}
    `;
    const params: any[] = [tenant_id];

    if (start && end) {
      sql += " AND a.data_inicio >= ? AND a.data_inicio <= ?";
      params.push(start, end);
    }
    if (userId) {
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

app.get("/api/agenda/:id", authMiddleware, planMiddleware('agenda'), async (req: any, res) => {
  const { id } = req.params;
  const { tenant_id } = req.user;

  try {
    const [rows] = await pool.query(`
      SELECT 
        a.*, 
        p.nome as cliente_nome,
        p.telefone as cliente_telefone,
        p.email as cliente_email,
        u.nome as profissional_nome
      FROM agendamentos a
      LEFT JOIN pessoas p ON a.pessoa_id = p.id
      JOIN usuarios u ON a.usuario_id = u.id
      WHERE a.id = ? AND a.tenant_id = ?
    `, [id, tenant_id]) as any[];

    if (rows.length === 0) return res.status(404).json({ error: "Agendamento não encontrado" });

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

app.post("/api/agenda", authMiddleware, planMiddleware('agenda'), async (req: any, res) => {
  const { tenant_id } = req.user;
  const { usuario_id, pessoa_id, data_inicio, data_fim, valor_total, status, observacao, items } = req.body;

  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();

    // Validate duration based on services
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
    
    // Auto-notify on creation if enabled
    try {
      const [emp] = await pool.query("SELECT whatsapp_automatico, email_automatico FROM empresas WHERE tenant_id = ?", [tenant_id]) as any[];

      if (emp[0]?.whatsapp_automatico) {
        await processNotification(tenant_id, agendaId, 'whatsapp', 'confirmacao', undefined, true);
        const [ag] = await pool.query("SELECT data_inicio FROM agendamentos WHERE id = ?", [agendaId]) as any[];
        if (ag[0]) {
          const scheduledDate = new Date(new Date(ag[0].data_inicio).getTime() - 2 * 60 * 60 * 1000);
          await processNotification(tenant_id, agendaId, 'whatsapp', 'lembrete', scheduledDate, true);
        }
      }
      if (emp[0]?.email_automatico) {
        await processNotification(tenant_id, agendaId, 'email', 'confirmacao', undefined, true);
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

app.put("/api/agenda/:id", authMiddleware, planMiddleware('agenda'), async (req: any, res) => {
  const { id } = req.params;
  const { tenant_id } = req.user;
  const { usuario_id, pessoa_id, data_inicio, data_fim, valor_total, status, observacao, items } = req.body;

  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();

    const [existing] = await connection.query("SELECT venda_id FROM agendamentos WHERE id = ? AND tenant_id = ?", [id, tenant_id]) as any[];
    if (existing?.[0]?.venda_id && status === 'Cancelado') {
      await connection.query("UPDATE vendas SET status = 'cancelada' WHERE id = ? AND tenant_id = ?", [existing[0].venda_id, tenant_id]);
    }

    await connection.query(`
      UPDATE agendamentos 
      SET usuario_id = ?, pessoa_id = ?, data_inicio = ?, data_fim = ?, valor_total = ?, status = ?, observacao = ?, updated_at = CURRENT_TIMESTAMP
      WHERE id = ? AND tenant_id = ?
    `, [usuario_id, pessoa_id || null, data_inicio, data_fim, valor_total, status, observacao, id, tenant_id]);

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

    // Auto-notify on update if enabled and status is Agendado
    if (status === 'Agendado') {
      try {
        const [emp] = await pool.query("SELECT whatsapp_automatico, email_automatico FROM empresas WHERE tenant_id = ?", [tenant_id]) as any[];

        if (emp[0]?.whatsapp_automatico) {
          await processNotification(tenant_id, parseInt(id), 'whatsapp', 'confirmacao', undefined, true);
          const [ag] = await pool.query("SELECT data_inicio FROM agendamentos WHERE id = ?", [id]) as any[];
          if (ag[0]) {
            const scheduledDate = new Date(new Date(ag[0].data_inicio).getTime() - 2 * 60 * 60 * 1000);
            await processNotification(tenant_id, parseInt(id), 'whatsapp', 'lembrete', scheduledDate, true);
          }
        }
        if (emp[0]?.email_automatico) {
          await processNotification(tenant_id, parseInt(id), 'email', 'confirmacao', undefined, true);
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

app.delete("/api/agenda/:id", authMiddleware, planMiddleware('agenda'), async (req: any, res) => {
  const { id } = req.params;
  const { tenant_id } = req.user;

  try {
    await pool.query("DELETE FROM agendamentos WHERE id = ? AND tenant_id = ?", [id, tenant_id]);
    res.json({ success: true });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

app.post("/api/agenda/:id/concluir", authMiddleware, planMiddleware('agenda'), async (req: any, res) => {
  const { id } = req.params;
  const { tenant_id, id: authUserId } = req.user;

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
      INSERT INTO vendas (tenant_id, sequencial_id, pessoa_id, usuario_id, valor_total, status, origem, tipo)
      VALUES (?, ?, ?, ?, ?, 'orcamento', 'Agenda', 'venda')
    `, [tenant_id, nextSequencial, agenda.pessoa_id, authUserId, agenda.valor_total]) as any[];

    const vendaId = resVenda.insertId;

    for (const item of items) {
      await connection.query(`
        INSERT INTO vendas_itens (tenant_id, venda_id, produto_id, quantidade, preco_unitario, subtotal)
        VALUES (?, ?, ?, ?, ?, ?)
      `, [tenant_id, vendaId, item.produto_id, item.quantidade, item.preco_unitario, item.subtotal]);
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

// Helper function to process notifications and log to DB
async function processNotification(tenant_id: any, agenda_id: number, type: 'whatsapp' | 'email', contexto: 'confirmacao' | 'lembrete' = 'confirmacao', scheduledDate?: Date, enqueueOnly: boolean = false) {
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

    // Bypass check for 'system' tenant or if it's the testing user
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
        html: `<div style="font-family: sans-serif; padding: 20px; color: #333;">${emailMsg.replace(/\n/g, '<br>')}</div>`
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

// Notifications Route
app.post("/api/agenda/:id/notify/:type", authMiddleware, async (req: any, res) => {
  const { id, type } = req.params;
  const { tenant_id } = req.user;
  try {
    const result = await processNotification(tenant_id, parseInt(id), type as any, 'confirmacao');
    res.json(result);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});


app.post("/api/whatsapp/test", authMiddleware, async (req: any, res) => {
  const { number, url, key, instance, message } = req.body;

  if (!number || !url || !key || !instance) {
    return res.status(400).json({ error: "Todos os campos (Número, URL, Key, Instância) são obrigatórios para o teste." });
  }

  try {
    let phone = number.replace(/\D/g, '');
    if ((phone.length === 10 || phone.length === 11) && !phone.startsWith('55')) {
      phone = '55' + phone;
    }

    const msg = message || `Teste de conexão WhatsApp - ${new Date().toLocaleString('pt-BR')}`;
    
    // Normalizar URL da Evolution API
    let cleanUrl = url.trim();
    if (!cleanUrl.startsWith('http')) {
      cleanUrl = 'https://' + cleanUrl;
    }
    if (cleanUrl.endsWith('/')) {
      cleanUrl = cleanUrl.slice(0, -1);
    }
    
    // Lista de caminhos comuns para remover se o usuário colou a URL completa de algum endpoint
    const pathsToRemove = [
      '/message/sendText', 
      '/message/sendMedia', 
      '/instance/view', 
      '/instance/list', 
      '/instance/connect',
      '/group/create'
    ];

    for (const p of pathsToRemove) {
      if (cleanUrl.includes(p)) {
        cleanUrl = cleanUrl.split(p)[0];
      }
    }

    // Se a URL termina com o nome da instância (provavelmente o usuário copiou de um dashboard), remove
    if (cleanUrl.endsWith(`/${instance}`)) {
      cleanUrl = cleanUrl.slice(0, -(instance.length + 1));
    }

    const fullUrl = `${cleanUrl}/message/sendText/${encodeURIComponent(instance)}`;
    console.log(`Testing WhatsApp: ${fullUrl}`);

    const response = await fetch(fullUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'apikey': key
      },
      body: JSON.stringify({
        number: phone,
        text: msg
      })
    });

    let data;
    try {
      data = await response.json();
    } catch (e) {
      data = { message: "Servidor não retornou um JSON válido." };
    }

    if (!response.ok) {
      console.error("WhatsApp API Error Details:", data);
      throw new Error(`Erro ${response.status} (${response.statusText}): ${data.message || data.error || "Acesse o log do servidor para detalhes"}`);
    }

    res.json({ success: true, data });
  } catch (err: any) {
    console.error("WhatsApp test error:", err);
    res.status(500).json({ error: err.message });
  }
});

app.post("/api/email/test", authMiddleware, async (req: any, res) => {
  const { host, port, user, pass, from, to, message } = req.body;

  if (!host || !user || !pass || !to) {
    return res.status(400).json({ error: "Campos host, usuário, senha e destinatário são obrigatórios para o teste." });
  }

  try {
    const transporter = nodemailer.createTransport({
      host,
      port: parseInt(port || '587'),
      secure: parseInt(port) === 465,
      auth: { user, pass }
    });

    const emailMsg = message || `Este é um e-mail de teste enviado em ${new Date().toLocaleString('pt-BR')}. Sua configuração está funcionando corretamente!`;

    const info = await transporter.sendMail({
      from: from || user,
      to,
      subject: "Teste de Configuração de E-mail",
      text: emailMsg,
      html: emailMsg.includes('<') ? emailMsg : `<p>${emailMsg.replace(/\n/g, '<br>')}</p>`
    });

    res.json({ success: true, info });
  } catch (err: any) {
    console.error("Email test error:", err);
    res.status(500).json({ error: err.message });
  }
});

// BACKGROUND WORKER REMOVED - Moved to separate cron endpoint
app.post("/api/admin/cron/process-notifications", async (req, res) => {
  // Simple check for internal call (could be more robust with a secret header)
  const authHeader = req.headers['x-cron-auth'];
  if (process.env.CRON_SECRET && authHeader !== process.env.CRON_SECRET) {
    return res.status(401).json({ error: "Unauthorized" });
  }

  let processed = 0;
  try {
    // 1. First, create missing reminder records (Scheduled 2h before)
    const [empresas] = await pool.query(`
      SELECT tenant_id, whatsapp_automatico, email_automatico
      FROM empresas 
      WHERE (whatsapp_automatico = TRUE OR email_automatico = TRUE)
    `) as any[];

    for (const emp of empresas) {
      // Find appointments in the next 2.5 hours that don't have a reminder record yet
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


// BACKGROUND WORKER (Commented out as requested)
// Este código roda a cada 5 minutos chamando o endpoint de cron interno.
setInterval(async () => {
  try {
    const cronSecret = process.env.CRON_SECRET || 'dev-secret';
    // O container escuta na porta 3000 internamente
    const serverUrl = 'http://localhost:3000';
    
    console.log(`[Background Worker] Triggering notification cron...`);
    
    const response = await fetch(`${serverUrl}/api/admin/cron/process-notifications`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-cron-auth': cronSecret
      }
    });
    
    if (!response.ok) {
      const text = await response.text();
      console.error(`[Background Worker] Cron trigger failed: ${text}`);
    } else {
      const data = await response.json();
      console.log(`[Background Worker] Cron trigger success:`, data);
    }
  } catch (err) {
    console.error("[Background Worker] Error:", err);
  }
}, 5 * 60 * 1000); // 5 minutos


app.get("/api/admin/cron/logs", authMiddleware, async (req: any, res) => {
  // Only superadmin should access this (ideally check role, but auth is a start)
  try {
    const [logs] = await pool.query("SELECT * FROM cron_logs ORDER BY created_at DESC LIMIT 50") as any[];
    res.json(logs);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

app.get("/api/notifications/logs", authMiddleware, async (req: any, res) => {
  const { tenant_id } = req.user;
  try {
    const [logs] = await pool.query(`
      SELECT n.*, p.nome as cliente_nome, a.data_inicio
      FROM notificacoes n
      LEFT JOIN agendamentos a ON n.agenda_id = a.id
      LEFT JOIN pessoas p ON a.pessoa_id = p.id
      WHERE n.tenant_id = ?
      ORDER BY n.created_at DESC
      LIMIT 100
    `, [tenant_id]) as any[];
    res.json(logs);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

app.put("/api/sales/:id", authMiddleware, async (req: any, res) => {
  const { id } = req.params; // This is now sequencial_id
  const { pessoa_id, items, valor_total, desconto, frete, status, solicitacao, laudo_tecnico, pagamentos, identificacao, taxa_servico, origem, tipo } = req.body;
  const { tenant_id } = req.user;
  
  const pessoaIdToInsert = pessoa_id === '' ? null : pessoa_id;

  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();

    let [existingSales] = await connection.query("SELECT * FROM vendas WHERE sequencial_id = ? AND tenant_id = ?", [id, tenant_id]) as any[];
    if (existingSales.length === 0) {
      // Fallback to internal ID if sequencial not found (helps with old records or frontend mismatches)
      [existingSales] = await connection.query("SELECT * FROM vendas WHERE id = ? AND tenant_id = ?", [id, tenant_id]) as any[];
    }
    
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
// --- SETTINGS: USERS & GROUPS ---

app.get("/api/settings/groups", authMiddleware, async (req: any, res) => {
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

app.post("/api/settings/groups", authMiddleware, async (req: any, res) => {
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

app.put("/api/settings/groups/:id", authMiddleware, async (req: any, res) => {
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

app.delete("/api/settings/groups/:id", authMiddleware, async (req: any, res) => {
  const { tenant_id } = req.user;
  const groupId = req.params.id;
  try {
    const [group] = await pool.query("SELECT is_master FROM grupos_usuarios WHERE id = ? AND tenant_id = ?", [groupId, tenant_id]) as any[];
    if (!group[0]) return res.status(404).json({ error: "Grupo não encontrado" });
    if (group[0].is_master) return res.status(400).json({ error: "Grupo Master não pode ser excluído" });

    // Check if there are users in this group
    const [users] = await pool.query("SELECT COUNT(*) as count FROM usuarios WHERE grupo_id = ?", [groupId]) as any[];
    if (users[0].count > 0) return res.status(400).json({ error: "Não é possível excluir um grupo que possui usuários vinculados." });

    await pool.query("DELETE FROM grupos_usuarios WHERE id = ? AND tenant_id = ?", [groupId, tenant_id]);
    res.json({ success: true });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

app.get("/api/settings/users", authMiddleware, planMiddleware('configuracoes'), async (req: any, res) => {
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

app.post("/api/settings/users", authMiddleware, async (req: any, res) => {
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

app.put("/api/settings/users/:id", authMiddleware, async (req: any, res) => {
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

app.get("/api/company/settings", authMiddleware, planMiddleware('configuracoes'), async (req: any, res) => {
  try {
    const { tenant_id } = req.user;
    let [companies] = await pool.query(`
      SELECT e.*, p.nome as plano_nome 
      FROM empresas e 
      LEFT JOIN planos p ON e.plano_id = p.id 
      WHERE e.tenant_id = ?
    `, [tenant_id]) as any[];

    if (!companies || (Array.isArray(companies) && companies.length === 0)) {
      console.log(`Company settings not found for tenant: ${tenant_id}. Attempting auto-repair...`);
      const [allPlans] = await pool.query("SELECT id FROM planos ORDER BY id ASC LIMIT 1") as any[];
      const defaultPlanId = allPlans[0]?.id || 1;
      
      try {
        await pool.query(
          "INSERT INTO empresas (tenant_id, nome_fantasia, email, status_assinatura, plano_id) VALUES (?, ?, ?, ?, ?)",
          [tenant_id, 'Minha Empresa', req.user.email || 'contato@empresa.com', 'ativo', defaultPlanId]
        );
        console.log(`Successfully created missing company record for tenant: ${tenant_id}`);
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
      return res.status(404).json({ error: "Empresa não encontrada mesmo após tentativa de criação automática." });
    }
    res.json(companies[0]);
  } catch (err: any) {
    console.error("Error fetching company settings:", err);
    res.status(500).json({ error: err.message });
  }
});

app.put("/api/company/settings", authMiddleware, async (req: any, res) => {
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

// --- ESTOQUE ROUTES ---

app.get("/api/inventory/groups", authMiddleware, async (req: any, res) => {
  try {
    const { tenant_id } = req.user;
    const [groups] = await pool.query("SELECT * FROM grupos_produtos WHERE tenant_id = ?", [tenant_id]);
    res.json(groups);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

app.post("/api/inventory/groups", authMiddleware, async (req: any, res) => {
  try {
    const { tenant_id } = req.user;
    const { nome } = req.body;
    const [result] = await pool.query("INSERT INTO grupos_produtos (tenant_id, nome) VALUES (?, ?)", [tenant_id, nome]) as any[];
    res.json({ id: result.insertId, nome });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

app.put("/api/inventory/groups/:id", authMiddleware, async (req: any, res) => {
  try {
    const { tenant_id } = req.user;
    const { id } = req.params;
    const { nome } = req.body;
    await pool.query("UPDATE grupos_produtos SET nome = ? WHERE id = ? AND tenant_id = ?", [nome, id, tenant_id]);
    res.json({ success: true });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

app.delete("/api/inventory/groups/:id", authMiddleware, async (req: any, res) => {
  try {
    const { tenant_id } = req.user;
    const { id } = req.params;
    await pool.query("DELETE FROM grupos_produtos WHERE id = ? AND tenant_id = ?", [id, tenant_id]);
    res.json({ success: true });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

app.get("/api/inventory/layouts", authMiddleware, async (req: any, res) => {
  try {
    const { tenant_id } = req.user;
    const [layouts] = await pool.query("SELECT * FROM layouts_etiquetas WHERE tenant_id = ?", [tenant_id]);
    res.json(layouts);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

app.post("/api/inventory/layouts", authMiddleware, async (req: any, res) => {
  try {
    const { tenant_id } = req.user;
    const { nome, largura, altura, colunas, json_config } = req.body;
    const [result] = await pool.query(
      "INSERT INTO layouts_etiquetas (tenant_id, nome, largura, altura, colunas, json_config) VALUES (?, ?, ?, ?, ?, ?)", 
      [tenant_id, nome, largura, altura, colunas, JSON.stringify(json_config)]
    ) as any[];
    res.json({ id: result.insertId });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

app.put("/api/inventory/layouts/:id", authMiddleware, async (req: any, res) => {
  try {
    const { tenant_id } = req.user;
    const { id } = req.params;
    const { nome, largura, altura, colunas, json_config } = req.body;
    await pool.query(
      "UPDATE layouts_etiquetas SET nome = ?, largura = ?, altura = ?, colunas = ?, json_config = ? WHERE id = ? AND tenant_id = ?", 
      [nome, largura, altura, colunas, JSON.stringify(json_config), id, tenant_id]
    );
    res.json({ success: true });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

app.delete("/api/inventory/layouts/:id", authMiddleware, async (req: any, res) => {
  try {
    const { tenant_id } = req.user;
    const { id } = req.params;
    await pool.query("DELETE FROM layouts_etiquetas WHERE id = ? AND tenant_id = ?", [id, tenant_id]);
    res.json({ success: true });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
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

    try {
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
    } catch (err: any) {
      if (err.type === 'StripeInvalidRequestError' && (err.message.includes('No such customer') || err.message.includes('No such subscription'))) {
         return res.status(404).json({ error: "Cliente ou assinatura não encontrado no Stripe." });
      }
      throw err;
    }

    if (!subscription) {
      return res.status(404).json({ error: "Nenhuma assinatura encontrada no Stripe para este cliente" });
    }

    const subObj = subscription as any;
    let status = subObj.status === 'active' ? 'ativo' : 'suspenso';
    if (subObj.cancel_at_period_end) {
      status = 'Cancelamento Solicitado';
    }
    if (subObj.status === 'canceled') {
      status = 'cancelado';
    }

    let vencimento = '';
    try {
      const sub = subscription as any;
      if (sub && sub.current_period_end) {
        vencimento = new Date(sub.current_period_end * 1000).toISOString().split('T')[0];
      } else {
        console.warn("Stripe subscription missing current_period_end:", sub);
        // Fallback to today + 30 days if missing
        const fallbackDate = new Date();
        fallbackDate.setDate(fallbackDate.getDate() + 30);
        vencimento = fallbackDate.toISOString().split('T')[0];
      }
    } catch (dateErr) {
      console.error("Error parsing date from subscription:", (subscription as any)?.current_period_end, dateErr);
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
  const { nome, valor_mensal, limite_usuarios, stripe_price_id, modulos, is_trial, trial_days } = req.body;
  
  if (stripe_price_id && stripe_price_id !== 'none' && stripe_price_id !== 'price_system' && !stripe_price_id.startsWith('price_')) {
    return res.status(400).json({ error: "O ID do Stripe deve ser um Price ID (começar com 'price_')." });
  }

  try {
    await pool.query("INSERT INTO planos (nome, valor_mensal, limite_usuarios, stripe_price_id, modulos, is_trial, trial_days) VALUES (?, ?, ?, ?, ?, ?, ?)", 
      [nome, valor_mensal, limite_usuarios, stripe_price_id, JSON.stringify(modulos || []), is_trial ? 1 : 0, trial_days || null]);
    res.json({ success: true });
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});

app.put("/api/admin/plans/:id", authMiddleware, async (req: any, res) => {
  if (req.user.perfil !== 'superadmin') return res.status(403).json({ error: "Forbidden" });
  const { id } = req.params;
  const { nome, valor_mensal, limite_usuarios, stripe_price_id, modulos, is_trial, trial_days } = req.body;
  
  if (stripe_price_id && stripe_price_id !== 'none' && stripe_price_id !== 'price_system' && !stripe_price_id.startsWith('price_')) {
    return res.status(400).json({ error: "O ID do Stripe deve ser um Price ID (começar com 'price_')." });
  }

  await pool.query("UPDATE planos SET nome = ?, valor_mensal = ?, limite_usuarios = ?, stripe_price_id = ?, modulos = ?, is_trial = ?, trial_days = ? WHERE id = ?", 
    [nome, valor_mensal, limite_usuarios, stripe_price_id, JSON.stringify(modulos || []), is_trial ? 1 : 0, trial_days || null, id]);
    
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
app.get("/api/finance/receivable", authMiddleware, planMiddleware('financeiro'), async (req: any, res) => {
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

app.get("/api/finance/payable", authMiddleware, planMiddleware('financeiro'), async (req: any, res) => {
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
app.get("/api/sales", authMiddleware, planMiddleware('vendas'), async (req: any, res) => {
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
app.get("/api/finance/dre", authMiddleware, planMiddleware('financeiro'), async (req: any, res) => {
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
      WHERE l.tenant_id = ? AND l.status != 'cancelada'
        AND l.tipo = 'CP' 
        AND (l.descricao IS NULL OR l.descricao NOT LIKE 'Pagamento conta #%')
        ${dateFilterLanc}
      GROUP BY c.nome
    `, paramsLanc) as any[];

    const [caixaDespesasRaw] = await pool.query(`
      SELECT COALESCE(c.nome, 'Saídas Caixa (Não Categorizadas)') as categoria, SUM(m.valor) as total
      FROM movimentacoes_caixa m
      LEFT JOIN categorias_contas c ON m.categoria_id = c.id
      WHERE m.tenant_id = ? AND (m.status != 'cancelada' OR m.status IS NULL) AND m.tipo = 'saida' 
        AND m.descricao NOT LIKE 'Pagamento conta %' 
        AND m.venda_id IS NULL AND m.origem = 'Lançamento Manual'
        ${dateFilterCaixa}
      GROUP BY c.nome
    `, paramsCaixa) as any[];

    const [outrasReceitasLancRaw] = await pool.query(`
      SELECT COALESCE(c.nome, 'Outras Receitas') as categoria, SUM(l.valor) as total
      FROM lancamentos l
      LEFT JOIN categorias_contas c ON l.categoria_id = c.id
      WHERE l.tenant_id = ? AND l.status != 'cancelada'
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
      WHERE m.tenant_id = ? AND (m.status != 'cancelada' OR m.status IS NULL) AND m.tipo = 'entrada' 
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
             l.valor as valor, CASE WHEN l.status = 'paga' THEN 1 ELSE 0 END as pago, l.pessoa_id as pessoa_id, p.nome as pessoa_nome,
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

app.post("/api/finance/movements/:table/:id/cancel", authMiddleware, async (req: any, res) => {
  const { table, id } = req.params;
  const { motivo } = req.body;
  const { tenant_id, id: user_id } = req.user;
  try {
    const tableName = table === 'caixa' ? 'movimentacoes_caixa' : 'lancamentos';
    const [rows] = await pool.query(`SELECT status FROM ${tableName} WHERE id = ? AND tenant_id = ?`, [id, tenant_id]) as any[];
    if (rows.length === 0) return res.status(404).json({ error: "Lançamento não encontrado" });
    
    if (rows[0].status !== 'aberta') return res.status(400).json({ error: "Apenas lançamentos com status Aberta podem ser cancelados" });

    await pool.query(`UPDATE ${tableName} SET status = 'cancelada', cancelado_em = NOW(), cancelado_por = ?, motivo_cancelamento = ? WHERE id = ?`, [user_id, motivo, id]);
    res.json({ success: true, message: "Cancelado com sucesso" });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Erro ao cancelar" });
  }
});

app.post("/api/finance/movements/:table/:id/estorno", authMiddleware, async (req: any, res) => {
  const { table, id } = req.params;
  const { motivo } = req.body;
  const { tenant_id, id: user_id } = req.user;
  try {
    const tableName = table === 'caixa' ? 'movimentacoes_caixa' : 'lancamentos';
    const [rows] = await pool.query(`SELECT * FROM ${tableName} WHERE id = ? AND tenant_id = ?`, [id, tenant_id]) as any[];
    if (rows.length === 0) return res.status(404).json({ error: "Lançamento não encontrado" });
    const row = rows[0];
    
    if (row.status !== 'paga' && row.status !== 'parcial') return res.status(400).json({ error: "Apenas lançamentos pagos ou parcialmente pagos podem ser estornados" });

    if (tableName === 'lancamentos') {
      if (row.local === 'Banco' || row.local === 'Caixa' || row.local === 'Cartão' || row.local === 'Cartao') {
         const isCr = row.tipo === 'CR';
         if (row.local === 'Banco') {
             await pool.query(
                 `INSERT INTO movimentacoes_banco (tenant_id, lancamento_id, tipo, valor, descricao, categoria_id) VALUES (?, ?, ?, ?, ?, ?)`,
                 [tenant_id, id, isCr ? 'saida' : 'entrada', row.valor_pago, `Estorno ref. Lançamento #${id}`, row.categoria_id]
             );
         } else if (row.local === 'Cartão' || row.local === 'Cartao') {
             await pool.query(
                 `INSERT INTO movimentacoes_cartao (tenant_id, lancamento_id, tipo, valor, descricao, categoria_id) VALUES (?, ?, ?, ?, ?, ?)`,
                 [tenant_id, id, isCr ? 'saida' : 'entrada', row.valor_pago, `Estorno ref. Lançamento #${id}`, row.categoria_id]
             );
         } else if (row.local === 'Caixa') {
             const [caixas] = await pool.query("SELECT id FROM caixa WHERE tenant_id = ? AND status = 'aberto' ORDER BY id DESC LIMIT 1", [tenant_id]) as any[];
             if (caixas[0]) {
                 await pool.query(
                     `INSERT INTO movimentacoes_caixa (tenant_id, caixa_id, tipo, valor, descricao, categoria_id) VALUES (?, ?, ?, ?, ?, ?)`,
                     [tenant_id, caixas[0].id, isCr ? 'saida' : 'entrada', row.valor_pago, `Estorno ref. Lançamento #${id}`, row.categoria_id]
                 );
             }
         }
      }
      await pool.query(
        `UPDATE lancamentos SET status = 'aberta', valor_pago = 0, data_pagamento = NULL, estornado_em = NOW(), estornado_por = ?, motivo_estorno = ? WHERE id = ?`,
        [user_id, motivo, id]
      );
    } else {
      const reverseCaixaTipo = row.tipo === 'entrada' ? 'saida' : 'entrada';
      const [caixas] = await pool.query("SELECT id FROM caixa WHERE tenant_id = ? AND status = 'aberto' ORDER BY id DESC LIMIT 1", [tenant_id]) as any[];
      if (caixas[0]) {
         await pool.query(
             `INSERT INTO movimentacoes_caixa (tenant_id, caixa_id, tipo, valor, descricao, origem, status) VALUES (?, ?, ?, ?, ?, 'Estorno', 'paga')`,
             [tenant_id, caixas[0].id, reverseCaixaTipo, row.valor, `Estorno ref. Caixa #${id}`]
         );
      }
      await pool.query(
        `UPDATE movimentacoes_caixa SET status = 'aberta', estornado_em = NOW(), estornado_por = ?, motivo_estorno = ? WHERE id = ?`,
        [user_id, motivo, id] 
      );
    }
    res.json({ success: true, message: "Estornado com sucesso" });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Erro ao estornar" });
  }
});

// Cashier Management
app.get("/api/finance/cashier/current", authMiddleware, planMiddleware('financeiro'), async (req: any, res) => {
  const [caixas] = await pool.query("SELECT * FROM caixa WHERE tenant_id = ? AND status = 'aberto' ORDER BY id DESC LIMIT 1", [req.user.tenant_id]) as any[];
  res.json(caixas[0] || null);
});

app.post("/api/finance/cashier/open", authMiddleware, planMiddleware('financeiro'), async (req: any, res) => {
  const { valor_inicial } = req.body;
  const { tenant_id, id: usuario_id } = req.user;

  try {
    const [abertoRows] = await pool.query("SELECT id FROM caixa WHERE tenant_id = ? AND status = 'aberto'", [tenant_id]) as any[];
    if (abertoRows.length > 0) return res.status(400).json({ error: "Já existe um caixa aberto" });

    await pool.query(
      "INSERT INTO caixa (tenant_id, usuario_id, valor_inicial, status) VALUES (?, ?, ?, 'aberto')",
      [tenant_id, usuario_id, valor_inicial || 0]
    );
    res.json({ success: true });
  } catch (err: any) {
    console.error("Error opening cashier:", err);
    res.status(500).json({ error: "Erro interno ao abrir o caixa: " + err.message });
  }
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
