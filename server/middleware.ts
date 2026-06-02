import jwt from "jsonwebtoken";
import { pool } from "./db";

export const authMiddleware = (req: any, res: any, next: any) => {
  const token = req.headers.authorization?.split(" ")[1];
  if (!token) return res.status(401).json({ error: "Token não fornecido" });

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET || "saas-secret-key-123") as any;
    req.user = decoded;
    next();
  } catch (err) {
    res.status(401).json({ error: "Token inválido" });
  }
};

export const planMiddleware = (module: string) => {
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
      
      if (isBlocked && currentModule !== 'meuplano') {
        return res.status(403).json({ 
          error: "Assinatura expirada ou bloqueada. Por favor, regularize seu pagamento para continuar acessando este recurso.",
          blocked: true
        });
      }

      // Check Plan level: verify if the module is allowed in the user's plan
      const allowedModules = company.modulos || [];
      
      let planHasModule = true;
      if (currentModule !== 'dashboard' && currentModule !== 'meuplano') {
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
      if (currentModule !== 'dashboard' && currentModule !== 'meuplano') {
        if (!userPerms[currentModule] || !userPerms[currentModule].acessar) {
          return res.status(403).json({ 
            error: `Seu usuário não possui permissão para acessar o módulo ${currentModule}. Contate o administrador.`,
            code: 'USER_RESTRICTION',
            module: currentModule 
          });
        }
      }

      next();
    } catch (err: any) {
      console.error("planMiddleware error:", err);
      res.status(500).json({ error: "Erro ao verificar plano" });
    }
  };
};
