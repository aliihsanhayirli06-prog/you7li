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

test("report export supports csv/pdf and schedule creation", async () => {
  process.env.STORAGE_DRIVER = "file";
  process.env.QUEUE_DRIVER = "file";
  process.env.AUTH_ENABLED = "false";
  process.env.DATA_DIR = await mkdtemp(path.join(os.tmpdir(), "you7li-reporting-"));

  const app = await startTestServer();
  try {
    const pipelineRes = await fetch(`http://127.0.0.1:${app.port}/api/v1/pipeline/run`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ topic: "reporting smoke" })
    });
    assert.equal(pipelineRes.status, 200);

    const csvRes = await fetch(
      `http://127.0.0.1:${app.port}/api/v1/reports/export?dataset=history&format=csv`
    );
    const csv = await csvRes.text();
    assert.equal(csvRes.status, 200);
    assert.match(csvRes.headers.get("content-type") || "", /text\/csv/);
    assert.match(csv, /eventType|no_data/);

    const pdfRes = await fetch(
      `http://127.0.0.1:${app.port}/api/v1/reports/export?dataset=usage&format=pdf`
    );
    const pdf = await pdfRes.arrayBuffer();
    assert.equal(pdfRes.status, 200);
    assert.match(pdfRes.headers.get("content-type") || "", /application\/pdf/);
    assert.ok(pdf.byteLength > 12);

    const createScheduleRes = await fetch(`http://127.0.0.1:${app.port}/api/v1/reports/schedules`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        email: "ops@example.com",
        dataset: "history",
        format: "csv",
        cadence: "weekly"
      })
    });
    const createSchedule = await createScheduleRes.json();
    assert.equal(createScheduleRes.status, 201);
    assert.equal(createSchedule.schedule.dataset, "history");
    assert.equal(createSchedule.delivery.mode, "simulated_email");

    const listRes = await fetch(`http://127.0.0.1:${app.port}/api/v1/reports/schedules`);
    const list = await listRes.json();
    assert.equal(listRes.status, 200);
    assert.ok(list.items.length >= 1);
  } finally {
    await app.close();
  }
});
