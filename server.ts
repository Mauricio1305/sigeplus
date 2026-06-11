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
import { pool, pgPool, processQuery } from "./server/db";
import { authMiddleware, planMiddleware } from "./server/middleware";
import { getStripe, transporter } from "./server/utils";
import agendaRouter from "./server/routes/agenda";
import financeRouter from "./server/routes/finance";
import pessoasRouter, { clientsRouter } from "./server/routes/pessoas";
import estoqueRouter from "./server/routes/estoque";
import vendasRouter from "./server/routes/vendas";
import osRouter from "./server/routes/os";
import mesasRouter from "./server/routes/mesas";
import pdvRouter from "./server/routes/pdv";
import dashboardRouter from "./server/routes/dashboard";
import reportsRouter from "./server/routes/reports";
import settingsRouter from "./server/routes/settings";
import authRouter from "./server/routes/auth";
import saasRouter from "./server/routes/saas";
import suporteRouter from "./server/routes/suporte";
import { processNotification } from "./server/services/notificationService";

dotenv.config();

const requiredEnvVars = ['DB_HOST', 'DB_USER', 'DB_PASS', 'DB_NAME', 'DB_PORT'];
const missingEnvVars = requiredEnvVars.filter(varName => !process.env[varName]);

if (missingEnvVars.length > 0) {
  throw new Error(`Critical: Missing database environment variables: ${missingEnvVars.join(', ')}`);
}

// Middlewares and DB utilities imported from ./server/db and ./server/middleware


const JWT_SECRET = process.env.JWT_SECRET || "saas-secret-key-123";

// transporter definition moved to ./server/utils.ts

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
          if (!columns.includes('max_desconto_venda')) await pool.query("ALTER TABLE empresas ADD COLUMN max_desconto_venda DECIMAL(5, 2) DEFAULT 0");
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

      // Create chamados tables
      await pool.query(`
        CREATE TABLE IF NOT EXISTS chamados (
          id SERIAL PRIMARY KEY,
          tenant_id VARCHAR(50),
          usuario_id INTEGER,
          email VARCHAR(255),
          assunto VARCHAR(255),
          status VARCHAR(50) DEFAULT 'Aguardando Análise',
          unread_user BOOLEAN DEFAULT FALSE,
          unread_admin BOOLEAN DEFAULT FALSE,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
      `);
      
      await pool.query(`
        CREATE TABLE IF NOT EXISTS chamados_mensagens (
          id SERIAL PRIMARY KEY,
          chamado_id INTEGER NOT NULL,
          sender_type VARCHAR(20) NOT NULL,
          mensagem TEXT NOT NULL,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          FOREIGN KEY (chamado_id) REFERENCES chamados(id)
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
app.use("/api/auth/login", authLimiter);
app.use("/api/auth/register", authLimiter);
app.use("/api/auth/forgot-password", authLimiter);
app.use("/api/auth/reset-password", authLimiter);

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

// --- AUTH ROUTES ---
app.use("/api/auth", authRouter);

// --- SETTINGS, USERS & GROUPS ---
app.use("/api", settingsRouter);

// --- SAAS & STRIPE ROUTES ---
app.use("/api", saasRouter);

// --- ESTOQUE ROUTES ---
// (REFACTORED - moved to ./server/routes/estoque.ts)

// --- SUPERADMIN ROUTES ---
// (REFACTORED - moved to ./server/routes/settings.ts)

// Finance
// (REFACTORED - moved to ./server/routes/finance.ts)


// Mount Routers
app.use("/api/agenda", agendaRouter);
app.use("/api/finance", financeRouter);
app.use("/api/pessoas", pessoasRouter);
app.use("/api/clients", clientsRouter);
app.use("/api", estoqueRouter);
app.use("/api/sales", vendasRouter);
app.use("/api/os", osRouter);
app.use("/api/mesas", mesasRouter);
app.use("/api/pdv", pdvRouter);
app.use("/api/dashboard", dashboardRouter);
app.use("/api/reports", reportsRouter);
app.use("/api/suporte", suporteRouter);

// --- API 404 HANDLER ---
app.use("/api", (req, res) => {
  res.status(404).json({ error: `Rota API não encontrada: ${req.method} ${req.originalUrl}` });
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

// BACKGROUND WORKER
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
