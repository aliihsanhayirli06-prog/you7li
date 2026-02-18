import { appendFile, mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { getPool, shouldUsePostgres } from "./db.js";

const DATA_DIR = process.env.DATA_DIR || "data";
const REVIEW_QUEUE_FILE = path.join(DATA_DIR, "review-queue.jsonl");

async function ensureFile() {
  await mkdir(DATA_DIR, { recursive: true });
  try {
    await readFile(REVIEW_QUEUE_FILE, "utf8");
  } catch {
    await appendFile(REVIEW_QUEUE_FILE, "", "utf8");
  }
}

async function readItems() {
  await ensureFile();
  const raw = await readFile(REVIEW_QUEUE_FILE, "utf8");
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

async function rewriteItems(items) {
  const body = items.map((item) => JSON.stringify(item)).join("\n");
  await ensureFile();
  await writeFile(REVIEW_QUEUE_FILE, body ? `${body}\n` : "", "utf8");
}

function mapRow(row) {
  return {
    reviewId: row.review_id,
    tenantId: row.tenant_id,
    publishId: row.publish_id,
    channelId: row.channel_id,
    status: row.status,
    decision: row.decision,
    reason: row.reason,
    riskScore: Number(row.risk_score || 0),
    categories: row.categories || [],
    note: row.note || null,
    reviewedBy: row.reviewed_by || null,
    createdAt: new Date(row.created_at).toISOString(),
    reviewedAt: row.reviewed_at ? new Date(row.reviewed_at).toISOString() : null
  };
}

export async function enqueueReviewItem(item) {
  if (!shouldUsePostgres()) {
    await ensureFile();
    await appendFile(REVIEW_QUEUE_FILE, `${JSON.stringify(item)}\n`, "utf8");
    return item;
  }

  const pool = await getPool();
  await pool.query(
    `
    INSERT INTO review_queue (
      review_id, tenant_id, publish_id, channel_id, status, decision, reason,
      risk_score, categories, note, reviewed_by, created_at, reviewed_at
    ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
    `,
    [
      item.reviewId,
      item.tenantId,
      item.publishId,
      item.channelId || null,
      item.status,
      item.decision || null,
      item.reason || null,
      item.riskScore || 0,
      JSON.stringify(item.categories || []),
      item.note || null,
      item.reviewedBy || null,
      item.createdAt,
      item.reviewedAt || null
    ]
  );
  return item;
}

export async function listReviewItems({ tenantId, status = null, limit = 100 }) {
  if (!shouldUsePostgres()) {
    const items = await readItems();
    const filtered = items.filter((item) => {
      if (tenantId && item.tenantId !== tenantId) return false;
      if (status && item.status !== status) return false;
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
  if (status) {
    params.push(status);
    where.push(`status = $${params.length}`);
  }
  params.push(limit);
  const whereSql = where.length ? `WHERE ${where.join(" AND ")}` : "";

  const result = await pool.query(
    `
    SELECT review_id, tenant_id, publish_id, channel_id, status, decision, reason,
           risk_score, categories, note, reviewed_by, created_at, reviewed_at
    FROM review_queue
    ${whereSql}
    ORDER BY created_at DESC
    LIMIT $${params.length}
    `,
    params
  );
  return result.rows.map(mapRow);
}

export async function getReviewItemById(reviewId) {
  if (!reviewId) return null;
  if (!shouldUsePostgres()) {
    const items = await readItems();
    return items.find((item) => item.reviewId === reviewId) || null;
  }

  const pool = await getPool();
  const result = await pool.query(
    `
    SELECT review_id, tenant_id, publish_id, channel_id, status, decision, reason,
           risk_score, categories, note, reviewed_by, created_at, reviewed_at
    FROM review_queue
    WHERE review_id = $1
    LIMIT 1
    `,
    [reviewId]
  );
  if (result.rowCount === 0) return null;
  return mapRow(result.rows[0]);
}

export async function updateReviewDecision({
  reviewId,
  status,
  decision,
  note = null,
  reviewedBy = null,
  reviewedAt
}) {
  if (!shouldUsePostgres()) {
    const items = await readItems();
    const idx = items.findIndex((item) => item.reviewId === reviewId);
    if (idx === -1) return null;
    items[idx] = {
      ...items[idx],
      status,
      decision,
      note,
      reviewedBy,
      reviewedAt
    };
    await rewriteItems(items);
    return items[idx];
  }

  const pool = await getPool();
  const result = await pool.query(
    `
    UPDATE review_queue
    SET status = $2,
        decision = $3,
        note = $4,
        reviewed_by = $5,
        reviewed_at = $6
    WHERE review_id = $1
    RETURNING review_id, tenant_id, publish_id, channel_id, status, decision, reason,
              risk_score, categories, note, reviewed_by, created_at, reviewed_at
    `,
    [reviewId, status, decision, note, reviewedBy, reviewedAt]
  );
  if (result.rowCount === 0) return null;
  return mapRow(result.rows[0]);
}
