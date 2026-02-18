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

test("feature store snapshot aggregates channel/content segments", async () => {
  process.env.STORAGE_DRIVER = "file";
  process.env.QUEUE_DRIVER = "file";
  process.env.AUTH_ENABLED = "false";
  process.env.DATA_DIR = await mkdtemp(path.join(os.tmpdir(), "you7li-feature-store-"));

  const app = await startTestServer();
  try {
    const pipelineRes = await fetch(`http://127.0.0.1:${app.port}/api/v1/pipeline/run`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ topic: "feature store smoke" })
    });
    const pipeline = await pipelineRes.json();
    assert.equal(pipelineRes.status, 200);
    assert.ok(pipeline.publish.publishId);

    const ingestRes = await fetch(`http://127.0.0.1:${app.port}/api/v1/analytics/ingest`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        publishId: pipeline.publish.publishId,
        metricsCtr: 0.051,
        metricsRetention3s: 0.61,
        metricsAvgWatchDurationSec: 21,
        metricsCompletionRate: 0.57
      })
    });
    assert.equal(ingestRes.status, 200);

    const snapshotRes = await fetch(`http://127.0.0.1:${app.port}/api/v1/analytics/feature-store`);
    const snapshot = await snapshotRes.json();
    assert.equal(snapshotRes.status, 200);
    assert.equal(snapshot.tenantId, "t_default");
    assert.ok(snapshot.summary.publishes >= 1);
    assert.ok(Array.isArray(snapshot.segments.byChannel));
    assert.ok(Array.isArray(snapshot.segments.byContentSegment));
    assert.ok(
      snapshot.segments.byContentSegment.some(
        (segment) => segment.segment === "high_ctr" && segment.publishCount >= 1
      )
    );
  } finally {
    await app.close();
  }
});
