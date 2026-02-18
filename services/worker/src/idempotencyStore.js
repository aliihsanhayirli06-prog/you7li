import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

const DATA_DIR = process.env.DATA_DIR || "data";
const STORE_FILE = path.join(DATA_DIR, "processed-jobs.json");
const STORE_TTL_HOURS = Number(process.env.JOB_IDEMPOTENCY_TTL_HOURS || 48);

async function ensureStore() {
  await mkdir(DATA_DIR, { recursive: true });
  try {
    await readFile(STORE_FILE, "utf8");
  } catch {
    await writeFile(STORE_FILE, "{}", "utf8");
  }
}

async function readStore() {
  await ensureStore();
  const raw = await readFile(STORE_FILE, "utf8");

  try {
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

async function writeStore(store) {
  await writeFile(STORE_FILE, JSON.stringify(store, null, 2), "utf8");
}

function cleanupExpired(store) {
  const cutoff = Date.now() - STORE_TTL_HOURS * 60 * 60 * 1000;
  const cleaned = {};

  for (const [key, value] of Object.entries(store)) {
    const ts = Date.parse(value || "");
    if (Number.isFinite(ts) && ts >= cutoff) {
      cleaned[key] = value;
    }
  }

  return cleaned;
}

export async function isProcessed(jobKey) {
  if (!jobKey) return false;
  const store = cleanupExpired(await readStore());
  await writeStore(store);
  return Boolean(store[jobKey]);
}

export async function markProcessed(jobKey) {
  if (!jobKey) return;
  const store = cleanupExpired(await readStore());
  store[jobKey] = new Date().toISOString();
  await writeStore(store);
}

export function buildJobKey(job) {
  if (!job) return null;
  return job.jobId || `${job.jobType || "unknown"}:${job.publishId || "na"}:${job.attempt || 0}`;
}
