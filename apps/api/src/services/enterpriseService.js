import crypto from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

function getFile() {
  return path.join(process.env.DATA_DIR || "data", "enterprise-incidents.json");
}

async function readIncidents() {
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

async function writeIncidents(items) {
  const file = getFile();
  await mkdir(path.dirname(file), { recursive: true });
  await writeFile(file, JSON.stringify(items, null, 2), "utf8");
}

export function getSoc2ReadinessPack() {
  return {
    framework: "SOC2-readiness",
    generatedAt: new Date().toISOString(),
    controls: [
      { id: "CC1.1", title: "Control environment ownership", status: "implemented" },
      { id: "CC6.1", title: "Logical access controls", status: "implemented" },
      { id: "CC7.2", title: "Monitoring and anomaly response", status: "implemented" },
      { id: "A1.2", title: "Availability commitment and failover drills", status: "implemented" }
    ],
    exports: [
      { key: "audit_trail", endpoint: "/api/v1/audit/trail?limit=500" },
      { key: "retention_policy", endpoint: "/api/v1/privacy/policy" },
      { key: "dr_evidence", endpoint: "/api/v1/ops/dr/multi-region/status" }
    ]
  };
}

export function getSlaTiers() {
  return {
    tiers: [
      {
        code: "standard",
        uptimeTarget: 99.5,
        supportHours: "business_hours",
        firstResponseSlaMinutes: 240
      },
      {
        code: "business",
        uptimeTarget: 99.9,
        supportHours: "16x7",
        firstResponseSlaMinutes: 60
      },
      {
        code: "enterprise",
        uptimeTarget: 99.95,
        supportHours: "24x7",
        firstResponseSlaMinutes: 15
      }
    ],
    generatedAt: new Date().toISOString()
  };
}

export async function createSupportIncident({
  tenantId,
  severity = "sev3",
  title,
  description = "",
  slaTier = "standard"
}) {
  if (!tenantId) throw new Error("TENANT_ID_REQUIRED");
  if (!String(title || "").trim()) throw new Error("TITLE_REQUIRED");

  const item = {
    incidentId: `ent_${crypto.randomUUID()}`,
    tenantId,
    severity: String(severity || "sev3"),
    slaTier: String(slaTier || "standard"),
    title: String(title).trim(),
    description: String(description || ""),
    status: "open",
    createdAt: new Date().toISOString()
  };
  const incidents = await readIncidents();
  incidents.push(item);
  await writeIncidents(incidents);
  return item;
}

export async function listSupportIncidents(tenantId) {
  const incidents = await readIncidents();
  return incidents.filter((item) => item.tenantId === tenantId);
}
