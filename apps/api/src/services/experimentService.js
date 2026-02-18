import crypto from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

function getFile(name) {
  return path.join(process.env.DATA_DIR || "data", name);
}

async function readArrayFile(name) {
  const file = getFile(name);
  await mkdir(path.dirname(file), { recursive: true });
  try {
    const raw = await readFile(file, "utf8");
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

async function writeArrayFile(name, items) {
  const file = getFile(name);
  await mkdir(path.dirname(file), { recursive: true });
  await writeFile(file, JSON.stringify(items, null, 2), "utf8");
}

function slug(value, fallback = "variant") {
  const normalized = String(value || "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
  return normalized || fallback;
}

function normalizeVariants(input) {
  if (!Array.isArray(input) || input.length < 2) {
    throw new Error("AT_LEAST_TWO_VARIANTS_REQUIRED");
  }
  return input.map((item, index) => {
    const label = String(item?.label || "").trim() || `Variant ${index + 1}`;
    const key = String(item?.key || "").trim() || slug(label, `variant_${index + 1}`);
    return { key, label };
  });
}

function normalizeGuardrails(input = {}) {
  return {
    minRetention3s: Number(input.minRetention3s ?? 0.5),
    minCompletionRate: Number(input.minCompletionRate ?? 0.55),
    maxErrorRate: Number(input.maxErrorRate ?? 0.02)
  };
}

function computeVariant(experimentId, subjectKey, variants) {
  const digest = crypto
    .createHash("sha256")
    .update(`${experimentId}:${subjectKey}`)
    .digest("hex")
    .slice(0, 8);
  const bucket = Number.parseInt(digest, 16) % variants.length;
  return variants[bucket];
}

export async function createExperiment({
  tenantId,
  name,
  targetMetric = "ctr",
  variants = [],
  guardrails = {}
}) {
  if (!tenantId) throw new Error("TENANT_ID_REQUIRED");
  if (!String(name || "").trim()) throw new Error("EXPERIMENT_NAME_REQUIRED");
  const normalizedVariants = normalizeVariants(variants);

  const item = {
    experimentId: `exp_${crypto.randomUUID()}`,
    tenantId,
    name: String(name).trim(),
    status: "active",
    targetMetric: String(targetMetric || "ctr"),
    variants: normalizedVariants,
    guardrails: normalizeGuardrails(guardrails),
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  };

  const experiments = await readArrayFile("experiments.json");
  experiments.push(item);
  await writeArrayFile("experiments.json", experiments);
  return item;
}

export async function listExperiments(tenantId) {
  const experiments = await readArrayFile("experiments.json");
  return experiments.filter((item) => item.tenantId === tenantId);
}

export async function assignVariant({ tenantId, experimentId, publishId = null, subjectId = null }) {
  const experiments = await readArrayFile("experiments.json");
  const experiment = experiments.find(
    (item) => item.tenantId === tenantId && item.experimentId === experimentId
  );
  if (!experiment) throw new Error("EXPERIMENT_NOT_FOUND");
  if (experiment.status !== "active") throw new Error("EXPERIMENT_NOT_ACTIVE");

  const assignments = await readArrayFile("experiment-assignments.json");
  const subjectKey = String(subjectId || publishId || "");
  if (!subjectKey) throw new Error("SUBJECT_REQUIRED");
  const existing = assignments.find(
    (item) =>
      item.tenantId === tenantId &&
      item.experimentId === experimentId &&
      item.subjectKey === subjectKey
  );
  if (existing) return existing;

  const selected = computeVariant(experimentId, subjectKey, experiment.variants);
  const assignment = {
    assignmentId: `asg_${crypto.randomUUID()}`,
    tenantId,
    experimentId,
    publishId,
    subjectKey,
    variantKey: selected.key,
    assignedAt: new Date().toISOString()
  };
  assignments.push(assignment);
  await writeArrayFile("experiment-assignments.json", assignments);
  return assignment;
}

export async function recordGuardrailMetric({
  tenantId,
  experimentId,
  variantKey,
  publishId = null,
  metricsCtr = null,
  metricsRetention3s = null,
  metricsCompletionRate = null,
  errorRate = 0
}) {
  const experiments = await readArrayFile("experiments.json");
  const experiment = experiments.find(
    (item) => item.tenantId === tenantId && item.experimentId === experimentId
  );
  if (!experiment) throw new Error("EXPERIMENT_NOT_FOUND");
  const variantExists = experiment.variants.some((item) => item.key === variantKey);
  if (!variantExists) throw new Error("VARIANT_NOT_FOUND");

  const event = {
    metricEventId: `met_${crypto.randomUUID()}`,
    tenantId,
    experimentId,
    variantKey,
    publishId,
    metricsCtr: metricsCtr == null ? null : Number(metricsCtr),
    metricsRetention3s: metricsRetention3s == null ? null : Number(metricsRetention3s),
    metricsCompletionRate: metricsCompletionRate == null ? null : Number(metricsCompletionRate),
    errorRate: Number(errorRate || 0),
    createdAt: new Date().toISOString()
  };

  const events = await readArrayFile("experiment-metrics.json");
  events.push(event);
  await writeArrayFile("experiment-metrics.json", events);
  return event;
}

export async function getExperimentReport({ tenantId, experimentId }) {
  const experiments = await readArrayFile("experiments.json");
  const experiment = experiments.find(
    (item) => item.tenantId === tenantId && item.experimentId === experimentId
  );
  if (!experiment) throw new Error("EXPERIMENT_NOT_FOUND");

  const events = (await readArrayFile("experiment-metrics.json")).filter(
    (item) => item.tenantId === tenantId && item.experimentId === experimentId
  );

  const byVariant = experiment.variants.map((variant) => {
    const rows = events.filter((item) => item.variantKey === variant.key);
    const avg = (field) => {
      const values = rows.filter((item) => item[field] != null).map((item) => Number(item[field]));
      if (!values.length) return null;
      const total = values.reduce((a, b) => a + b, 0);
      return Number((total / values.length).toFixed(4));
    };
    const metrics = {
      avgCtr: avg("metricsCtr"),
      avgRetention3s: avg("metricsRetention3s"),
      avgCompletionRate: avg("metricsCompletionRate"),
      avgErrorRate: avg("errorRate")
    };
    const breaches = {
      retention: metrics.avgRetention3s != null && metrics.avgRetention3s < experiment.guardrails.minRetention3s,
      completion:
        metrics.avgCompletionRate != null &&
        metrics.avgCompletionRate < experiment.guardrails.minCompletionRate,
      errorRate:
        metrics.avgErrorRate != null && metrics.avgErrorRate > experiment.guardrails.maxErrorRate
    };

    return {
      variantKey: variant.key,
      variantLabel: variant.label,
      samples: rows.length,
      metrics,
      guardrailBreaches: breaches
    };
  });

  const hasBreach = byVariant.some(
    (item) =>
      item.guardrailBreaches.retention ||
      item.guardrailBreaches.completion ||
      item.guardrailBreaches.errorRate
  );

  return {
    experimentId: experiment.experimentId,
    tenantId,
    status: experiment.status,
    targetMetric: experiment.targetMetric,
    guardrails: experiment.guardrails,
    samples: events.length,
    health: hasBreach ? "violated" : "healthy",
    byVariant,
    generatedAt: new Date().toISOString()
  };
}
