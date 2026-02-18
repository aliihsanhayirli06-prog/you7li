import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { getPool, shouldUsePostgres } from "./db.js";

const DATA_DIR = process.env.DATA_DIR || "data";
const TENANTS_FILE = path.join(DATA_DIR, "tenants.json");
const DEFAULT_TENANT = {
  tenantId: "t_default",
  name: "Default Tenant",
  planCode: "free",
  status: "active",
  settings: {
    locale: "tr",
    timezone: "Europe/Istanbul",
    isolationMode: "soft"
  }
};

async function ensureFile() {
  await mkdir(DATA_DIR, { recursive: true });
  try {
    await readFile(TENANTS_FILE, "utf8");
  } catch {
    await writeFile(TENANTS_FILE, JSON.stringify([DEFAULT_TENANT], null, 2), "utf8");
  }
}

async function readFromFile() {
  await ensureFile();
  const raw = await readFile(TENANTS_FILE, "utf8");
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [DEFAULT_TENANT];
  } catch {
    return [DEFAULT_TENANT];
  }
}

async function writeToFile(items) {
  await writeFile(TENANTS_FILE, JSON.stringify(items, null, 2), "utf8");
}

function mapRow(row) {
  return {
    tenantId: row.tenant_id,
    name: row.name,
    planCode: row.plan_code,
    status: row.status,
    settings: row.settings || {}
  };
}

export async function ensureDefaultTenant() {
  if (!shouldUsePostgres()) {
    const tenants = await readFromFile();
    if (tenants.some((item) => item.tenantId === DEFAULT_TENANT.tenantId)) return DEFAULT_TENANT;
    tenants.unshift(DEFAULT_TENANT);
    await writeToFile(tenants);
    return DEFAULT_TENANT;
  }

  const pool = await getPool();
  await pool.query(
    `
    INSERT INTO tenants (tenant_id, name, plan_code, status, settings)
    VALUES ($1, $2, $3, $4, $5)
    ON CONFLICT (tenant_id) DO NOTHING
    `,
    [
      DEFAULT_TENANT.tenantId,
      DEFAULT_TENANT.name,
      DEFAULT_TENANT.planCode,
      DEFAULT_TENANT.status,
      JSON.stringify(DEFAULT_TENANT.settings)
    ]
  );

  return DEFAULT_TENANT;
}

export async function listTenants() {
  await ensureDefaultTenant();

  if (!shouldUsePostgres()) return readFromFile();

  const pool = await getPool();
  const result = await pool.query(
    `
    SELECT tenant_id, name, plan_code, status, settings
    FROM tenants
    ORDER BY created_at ASC
    `
  );
  return result.rows.map(mapRow);
}

export async function getTenantById(tenantId) {
  if (!tenantId) return null;
  await ensureDefaultTenant();

  if (!shouldUsePostgres()) {
    const tenants = await readFromFile();
    return tenants.find((item) => item.tenantId === tenantId) || null;
  }

  const pool = await getPool();
  const result = await pool.query(
    `
    SELECT tenant_id, name, plan_code, status, settings
    FROM tenants
    WHERE tenant_id = $1
    LIMIT 1
    `,
    [tenantId]
  );

  if (result.rowCount === 0) return null;
  return mapRow(result.rows[0]);
}

export async function createTenant({
  tenantId,
  name,
  planCode = "free",
  status = "active",
  settings = {}
}) {
  if (!tenantId || !name) {
    throw new Error("TENANT_ID_AND_NAME_REQUIRED");
  }

  const payload = { tenantId, name, planCode, status, settings };
  await ensureDefaultTenant();

  if (!shouldUsePostgres()) {
    const tenants = await readFromFile();
    if (tenants.some((item) => item.tenantId === tenantId))
      throw new Error("TENANT_ALREADY_EXISTS");
    tenants.push(payload);
    await writeToFile(tenants);
    return payload;
  }

  const pool = await getPool();
  try {
    await pool.query(
      `
      INSERT INTO tenants (tenant_id, name, plan_code, status, settings)
      VALUES ($1, $2, $3, $4, $5)
      `,
      [
        payload.tenantId,
        payload.name,
        payload.planCode,
        payload.status,
        JSON.stringify(payload.settings)
      ]
    );
  } catch (error) {
    if (
      String(error.message || "")
        .toLowerCase()
        .includes("duplicate")
    ) {
      throw new Error("TENANT_ALREADY_EXISTS");
    }
    throw error;
  }

  return payload;
}

export async function updateTenantSettings(tenantId, patch = {}) {
  if (!tenantId) throw new Error("TENANT_ID_REQUIRED");
  await ensureDefaultTenant();

  if (!shouldUsePostgres()) {
    const tenants = await readFromFile();
    const idx = tenants.findIndex((item) => item.tenantId === tenantId);
    if (idx === -1) return null;
    tenants[idx] = {
      ...tenants[idx],
      settings: { ...(tenants[idx].settings || {}), ...(patch.settings || {}) },
      planCode: patch.planCode || tenants[idx].planCode,
      status: patch.status || tenants[idx].status
    };
    await writeToFile(tenants);
    return tenants[idx];
  }

  const current = await getTenantById(tenantId);
  if (!current) return null;

  const next = {
    settings: { ...(current.settings || {}), ...(patch.settings || {}) },
    planCode: patch.planCode || current.planCode,
    status: patch.status || current.status
  };

  const pool = await getPool();
  const result = await pool.query(
    `
    UPDATE tenants
    SET settings = $2,
        plan_code = $3,
        status = $4,
        updated_at = NOW()
    WHERE tenant_id = $1
    RETURNING tenant_id, name, plan_code, status, settings
    `,
    [tenantId, JSON.stringify(next.settings), next.planCode, next.status]
  );
  if (result.rowCount === 0) return null;
  return mapRow(result.rows[0]);
}
