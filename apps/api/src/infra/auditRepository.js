import crypto from "node:crypto";
import { appendFile, mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { getPool, shouldUsePostgres } from "./db.js";

const DATA_DIR = process.env.DATA_DIR || "data";
const AUDIT_FILE = path.join(DATA_DIR, "audit-trail.jsonl");

function stable(value) {
  if (value == null || typeof value !== "object") return value;
  if (Array.isArray(value)) return value.map((item) => stable(item));
  const out = {};
  for (const key of Object.keys(value).sort()) {
    out[key] = stable(value[key]);
  }
  return out;
}

function hashRecord(payload) {
  const body = JSON.stringify(stable(payload));
  return crypto.createHash("sha256").update(body).digest("hex");
}

async function ensureFile() {
  await mkdir(DATA_DIR, { recursive: true });
  try {
    await readFile(AUDIT_FILE, "utf8");
  } catch {
    await writeFile(AUDIT_FILE, "", "utf8");
  }
}

async function readFileEvents() {
  await ensureFile();
  const raw = await readFile(AUDIT_FILE, "utf8");
  return raw
    .split("\n")
    .filter(Boolean)
    .map((line) => {
      try {
        return JSON.parse(line);
      } catch {
        return null;
      }
    })
    .filter(Boolean);
}

async function readFileEventsStrict() {
  await ensureFile();
  const raw = await readFile(AUDIT_FILE, "utf8");
  const lines = raw.split("\n").filter(Boolean);
  const events = [];
  for (let i = 0; i < lines.length; i += 1) {
    try {
      events.push(JSON.parse(lines[i]));
    } catch {
      return { ok: false, events: [], failedAt: i, reason: "INVALID_JSON_LINE" };
    }
  }
  return { ok: true, events, failedAt: null, reason: null };
}

async function getLastHashFile() {
  const events = await readFileEvents();
  if (events.length === 0) return null;
  return events[events.length - 1].chainHash || null;
}

function mapRow(row) {
  return {
    eventId: row.event_id,
    tenantId: row.tenant_id,
    publishId: row.publish_id || null,
    eventType: row.event_type,
    actorRole: row.actor_role || null,
    payload: row.payload || {},
    prevHash: row.prev_hash || null,
    chainHash: row.chain_hash,
    createdAt: new Date(row.created_at).toISOString()
  };
}

export async function appendAuditEvent(event) {
  const createdAt = event.createdAt || new Date().toISOString();
  const payload = {
    eventId: event.eventId,
    tenantId: event.tenantId || "t_default",
    publishId: event.publishId || null,
    eventType: event.eventType,
    actorRole: event.actorRole || null,
    payload: event.payload || {},
    createdAt
  };

  if (!shouldUsePostgres()) {
    const prevHash = await getLastHashFile();
    const chainHash = hashRecord({ ...payload, prevHash });
    const saved = { ...payload, prevHash, chainHash };
    await ensureFile();
    await appendFile(AUDIT_FILE, `${JSON.stringify(saved)}\n`, "utf8");
    return saved;
  }

  const pool = await getPool();
  const prevResult = await pool.query(
    `
    SELECT chain_hash
    FROM audit_events
    ORDER BY created_at DESC
    LIMIT 1
    `
  );
  const prevHash = prevResult.rowCount ? prevResult.rows[0].chain_hash : null;
  const chainHash = hashRecord({ ...payload, prevHash });
  const saved = { ...payload, prevHash, chainHash };

  await pool.query(
    `
    INSERT INTO audit_events (
      event_id, tenant_id, publish_id, event_type, actor_role, payload, prev_hash, chain_hash, created_at
    ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
    `,
    [
      saved.eventId,
      saved.tenantId,
      saved.publishId,
      saved.eventType,
      saved.actorRole,
      JSON.stringify(saved.payload),
      saved.prevHash,
      saved.chainHash,
      saved.createdAt
    ]
  );

  return saved;
}

export async function listAuditEvents({ tenantId = null, publishId = null, limit = 100 } = {}) {
  if (!shouldUsePostgres()) {
    const events = await readFileEvents();
    const filtered = events.filter((item) => {
      if (tenantId && item.tenantId !== tenantId) return false;
      if (publishId && item.publishId !== publishId) return false;
      return true;
    });
    return filtered.slice(-limit).reverse();
  }

  const pool = await getPool();
  const params = [];
  const where = [];
  if (tenantId) {
    params.push(tenantId);
    where.push(`tenant_id = $${params.length}`);
  }
  if (publishId) {
    params.push(publishId);
    where.push(`publish_id = $${params.length}`);
  }
  params.push(limit);
  const whereSql = where.length ? `WHERE ${where.join(" AND ")}` : "";

  const result = await pool.query(
    `
    SELECT event_id, tenant_id, publish_id, event_type, actor_role, payload, prev_hash, chain_hash, created_at
    FROM audit_events
    ${whereSql}
    ORDER BY created_at DESC
    LIMIT $${params.length}
    `,
    params
  );
  return result.rows.map(mapRow);
}

export async function verifyAuditChain({ tenantId = null } = {}) {
  const events = shouldUsePostgres()
    ? await (async () => {
        const pool = await getPool();
        const params = [];
        let whereSql = "";
        if (tenantId) {
          params.push(tenantId);
          whereSql = `WHERE tenant_id = $1`;
        }
        const result = await pool.query(
          `
          SELECT event_id, tenant_id, publish_id, event_type, actor_role, payload, prev_hash, chain_hash, created_at
          FROM audit_events
          ${whereSql}
          ORDER BY created_at ASC
          `,
          params
        );
        return result.rows.map(mapRow);
      })()
    : await (async () => {
        const parsed = await readFileEventsStrict();
        if (!parsed.ok) {
          return {
            __failed: true,
            failedAt: parsed.failedAt,
            reason: parsed.reason,
            events: []
          };
        }
        return parsed.events.filter((item) => (tenantId ? item.tenantId === tenantId : true));
      })();

  if (events.__failed) {
    return {
      ok: false,
      total: 0,
      failedAt: events.failedAt,
      reason: events.reason
    };
  }

  let previous = null;
  for (let i = 0; i < events.length; i += 1) {
    const event = events[i];
    const expectedHash = hashRecord({
      eventId: event.eventId,
      tenantId: event.tenantId || "t_default",
      publishId: event.publishId || null,
      eventType: event.eventType,
      actorRole: event.actorRole || null,
      payload: event.payload || {},
      createdAt: event.createdAt,
      prevHash: previous
    });

    if ((event.prevHash || null) !== (previous || null)) {
      return {
        ok: false,
        total: events.length,
        failedAt: i,
        reason: "PREV_HASH_MISMATCH"
      };
    }
    if (event.chainHash !== expectedHash) {
      return {
        ok: false,
        total: events.length,
        failedAt: i,
        reason: "CHAIN_HASH_MISMATCH"
      };
    }
    previous = event.chainHash;
  }

  return {
    ok: true,
    total: events.length,
    failedAt: null,
    reason: null
  };
}
