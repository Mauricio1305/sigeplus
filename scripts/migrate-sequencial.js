import { pgPool } from '../server/db.js';

async function run() {
  try {
    console.log("Checking and adding sequencial_id to pessoas and produtos...");
    
    // Add columns if they don't exist
    await pgPool.query(`ALTER TABLE pessoas ADD COLUMN IF NOT EXISTS sequencial_id INTEGER;`);
    await pgPool.query(`ALTER TABLE produtos ADD COLUMN IF NOT EXISTS sequencial_id INTEGER;`);

    // Populate for pessoas
    console.log("Populating sequencial_id for pessoas...");
    await pgPool.query(`
      WITH numbered AS (
        SELECT id, ROW_NUMBER() OVER(PARTITION BY tenant_id ORDER BY id ASC) as seq
        FROM pessoas
        WHERE sequencial_id IS NULL
      )
      UPDATE pessoas p
      SET sequencial_id = n.seq
      FROM numbered n
      WHERE p.id = n.id;
    `);

    // Populate for produtos
    console.log("Populating sequencial_id for produtos...");
    await pgPool.query(`
      WITH numbered AS (
        SELECT id, ROW_NUMBER() OVER(PARTITION BY tenant_id ORDER BY id ASC) as seq
        FROM produtos
        WHERE sequencial_id IS NULL
      )
      UPDATE produtos p
      SET sequencial_id = n.seq
      FROM numbered n
      WHERE p.id = n.id;
    `);

    console.log("Migration complete!");
  } catch (err) {
    console.error("Migration failed:", err);
  } finally {
    process.exit(0);
  }
}

run();
