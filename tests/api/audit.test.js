import test from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import { appendFile, mkdir, mkdtemp, writeFile } from "node:fs/promises";
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

test("audit trail is generated and chain verifies", async () => {
  await mkdir("data", { recursive: true });
  await writeFile(path.join("data", "audit-trail.jsonl"), "", "utf8");
  process.env.STORAGE_DRIVER = "file";
  process.env.QUEUE_DRIVER = "file";
  process.env.AUTH_ENABLED = "false";
  process.env.DATA_DIR = await mkdtemp(path.join(os.tmpdir(), "you7li-audit-"));

  const app = await startTestServer();
  try {
    const runRes = await fetch(`http://127.0.0.1:${app.port}/api/v1/pipeline/run`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ topic: "audit pipeline" })
    });
    assert.equal(runRes.status, 200);

    const trailRes = await fetch(`http://127.0.0.1:${app.port}/api/v1/audit/trail?limit=20`);
    const trail = await trailRes.json();
    assert.equal(trailRes.status, 200);
    assert.ok(Array.isArray(trail.items));
    assert.ok(trail.items.length >= 1);
    assert.ok(trail.items[0].chainHash);

    const verifyRes = await fetch(`http://127.0.0.1:${app.port}/api/v1/audit/verify`);
    const verify = await verifyRes.json();
    assert.equal(verifyRes.status, 200);
    assert.equal(verify.ok, true);
    assert.ok(verify.total >= 1);
  } finally {
    await app.close();
  }
});

test("audit verify fails after trail tampering", async () => {
  await mkdir("data", { recursive: true });
  await writeFile(path.join("data", "audit-trail.jsonl"), "", "utf8");
  process.env.STORAGE_DRIVER = "file";
  process.env.QUEUE_DRIVER = "file";
  process.env.AUTH_ENABLED = "false";
  process.env.DATA_DIR = await mkdtemp(path.join(os.tmpdir(), "you7li-audit-"));

  const app = await startTestServer();
  try {
    const runRes = await fetch(`http://127.0.0.1:${app.port}/api/v1/pipeline/run`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ topic: "audit tamper" })
    });
    assert.equal(runRes.status, 200);

    await appendFile(path.join("data", "audit-trail.jsonl"), "{bad-json}\n", "utf8");

    const verifyRes = await fetch(`http://127.0.0.1:${app.port}/api/v1/audit/verify`);
    const verify = await verifyRes.json();
    assert.equal(verifyRes.status, 409);
    assert.equal(verify.ok, false);
  } finally {
    await app.close();
  }
});
