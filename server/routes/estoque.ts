import { Router } from "express";
import { pool } from "../db";
import { authMiddleware, planMiddleware } from "../middleware";

const router = Router();

// --- PRODUCTS ---

router.get("/products", authMiddleware, planMiddleware('estoque'), async (req: any, res) => {
  const [products] = await pool.query(`
    SELECT p.*, g.nome as grupo_nome 
    FROM produtos p 
    LEFT JOIN grupos_produtos g ON p.grupo_id = g.id 
    WHERE p.tenant_id = ?
  `, [req.user.tenant_id]);
  res.json(products);
});

router.post("/products", authMiddleware, planMiddleware('estoque'), async (req: any, res) => {
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

router.put("/products/:id", authMiddleware, planMiddleware('estoque'), async (req: any, res) => {
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

// --- INVENTORY GROUPS ---

router.get("/inventory/groups", authMiddleware, async (req: any, res) => {
  try {
    const { tenant_id } = req.user;
    const [groups] = await pool.query("SELECT * FROM grupos_produtos WHERE tenant_id = ?", [tenant_id]);
    res.json(groups);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

router.post("/inventory/groups", authMiddleware, async (req: any, res) => {
  try {
    const { tenant_id } = req.user;
    const { nome } = req.body;
    const [result] = await pool.query("INSERT INTO grupos_produtos (tenant_id, nome) VALUES (?, ?)", [tenant_id, nome]) as any[];
    res.json({ id: result.insertId, nome });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

router.put("/inventory/groups/:id", authMiddleware, async (req: any, res) => {
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

router.delete("/inventory/groups/:id", authMiddleware, async (req: any, res) => {
  try {
    const { tenant_id } = req.user;
    const { id } = req.params;
    await pool.query("DELETE FROM grupos_produtos WHERE id = ? AND tenant_id = ?", [id, tenant_id]);
    res.json({ success: true });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// --- LABEL LAYOUTS ---

router.get("/inventory/layouts", authMiddleware, async (req: any, res) => {
  try {
    const { tenant_id } = req.user;
    const [layouts] = await pool.query("SELECT * FROM layouts_etiquetas WHERE tenant_id = ?", [tenant_id]);
    res.json(layouts);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

router.post("/inventory/layouts", authMiddleware, async (req: any, res) => {
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

router.put("/inventory/layouts/:id", authMiddleware, async (req: any, res) => {
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

router.delete("/inventory/layouts/:id", authMiddleware, async (req: any, res) => {
  try {
    const { tenant_id } = req.user;
    const { id } = req.params;
    await pool.query("DELETE FROM layouts_etiquetas WHERE id = ? AND tenant_id = ?", [id, tenant_id]);
    res.json({ success: true });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
