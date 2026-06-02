import { Router } from "express";
import { pool } from "../db";
import { authMiddleware, planMiddleware } from "../middleware";

const router = Router();

// Pessoas (Clients/Suppliers)
router.get("/", authMiddleware, planMiddleware('cadastros'), async (req: any, res) => {
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

router.post("/", authMiddleware, async (req: any, res) => {
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

router.put("/:id", authMiddleware, async (req: any, res) => {
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

// Backward compatibility for clients endpoint (mounted at /api/clients in server.ts)
export const clientsRouter = Router();
clientsRouter.get("/", authMiddleware, async (req: any, res) => {
  const [clients] = await pool.query("SELECT * FROM pessoas WHERE tenant_id = ? AND (tipo_pessoa = 'cliente' OR tipo_pessoa = 'ambos')", [req.user.tenant_id]);
  res.json(clients);
});

export default router;
