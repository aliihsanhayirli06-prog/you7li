import crypto from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

const CATALOG = [
  {
    pluginCode: "analytics_plus",
    name: "Analytics Plus",
    category: "analytics",
    summary: "Cross-channel performance dashboards",
    pricing: "from_49_usd"
  },
  {
    pluginCode: "ugc_distributor",
    name: "UGC Distributor",
    category: "distribution",
    summary: "Auto distribution to short-form platforms",
    pricing: "from_29_usd"
  },
  {
    pluginCode: "brand_guard",
    name: "Brand Guard",
    category: "compliance",
    summary: "Brand-safety and policy pre-check layer",
    pricing: "from_19_usd"
  }
];

function getFile() {
  return path.join(process.env.DATA_DIR || "data", "partner-applications.json");
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

export async function listMarketplacePlugins() {
  return CATALOG;
}

export async function submitPartnerApplication({
  tenantId,
  companyName,
  contactEmail,
  useCase,
  targetPluginCode = null
}) {
  if (!tenantId) throw new Error("TENANT_ID_REQUIRED");
  if (!String(companyName || "").trim()) throw new Error("COMPANY_NAME_REQUIRED");
  if (!String(contactEmail || "").includes("@")) throw new Error("INVALID_EMAIL");
  if (!String(useCase || "").trim()) throw new Error("USE_CASE_REQUIRED");

  if (targetPluginCode && !CATALOG.some((item) => item.pluginCode === targetPluginCode)) {
    throw new Error("INVALID_PLUGIN_CODE");
  }

  const item = {
    applicationId: `par_${crypto.randomUUID()}`,
    tenantId,
    companyName: String(companyName).trim(),
    contactEmail: String(contactEmail).trim(),
    useCase: String(useCase).trim(),
    targetPluginCode: targetPluginCode || null,
    status: "submitted",
    createdAt: new Date().toISOString()
  };

  const items = await readItems();
  items.push(item);
  await writeItems(items);
  return item;
}

export async function listPartnerApplications(tenantId) {
  const items = await readItems();
  return items.filter((item) => item.tenantId === tenantId);
}
