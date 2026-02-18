import { mkdir, readdir, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";

function getDataDir() {
  return process.env.DATA_DIR || "data";
}

function getDataDirs() {
  return Array.from(new Set([getDataDir(), "data"]));
}

async function readJsonFile(filePath, fallback) {
  try {
    const raw = await readFile(filePath, "utf8");
    const parsed = JSON.parse(raw);
    return parsed;
  } catch {
    return fallback;
  }
}

async function writeJsonFile(filePath, value) {
  await writeFile(filePath, JSON.stringify(value, null, 2), "utf8");
}

async function readJsonl(filePath) {
  try {
    const raw = await readFile(filePath, "utf8");
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
  } catch {
    return [];
  }
}

async function writeJsonl(filePath, rows) {
  const body = rows.map((item) => JSON.stringify(item)).join("\n");
  await writeFile(filePath, body ? `${body}\n` : "", "utf8");
}

function olderThan(iso, cutoffTs) {
  const ts = Date.parse(iso || "");
  return Number.isFinite(ts) && ts < cutoffTs;
}

export async function applyRetentionPolicy({ tenantId = "t_default", retentionDays = 90 } = {}) {
  const cutoffTs = Date.now() - Math.max(1, Number(retentionDays || 90)) * 24 * 60 * 60 * 1000;
  const deleted = { history: 0, usage: 0, audit: 0, review: 0 };
  const remaining = { history: 0, usage: 0, audit: 0, review: 0 };

  for (const dataDir of getDataDirs()) {
    await mkdir(dataDir, { recursive: true });
    const historyFile = path.join(dataDir, "history.jsonl");
    const usageFile = path.join(dataDir, "usage-events.jsonl");
    const auditFile = path.join(dataDir, "audit-trail.jsonl");
    const reviewFile = path.join(dataDir, "review-queue.jsonl");

    const history = await readJsonl(historyFile);
    const nextHistory = history.filter((item) => {
      if (String(item.tenantId || "t_default") !== tenantId) return true;
      return !olderThan(item.createdAt, cutoffTs);
    });
    await writeJsonl(historyFile, nextHistory);

    const usage = await readJsonl(usageFile);
    const nextUsage = usage.filter((item) => {
      if (String(item.tenantId || "t_default") !== tenantId) return true;
      return !olderThan(item.occurredAt, cutoffTs);
    });
    await writeJsonl(usageFile, nextUsage);

    const audit = await readJsonl(auditFile);
    const nextAudit = audit.filter((item) => {
      if (String(item.tenantId || "t_default") !== tenantId) return true;
      return !olderThan(item.createdAt, cutoffTs);
    });
    await writeJsonl(auditFile, nextAudit);

    const review = await readJsonl(reviewFile);
    const nextReview = review.filter((item) => {
      if (String(item.tenantId || "t_default") !== tenantId) return true;
      return !olderThan(item.createdAt, cutoffTs);
    });
    await writeJsonl(reviewFile, nextReview);

    deleted.history += history.length - nextHistory.length;
    deleted.usage += usage.length - nextUsage.length;
    deleted.audit += audit.length - nextAudit.length;
    deleted.review += review.length - nextReview.length;
    remaining.history += nextHistory.length;
    remaining.usage += nextUsage.length;
    remaining.audit += nextAudit.length;
    remaining.review += nextReview.length;
  }

  return {
    tenantId,
    retentionDays,
    deleted,
    remaining
  };
}

export async function erasePublishData({ tenantId = "t_default", publishId }) {
  if (!publishId) throw new Error("PUBLISH_ID_REQUIRED");
  const deleted = { publishes: 0, history: 0, usage: 0, audit: 0, review: 0 };

  for (const dataDir of getDataDirs()) {
    await mkdir(dataDir, { recursive: true });
    const publishFile = path.join(dataDir, "publishes.json");
    const historyFile = path.join(dataDir, "history.jsonl");
    const usageFile = path.join(dataDir, "usage-events.jsonl");
    const auditFile = path.join(dataDir, "audit-trail.jsonl");
    const reviewFile = path.join(dataDir, "review-queue.jsonl");

    const publishes = await readJsonFile(publishFile, []);
    const nextPublishes = publishes.filter((item) => String(item.publishId) !== String(publishId));
    await writeJsonFile(publishFile, nextPublishes);

    const history = await readJsonl(historyFile);
    const nextHistory = history.filter(
      (item) =>
        !(
          String(item.publishId || "") === String(publishId) &&
          String(item.tenantId || "t_default") === tenantId
        )
    );
    await writeJsonl(historyFile, nextHistory);

    const usage = await readJsonl(usageFile);
    const nextUsage = usage.filter(
      (item) =>
        !(
          String(item.publishId || "") === String(publishId) &&
          String(item.tenantId || "t_default") === tenantId
        )
    );
    await writeJsonl(usageFile, nextUsage);

    const audit = await readJsonl(auditFile);
    const nextAudit = audit.filter(
      (item) =>
        !(
          String(item.publishId || "") === String(publishId) &&
          String(item.tenantId || "t_default") === tenantId
        )
    );
    await writeJsonl(auditFile, nextAudit);

    const reviews = await readJsonl(reviewFile);
    const nextReviews = reviews.filter(
      (item) =>
        !(
          String(item.publishId || "") === String(publishId) &&
          String(item.tenantId || "t_default") === tenantId
        )
    );
    await writeJsonl(reviewFile, nextReviews);

    deleted.publishes += publishes.length - nextPublishes.length;
    deleted.history += history.length - nextHistory.length;
    deleted.usage += usage.length - nextUsage.length;
    deleted.audit += audit.length - nextAudit.length;
    deleted.review += reviews.length - nextReviews.length;
  }

  return {
    tenantId,
    publishId,
    deleted
  };
}

export async function runBackupDrill({ tenantId = "t_default" } = {}) {
  const dataDir = getDataDir();
  const backupDir = path.join(dataDir, "_backup");
  const restoreDir = path.join(dataDir, "_restore");
  await mkdir(backupDir, { recursive: true });
  await rm(restoreDir, { recursive: true, force: true });
  await mkdir(restoreDir, { recursive: true });

  const files = (await readdir(dataDir)).filter(
    (name) => (name.endsWith(".json") || name.endsWith(".jsonl")) && !name.startsWith("_")
  );

  for (const name of files) {
    const src = path.join(dataDir, name);
    const backupPath = path.join(backupDir, name);
    const restorePath = path.join(restoreDir, name);
    const body = await readFile(src, "utf8");
    await writeFile(backupPath, body, "utf8");
    await writeFile(restorePath, body, "utf8");
  }

  return {
    tenantId,
    filesCount: files.length,
    backupDir,
    restoreDir,
    ok: true,
    executedAt: new Date().toISOString()
  };
}
