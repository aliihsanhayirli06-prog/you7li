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

test("onboarding status returns guided setup and empty-state progress", async () => {
  process.env.STORAGE_DRIVER = "file";
  process.env.QUEUE_DRIVER = "file";
  process.env.AUTH_ENABLED = "false";
  process.env.DATA_DIR = await mkdtemp(path.join(os.tmpdir(), "you7li-onboarding-"));

  const app = await startTestServer();
  try {
    const onboardRes = await fetch(`http://127.0.0.1:${app.port}/api/v1/onboarding/self-serve`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        tenantName: "Onboarding Team",
        ownerEmail: "owner@example.com",
        channelName: "Launch Channel"
      })
    });
    const onboard = await onboardRes.json();
    assert.equal(onboardRes.status, 201);
    const tenantId = onboard.tenant.tenantId;

    const statusBeforeRes = await fetch(`http://127.0.0.1:${app.port}/api/v1/onboarding/status`, {
      headers: { "x-tenant-id": tenantId }
    });
    const statusBefore = await statusBeforeRes.json();
    assert.equal(statusBeforeRes.status, 200);
    assert.equal(statusBefore.onboardingStatus, "in_progress");
    assert.equal(statusBefore.emptyState.hasPublish, false);
    assert.equal(statusBefore.emptyState.showGuidedSetup, true);
    assert.ok(statusBefore.steps.some((item) => item.key === "channel_connected" && item.done));
    assert.ok(
      statusBefore.steps.some((item) => item.key === "first_publish_created" && !item.done)
    );

    const pipelineRes = await fetch(`http://127.0.0.1:${app.port}/api/v1/pipeline/run`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-tenant-id": tenantId
      },
      body: JSON.stringify({ topic: "onboarding first publish" })
    });
    assert.equal(pipelineRes.status, 200);

    const statusAfterRes = await fetch(`http://127.0.0.1:${app.port}/api/v1/onboarding/status`, {
      headers: { "x-tenant-id": tenantId }
    });
    const statusAfter = await statusAfterRes.json();
    assert.equal(statusAfterRes.status, 200);
    assert.equal(statusAfter.emptyState.hasPublish, true);
    assert.ok(statusAfter.steps.some((item) => item.key === "first_publish_created" && item.done));
  } finally {
    await app.close();
  }
});
