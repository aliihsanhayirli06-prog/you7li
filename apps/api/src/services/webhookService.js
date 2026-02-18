import crypto from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

function getFile() {
  const dataDir = process.env.DATA_DIR || "data";
  return path.join(dataDir, "webhooks.json");
}

async function readItems() {
  const file = getFile();
  await mkdir(path.dirname(file), { recursive: true });
  try {
    const raw = await readFile(file, "utf8");
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

async function writeItems(items) {
  const file = getFile();
  await mkdir(path.dirname(file), { recursive: true });
  await writeFile(file, JSON.stringify(items, null, 2), "utf8");
}

export async function listWebhooks(tenantId) {
  const items = await readItems();
  return items.filter((item) => item.tenantId === tenantId);
}

export async function createWebhook({ tenantId, url, eventTypes = ["*"], provider = "generic" }) {
  if (!url) throw new Error("WEBHOOK_URL_REQUIRED");
  const items = await readItems();
  const hook = {
    webhookId: `wh_${crypto.randomUUID()}`,
    tenantId,
    url,
    provider,
    eventTypes: Array.isArray(eventTypes) && eventTypes.length ? eventTypes : ["*"],
    active: true,
    createdAt: new Date().toISOString()
  };
  items.push(hook);
  await writeItems(items);
  return hook;
}

export async function removeWebhook({ tenantId, webhookId }) {
  const items = await readItems();
  const next = items.filter(
    (item) => !(item.tenantId === tenantId && String(item.webhookId) === String(webhookId))
  );
  await writeItems(next);
  return { removed: items.length - next.length };
}

function acceptsEvent(hook, eventType) {
  if (!hook.active) return false;
  if (!Array.isArray(hook.eventTypes)) return true;
  if (hook.eventTypes.includes("*")) return true;
  return hook.eventTypes.includes(eventType);
}

export async function dispatchWebhookEvent({ tenantId, eventType, payload }) {
  const hooks = await listWebhooks(tenantId);
  const targets = hooks.filter((hook) => acceptsEvent(hook, eventType));
  const results = [];

  for (const hook of targets) {
    try {
      const response = await fetch(hook.url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ eventType, tenantId, payload })
      });
      results.push({ webhookId: hook.webhookId, status: response.status, ok: response.ok });
    } catch (error) {
      results.push({ webhookId: hook.webhookId, status: 0, ok: false, error: error.message });
    }
  }

  return {
    total: targets.length,
    delivered: results.filter((item) => item.ok).length,
    results
  };
}
