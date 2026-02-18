import crypto from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

function getFile() {
  const dataDir = process.env.DATA_DIR || "data";
  return path.join(dataDir, "plugins.json");
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

export async function listPlugins(tenantId) {
  const items = await readItems();
  return items.filter((item) => item.tenantId === tenantId);
}

export async function registerPlugin({ tenantId, name, endpoint, hooks = [] }) {
  if (!name || !endpoint) throw new Error("PLUGIN_NAME_AND_ENDPOINT_REQUIRED");
  const items = await readItems();
  const plugin = {
    pluginId: `plg_${crypto.randomUUID()}`,
    tenantId,
    name,
    endpoint,
    hooks: Array.isArray(hooks) ? hooks : [],
    active: true,
    createdAt: new Date().toISOString()
  };
  items.push(plugin);
  await writeItems(items);
  return plugin;
}

export async function invokePluginHook({ tenantId, hook, payload = {} }) {
  if (!hook) throw new Error("PLUGIN_HOOK_REQUIRED");
  const plugins = await listPlugins(tenantId);
  const targets = plugins.filter((item) => item.active && item.hooks.includes(hook));
  const results = [];

  for (const plugin of targets) {
    try {
      const res = await fetch(plugin.endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ hook, tenantId, payload })
      });
      results.push({ pluginId: plugin.pluginId, ok: res.ok, status: res.status });
    } catch (error) {
      results.push({ pluginId: plugin.pluginId, ok: false, status: 0, error: error.message });
    }
  }

  return {
    hook,
    triggered: targets.length,
    okCount: results.filter((item) => item.ok).length,
    results
  };
}
