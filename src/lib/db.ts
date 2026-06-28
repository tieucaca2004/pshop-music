import mysql from "mysql2/promise";

declare global {
  var __mysqlPool: mysql.Pool | undefined;
}

function createPool() {
  const rawUrl = process.env.DATABASE_URL;
  if (!rawUrl) {
    throw new Error("DATABASE_URL is not set");
  }

  const parsed = new URL(rawUrl);
  const sslMode = parsed.searchParams.get("ssl-mode");
  parsed.searchParams.delete("ssl-mode");

  return mysql.createPool({
    uri: parsed.toString(),
    waitForConnections: true,
    connectionLimit: 10,
    queueLimit: 0,
    dateStrings: true,
    ssl: sslMode && sslMode.toUpperCase() !== "DISABLED" ? { rejectUnauthorized: false } : undefined,
  });
}

export function getPool() {
  if (!global.__mysqlPool) {
    global.__mysqlPool = createPool();
  }
  return global.__mysqlPool;
}

export async function query<T = unknown>(sql: string, params: unknown[] = []): Promise<T> {
  const pool = getPool();
  const [rows] = await pool.query(sql, params);
  return rows as T;
}
