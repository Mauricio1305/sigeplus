import { Router } from "express";
import { pool } from "../db";
import { authMiddleware, planMiddleware } from "../middleware";

const router = Router();

// Grupos de Pessoas
router.get("/grupos", authMiddleware, planMiddleware('cadastros'), async (req: any, res) => {
  try {
    const [grupos] = await pool.query(
      "SELECT * FROM grupos_pessoas WHERE tenant_id = ? ORDER BY nome ASC",
      [req.user.tenant_id]
    );
    res.json(grupos);
  } catch (err: any) {
    console.error("Error fetching grupos_pessoas:", err);
    res.status(500).json({ error: err.message });
  }
});

router.post("/grupos", authMiddleware, async (req: any, res) => {
  try {
    const { nome } = req.body;
    if (!nome || !nome.trim()) {
      return res.status(400).json({ error: "Nome do grupo é obrigatório" });
    }
    const [maxRow] = await pool.query(
      "SELECT MAX(sequencial_id) as max_id FROM grupos_pessoas WHERE tenant_id = ?",
      [req.user.tenant_id]
    ) as any[];
    const sequencial_id = (maxRow[0]?.max_id || 0) + 1;
    const [result] = await pool.query(
      "INSERT INTO grupos_pessoas (tenant_id, sequencial_id, nome) VALUES (?, ?, ?)",
      [req.user.tenant_id, sequencial_id, nome.trim()]
    ) as any[];
    const insertId = (result as any).insertId || (result as any)[0]?.id;
    res.json({ success: true, id: insertId, sequencial_id, nome: nome.trim() });
  } catch (err: any) {
    console.error("Error creating grupo_pessoa:", err);
    res.status(500).json({ error: err.message });
  }
});

router.delete("/grupos/:id", authMiddleware, async (req: any, res) => {
  try {
    const { id } = req.params;
    await pool.query("DELETE FROM grupos_pessoas WHERE id = ? AND tenant_id = ?", [id, req.user.tenant_id]);
    res.json({ success: true });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// Pessoas (Clients/Suppliers)
router.get("/", authMiddleware, planMiddleware('cadastros'), async (req: any, res) => {
  const { tipo, ativo, grupo_id } = req.query;
  let sql = `
    SELECT p.*, g.nome as grupo_nome 
    FROM pessoas p 
    LEFT JOIN grupos_pessoas g ON p.grupo_id = g.id AND p.tenant_id = g.tenant_id 
    WHERE p.tenant_id = ?
  `;
  const params: any[] = [req.user.tenant_id];

  if (tipo) {
    if (tipo === 'cliente_or_ambos') {
      sql += " AND (p.tipo_pessoa = 'cliente' OR p.tipo_pessoa = 'ambos')";
    } else {
      sql += " AND p.tipo_pessoa = ?";
      params.push(tipo);
    }
  }

  if (grupo_id) {
    sql += " AND p.grupo_id = ?";
    params.push(grupo_id);
  }

  if (ativo !== undefined) {
    sql += " AND p.ativo = ?";
    params.push(ativo === 'true' || ativo === '1' ? 1 : 0);
  }

  sql += " ORDER BY p.nome ASC";

  const [pessoas] = await pool.query(sql, params);
  res.json(pessoas);
});

router.post("/", authMiddleware, async (req: any, res) => {
  const { 
    nome, tipo_pessoa, cpf_cnpj, telefone, email, endereco, cidade, uf, ativo,
    razao_social, nome_fantasia, telefone_fixo, telefone_celular, numero, cep, data_aniversario, observacao, grupo_id
  } = req.body;
  
  const [maxSequencialRow] = await pool.query("SELECT MAX(sequencial_id) as max_id FROM pessoas WHERE tenant_id = ?", [req.user.tenant_id]) as any[];
  const sequencial_id = (maxSequencialRow[0]?.max_id || 0) + 1;

  await pool.query(`
    INSERT INTO pessoas (
      tenant_id, sequencial_id, nome, tipo_pessoa, cpf_cnpj, telefone, email, endereco, cidade, uf, ativo,
      razao_social, nome_fantasia, telefone_fixo, telefone_celular, numero, cep, data_aniversario, observacao, grupo_id
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `, [
    req.user.tenant_id, sequencial_id, nome, tipo_pessoa || 'cliente', cpf_cnpj, telefone, email, endereco, cidade, uf, 
    ativo === undefined ? 1 : (ativo ? 1 : 0),
    razao_social, nome_fantasia, telefone_fixo, telefone_celular, numero, cep, data_aniversario || null, observacao || null,
    grupo_id ? parseInt(grupo_id) : null
  ]);
  res.json({ success: true, sequencial_id });
});

router.put("/:id", authMiddleware, async (req: any, res) => {
  const { id } = req.params;
  const { 
    nome, tipo_pessoa, cpf_cnpj, telefone, email, endereco, cidade, uf, ativo,
    razao_social, nome_fantasia, telefone_fixo, telefone_celular, numero, cep, data_aniversario, observacao, grupo_id
  } = req.body;
  
  await pool.query(`
    UPDATE pessoas 
    SET nome = ?, tipo_pessoa = ?, cpf_cnpj = ?, telefone = ?, email = ?, endereco = ?, cidade = ?, uf = ?, ativo = ?, 
        razao_social = ?, nome_fantasia = ?, telefone_fixo = ?, telefone_celular = ?, numero = ?, cep = ?, data_aniversario = ?, observacao = ?, grupo_id = ?,
        updated_at = CURRENT_TIMESTAMP 
    WHERE id = ? AND tenant_id = ?
  `, [
    nome, tipo_pessoa, cpf_cnpj, telefone, email, endereco, cidade, uf, ativo ? 1 : 0, 
    razao_social, nome_fantasia, telefone_fixo, telefone_celular, numero, cep, data_aniversario || null, observacao || null, grupo_id ? parseInt(grupo_id) : null,
    id, req.user.tenant_id
  ]);
  res.json({ success: true });
});

router.delete("/:id", authMiddleware, async (req: any, res) => {
  try {
    const { id } = req.params;
    await pool.query("DELETE FROM pessoas WHERE id = ? AND tenant_id = ?", [id, req.user.tenant_id]);
    res.json({ success: true });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// Backward compatibility for clients endpoint (mounted at /api/clients in server.ts)
export const clientsRouter = Router();
clientsRouter.get("/", authMiddleware, async (req: any, res) => {
  const [clients] = await pool.query("SELECT * FROM pessoas WHERE tenant_id = ? AND (tipo_pessoa = 'cliente' OR tipo_pessoa = 'ambos')", [req.user.tenant_id]);
  res.json(clients);
});

export default router;
