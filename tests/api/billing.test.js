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

test("billing usage report aggregates metered actions", async () => {
  process.env.STORAGE_DRIVER = "file";
  process.env.QUEUE_DRIVER = "file";
  process.env.AUTH_ENABLED = "false";
  process.env.DATA_DIR = await mkdtemp(path.join(os.tmpdir(), "you7li-billing-"));

  const app = await startTestServer();
  try {
    const runRes = await fetch(`http://127.0.0.1:${app.port}/api/v1/pipeline/run`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ topic: "billing test" })
    });
    const run = await runRes.json();
    assert.equal(runRes.status, 200);

    const ingestRes = await fetch(`http://127.0.0.1:${app.port}/api/v1/analytics/ingest`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        publishId: run.publish.publishId,
        metricsCtr: 0.03,
        metricsRetention3s: 0.52,
        metricsAvgWatchDurationSec: 20,
        metricsCompletionRate: 0.58
      })
    });
    assert.equal(ingestRes.status, 200);

    const billRes = await fetch(`http://127.0.0.1:${app.port}/api/v1/billing/usage?days=30`);
    const bill = await billRes.json();
    assert.equal(billRes.status, 200);
    assert.ok(bill.summary.eventCount >= 2);
    assert.ok(bill.summary.totalUnits > 0);
    assert.ok(bill.summary.totalAmountUsd > 0);
    assert.ok(bill.summary.byAction["pipeline.run"]);
    assert.ok(bill.summary.byAction["analytics.ingest"]);
  } finally {
    await app.close();
  }
});
