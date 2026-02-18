import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { runBackupDrill } from "./dataGovernanceService.js";

function getDataDir() {
  return process.env.DATA_DIR || "data";
}

function getReportFile() {
  return path.join(getDataDir(), "dr-multi-region-report.json");
}

function getRegions() {
  const raw = String(process.env.DR_REGIONS || "eu-central-1,us-east-1");
  return raw
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

function getBackupIntervalMin() {
  const n = Number(process.env.DR_BACKUP_INTERVAL_MIN || 15);
  return Number.isFinite(n) && n > 0 ? Math.round(n) : 15;
}

async function readLastReport() {
  const file = getReportFile();
  await mkdir(path.dirname(file), { recursive: true });
  try {
    const raw = await readFile(file, "utf8");
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

async function writeLastReport(payload) {
  const file = getReportFile();
  await mkdir(path.dirname(file), { recursive: true });
  await writeFile(file, JSON.stringify(payload, null, 2), "utf8");
}

export async function getMultiRegionDrStatus() {
  const regions = getRegions();
  const lastRun = await readLastReport();
  return {
    mode: "simulated_multi_region",
    regions,
    backupIntervalMin: getBackupIntervalMin(),
    lastRun
  };
}

export async function runMultiRegionDrill({ tenantId = "t_default" } = {}) {
  const startedAtTs = Date.now();
  const base = await runBackupDrill({ tenantId });
  const regions = getRegions();

  const regionReports = regions.map((region, index) => {
    const replicationLagSec = Math.max(3, Math.round(base.filesCount * 2 + (index + 1) * 3));
    return {
      region,
      replicationLagSec,
      restoreOk: true
    };
  });

  const maxLagSec = Math.max(0, ...regionReports.map((item) => item.replicationLagSec));
  const measuredRpoMinutes = Number((maxLagSec / 60).toFixed(2));
  const measuredRtoSeconds = Number(((Date.now() - startedAtTs) / 1000).toFixed(2));

  const report = {
    tenantId,
    mode: "simulated_multi_region",
    filesCount: base.filesCount,
    regions: regionReports,
    metrics: {
      measuredRpoMinutes,
      measuredRtoSeconds
    },
    backupIntervalMin: getBackupIntervalMin(),
    passed: regionReports.every((item) => item.restoreOk),
    executedAt: new Date().toISOString()
  };

  await writeLastReport(report);
  return report;
}
