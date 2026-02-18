import test from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import { mkdtemp } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { handleApi } from "../../apps/api/src/routes/api.js";

async function startTestServer() {
  const server = http.createServer((req, res) => {
    Promise.resolve(handleApi(req, res)).catch(() => {
      res.writeHead(500, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: "internal error" }));
    });
  });

  await new Promise((resolve) => server.listen(0, resolve));
  const { port } = server.address();
  return {
    port,
    close: () => new Promise((resolve) => server.close(resolve))
  };
}

test("experiment platform supports A/B setup, assignment and guardrail report", async () => {
  process.env.STORAGE_DRIVER = "file";
  process.env.QUEUE_DRIVER = "file";
  process.env.AUTH_ENABLED = "false";
  process.env.DATA_DIR = await mkdtemp(path.join(os.tmpdir(), "you7li-experiments-"));

  const app = await startTestServer();
  try {
    const createRes = await fetch(`http://127.0.0.1:${app.port}/api/v1/experiments`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: "Hook AB Test",
        targetMetric: "ctr",
        variants: [{ key: "control", label: "Control" }, { key: "variant_b", label: "Variant B" }],
        guardrails: { minRetention3s: 0.5, minCompletionRate: 0.55, maxErrorRate: 0.02 }
      })
    });
    const created = await createRes.json();
    assert.equal(createRes.status, 201);
    assert.equal(created.variants.length, 2);

    const assignFirstRes = await fetch(`http://127.0.0.1:${app.port}/api/v1/experiments/assign`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        experimentId: created.experimentId,
        subjectId: "subject-1"
      })
    });
    const assignFirst = await assignFirstRes.json();
    assert.equal(assignFirstRes.status, 200);
    assert.ok(["control", "variant_b"].includes(assignFirst.variantKey));

    const assignSecondRes = await fetch(`http://127.0.0.1:${app.port}/api/v1/experiments/assign`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        experimentId: created.experimentId,
        subjectId: "subject-1"
      })
    });
    const assignSecond = await assignSecondRes.json();
    assert.equal(assignSecondRes.status, 200);
    assert.equal(assignSecond.assignmentId, assignFirst.assignmentId);

    const metricGoodRes = await fetch(`http://127.0.0.1:${app.port}/api/v1/experiments/metrics`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        experimentId: created.experimentId,
        variantKey: "control",
        metricsCtr: 0.05,
        metricsRetention3s: 0.61,
        metricsCompletionRate: 0.63,
        errorRate: 0.01
      })
    });
    assert.equal(metricGoodRes.status, 201);

    const metricBadRes = await fetch(`http://127.0.0.1:${app.port}/api/v1/experiments/metrics`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        experimentId: created.experimentId,
        variantKey: "variant_b",
        metricsCtr: 0.06,
        metricsRetention3s: 0.41,
        metricsCompletionRate: 0.5,
        errorRate: 0.03
      })
    });
    assert.equal(metricBadRes.status, 201);

    const reportRes = await fetch(
      `http://127.0.0.1:${app.port}/api/v1/experiments/report?experimentId=${created.experimentId}`
    );
    const report = await reportRes.json();
    assert.equal(reportRes.status, 200);
    assert.equal(report.experimentId, created.experimentId);
    assert.equal(report.samples, 2);
    assert.equal(report.health, "violated");
    assert.ok(report.byVariant.some((item) => item.variantKey === "variant_b"));
  } finally {
    await app.close();
  }
});
