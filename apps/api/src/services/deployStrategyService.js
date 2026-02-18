import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

const DEFAULT_STATE = {
  strategy: "blue_green",
  activeColor: "blue",
  standbyColor: "green",
  canaryPercent: 0,
  rolloutStage: "stable",
  releaseGate: {
    type: "prompt_compliance",
    minScore: 80,
    lastScore: null,
    status: "not_evaluated",
    reason: null
  },
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

function normalizeScore(value) {
  if (value == null) return null;
  const n = Number(value);
  if (!Number.isFinite(n) || n < 0 || n > 100) throw new Error("INVALID_PROMPT_COMPLIANCE_SCORE");
  return Number(n.toFixed(2));
}

function normalizeMinScore(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return 80;
  if (n < 0) return 0;
  if (n > 100) return 100;
  return Number(n.toFixed(2));
}

export async function getDeployStrategyState() {
  return readState();
}

export async function updateCanaryRollout(percent, options = {}) {
  const current = await readState();
  const canaryPercent = normalizePercent(percent);
  const minScore = normalizeMinScore(
    options.minPromptComplianceScore ?? process.env.PROMPT_COMPLIANCE_MIN_SCORE
  );
  const promptComplianceScore = normalizeScore(options.promptComplianceScore);

  if (canaryPercent >= 100 && promptComplianceScore == null) {
    throw new Error("PROMPT_COMPLIANCE_SCORE_REQUIRED");
  }
  if (canaryPercent >= 100 && promptComplianceScore < minScore) {
    const err = new Error("PROMPT_COMPLIANCE_GATE_BLOCKED");
    err.meta = { minScore, promptComplianceScore };
    throw err;
  }

  const rolloutStage =
    canaryPercent === 0 ? "stable" : canaryPercent >= 100 ? "promoted" : "canary";

  const releaseGate =
    canaryPercent >= 100
      ? {
          type: "prompt_compliance",
          minScore,
          lastScore: promptComplianceScore,
          status: "passed",
          reason: null
        }
      : {
          type: "prompt_compliance",
          minScore,
          lastScore: promptComplianceScore,
          status: "not_required",
          reason: canaryPercent === 0 ? "stable_stage" : "canary_stage"
        };

  return writeState({
    ...current,
    strategy: "blue_green",
    canaryPercent,
    rolloutStage,
    releaseGate,
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
