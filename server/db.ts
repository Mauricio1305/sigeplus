import pg from "pg";
import dotenv from "dotenv";

dotenv.config();

// Fix for timestamp timezone issues: return raw strings from PG
pg.types.setTypeParser(1114, (stringValue) => stringValue);

const requiredEnvVars = ['DB_HOST', 'DB_USER', 'DB_PASS', 'DB_NAME', 'DB_PORT'];

export const pgPool = new pg.Pool({
  host: process.env.DB_HOST || "localhost",
  user: process.env.DB_USER || "postgres",
  password: process.env.DB_PASS || "",
  database: process.env.DB_NAME || "postgres",
  port: parseInt(process.env.DB_PORT || "5432"),
  max: 20,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 5000,
});

function checkDatabaseConfig() {
  const missingEnvVars = requiredEnvVars.filter(varName => !process.env[varName]);
  if (missingEnvVars.length > 0) {
    throw new Error(`Critical: Missing database environment variables: ${missingEnvVars.join(', ')}. Please configure them in your settings/environment.`);
  }
}

export const processQuery = (sql: string) => {
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

export const pool = {
  async query(sql: string, params?: any[]) {
    checkDatabaseConfig();
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
    checkDatabaseConfig();
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
