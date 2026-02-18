const counters = {
  httpRequestsTotal: 0,
  httpErrorsTotal: 0,
  jobsCompletedTotal: 0,
  jobsFailedTotal: 0,
  jobsRetriedTotal: 0,
  jobsDlqTotal: 0
};

const histograms = {
  httpDurationMs: []
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

function avg(values) {
  if (!values.length) return 0;
  const sum = values.reduce((acc, value) => acc + value, 0);
  return Number((sum / values.length).toFixed(2));
}

export function snapshot(extra = {}) {
  return {
    counters: { ...counters },
    timings: {
      httpDurationAvgMs: avg(histograms.httpDurationMs),
      httpDurationP95Ms: percentile(histograms.httpDurationMs, 95)
    },
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
