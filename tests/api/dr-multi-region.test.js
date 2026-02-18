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

test("multi-region DR drill reports RPO/RTO metrics and last run status", async () => {
  process.env.STORAGE_DRIVER = "file";
  process.env.QUEUE_DRIVER = "file";
  process.env.AUTH_ENABLED = "false";
  process.env.DATA_DIR = await mkdtemp(path.join(os.tmpdir(), "you7li-dr-"));
  process.env.DR_REGIONS = "eu-central-1,us-east-1";
  process.env.DR_BACKUP_INTERVAL_MIN = "10";

  const app = await startTestServer();
  try {
    const runRes = await fetch(`http://127.0.0.1:${app.port}/api/v1/ops/dr/multi-region/run`, {
      method: "POST"
    });
    const run = await runRes.json();
    assert.equal(runRes.status, 200);
    assert.equal(run.mode, "simulated_multi_region");
    assert.equal(run.regions.length, 2);
    assert.equal(typeof run.metrics.measuredRpoMinutes, "number");
    assert.equal(typeof run.metrics.measuredRtoSeconds, "number");

    const statusRes = await fetch(
      `http://127.0.0.1:${app.port}/api/v1/ops/dr/multi-region/status`
    );
    const status = await statusRes.json();
    assert.equal(statusRes.status, 200);
    assert.equal(status.backupIntervalMin, 10);
    assert.ok(status.lastRun);
    assert.equal(status.lastRun.mode, "simulated_multi_region");
  } finally {
    await app.close();
  }
});
