import { appendFile, mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

function getDataDir() {
  return process.env.DATA_DIR || "data";
}

function getHistoryFile() {
  return path.join(getDataDir(), "history.jsonl");
}

async function ensureHistoryFile() {
  const file = getHistoryFile();
  await mkdir(path.dirname(file), { recursive: true });
  try {
    await readFile(file, "utf8");
  } catch {
    await writeFile(file, "", "utf8");
  }
}

export async function appendHistoryEvent(event) {
  await ensureHistoryFile();

  const payload = {
    eventId: `evt_${Date.now()}_${Math.floor(Math.random() * 10000)}`,
    createdAt: new Date().toISOString(),
    ...event
  };

  await appendFile(getHistoryFile(), `${JSON.stringify(payload)}\n`, "utf8");
  return payload;
}

export async function listHistoryEvents({ limit = 100, publishId = null, tenantId = null } = {}) {
  await ensureHistoryFile();
  const raw = await readFile(getHistoryFile(), "utf8");

  const events = raw
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

  const filtered = events.filter((event) => {
    if (publishId && String(event.publishId || "") !== String(publishId)) return false;
    if (tenantId && String(event.tenantId || "t_default") !== String(tenantId)) return false;
    return true;
  });

  return filtered.slice(-limit).reverse();
}
