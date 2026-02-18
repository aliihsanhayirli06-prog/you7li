import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

test("analytics ingest queues optimization for low performance", async () => {
  process.env.DATA_DIR = await mkdtemp(path.join(os.tmpdir(), "you7li-growth-"));
  process.env.STORAGE_DRIVER = "file";
  process.env.QUEUE_DRIVER = "file";

  const { savePublish, getPublishById } =
    await import("../../apps/api/src/infra/publishRepository.js");
  const { ingestAnalytics } = await import("../../apps/api/src/services/analyticsService.js");
  const { dequeue } = await import("../../apps/api/src/infra/queueClient.js");

  const publishId = `pub_growth_${Date.now()}`;
  await savePublish({
    publishId,
    topic: "YouTube growth",
    title: "title",
    description: "desc",
    status: "published",
    complianceStatus: "pass",
    complianceRiskScore: 0,
    complianceReport: { status: "pass", riskScore: 0, findings: [] },
    scheduledAt: new Date().toISOString()
  });

  const result = await ingestAnalytics({
    publishId,
    metricsCtr: 0.02,
    metricsRetention3s: 0.4,
    metricsAvgWatchDurationSec: 14,
    metricsCompletionRate: 0.45
  });

  assert.equal(result.evaluation.needsOptimization, true);
  assert.ok(result.evaluation.flags.includes("low_ctr"));

  const queued = await dequeue();
  assert.equal(queued.jobType, "optimize.generate");

  const updated = await getPublishById(publishId);
  assert.equal(updated.optimizationStatus, "queued");
  assert.equal(updated.metricsCtr, 0.02);
});

test("optimize processor generates hook/title variants", async () => {
  process.env.DATA_DIR = await mkdtemp(path.join(os.tmpdir(), "you7li-growth-"));
  process.env.STORAGE_DRIVER = "file";
  process.env.QUEUE_DRIVER = "file";

  const { savePublish, getPublishById } =
    await import("../../apps/api/src/infra/publishRepository.js");
  const { processOptimizeJob } = await import("../../services/worker/src/optimizeProcessor.js");

  const publishId = `pub_opt_${Date.now()}`;
  await savePublish({
    publishId,
    topic: "YouTube retention",
    title: "retention title",
    description: "desc",
    status: "published",
    complianceStatus: "pass",
    complianceRiskScore: 0,
    complianceReport: { status: "pass", riskScore: 0, findings: [] },
    scheduledAt: new Date().toISOString()
  });

  const updated = await processOptimizeJob({
    jobType: "optimize.generate",
    publishId,
    flags: ["low_ctr", "low_retention_3s"]
  });

  assert.equal(updated.optimizationStatus, "ready");
  assert.ok(Array.isArray(updated.optimizationVariants.titleVariants));
  assert.ok(updated.optimizationVariants.titleVariants.length >= 2);

  const report = await getPublishById(publishId);
  assert.equal(report.optimizationStatus, "ready");
  assert.ok(Array.isArray(report.optimizationVariants.hookVariants));
});
