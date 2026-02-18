import test from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import { mkdtemp, readFile } from "node:fs/promises";
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

test("offline eval dataset endpoint and regression report generation", async () => {
  process.env.AUTH_ENABLED = "false";
  process.env.STORAGE_DRIVER = "file";
  process.env.QUEUE_DRIVER = "file";
  process.env.DATA_DIR = await mkdtemp(path.join(os.tmpdir(), "you7li-eval-"));
  process.env.QUALITY_EVAL_DATASET_FILE = path.resolve("tests/fixtures/quality-regression-dataset.json");

  const app = await startTestServer();
  try {
    const datasetRes = await fetch(`http://127.0.0.1:${app.port}/api/v1/ops/eval/dataset`);
    const dataset = await datasetRes.json();
    assert.equal(datasetRes.status, 200);
    assert.equal(dataset.items.length, 2);
    assert.equal(dataset.items[0].id, "fx_pass");

    const runRes = await fetch(`http://127.0.0.1:${app.port}/api/v1/ops/eval/regression/run`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ maxItems: 2 })
    });
    const report = await runRes.json();
    assert.equal(runRes.status, 200);
    assert.equal(report.dataset.size, 2);
    assert.equal(typeof report.summary.avgFinalScore, "number");
    assert.equal(report.summary.failed >= 1, true);
    assert.equal(report.status, "regression");
    assert.ok(Array.isArray(report.items));
    assert.equal(report.items.length, 2);

    const written = JSON.parse(
      await readFile(path.join(process.env.DATA_DIR, "quality-regression-latest.json"), "utf8")
    );
    assert.equal(written.dataset.size, 2);
    assert.equal(written.status, "regression");
  } finally {
    await app.close();
    delete process.env.QUALITY_EVAL_DATASET_FILE;
  }
});
