import test from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import { mkdtemp } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { handleApi } from "../../apps/api/src/routes/api.js";
import { resetCircuitBreakers, withCircuitBreaker } from "../../apps/api/src/infra/circuitBreakerStore.js";

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

test("reliability policy endpoint exposes backpressure and circuit-breaker config", async () => {
  process.env.STORAGE_DRIVER = "file";
  process.env.QUEUE_DRIVER = "file";
  process.env.AUTH_ENABLED = "false";
  process.env.DATA_DIR = await mkdtemp(path.join(os.tmpdir(), "you7li-reliability-policy-"));
  process.env.QUEUE_BACKPRESSURE_SOFT_LIMIT = "7";
  process.env.QUEUE_BACKPRESSURE_HARD_LIMIT = "11";
  process.env.QUEUE_BACKPRESSURE_DEFER_MS = "5";
  process.env.CIRCUIT_BREAKER_FAILURE_THRESHOLD = "2";
  process.env.CIRCUIT_BREAKER_COOLDOWN_MS = "2000";
  resetCircuitBreakers();

  await assert.rejects(
    async () =>
      withCircuitBreaker("policy.adapter", async () => {
        throw new Error("boom");
      }),
    /boom/
  );

  const app = await startTestServer();
  try {
    const res = await fetch(`http://127.0.0.1:${app.port}/api/v1/ops/reliability/policy`);
    const body = await res.json();
    assert.equal(res.status, 200);
    assert.equal(body.backpressure.softLimit, 7);
    assert.equal(body.backpressure.hardLimit, 11);
    assert.equal(body.backpressure.deferMs, 5);
    assert.equal(body.circuitBreaker.failureThreshold, 2);
    assert.equal(body.circuitBreaker.cooldownMs, 2000);
    assert.ok(body.circuitBreaker.circuits.some((item) => item.key === "policy.adapter"));
  } finally {
    await app.close();
  }
});
