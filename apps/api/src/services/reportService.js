import crypto from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

const ALLOWED_DATASETS = new Set(["history", "publish", "usage", "audit"]);
const ALLOWED_FORMATS = new Set(["json", "csv", "pdf"]);
const ALLOWED_CADENCE = new Set(["daily", "weekly", "monthly"]);

function getSchedulesFile() {
  return path.join(process.env.DATA_DIR || "data", "report-schedules.json");
}

async function readSchedules() {
  const file = getSchedulesFile();
  await mkdir(path.dirname(file), { recursive: true });
  try {
    const raw = await readFile(file, "utf8");
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

async function writeSchedules(items) {
  const file = getSchedulesFile();
  await mkdir(path.dirname(file), { recursive: true });
  await writeFile(file, JSON.stringify(items, null, 2), "utf8");
}

function normalizeCell(value) {
  if (value == null) return "";
  if (typeof value === "string") return value;
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  return JSON.stringify(value);
}

function csvEscape(value) {
  const raw = normalizeCell(value).replaceAll('"', '""');
  return /[,"\n]/.test(raw) ? `"${raw}"` : raw;
}

export function toCsv(items = []) {
  if (!Array.isArray(items) || items.length === 0) return "no_data\n";

  const keys = [...new Set(items.flatMap((item) => Object.keys(item || {})))];
  const header = keys.join(",");
  const rows = items.map((item) => keys.map((key) => csvEscape(item?.[key])).join(","));
  return `${header}\n${rows.join("\n")}\n`;
}

export function toPdfBuffer({ title = "Report", items = [] } = {}) {
  const lines = Array.isArray(items)
    ? items.slice(0, 100).map((item, index) => `${index + 1}. ${JSON.stringify(item)}`)
    : [];
  const body = [`%PDF-1.1`, `% you7li report mock`, `Title: ${title}`, ...lines].join("\n");
  return Buffer.from(body, "utf8");
}

export function validateReportDataset(dataset) {
  return ALLOWED_DATASETS.has(String(dataset || "").toLowerCase());
}

export function validateReportFormat(format) {
  return ALLOWED_FORMATS.has(String(format || "").toLowerCase());
}

export async function createReportSchedule({
  tenantId,
  email,
  dataset,
  format = "csv",
  cadence = "weekly",
  timezone = "Europe/Istanbul"
}) {
  if (!tenantId) throw new Error("TENANT_ID_REQUIRED");
  if (!String(email || "").includes("@")) throw new Error("INVALID_EMAIL");
  if (!validateReportDataset(dataset)) throw new Error("INVALID_DATASET");
  if (!validateReportFormat(format)) throw new Error("INVALID_FORMAT");
  if (!ALLOWED_CADENCE.has(String(cadence || "").toLowerCase())) throw new Error("INVALID_CADENCE");

  const item = {
    scheduleId: `rpt_${crypto.randomUUID()}`,
    tenantId,
    email: String(email).trim(),
    dataset: String(dataset).toLowerCase(),
    format: String(format).toLowerCase(),
    cadence: String(cadence).toLowerCase(),
    timezone: String(timezone || "Europe/Istanbul"),
    active: true,
    createdAt: new Date().toISOString(),
    deliveryMode: "simulated_email"
  };

  const schedules = await readSchedules();
  schedules.push(item);
  await writeSchedules(schedules);
  return item;
}

export async function listReportSchedules(tenantId) {
  const schedules = await readSchedules();
  return schedules.filter((item) => item.tenantId === tenantId);
}
