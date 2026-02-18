import crypto from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

function getFile() {
  const dataDir = process.env.DATA_DIR || "data";
  return path.join(dataDir, "api-keys.json");
}

function sha(value) {
  return crypto.createHash("sha256").update(value).digest("hex");
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

export async function listApiKeys(tenantId) {
  const items = await readItems();
  return items
    .filter((item) => item.tenantId === tenantId)
    .map((item) => ({
      keyId: item.keyId,
      name: item.name,
      status: item.status,
      createdAt: item.createdAt,
      revokedAt: item.revokedAt || null,
      last4: item.last4
    }));
}

export async function createApiKey({ tenantId, name }) {
  if (!name) throw new Error("API_KEY_NAME_REQUIRED");
  const rawKey = `yk_${crypto.randomUUID().replace(/-/g, "")}`;
  const item = {
    keyId: `key_${crypto.randomUUID()}`,
    tenantId,
    name,
    keyHash: sha(rawKey),
    last4: rawKey.slice(-4),
    status: "active",
    createdAt: new Date().toISOString(),
    revokedAt: null
  };
  const items = await readItems();
  items.push(item);
  await writeItems(items);
  return {
    keyId: item.keyId,
    name: item.name,
    key: rawKey,
    status: item.status,
    createdAt: item.createdAt
  };
}

export async function revokeApiKey({ tenantId, keyId }) {
  if (!keyId) throw new Error("API_KEY_ID_REQUIRED");
  const items = await readItems();
  const idx = items.findIndex((item) => item.tenantId === tenantId && item.keyId === keyId);
  if (idx === -1) throw new Error("API_KEY_NOT_FOUND");
  items[idx] = {
    ...items[idx],
    status: "revoked",
    revokedAt: new Date().toISOString()
  };
  await writeItems(items);
  return { keyId, status: "revoked", revokedAt: items[idx].revokedAt };
}

export async function resolveRoleFromApiKey(rawKey) {
  if (!rawKey) return null;
  const items = await readItems();
  const hashed = sha(rawKey);
  const item = items.find((entry) => entry.keyHash === hashed && entry.status === "active");
  if (!item) return null;
  return {
    role: "editor",
    tenantId: item.tenantId,
    keyId: item.keyId
  };
}
