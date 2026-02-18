import { mkdir, readdir, readFile } from "node:fs/promises";
import path from "node:path";

const MIGRATIONS_DIR = process.env.MIGRATIONS_DIR || "db/migrations";

async function ensureMigrationsTable(pool) {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      version TEXT PRIMARY KEY,
      applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);
}

export async function runMigrations(pool) {
  await mkdir(MIGRATIONS_DIR, { recursive: true });
  await ensureMigrationsTable(pool);

  const files = (await readdir(MIGRATIONS_DIR)).filter((name) => name.endsWith(".sql")).sort();

  for (const fileName of files) {
    const version = fileName.replace(/\.sql$/, "");
    const exists = await pool.query("SELECT 1 FROM schema_migrations WHERE version = $1 LIMIT 1", [
      version
    ]);

    if (exists.rowCount > 0) {
      continue;
    }

    const sql = await readFile(path.join(MIGRATIONS_DIR, fileName), "utf8");
    await pool.query("BEGIN");

    try {
      await pool.query(sql);
      await pool.query("INSERT INTO schema_migrations (version) VALUES ($1)", [version]);
      await pool.query("COMMIT");
    } catch (error) {
      await pool.query("ROLLBACK");
      throw error;
    }
  }
}
