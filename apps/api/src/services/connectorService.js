import crypto from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { getAnalyticsReport } from "./analyticsService.js";
import { withCircuitBreaker } from "../infra/circuitBreakerStore.js";

function getFile() {
  const dataDir = process.env.DATA_DIR || "data";
  return path.join(dataDir, "connectors.json");
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

export async function listConnectors(tenantId) {
  const items = await readItems();
  return items.filter((item) => item.tenantId === tenantId);
}

export async function addConnector({ tenantId, type, endpoint }) {
  if (!type || !endpoint) throw new Error("CONNECTOR_TYPE_AND_ENDPOINT_REQUIRED");
  const items = await readItems();
  const connector = {
    connectorId: `cn_${crypto.randomUUID()}`,
    tenantId,
    type,
    endpoint,
    active: true,
    createdAt: new Date().toISOString()
  };
  items.push(connector);
  await writeItems(items);
  return connector;
}

export async function syncConnectors({ tenantId, publishId }) {
  if (!publishId) throw new Error("PUBLISH_ID_REQUIRED");
  const connectors = await listConnectors(tenantId);
  const activeConnectors = connectors.filter((item) => item.active);
  const report = await getAnalyticsReport(publishId);

  const results = [];
  for (const connector of activeConnectors) {
    try {
      const status = await withCircuitBreaker(`connector:${connector.connectorId}`, async () => {
        const res = await fetch(connector.endpoint, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            connectorType: connector.type,
            tenantId,
            publishId,
            analytics: report
          })
        });
        if (!res.ok) {
          throw new Error(`CONNECTOR_HTTP_${res.status}`);
        }
        return res.status;
      });
      results.push({ connectorId: connector.connectorId, ok: true, status });
    } catch (error) {
      results.push({
        connectorId: connector.connectorId,
        ok: false,
        status: 0,
        error: error.message
      });
    }
  }

  const circuitOpenCount = results.filter((item) =>
    String(item.error || "").startsWith("CIRCUIT_OPEN:")
  ).length;
  if (activeConnectors.length > 0 && circuitOpenCount === activeConnectors.length) {
    throw new Error("CIRCUIT_OPEN:connectors");
  }

  return {
    tenantId,
    publishId,
    total: connectors.length,
    delivered: results.filter((item) => item.ok).length,
    results
  };
}
