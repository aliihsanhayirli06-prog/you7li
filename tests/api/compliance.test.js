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

test("compliance check flags missing finance disclaimer", async () => {
  const app = await startTestServer();
  try {
    const res = await fetch(`http://127.0.0.1:${app.port}/api/v1/compliance/check`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        topic: "kripto yatirim",
        script: "Bugun kripto portfoy kurulum adimlarini anlatiyorum."
      })
    });

    const json = await res.json();
    assert.equal(res.status, 200);
    assert.equal(json.status, "review");
    assert.ok(json.riskScore > 0);
  } finally {
    await app.close();
  }
});

test("publish gate blocks high-risk content and creates compliance report", async () => {
  process.env.DATA_DIR = await mkdtemp(path.join(os.tmpdir(), "you7li-compliance-"));
  process.env.STORAGE_DRIVER = "file";
  process.env.QUEUE_DRIVER = "file";

  const app = await startTestServer();
  try {
    const createRes = await fetch(`http://127.0.0.1:${app.port}/api/v1/publish/create`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        topic: "hizli buyume",
        script: "100% garanti kazanc ile hemen zengin ol"
      })
    });

    const created = await createRes.json();
    assert.equal(createRes.status, 201);
    assert.equal(created.status, "blocked");
    assert.equal(created.complianceStatus, "blocked");

    const reportRes = await fetch(
      `http://127.0.0.1:${app.port}/api/v1/compliance/report?publishId=${created.publishId}`
    );
    const report = await reportRes.json();

    assert.equal(reportRes.status, 200);
    assert.equal(report.complianceStatus, "blocked");
    assert.ok(report.complianceRiskScore >= 45);
  } finally {
    await app.close();
  }
});

test("policy classifier flags violent content as blocked", async () => {
  const app = await startTestServer();
  try {
    const res = await fetch(`http://127.0.0.1:${app.port}/api/v1/compliance/check`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        topic: "violent revenge",
        script: "how to attack with bomb in home"
      })
    });

    const json = await res.json();
    assert.equal(res.status, 200);
    assert.equal(json.status, "blocked");
    assert.ok(json.findings.some((item) => item.rule === "policy_violence"));
    assert.ok(json.riskScore >= 45);
  } finally {
    await app.close();
  }
});
