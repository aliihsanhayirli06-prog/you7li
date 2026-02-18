import { appendFile, mkdir, readFile } from "node:fs/promises";
import path from "node:path";
import { getPool, shouldUsePostgres } from "./db.js";

const DATA_DIR = process.env.DATA_DIR || "data";
const USAGE_FILE = path.join(DATA_DIR, "usage-events.jsonl");

async function ensureFile() {
  await mkdir(DATA_DIR, { recursive: true });
  try {
    await readFile(USAGE_FILE, "utf8");
  } catch {
    await appendFile(USAGE_FILE, "", "utf8");
  }
}

async function readFileEvents() {
  await ensureFile();
  const raw = await readFile(USAGE_FILE, "utf8");

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

export async function saveUsageEvent(event) {
  if (!shouldUsePostgres()) {
    await ensureFile();
    await appendFile(USAGE_FILE, `${JSON.stringify(event)}\n`, "utf8");
    return event;
  }

  try {
    const pool = await getPool();
    await pool.query(
      `
      INSERT INTO usage_events (
        event_id, occurred_at, action, actor_role, tenant_id, channel_id, publish_id, units, amount_usd, metadata
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
      `,
      [
        event.eventId,
        event.occurredAt,
        event.action,
        event.actorRole,
        event.tenantId || "t_default",
        event.channelId,
        event.publishId,
        event.units,
        event.amountUsd,
        JSON.stringify(event.metadata || {})
      ]
    );

    return event;
  } catch {
    await ensureFile();
    await appendFile(USAGE_FILE, `${JSON.stringify(event)}\n`, "utf8");
    return event;
  }
}

export async function listUsageEvents({
  from,
  to,
  tenantId = null,
  channelId = null,
  limit = 200
}) {
  if (!shouldUsePostgres()) {
    const events = await readFileEvents();
    const filtered = events.filter((event) => {
      const ts = Date.parse(event.occurredAt || "");
      if (!Number.isFinite(ts)) return false;
      if (from && ts < Date.parse(from)) return false;
      if (to && ts > Date.parse(to)) return false;
      if (tenantId && (event.tenantId || "t_default") !== tenantId) return false;
      if (channelId && event.channelId !== channelId) return false;
      return true;
    });

    return filtered.slice(-limit).reverse();
  }

  try {
    const pool = await getPool();
    const params = [];
    const where = [];

    if (from) {
      params.push(from);
      where.push(`occurred_at >= $${params.length}`);
    }

    if (to) {
      params.push(to);
      where.push(`occurred_at <= $${params.length}`);
    }

    if (tenantId) {
      params.push(tenantId);
      where.push(`COALESCE(tenant_id, 't_default') = $${params.length}`);
    }

    if (channelId) {
      params.push(channelId);
      where.push(`channel_id = $${params.length}`);
    }

    params.push(limit);
    const whereSql = where.length ? `WHERE ${where.join(" AND ")}` : "";

    const result = await pool.query(
      `
      SELECT event_id, occurred_at, action, actor_role, tenant_id, channel_id, publish_id, units, amount_usd, metadata
      FROM usage_events
      ${whereSql}
      ORDER BY occurred_at DESC
      LIMIT $${params.length}
      `,
      params
    );

    return result.rows.map((row) => ({
      eventId: row.event_id,
      occurredAt: new Date(row.occurred_at).toISOString(),
      action: row.action,
      actorRole: row.actor_role,
      tenantId: row.tenant_id || "t_default",
      channelId: row.channel_id,
      publishId: row.publish_id,
      units: Number(row.units),
      amountUsd: Number(row.amount_usd),
      metadata: row.metadata || {}
    }));
  } catch {
    const events = await readFileEvents();
    const filtered = events.filter((event) => {
      const ts = Date.parse(event.occurredAt || "");
      if (!Number.isFinite(ts)) return false;
      if (from && ts < Date.parse(from)) return false;
      if (to && ts > Date.parse(to)) return false;
      if (tenantId && (event.tenantId || "t_default") !== tenantId) return false;
      if (channelId && event.channelId !== channelId) return false;
      return true;
    });
    return filtered.slice(-limit).reverse();
  }
}
