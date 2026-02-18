import { snapshot } from "../infra/metricsStore.js";
import { getQueueSize } from "../infra/queueClient.js";

export async function getSloReport() {
  const metrics = snapshot();
  const queueSize = await getQueueSize();

  const requestTotal = Number(metrics.counters.httpRequestsTotal || 0);
  const requestErrors = Number(metrics.counters.httpErrorsTotal || 0);
  const errorRate = requestTotal > 0 ? requestErrors / requestTotal : 0;
  const p95 = Number(metrics.timings.httpDurationP95Ms || 0);

  const targetErrorRate = Number(process.env.SLO_ERROR_RATE_MAX || 0.01);
  const targetP95 = Number(process.env.SLO_HTTP_P95_MS_MAX || 400);

  const violations = [];
  if (errorRate > targetErrorRate) violations.push("error_rate");
  if (p95 > targetP95) violations.push("latency_p95");

  const capacity = {
    queueSize,
    backlogSeverity: queueSize > 100 ? "high" : queueSize > 20 ? "medium" : "low"
  };

  return {
    slo: {
      availabilityApprox: Number((1 - errorRate).toFixed(4)),
      errorRate: Number(errorRate.toFixed(4)),
      httpP95Ms: p95,
      targets: {
        errorRateMax: targetErrorRate,
        httpP95MsMax: targetP95
      },
      status: violations.length ? "violated" : "healthy",
      violations
    },
    capacity,
    generatedAt: new Date().toISOString()
  };
}
