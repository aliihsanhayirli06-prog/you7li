import test from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import { mkdtemp } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { handleApi } from "../../apps/api/src/routes/api.js";
import { recordProviderTelemetry } from "../../apps/api/src/infra/metricsStore.js";

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

test("provider telemetry alert check creates incidents and respects cooldown", async () => {
  process.env.AUTH_ENABLED = "false";
  process.env.STORAGE_DRIVER = "file";
  process.env.QUEUE_DRIVER = "file";
  process.env.DATA_DIR = await mkdtemp(path.join(os.tmpdir(), "you7li-alert-"));
  process.env.PROVIDER_ALERT_MIN_ATTEMPTS = "5";
  process.env.PROVIDER_ALERT_FAILURE_RATE_MAX = "0.4";
  process.env.PROVIDER_ALERT_TIMEOUT_RATE_MAX = "0.2";
  process.env.PROVIDER_ALERT_COOLDOWN_MS = "600000";

  for (let i = 0; i < 10; i += 1) {
    recordProviderTelemetry({
      provider: "voice",
      outcome: i < 6 ? "timeout" : "success",
      durationMs: 250 + i
    });
  }

  const app = await startTestServer();
  try {
    const firstRes = await fetch(`http://127.0.0.1:${app.port}/api/v1/ops/alerts/provider/check`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({})
    });
    const first = await firstRes.json();
    assert.equal(firstRes.status, 200);
    assert.ok(first.alerts.length >= 2);
    assert.ok(first.incidents.length >= 2);
    assert.equal(first.suppressed.length, 0);

    const incidentRes = await fetch(`http://127.0.0.1:${app.port}/api/v1/enterprise/support/incidents`);
    const incidentList = await incidentRes.json();
    assert.equal(incidentRes.status, 200);
    assert.ok(incidentList.items.length >= 2);

    const secondRes = await fetch(`http://127.0.0.1:${app.port}/api/v1/ops/alerts/provider/check`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({})
    });
    const second = await secondRes.json();
    assert.equal(secondRes.status, 200);
    assert.equal(second.alerts.length, 0);
    assert.equal(second.incidents.length, 0);
    assert.ok(second.suppressed.length >= 1);
  } finally {
    await app.close();
    delete process.env.PROVIDER_ALERT_MIN_ATTEMPTS;
    delete process.env.PROVIDER_ALERT_FAILURE_RATE_MAX;
    delete process.env.PROVIDER_ALERT_TIMEOUT_RATE_MAX;
    delete process.env.PROVIDER_ALERT_COOLDOWN_MS;
  }
});
