import { appendFile, mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import crypto from "node:crypto";
import { getRedisClient, shouldUseRedis } from "./redisClient.js";

const DATA_DIR = process.env.DATA_DIR || "data";
const QUEUE_FILE = path.join(DATA_DIR, "queue.jsonl");
const DLQ_FILE = path.join(DATA_DIR, "dlq.jsonl");
const MAX_ATTEMPTS = Number(process.env.JOB_MAX_ATTEMPTS || 3);

export const REDIS_QUEUE_KEY = process.env.REDIS_QUEUE_KEY || "you7li:publish:jobs";
export const REDIS_DLQ_KEY = process.env.REDIS_DLQ_KEY || "you7li:publish:dlq";

function withJobDefaults(job) {
  return {
    ...job,
    jobId: job.jobId || `job_${crypto.randomUUID()}`,
    attempt: Number(job.attempt || 0),
    queuedAt: job.queuedAt || new Date().toISOString()
  };
}

async function ensureFile(filePath) {
  await mkdir(DATA_DIR, { recursive: true });
  try {
    await readFile(filePath, "utf8");
  } catch {
    await writeFile(filePath, "", "utf8");
  }
}

async function appendJsonl(filePath, payload) {
  await ensureFile(filePath);
  await appendFile(filePath, `${JSON.stringify(payload)}\n`, "utf8");
}

async function lpopJsonl(filePath) {
  await ensureFile(filePath);
  const raw = await readFile(filePath, "utf8");
  const lines = raw.split("\n").filter(Boolean);

  if (lines.length === 0) {
    return null;
  }

  const first = lines.shift();
  await writeFile(filePath, `${lines.join("\n")}${lines.length ? "\n" : ""}`, "utf8");

  try {
    return JSON.parse(first);
  } catch {
    return null;
  }
}

async function countJsonl(filePath) {
  await ensureFile(filePath);
  const raw = await readFile(filePath, "utf8");
  return raw.split("\n").filter(Boolean).length;
}

async function readLastJsonl(filePath, limit = 20) {
  await ensureFile(filePath);
  const raw = await readFile(filePath, "utf8");
  const lines = raw.split("\n").filter(Boolean);
  const selected = lines.slice(-Math.max(1, limit)).reverse();

  return selected
    .map((line) => {
      try {
        return JSON.parse(line);
      } catch {
        return null;
      }
    })
    .filter(Boolean);
}

async function enqueueFile(payload) {
  await appendJsonl(QUEUE_FILE, payload);
  return payload;
}

async function enqueueDlqFile(payload) {
  await appendJsonl(DLQ_FILE, payload);
  return payload;
}

export async function enqueue(job) {
  const payload = withJobDefaults(job);

  if (!shouldUseRedis()) {
    return enqueueFile(payload);
  }

  try {
    const client = await getRedisClient();
    await client.rPush(REDIS_QUEUE_KEY, JSON.stringify(payload));
    return payload;
  } catch {
    return enqueueFile(payload);
  }
}

export async function dequeue() {
  if (!shouldUseRedis()) {
    return lpopJsonl(QUEUE_FILE);
  }

  try {
    const client = await getRedisClient();
    const item = await client.lPop(REDIS_QUEUE_KEY);
    if (!item) return null;
    return JSON.parse(item);
  } catch {
    return lpopJsonl(QUEUE_FILE);
  }
}

export async function moveToDlq(job, errorMessage = "unknown") {
  const payload = {
    ...withJobDefaults(job),
    failedAt: new Date().toISOString(),
    error: errorMessage
  };

  if (!shouldUseRedis()) {
    return enqueueDlqFile(payload);
  }

  try {
    const client = await getRedisClient();
    await client.rPush(REDIS_DLQ_KEY, JSON.stringify(payload));
    return payload;
  } catch {
    return enqueueDlqFile(payload);
  }
}

export async function requeueWithRetry(job, errorMessage = "unknown") {
  const attempt = Number(job.attempt || 0) + 1;

  if (attempt >= MAX_ATTEMPTS) {
    const dlqItem = await moveToDlq({ ...job, attempt }, errorMessage);
    return { action: "dlq", item: dlqItem, attempt };
  }

  const retried = await enqueue({ ...job, attempt });
  return { action: "retried", item: retried, attempt };
}

export async function getQueueSize() {
  if (!shouldUseRedis()) {
    return countJsonl(QUEUE_FILE);
  }

  try {
    const client = await getRedisClient();
    const size = await client.lLen(REDIS_QUEUE_KEY);
    return Number(size);
  } catch {
    return countJsonl(QUEUE_FILE);
  }
}

export async function getDlqSize() {
  if (!shouldUseRedis()) {
    return countJsonl(DLQ_FILE);
  }

  try {
    const client = await getRedisClient();
    const size = await client.lLen(REDIS_DLQ_KEY);
    return Number(size);
  } catch {
    return countJsonl(DLQ_FILE);
  }
}

export async function listDlq(limit = 20) {
  if (!shouldUseRedis()) {
    return readLastJsonl(DLQ_FILE, limit);
  }

  try {
    const client = await getRedisClient();
    const values = await client.lRange(REDIS_DLQ_KEY, Math.max(0, -limit), -1);
    return values
      .map((raw) => {
        try {
          return JSON.parse(raw);
        } catch {
          return null;
        }
      })
      .filter(Boolean)
      .reverse();
  } catch {
    return readLastJsonl(DLQ_FILE, limit);
  }
}
