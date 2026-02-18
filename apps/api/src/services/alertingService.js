import { log } from "../utils/logger.js";
import { snapshot } from "../infra/metricsStore.js";
import { createSupportIncident } from "./enterpriseService.js";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

const ALERT_WEBHOOK_URL = process.env.ALERT_WEBHOOK_URL || "";

function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max);
}

function toRate(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return 0;
  return clamp(n, 0, 1);
}

function getAlertStateFile() {
  return path.join(process.env.DATA_DIR || "data", "provider-alert-state.json");
}

async function readAlertState() {
  const file = getAlertStateFile();
  await mkdir(path.dirname(file), { recursive: true });
  try {
    const raw = await readFile(file, "utf8");
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === "object" ? parsed : { alerts: {} };
  } catch {
    return { alerts: {} };
  }
}

async function writeAlertState(state) {
  const file = getAlertStateFile();
  await mkdir(path.dirname(file), { recursive: true });
  await writeFile(file, JSON.stringify(state, null, 2), "utf8");
}

function getThresholds() {
  return {
    minAttempts: Math.max(1, Number(process.env.PROVIDER_ALERT_MIN_ATTEMPTS || 5)),
    failureRateMax: toRate(process.env.PROVIDER_ALERT_FAILURE_RATE_MAX ?? 0.4),
    timeoutRateMax: toRate(process.env.PROVIDER_ALERT_TIMEOUT_RATE_MAX ?? 0.25),
    circuitOpenMax: Math.max(1, Number(process.env.PROVIDER_ALERT_CIRCUIT_OPEN_MAX || 3)),
    cooldownMs: Math.max(1000, Number(process.env.PROVIDER_ALERT_COOLDOWN_MS || 900000))
  };
}

export async function sendAlert(eventType, payload) {
  log("error", "alert_event", { eventType, ...payload });

  if (!ALERT_WEBHOOK_URL) return;

  try {
    await fetch(ALERT_WEBHOOK_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        eventType,
        payload,
        ts: new Date().toISOString()
      })
    });
  } catch (error) {
    log("error", "alert_delivery_failed", {
      eventType,
      error: error?.message || "unknown"
    });
  }
}

function evaluateProvider(provider, stats, thresholds) {
  const attempts = Number(stats?.attempts || 0);
  const failure = Number(stats?.failure || 0);
  const timeout = Number(stats?.timeout || 0);
  const circuitOpen = Number(stats?.circuitOpen || 0);

  if (attempts < thresholds.minAttempts) {
    return [];
  }

  const reasons = [];
  const failureRate = attempts > 0 ? failure / attempts : 0;
  const timeoutRate = attempts > 0 ? timeout / attempts : 0;

  if (failureRate > thresholds.failureRateMax) {
    reasons.push({
      key: `${provider}:failure_rate`,
      reason: "failure_rate",
      current: Number(failureRate.toFixed(4)),
      threshold: thresholds.failureRateMax
    });
  }
  if (timeoutRate > thresholds.timeoutRateMax) {
    reasons.push({
      key: `${provider}:timeout_rate`,
      reason: "timeout_rate",
      current: Number(timeoutRate.toFixed(4)),
      threshold: thresholds.timeoutRateMax
    });
  }
  if (circuitOpen > thresholds.circuitOpenMax) {
    reasons.push({
      key: `${provider}:circuit_open`,
      reason: "circuit_open",
      current: circuitOpen,
      threshold: thresholds.circuitOpenMax
    });
  }

  return reasons.map((entry) => ({
    ...entry,
    provider,
    attempts,
    failure,
    timeout,
    circuitOpen
  }));
}

export async function checkProviderTelemetryAlerts({ tenantId = "t_default", metrics = null } = {}) {
  const thresholds = getThresholds();
  const snap = metrics || snapshot();
  const providers = snap.providers || {};
  const state = await readAlertState();
  const now = Date.now();
  const alerts = [];
  const incidents = [];
  const suppressed = [];

  for (const provider of ["voice", "visual"]) {
    const reasons = evaluateProvider(provider, providers[provider] || {}, thresholds);
    for (const reason of reasons) {
      const lastTs = Number(state.alerts?.[reason.key] || 0);
      const inCooldown = now - lastTs < thresholds.cooldownMs;
      if (inCooldown) {
        suppressed.push({
          key: reason.key,
          provider: reason.provider,
          reason: reason.reason,
          retryAfterMs: thresholds.cooldownMs - (now - lastTs)
        });
        continue;
      }

      state.alerts = state.alerts || {};
      state.alerts[reason.key] = now;

      const payload = {
        tenantId,
        provider: reason.provider,
        reason: reason.reason,
        current: reason.current,
        threshold: reason.threshold,
        attempts: reason.attempts,
        failure: reason.failure,
        timeout: reason.timeout,
        circuitOpen: reason.circuitOpen
      };

      await sendAlert("provider.telemetry.threshold_breach", payload);
      alerts.push(payload);

      const incident = await createSupportIncident({
        tenantId,
        severity: "sev2",
        slaTier: "business",
        title: `Provider alert: ${reason.provider} ${reason.reason}`,
        description: `current=${reason.current}; threshold=${reason.threshold}; attempts=${reason.attempts}`
      });
      incidents.push(incident);
    }
  }

  await writeAlertState(state);

  return {
    checkedAt: new Date(now).toISOString(),
    thresholds,
    providersEvaluated: Object.keys(providers).length,
    alerts,
    incidents,
    suppressed
  };
}
