import jwt from "jsonwebtoken";
import { pool } from "./db";
import { parseJSON, DEFAULT_MASTER_PERMISSOES } from "./permissions";

export const authMiddleware = async (req: any, res: any, next: any) => {
  const token = req.headers.authorization?.split(" ")[1];
  if (!token) return res.status(401).json({ error: "Token não fornecido" });

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET || "saas-secret-key-123") as any;
    req.user = decoded;

    // Dynamically refresh permissions, plan modules, and profile from DB
    if (req.user?.id) {
      try {
        const [users] = await pool.query("SELECT grupo_id, perfil, tenant_id FROM usuarios WHERE id = ?", [req.user.id]) as any[];
        if (users.length > 0) {
          const u = users[0];
          if (u.perfil) req.user.perfil = u.perfil;
          req.user.tenant_id = u.tenant_id;

          // Fetch company plan modules
          if (u.tenant_id) {
            const [companies] = await pool.query(`
              SELECT e.status_assinatura, e.vencimento_assinatura, e.plano_id, 
                     COALESCE(p.modulos, (SELECT modulos FROM planos ORDER BY id ASC LIMIT 1)) as modulos 
              FROM empresas e 
              LEFT JOIN planos p ON e.plano_id = p.id 
              WHERE e.tenant_id = ?
            `, [u.tenant_id]) as any[];
            if (companies.length > 0) {
              req.user.modulos = parseJSON(companies[0].modulos, []);
              req.user.status_assinatura = companies[0].status_assinatura;
              req.user.vencimento_assinatura = companies[0].vencimento_assinatura;
              req.user.plano_id = companies[0].plano_id;
            }
          }

          const grupoId = u.grupo_id || req.user.grupo_id;
          if (grupoId) {
            const [grupos] = await pool.query("SELECT is_master, permissoes FROM grupos_usuarios WHERE id = ?", [grupoId]) as any[];
            if (grupos.length > 0) {
              let p = parseJSON(grupos[0].permissoes, {});
              if (grupos[0].is_master || u.perfil === 'admin' || u.perfil === 'superadmin') {
                p = { ...DEFAULT_MASTER_PERMISSOES, ...p };
              }
              req.user.permissoes = p;
            }
          } else if (u.perfil === 'admin' || u.perfil === 'superadmin') {
            req.user.permissoes = DEFAULT_MASTER_PERMISSOES;
          }
        }
      } catch (dbErr) {
        // Fall back to decoded permissions if DB query fails
      }
    }

    next();
  } catch (err) {
    res.status(401).json({ error: "Token inválido" });
  }
};

export const planMiddleware = (module: string) => {
  return async (req: any, res: any, next: any) => {
    try {
      // Superadmins bypass all restrictions
      if (req.user.perfil === 'superadmin') {
        return next();
      }

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
      
      // System tenant bypasses Tier 1 (Company Plan check)
      const isSystemTenant = tenant_id === 'system' || tenant_id === 'System';

      if (!isSystemTenant) {
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
        
        if (isBlocked && currentModule !== 'meuplano') {
          return res.status(403).json({ 
            error: "Assinatura expirada ou bloqueada. Por favor, regularize seu pagamento para continuar acessando este recurso.",
            blocked: true
          });
        }

        // Tier 1: Check Plan level - verify if the module is allowed in the user's plan
        let allowedModules: string[] = [];
        if (typeof company.modulos === 'string') {
          try {
            allowedModules = JSON.parse(company.modulos);
          } catch (e) {
            allowedModules = [];
          }
        } else if (Array.isArray(company.modulos)) {
          allowedModules = company.modulos;
        }

        // Default base modules if no modulos array defined
        if (!allowedModules || allowedModules.length === 0) {
          allowedModules = [
            'home', 'dashboard', 'meuplano', 'agenda', 'vendas', 'estoque', 
            'cadastros', 'financeiro', 'pdv', 'os', 'mesas', 'etiquetas', 
            'configuracoes', 'relatorios', 'comissoes', 'export_excel', 
            'import_produtos', 'lembrete_email', 'lembrete_whatsapp'
          ];
        }
        
        let planHasModule = true;
        if (currentModule !== 'dashboard' && currentModule !== 'meuplano' && currentModule !== 'home') {
           planHasModule = allowedModules.includes(currentModule);
           if (!planHasModule && (currentModule === 'cadastros' || currentModule === 'estoque')) {
             const helperModules = ['agenda', 'vendas', 'os', 'pdv', 'mesas'];
             if (helperModules.some(m => allowedModules.includes(m))) {
               planHasModule = true;
             }
           }
        }

        if (!planHasModule) {
          return res.status(403).json({ 
            error: `O seu plano atual não possui acesso ao módulo ${currentModule}.`,
            code: 'PLAN_RESTRICTION',
            module: currentModule 
          });
        }
      }

      // Tier 2: Check User level (group permissions)
      // Master group / Admin users have full access to all modules allowed in their company plan
      if (req.user.perfil === 'admin') return next();

      // Base modules allowed for all logged in users
      if (currentModule === 'home' || currentModule === 'inicio' || currentModule === 'meuplano') {
        return next();
      }

      const userPerms = req.user.permissoes || {};
      
      // Check if module permission is explicitly set to true
      const modulePerm = userPerms[currentModule];
      if (!modulePerm || modulePerm.acessar !== true) {
        // Allow GET requests for cadastros or estoque if user has access to operational modules (agenda, vendas, os, pdv, mesas)
        if (req.method === 'GET' && (currentModule === 'cadastros' || currentModule === 'estoque')) {
          const helperModules = ['agenda', 'vendas', 'os', 'pdv', 'mesas'];
          const hasHelperAccess = helperModules.some(m => userPerms[m] && userPerms[m].acessar === true);
          if (hasHelperAccess) {
            return next();
          }
        }

        return res.status(403).json({ 
          error: `Seu grupo de usuário não possui permissão para acessar o módulo ${currentModule}. Contate o administrador.`,
          code: 'USER_RESTRICTION',
          module: currentModule 
        });
      }

      next();
    } catch (err: any) {
      console.error("planMiddleware error:", err);
      res.status(500).json({ error: "Erro ao verificar plano" });
    }
  };
};
