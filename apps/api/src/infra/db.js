import { runMigrations } from "./migrationRunner.js";
import { recordQueryProfile } from "./queryProfiler.js";

let pool;
let migrationsDone = false;

function getStorageDriver() {
  return process.env.STORAGE_DRIVER || "auto";
}

export function shouldUsePostgres() {
  const driver = getStorageDriver();
  if (driver === "postgres") return true;
  if (driver === "file") return false;
  return Boolean(process.env.DATABASE_URL);
}

export async function getPool() {
  if (!shouldUsePostgres()) {
    return null;
  }

  if (!pool) {
    const { Pool } = await import("pg");
    pool = new Pool({
      connectionString: process.env.DATABASE_URL,
      max: 5
    });
    const rawQuery = pool.query.bind(pool);
    pool.query = async (...args) => {
      const startedAt = Date.now();
      try {
        return await rawQuery(...args);
      } finally {
        const sql = typeof args[0] === "string" ? args[0] : args[0]?.text || "";
        recordQueryProfile({
          sql,
          durationMs: Date.now() - startedAt
        });
      }
    };
  }

  if (!migrationsDone) {
    await runMigrations(pool);
    migrationsDone = true;
  }

  return pool;
}
