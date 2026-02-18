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

test("deploy strategy supports canary progression and blue/green switch", async () => {
  process.env.STORAGE_DRIVER = "file";
  process.env.QUEUE_DRIVER = "file";
  process.env.AUTH_ENABLED = "false";
  process.env.DATA_DIR = await mkdtemp(path.join(os.tmpdir(), "you7li-deploy-"));

  const app = await startTestServer();
  try {
    const initialRes = await fetch(`http://127.0.0.1:${app.port}/api/v1/ops/deploy/strategy`);
    const initial = await initialRes.json();
    assert.equal(initialRes.status, 200);
    assert.equal(initial.activeColor, "blue");
    assert.equal(initial.standbyColor, "green");

    const canaryRes = await fetch(`http://127.0.0.1:${app.port}/api/v1/ops/deploy/canary`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ percent: 25 })
    });
    const canary = await canaryRes.json();
    assert.equal(canaryRes.status, 200);
    assert.equal(canary.canaryPercent, 25);
    assert.equal(canary.rolloutStage, "canary");

    const promotedRes = await fetch(`http://127.0.0.1:${app.port}/api/v1/ops/deploy/canary`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ percent: 100, promptComplianceScore: 92 })
    });
    const promoted = await promotedRes.json();
    assert.equal(promotedRes.status, 200);
    assert.equal(promoted.rolloutStage, "promoted");
    assert.equal(promoted.releaseGate.status, "passed");
    assert.equal(promoted.releaseGate.lastScore, 92);

    const switchRes = await fetch(`http://127.0.0.1:${app.port}/api/v1/ops/deploy/switch`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ targetColor: "green" })
    });
    const switched = await switchRes.json();
    assert.equal(switchRes.status, 200);
    assert.equal(switched.activeColor, "green");
    assert.equal(switched.standbyColor, "blue");
    assert.equal(switched.rolloutStage, "stable");
    assert.equal(switched.canaryPercent, 0);

    const opsStatusRes = await fetch(`http://127.0.0.1:${app.port}/api/v1/ops/status`);
    const opsStatus = await opsStatusRes.json();
    assert.equal(opsStatusRes.status, 200);
    assert.equal(opsStatus.deployStrategy.activeColor, "green");
  } finally {
    await app.close();
  }
});

test("deploy strategy blocks 100 percent rollout when prompt compliance is below threshold", async () => {
  process.env.STORAGE_DRIVER = "file";
  process.env.QUEUE_DRIVER = "file";
  process.env.AUTH_ENABLED = "false";
  process.env.PROMPT_COMPLIANCE_MIN_SCORE = "85";
  process.env.DATA_DIR = await mkdtemp(path.join(os.tmpdir(), "you7li-deploy-gate-"));

  const app = await startTestServer();
  try {
    const blockedRes = await fetch(`http://127.0.0.1:${app.port}/api/v1/ops/deploy/canary`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ percent: 100, promptComplianceScore: 72 })
    });
    const blocked = await blockedRes.json();
    assert.equal(blockedRes.status, 409);
    assert.equal(blocked.error, "prompt compliance gate blocked full rollout");
    assert.equal(blocked.minScore, 85);
    assert.equal(blocked.score, 72);

    const missingScoreRes = await fetch(`http://127.0.0.1:${app.port}/api/v1/ops/deploy/canary`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ percent: 100 })
    });
    const missing = await missingScoreRes.json();
    assert.equal(missingScoreRes.status, 400);
    assert.equal(missing.error, "promptComplianceScore required for 100 percent rollout");
  } finally {
    await app.close();
    delete process.env.PROMPT_COMPLIANCE_MIN_SCORE;
  }
});
