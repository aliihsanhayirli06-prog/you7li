import { getPool, shouldUsePostgres } from "../infra/db.js";

if (!shouldUsePostgres()) {
  console.log("Storage driver is file. Set STORAGE_DRIVER=postgres to run DB migrations.");
  process.exit(0);
}

try {
  await getPool();
  console.log("Migrations applied successfully.");
  process.exit(0);
} catch (error) {
  console.error("Migration failed:", error.message);
  process.exit(1);
}
