import { PGlite } from "@electric-sql/pglite";
import { Pool, PoolClient } from "pg";
import path from "path";
import fs from "fs";

export interface QueryResult<T = any> {
  rows: T[];
  rowCount: number;
}

export interface TxClient {
  query: <T = any>(sql: string, params?: any[]) => Promise<QueryResult<T>>;
}

declare global {
  // eslint-disable-next-line no-var
  var __shopsphere_pglite: PGlite | undefined;
  // eslint-disable-next-line no-var
  var __shopsphere_pgpool: Pool | undefined;
  // eslint-disable-next-line no-var
  var __shopsphere_pg_init_promise: Promise<void> | undefined;
  // eslint-disable-next-line no-var
  var __shopsphere_pg_mutex: Promise<any> | undefined;
}

const useExternalPostgres = Boolean(
  process.env.DATABASE_URL && process.env.DATABASE_URL.trim().startsWith("postgres")
);

async function getPGliteInstance(): Promise<PGlite> {
  if (!global.__shopsphere_pglite) {
    const dataDir = path.resolve(
      process.cwd(),
      process.env.POSTGRES_DATA_DIR || "./.pgdata"
    );
    if (!fs.existsSync(dataDir)) {
      fs.mkdirSync(dataDir, { recursive: true });
    }
    global.__shopsphere_pglite = new PGlite(dataDir);
    await global.__shopsphere_pglite.waitReady;
  }
  return global.__shopsphere_pglite;
}

function getPgPool(): Pool {
  if (!global.__shopsphere_pgpool) {
    global.__shopsphere_pgpool = new Pool({
      connectionString: process.env.DATABASE_URL,
    });
  }
  return global.__shopsphere_pgpool;
}

/**
 * Serializes access on PGlite single-connection WASM engine to prevent overlapping transactions
 */
async function withMutex<T>(fn: () => Promise<T>): Promise<T> {
  const prev = global.__shopsphere_pg_mutex ?? Promise.resolve();
  let release!: () => void;
  global.__shopsphere_pg_mutex = new Promise<void>((resolve) => {
    release = resolve;
  });
  await prev;
  try {
    return await fn();
  } finally {
    release();
  }
}

export async function pgQuery<T = any>(
  sql: string,
  params: any[] = []
): Promise<QueryResult<T>> {
  if (useExternalPostgres) {
    const pool = getPgPool();
    const res = await pool.query(sql, params);
    return {
      rows: res.rows as T[],
      rowCount: res.rowCount ?? res.rows.length,
    };
  }

  return withMutex(async () => {
    const db = await getPGliteInstance();
    const res = await db.query<T>(sql, params);
    return {
      rows: res.rows,
      rowCount: res.affectedRows ?? res.rows.length,
    };
  });
}

export async function pgExec(sql: string): Promise<void> {
  if (useExternalPostgres) {
    const pool = getPgPool();
    await pool.query(sql);
    return;
  }

  await withMutex(async () => {
    const db = await getPGliteInstance();
    await db.exec(sql);
  });
}

/**
 * Executes a callback inside a strict ACID PostgreSQL Transaction (BEGIN -> COMMIT / ROLLBACK)
 */
export async function pgTransaction<T>(
  callback: (tx: TxClient) => Promise<T>
): Promise<T> {
  if (useExternalPostgres) {
    const pool = getPgPool();
    const client: PoolClient = await pool.connect();
    try {
      await client.query("BEGIN");
      const txClient: TxClient = {
        query: async <R = any>(sql: string, params: any[] = []) => {
          const r = await client.query(sql, params);
          return { rows: r.rows as R[], rowCount: r.rowCount ?? r.rows.length };
        },
      };
      const result = await callback(txClient);
      await client.query("COMMIT");
      return result;
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  }

  return withMutex(async () => {
    const db = await getPGliteInstance();
    await db.exec("BEGIN");
    try {
      const txClient: TxClient = {
        query: async <R = any>(sql: string, params: any[] = []) => {
          const r = await db.query<R>(sql, params);
          return {
            rows: r.rows,
            rowCount: r.affectedRows ?? r.rows.length,
          };
        },
      };
      const result = await callback(txClient);
      await db.exec("COMMIT");
      return result;
    } catch (error) {
      await db.exec("ROLLBACK");
      throw error;
    }
  });
}

export function getPostgresEngineInfo() {
  return {
    engine: useExternalPostgres
      ? "PostgreSQL Server (External TCP Pool)"
      : "PostgreSQL 16.4 (PGlite Persistent Relational Engine)",
    dataDir: process.env.POSTGRES_DATA_DIR || "./.pgdata",
  };
}
