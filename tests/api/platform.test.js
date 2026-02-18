import test from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import { mkdtemp } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { handleApi } from "../../apps/api/src/routes/api.js";

async function startTestServer(handler = handleApi) {
  const server = http.createServer((req, res) => {
    Promise.resolve(handler(req, res)).catch(() => {
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

test("privacy retention/erase and DR drill endpoints work", async () => {
  process.env.AUTH_ENABLED = "false";
  process.env.STORAGE_DRIVER = "file";
  process.env.QUEUE_DRIVER = "file";
  process.env.DATA_DIR = await mkdtemp(path.join(os.tmpdir(), "you7li-gov-"));

  const app = await startTestServer();
  try {
    const createRes = await fetch(`http://127.0.0.1:${app.port}/api/v1/publish/create`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ topic: "privacy", script: "safe script" })
    });
    const created = await createRes.json();
    assert.equal(createRes.status, 201);

    const eraseRes = await fetch(`http://127.0.0.1:${app.port}/api/v1/privacy/erase-publish`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ publishId: created.publishId })
    });
    const erased = await eraseRes.json();
    assert.equal(eraseRes.status, 200);
    assert.ok(erased.deleted.publishes >= 1);

    const retentionRes = await fetch(
      `http://127.0.0.1:${app.port}/api/v1/privacy/retention/apply`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ retentionDays: 1 })
      }
    );
    assert.equal(retentionRes.status, 200);

    const drillRes = await fetch(`http://127.0.0.1:${app.port}/api/v1/ops/dr/drill`, {
      method: "POST"
    });
    const drill = await drillRes.json();
    assert.equal(drillRes.status, 200);
    assert.equal(drill.ok, true);
  } finally {
    await app.close();
  }
});

test("webhook/plugin/connector and api key lifecycle endpoints work", async () => {
  process.env.AUTH_ENABLED = "false";
  process.env.STORAGE_DRIVER = "file";
  process.env.QUEUE_DRIVER = "file";
  process.env.DATA_DIR = await mkdtemp(path.join(os.tmpdir(), "you7li-eco-"));

  const receiverEvents = [];
  const receiver = await startTestServer(async (req, res) => {
    if (req.method === "POST") {
      receiverEvents.push(req.url);
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ ok: true }));
      return;
    }
    res.writeHead(404, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ error: "not found" }));
  });

  const app = await startTestServer();
  try {
    const webhookRes = await fetch(`http://127.0.0.1:${app.port}/api/v1/integrations/webhooks`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ url: `http://127.0.0.1:${receiver.port}/hook`, eventTypes: ["*"] })
    });
    assert.equal(webhookRes.status, 201);

    const pluginRes = await fetch(`http://127.0.0.1:${app.port}/api/v1/plugins/register`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: "plugin-test",
        endpoint: `http://127.0.0.1:${receiver.port}/plugin`,
        hooks: ["history.event"]
      })
    });
    assert.equal(pluginRes.status, 201);

    const keyRes = await fetch(`http://127.0.0.1:${app.port}/api/v1/developer/keys`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: "ci" })
    });
    const createdKey = await keyRes.json();
    assert.equal(keyRes.status, 201);
    assert.ok(createdKey.key);

    const revokeRes = await fetch(`http://127.0.0.1:${app.port}/api/v1/developer/keys/revoke`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ keyId: createdKey.keyId })
    });
    assert.equal(revokeRes.status, 200);

    const createPublishRes = await fetch(`http://127.0.0.1:${app.port}/api/v1/publish/create`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ topic: "event", script: "event script" })
    });
    assert.equal(createPublishRes.status, 201);

    const webhookTestRes = await fetch(
      `http://127.0.0.1:${app.port}/api/v1/integrations/webhooks/test`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ eventType: "manual.test", payload: { ok: true } })
      }
    );
    const webhookTest = await webhookTestRes.json();
    assert.equal(webhookTestRes.status, 200);
    assert.ok(webhookTest.total >= 1);

    const connectorRes = await fetch(
      `http://127.0.0.1:${app.port}/api/v1/integrations/connectors`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          type: "ga4",
          endpoint: `http://127.0.0.1:${receiver.port}/connector`
        })
      }
    );
    assert.equal(connectorRes.status, 201);

    assert.ok(receiverEvents.length >= 1);
  } finally {
    await app.close();
    await receiver.close();
  }
});

test("sso login endpoint returns session for valid oidc token", async () => {
  process.env.AUTH_ENABLED = "false";
  process.env.SSO_OIDC_TEST_TOKEN = "oidc-test-token";
  process.env.SSO_SAML_TEST_TOKEN = "saml-test-token";

  const app = await startTestServer();
  try {
    const res = await fetch(`http://127.0.0.1:${app.port}/api/v1/auth/sso/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        provider: "oidc",
        idToken: "oidc-test-token",
        email: "user@example.com"
      })
    });
    const session = await res.json();
    assert.equal(res.status, 200);
    assert.equal(session.provider, "oidc");
    assert.equal(session.role, "editor");
    assert.ok(session.sessionToken);
  } finally {
    await app.close();
  }
});

test("ops autoscale/slo/cache endpoints return snapshots", async () => {
  process.env.AUTH_ENABLED = "false";
  process.env.STORAGE_DRIVER = "file";
  process.env.QUEUE_DRIVER = "file";
  process.env.DATA_DIR = await mkdtemp(path.join(os.tmpdir(), "you7li-ops-"));

  const app = await startTestServer();
  try {
    const autoscaleRes = await fetch(`http://127.0.0.1:${app.port}/api/v1/ops/autoscale`);
    const autoscale = await autoscaleRes.json();
    assert.equal(autoscaleRes.status, 200);
    assert.equal(typeof autoscale.desiredWorkers, "number");

    const sloRes = await fetch(`http://127.0.0.1:${app.port}/api/v1/ops/slo`);
    const slo = await sloRes.json();
    assert.equal(sloRes.status, 200);
    assert.ok(slo.slo.status);

    const capacityRes = await fetch(`http://127.0.0.1:${app.port}/api/v1/ops/capacity-plan`);
    assert.equal(capacityRes.status, 200);

    const cacheRes = await fetch(`http://127.0.0.1:${app.port}/api/v1/ops/cache`);
    const cache = await cacheRes.json();
    assert.equal(cacheRes.status, 200);
    assert.equal(typeof cache.items, "number");

    const invalidateRes = await fetch(`http://127.0.0.1:${app.port}/api/v1/ops/cache/invalidate`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ prefix: "analytics:report:" })
    });
    assert.equal(invalidateRes.status, 200);
  } finally {
    await app.close();
  }
});
