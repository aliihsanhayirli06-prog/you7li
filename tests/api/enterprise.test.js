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

test("enterprise endpoints expose SOC2 pack, SLA tiers and support incident flow", async () => {
  process.env.STORAGE_DRIVER = "file";
  process.env.QUEUE_DRIVER = "file";
  process.env.AUTH_ENABLED = "false";
  process.env.DATA_DIR = await mkdtemp(path.join(os.tmpdir(), "you7li-enterprise-"));

  const app = await startTestServer();
  try {
    const packRes = await fetch(`http://127.0.0.1:${app.port}/api/v1/enterprise/compliance-pack`);
    const pack = await packRes.json();
    assert.equal(packRes.status, 200);
    assert.ok(Array.isArray(pack.controls));
    assert.ok(pack.controls.length >= 3);

    const tiersRes = await fetch(`http://127.0.0.1:${app.port}/api/v1/enterprise/sla-tiers`);
    const tiers = await tiersRes.json();
    assert.equal(tiersRes.status, 200);
    assert.ok(tiers.tiers.some((item) => item.code === "enterprise"));

    const createRes = await fetch(
      `http://127.0.0.1:${app.port}/api/v1/enterprise/support/incidents`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          severity: "sev2",
          slaTier: "business",
          title: "Connector sync degradation",
          description: "error rate increased after release"
        })
      }
    );
    const created = await createRes.json();
    assert.equal(createRes.status, 201);
    assert.equal(created.status, "open");

    const listRes = await fetch(`http://127.0.0.1:${app.port}/api/v1/enterprise/support/incidents`);
    const list = await listRes.json();
    assert.equal(listRes.status, 200);
    assert.ok(list.items.some((item) => item.incidentId === created.incidentId));
  } finally {
    await app.close();
  }
});
