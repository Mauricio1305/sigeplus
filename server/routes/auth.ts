import { Router } from "express";
import jwt from "jsonwebtoken";
import bcrypt from "bcryptjs";
import { pool } from "../db";
import { authMiddleware } from "../middleware";
import { getStripe, transporter } from "../utils";
import { DEFAULT_MASTER_PERMISSOES, parseJSON } from "../permissions";

const router = Router();
const JWT_SECRET = process.env.JWT_SECRET || "saas-secret-key-123";

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
        </div>
      `,
    };

    await transporter.sendMail(mailOptions);
  } catch (error) {
    console.error("Error sending welcome email:", error);
  }
};

router.post("/register", async (req, res) => {
  const { nome, email, senha, empresa, companyName, password, name, whatsapp, plano_id } = req.body;
  
  const finalNome = nome || name;
  const finalSenha = senha || password;
  const finalEmpresa = empresa || companyName;

  if (!finalNome || !email || !finalSenha || !finalEmpresa) {
    return res.status(400).json({ error: "Todos os campos são obrigatórios." });
  }

  try {
    const [existing] = await pool.query("SELECT id FROM usuarios WHERE email = ?", [email]) as any[];
    if (existing.length > 0) {
      return res.status(400).json({ error: "Este e-mail já está em uso." });
    }

    const tenant_id = `t_${Date.now()}`;
    const salt = bcrypt.genSaltSync(10);
    const hashedPassword = bcrypt.hashSync(finalSenha, salt);
    
    // Determine the plan
    let planId = 1;
    let trialDays = 7;
    if (plano_id) {
       const [chosenPlans] = await pool.query("SELECT id, trial_days FROM planos WHERE id = ?", [plano_id]) as any[];
       if (chosenPlans.length > 0) {
         planId = chosenPlans[0].id;
         trialDays = chosenPlans[0].trial_days || 7;
       }
    } else {
       const [allPlans] = await pool.query("SELECT id, trial_days FROM planos WHERE is_trial = 1 ORDER BY id ASC LIMIT 1") as any[];
       if (allPlans.length > 0) {
         planId = allPlans[0].id;
         trialDays = allPlans[0].trial_days || 7;
       }
    }
    
    const vencimento = new Date();
    vencimento.setDate(vencimento.getDate() + trialDays);

    await pool.query(
      "INSERT INTO empresas (tenant_id, nome_fantasia, razao_social, email, whatsapp, status_assinatura, plano_id, vencimento_assinatura) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
      [tenant_id, finalEmpresa, finalEmpresa, email, whatsapp || null, 'ativo', planId, vencimento]
    );

    const [userResult] = await pool.query(
      "INSERT INTO usuarios (tenant_id, nome, email, senha, perfil) VALUES (?, ?, ?, ?, ?)",
      [tenant_id, finalNome, email, hashedPassword, 'admin']
    ) as any[];

    // Seed master group for NEW company
    const masterPermissoes = JSON.stringify({
      financeiro: { acessar: true, lancar: true, editar: true, cancelar: true, estornar: true },
      vendas: { acessar: true, lancar: true, cancelar: true, relatorios: true },
      pdv: { acessar: true, vender: true, cancelar: true },
      estoque: { acessar: true, editar: true, excluir: true },
      cadastros: { acessar: true, editar: true, excluir: true },
      configuracoes: { acessar: true, editar: true },
      agenda: { acessar: true, criar: true, cancelar: true, ver_outros: true },
      mesas: { acessar: true, comandas: true },
      os: { acessar: true, criar: true, editar: true, cancelar: true },
      etiquetas: { acessar: true, imprimir: true },
      relatorios: { acessar: true, sales: true, inventory: true, finance: true, comissoes: true, dre: true, people: true, agenda: true, notifications: true }
    });

    const [groupRes] = await pool.query(
      "INSERT INTO grupos_usuarios (tenant_id, nome, is_master, permissoes) VALUES (?, 'Master', 1, ?)",
      [tenant_id, masterPermissoes]
    ) as any[];
    
    await pool.query("UPDATE usuarios SET grupo_id = ? WHERE id = ?", [groupRes.insertId, userResult.insertId]);

    await sendWelcomeEmail(email, finalNome, finalEmpresa);

    const userObj = {
      id: userResult.insertId,
      tenant_id,
      nome: finalNome,
      email,
      perfil: 'admin',
      grupo_id: groupRes.insertId,
      telefone: whatsapp || null
    };

    const permissoesObj = JSON.parse(masterPermissoes);
    
    // Check if the plan we used has 'modulos'
    let modulos: string[] = [];
    if (plano_id) {
       const [chosenPlans] = await pool.query("SELECT modulos FROM planos WHERE id = ?", [planId]) as any[];
       if (chosenPlans.length > 0 && chosenPlans[0].modulos) {
         modulos = typeof chosenPlans[0].modulos === 'string' ? JSON.parse(chosenPlans[0].modulos) : chosenPlans[0].modulos;
       }
    } else {
       const [allPlans] = await pool.query("SELECT modulos FROM planos WHERE id = ?", [planId]) as any[];
       if (allPlans.length > 0 && allPlans[0].modulos) {
         modulos = typeof allPlans[0].modulos === 'string' ? JSON.parse(allPlans[0].modulos) : allPlans[0].modulos;
       }
    }

    const token = jwt.sign(
      { 
        id: userObj.id, 
        tenant_id, 
        perfil: userObj.perfil, 
        nome: userObj.nome, 
        status_assinatura: 'ativo', 
        vencimento_assinatura: vencimento, 
        plano_id: planId, 
        modulos, 
        permissoes: permissoesObj 
      },
      JWT_SECRET,
      { expiresIn: "1d" }
    );

    res.status(201).json({ 
      message: "Registro realizado com sucesso!",
      token,
      user: { 
        ...userObj, 
        status_assinatura: 'ativo', 
        vencimento_assinatura: vencimento, 
        plano_id: planId, 
        modulos, 
        permissoes: permissoesObj 
      }
    });
  } catch (err: any) {
    console.error("Registration error:", err);
    res.status(500).json({ error: "Erro ao realizar registro: " + err.message });
  }
});

router.post("/login", async (req, res) => {
  const { email, password } = req.body;
  try {
    const [users] = await pool.query("SELECT * FROM usuarios WHERE email = ?", [email]) as any[];
    const user = users[0];

    if (!user) return res.status(401).json({ error: "Credenciais inválidas" });

    const passwordMatch = await bcrypt.compare(password, user.senha);
    if (!passwordMatch) return res.status(401).json({ error: "Credenciais inválidas" });

    const [companies] = await pool.query(`
      SELECT e.status_assinatura, e.vencimento_assinatura, e.plano_id, e.stripe_subscription_id, 
             COALESCE(p.modulos, (SELECT modulos FROM planos ORDER BY id ASC LIMIT 1)) as modulos 
      FROM empresas e 
      LEFT JOIN planos p ON e.plano_id = p.id 
      WHERE e.tenant_id = ?
    `, [user.tenant_id]) as any[];
    
    let company = companies[0];

    if (company?.stripe_subscription_id) {
      try {
        const stripe = getStripe();
        const subscription = (await stripe.subscriptions.retrieve(company.stripe_subscription_id)) as any;
        const stripeStatus = subscription.status;
        const currentPeriodEnd = subscription.current_period_end;
        
        let newVencimento = currentPeriodEnd ? new Date(currentPeriodEnd * 1000) : (company.vencimento_assinatura ? new Date(company.vencimento_assinatura) : new Date());
        if (isNaN(newVencimento.getTime())) {
          newVencimento = new Date();
          newVencimento.setDate(newVencimento.getDate() + 30);
        }
        let newStatus = company.status_assinatura;

        if (stripeStatus === 'active' || stripeStatus === 'trialing') {
          newStatus = (subscription.cancel_at_period_end || (subscription as any).cancel_at || (subscription as any).cancellation_details?.reason === 'cancellation_requested') ? 'Cancelamento Solicitado' : 'ativo';
        } else if (stripeStatus === 'past_due') {
          newStatus = 'pagamento_pendente';
        } else {
          const localVencimento = company.vencimento_assinatura ? new Date(company.vencimento_assinatura) : null;
          newStatus = (localVencimento && localVencimento > new Date()) ? 'Cancelamento Solicitado' : 'cancelado';
        }

        if (newStatus !== company.status_assinatura) {
          await pool.query("UPDATE empresas SET status_assinatura = ?, vencimento_assinatura = ? WHERE tenant_id = ?", [newStatus, newVencimento, user.tenant_id]);
          company.status_assinatura = newStatus;
          company.vencimento_assinatura = newVencimento;
        }
      } catch (stripeErr: any) {
        console.warn(`Stripe verification failed for ${user.tenant_id}:`, stripeErr.message);
        if (stripeErr.message?.includes("No such subscription") || stripeErr.code === "resource_missing") {
          try {
            await pool.query("UPDATE empresas SET stripe_subscription_id = NULL, status_assinatura = 'cancelado' WHERE tenant_id = ?", [user.tenant_id]);
            if (company) {
              company.stripe_subscription_id = null;
              company.status_assinatura = 'cancelado';
            }
          } catch (dbErr) {
            console.error("Failed to clear invalid Stripe subscription ID from DB:", dbErr);
          }
        }
      }
    }

    let permissoes: any = {};
    if (user.grupo_id) {
      const [grupos] = await pool.query("SELECT is_master, permissoes FROM grupos_usuarios WHERE id = ?", [user.grupo_id]) as any[];
      if (grupos.length > 0) {
        permissoes = parseJSON(grupos[0].permissoes, {});
        if (grupos[0].is_master || user.perfil === 'admin' || user.perfil === 'superadmin') {
          permissoes = { ...DEFAULT_MASTER_PERMISSOES, ...permissoes };
        }
      }
    } else {
      if (user.perfil === 'admin' || user.perfil === 'superadmin') {
        permissoes = DEFAULT_MASTER_PERMISSOES;
      } else if (user.tenant_id) {
        const [masterGroup] = await pool.query("SELECT permissoes FROM grupos_usuarios WHERE tenant_id = ? AND (is_master = 1 OR nome = 'Master')", [user.tenant_id]) as any[];
        if (masterGroup.length > 0) {
          permissoes = parseJSON(masterGroup[0].permissoes, {});
        }
      }
    }

    const modulosParsed = parseJSON(company?.modulos, []);

    const token = jwt.sign(
      { id: user.id, tenant_id: user.tenant_id, perfil: user.perfil, nome: user.nome, status_assinatura: company?.status_assinatura, vencimento_assinatura: company?.vencimento_assinatura, plano_id: company?.plano_id, modulos: modulosParsed, permissoes },
      JWT_SECRET,
      { expiresIn: "1d" }
    );

    res.json({ token, user: { ...user, status_assinatura: company?.status_assinatura, vencimento_assinatura: company?.vencimento_assinatura, plano_id: company?.plano_id, modulos: modulosParsed, permissoes } });
  } catch (err: any) {
    res.status(500).json({ error: "Erro interno do servidor", details: err.message });
  }
});

router.get("/me", authMiddleware, async (req: any, res) => {
  try {
    const [users] = await pool.query("SELECT id, tenant_id, nome, email, perfil, avatar, grupo_id FROM usuarios WHERE id = ?", [req.user.id]) as any[];
    const user = users[0];
    if (!user) return res.status(404).json({ error: "Usuário não encontrado" });

    const [companies] = await pool.query(`
      SELECT e.status_assinatura, e.vencimento_assinatura, e.plano_id, e.stripe_subscription_id, 
             COALESCE(p.modulos, (SELECT modulos FROM planos ORDER BY id ASC LIMIT 1)) as modulos 
      FROM empresas e 
      LEFT JOIN planos p ON e.plano_id = p.id 
      WHERE e.tenant_id = ?
    `, [user.tenant_id]) as any[];
    let company = companies[0] || { status_assinatura: 'ativo', vencimento_assinatura: null, plano_id: 1, modulos: [] };

    let permissoes: any = {};
    if (user.grupo_id) {
      const [grupos] = await pool.query("SELECT is_master, permissoes FROM grupos_usuarios WHERE id = ?", [user.grupo_id]) as any[];
      if (grupos.length > 0) {
        permissoes = parseJSON(grupos[0].permissoes, {});
        if (grupos[0].is_master || user.perfil === 'admin' || user.perfil === 'superadmin') {
          permissoes = { ...DEFAULT_MASTER_PERMISSOES, ...permissoes };
        }
      }
    } else {
      if (user.perfil === 'admin' || user.perfil === 'superadmin') {
        permissoes = DEFAULT_MASTER_PERMISSOES;
      } else if (user.tenant_id) {
        const [masterGroup] = await pool.query("SELECT permissoes FROM grupos_usuarios WHERE tenant_id = ? AND (is_master = 1 OR nome = 'Master')", [user.tenant_id]) as any[];
        if (masterGroup.length > 0) {
          permissoes = parseJSON(masterGroup[0].permissoes, {});
        }
      }
    }

    const modulosParsed = parseJSON(company.modulos, []);

    res.json({ user: { ...user, status_assinatura: company.status_assinatura, vencimento_assinatura: company.vencimento_assinatura, plano_id: company.plano_id, modulos: modulosParsed, permissoes } });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

router.post("/forgot-password", async (req, res) => {
  const { email } = req.body;
  try {
    const [users] = await pool.query("SELECT * FROM usuarios WHERE email = ?", [email]) as any[];
    if (users.length === 0) return res.status(404).json({ error: "E-mail não encontrado" });

    const codigo = Math.floor(100000 + Math.random() * 900000).toString();
    const expiraEm = new Date(Date.now() + 120 * 1000); 

    await pool.query("INSERT INTO recuperacao_senha (email, codigo, expira_em) VALUES (?, ?, ?)", [email, codigo, expiraEm]);

    await transporter.sendMail({
      from: process.env.SMTP_FROM,
      to: email,
      subject: "Código de Recuperação de Senha",
      html: `<p>Seu código de recuperação de senha é: <strong>${codigo}</strong></p><p>Ele expira em 120 segundos.</p>`,
    });
    res.json({ message: "Código enviado com sucesso" });
  } catch (err: any) {
    res.status(500).json({ error: "Erro ao enviar e-mail de recuperação" });
  }
});

router.post("/reset-password", async (req, res) => {
  const { email, codigo, novaSenha } = req.body;
  try {
    const [rows] = await pool.query("SELECT * FROM recuperacao_senha WHERE email = ? AND codigo = ? AND usado = 0 AND expira_em > NOW()", [email, codigo]) as any[];
    if (rows.length === 0) return res.status(400).json({ error: "Código inválido ou expirado" });

    const hashedPassword = await bcrypt.hash(novaSenha, 10);
    await pool.query("UPDATE usuarios SET senha = ? WHERE email = ?", [hashedPassword, email]);
    await pool.query("UPDATE recuperacao_senha SET usado = 1 WHERE id = ?", [rows[0].id]);
    res.json({ message: "Senha alterada com sucesso" });
  } catch (err: any) {
    res.status(500).json({ error: "Erro ao resetar senha" });
  }
});

router.put("/profile", authMiddleware, async (req: any, res) => {
  const { nome, avatar, senha } = req.body;
  const userId = req.user.id;
  try {
    let query = "UPDATE usuarios SET nome = ?, avatar = ? WHERE id = ?";
    let params = [nome, avatar, userId];
    if (senha) {
      params = [nome, avatar, await bcrypt.hash(senha, 10), userId];
      query = "UPDATE usuarios SET nome = ?, avatar = ?, senha = ? WHERE id = ?";
    }
    await pool.query(query, params);
    const [users] = await pool.query("SELECT id, tenant_id, nome, email, perfil, avatar FROM usuarios WHERE id = ?", [userId]) as any[];
    res.json({ success: true, user: users[0] });
  } catch (err: any) {
    res.status(500).json({ error: "Erro ao atualizar perfil" });
  }
});

export default router;
