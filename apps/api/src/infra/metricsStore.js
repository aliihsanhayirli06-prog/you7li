const counters = {
  httpRequestsTotal: 0,
  httpErrorsTotal: 0,
  jobsCompletedTotal: 0,
  jobsFailedTotal: 0,
  jobsRetriedTotal: 0,
  jobsDlqTotal: 0,
  providerAttemptsTotal: 0,
  providerSuccessTotal: 0,
  providerFailuresTotal: 0,
  providerTimeoutsTotal: 0,
  providerCircuitOpenTotal: 0,
  providerRetriesTotal: 0
};

const histograms = {
  httpDurationMs: []
};

const providerTelemetry = {
  voice: {
    attempts: 0,
    success: 0,
    failure: 0,
    timeout: 0,
    circuitOpen: 0,
    retries: 0,
    durationMs: []
  },
  visual: {
    attempts: 0,
    success: 0,
    failure: 0,
    timeout: 0,
    circuitOpen: 0,
    retries: 0,
    durationMs: []
  }
};

function capArray(arr, max = 5000) {
  if (arr.length > max) {
    arr.splice(0, arr.length - max);
  }
}

export function increment(metric, amount = 1) {
  if (!(metric in counters)) return;
  counters[metric] += amount;
}

export function observeHttpDuration(ms) {
  if (!Number.isFinite(ms)) return;
  histograms.httpDurationMs.push(ms);
  capArray(histograms.httpDurationMs);
}

function safeProviderName(provider) {
  const normalized = String(provider || "").toLowerCase();
  if (normalized === "voice" || normalized === "visual") return normalized;
  return null;
}

export function recordProviderTelemetry({
  provider,
  outcome = "failure",
  durationMs = 0,
  retried = false
}) {
  const key = safeProviderName(provider);
  if (!key) return;

  providerTelemetry[key].attempts += 1;
  counters.providerAttemptsTotal += 1;

  if (Number.isFinite(durationMs) && durationMs >= 0) {
    providerTelemetry[key].durationMs.push(durationMs);
    capArray(providerTelemetry[key].durationMs);
  }

  if (retried) {
    providerTelemetry[key].retries += 1;
    counters.providerRetriesTotal += 1;
  }

  const outcomeLabel = String(outcome || "failure").toLowerCase();
  if (outcomeLabel === "success") {
    providerTelemetry[key].success += 1;
    counters.providerSuccessTotal += 1;
    return;
  }
  if (outcomeLabel === "timeout") {
    providerTelemetry[key].timeout += 1;
    providerTelemetry[key].failure += 1;
    counters.providerTimeoutsTotal += 1;
    counters.providerFailuresTotal += 1;
    return;
  }
  if (outcomeLabel === "circuit_open") {
    providerTelemetry[key].circuitOpen += 1;
    providerTelemetry[key].failure += 1;
    counters.providerCircuitOpenTotal += 1;
    counters.providerFailuresTotal += 1;
    return;
  }

  providerTelemetry[key].failure += 1;
  counters.providerFailuresTotal += 1;
}

function avg(values) {
  if (!values.length) return 0;
  const sum = values.reduce((acc, value) => acc + value, 0);
  return Number((sum / values.length).toFixed(2));
}

export function snapshot(extra = {}) {
  const providers = Object.fromEntries(
    Object.entries(providerTelemetry).map(([key, value]) => [
      key,
      {
        attempts: value.attempts,
        success: value.success,
        failure: value.failure,
        timeout: value.timeout,
        circuitOpen: value.circuitOpen,
        retries: value.retries,
        avgDurationMs: avg(value.durationMs),
        p95DurationMs: percentile(value.durationMs, 95)
      }
    ])
  );

  return {
    counters: { ...counters },
    timings: {
      httpDurationAvgMs: avg(histograms.httpDurationMs),
      httpDurationP95Ms: percentile(histograms.httpDurationMs, 95)
    },
    providers,
    ...extra,
    generatedAt: new Date().toISOString()
  };
}

function percentile(values, p) {
  if (!values.length) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const idx = Math.min(sorted.length - 1, Math.floor((p / 100) * sorted.length));
  return Number(sorted[idx].toFixed(2));
}
