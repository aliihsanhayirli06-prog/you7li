import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

const DEFAULT_STATE = {
  strategy: "blue_green",
  activeColor: "blue",
  standbyColor: "green",
  canaryPercent: 0,
  rolloutStage: "stable",
  updatedAt: null
};

function getFile() {
  return path.join(process.env.DATA_DIR || "data", "deploy-strategy.json");
}

async function ensureFile() {
  const file = getFile();
  await mkdir(path.dirname(file), { recursive: true });
  try {
    await readFile(file, "utf8");
  } catch {
    await writeFile(file, JSON.stringify(DEFAULT_STATE, null, 2), "utf8");
  }
}

async function readState() {
  await ensureFile();
  try {
    const raw = await readFile(getFile(), "utf8");
    return { ...DEFAULT_STATE, ...(JSON.parse(raw) || {}) };
  } catch {
    return { ...DEFAULT_STATE };
  }
}

async function writeState(next) {
  await writeFile(getFile(), JSON.stringify(next, null, 2), "utf8");
  return next;
}

function normalizePercent(value) {
  const n = Number(value);
  if (!Number.isFinite(n) || n < 0 || n > 100) throw new Error("INVALID_CANARY_PERCENT");
  return Math.round(n);
}

export async function getDeployStrategyState() {
  return readState();
}

export async function updateCanaryRollout(percent) {
  const current = await readState();
  const canaryPercent = normalizePercent(percent);
  const rolloutStage =
    canaryPercent === 0 ? "stable" : canaryPercent >= 100 ? "promoted" : "canary";
  return writeState({
    ...current,
    strategy: "blue_green",
    canaryPercent,
    rolloutStage,
    updatedAt: new Date().toISOString()
  });
}

export async function switchActiveColor(targetColor = null) {
  const current = await readState();
  const nextColor =
    targetColor === "blue" || targetColor === "green"
      ? targetColor
      : current.activeColor === "blue"
        ? "green"
        : "blue";
  const standbyColor = nextColor === "blue" ? "green" : "blue";
  return writeState({
    ...current,
    strategy: "blue_green",
    activeColor: nextColor,
    standbyColor,
    canaryPercent: 0,
    rolloutStage: "stable",
    updatedAt: new Date().toISOString()
  });
}
