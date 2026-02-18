const queryStats = {
  total: 0,
  slow: 0,
  avgMs: 0,
  maxMs: 0,
  lastSlow: []
};

function cap(arr, max = 100) {
  if (arr.length > max) arr.splice(0, arr.length - max);
}

export function recordQueryProfile({ sql = "", durationMs = 0 } = {}) {
  const ms = Number(durationMs || 0);
  if (!Number.isFinite(ms)) return;

  queryStats.total += 1;
  queryStats.avgMs = Number(
    ((queryStats.avgMs * (queryStats.total - 1) + ms) / queryStats.total).toFixed(2)
  );
  if (ms > queryStats.maxMs) queryStats.maxMs = Number(ms.toFixed(2));

  const slowThresholdMs = Number(process.env.DB_SLOW_QUERY_MS || 250);
  if (ms >= slowThresholdMs) {
    queryStats.slow += 1;
    queryStats.lastSlow.push({
      at: new Date().toISOString(),
      durationMs: Number(ms.toFixed(2)),
      sql: String(sql || "").slice(0, 300)
    });
    cap(queryStats.lastSlow, 200);
  }
}

export function getQueryProfileSnapshot() {
  return {
    ...queryStats,
    slowRate: queryStats.total ? Number((queryStats.slow / queryStats.total).toFixed(4)) : 0,
    generatedAt: new Date().toISOString()
  };
}
