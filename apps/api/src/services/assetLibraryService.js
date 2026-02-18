import crypto from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

const ALLOWED_TYPES = new Set(["image", "audio", "template"]);

function getFile() {
  return path.join(process.env.DATA_DIR || "data", "asset-library.json");
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

export async function listAssets({ tenantId, type = null, assetKey = null } = {}) {
  const items = await readItems();
  return items
    .filter((item) => item.tenantId === tenantId)
    .filter((item) => (type ? item.type === type : true))
    .filter((item) => (assetKey ? item.assetKey === assetKey : true))
    .sort((a, b) => Number(b.version) - Number(a.version));
}

export async function addAssetVersion({
  tenantId,
  assetKey,
  name,
  type = "template",
  sourceUrl = "",
  metadata = {}
}) {
  if (!tenantId) throw new Error("TENANT_ID_REQUIRED");
  if (!assetKey || !name) throw new Error("ASSET_KEY_AND_NAME_REQUIRED");
  const normalizedType = String(type || "").toLowerCase();
  if (!ALLOWED_TYPES.has(normalizedType)) throw new Error("INVALID_ASSET_TYPE");

  const items = await readItems();
  const current = items.filter(
    (item) => item.tenantId === tenantId && item.assetKey === String(assetKey)
  );
  const version = current.length > 0 ? Math.max(...current.map((item) => Number(item.version))) + 1 : 1;

  const record = {
    assetId: `ast_${crypto.randomUUID()}`,
    tenantId,
    assetKey: String(assetKey),
    name: String(name),
    type: normalizedType,
    version,
    sourceUrl: String(sourceUrl || ""),
    metadata: metadata && typeof metadata === "object" ? metadata : {},
    createdAt: new Date().toISOString()
  };

  items.push(record);
  await writeItems(items);
  return record;
}
