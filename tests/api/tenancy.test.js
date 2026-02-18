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

test("tenant isolation keeps publish and billing data separated", async () => {
  process.env.STORAGE_DRIVER = "file";
  process.env.QUEUE_DRIVER = "file";
  process.env.AUTH_ENABLED = "false";
  process.env.DATA_DIR = await mkdtemp(path.join(os.tmpdir(), "you7li-tenant-"));

  const app = await startTestServer();
  try {
    const alphaTenantId = `t_alpha_${Date.now()}`;
    const betaTenantId = `t_beta_${Date.now()}`;

    const createAlpha = await fetch(`http://127.0.0.1:${app.port}/api/v1/tenants`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ tenantId: alphaTenantId, name: "Alpha", planCode: "free" })
    });
    assert.equal(createAlpha.status, 201);

    const createBeta = await fetch(`http://127.0.0.1:${app.port}/api/v1/tenants`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ tenantId: betaTenantId, name: "Beta", planCode: "free" })
    });
    assert.equal(createBeta.status, 201);

    const runAlpha = await fetch(`http://127.0.0.1:${app.port}/api/v1/pipeline/run`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-tenant-id": alphaTenantId
      },
      body: JSON.stringify({ topic: "alpha isolation" })
    });
    const alphaPayload = await runAlpha.json();
    assert.equal(runAlpha.status, 200);

    const listBeta = await fetch(`http://127.0.0.1:${app.port}/api/v1/publish`, {
      headers: { "x-tenant-id": betaTenantId }
    });
    const betaPublishes = await listBeta.json();
    assert.equal(listBeta.status, 200);
    assert.ok(
      !betaPublishes.items.some((item) => item.publishId === alphaPayload.publish.publishId)
    );

    const alphaUsageRes = await fetch(`http://127.0.0.1:${app.port}/api/v1/billing/usage?days=30`, {
      headers: { "x-tenant-id": alphaTenantId }
    });
    const alphaUsage = await alphaUsageRes.json();
    assert.equal(alphaUsageRes.status, 200);
    assert.equal(alphaUsage.tenantId, alphaTenantId);
    assert.ok(alphaUsage.summary.eventCount >= 1);

    const betaUsageRes = await fetch(`http://127.0.0.1:${app.port}/api/v1/billing/usage?days=30`, {
      headers: { "x-tenant-id": betaTenantId }
    });
    const betaUsage = await betaUsageRes.json();
    assert.equal(betaUsageRes.status, 200);
    assert.equal(betaUsage.summary.eventCount, 0);

    const alphaInvoiceRes = await fetch(`http://127.0.0.1:${app.port}/api/v1/billing/invoice`, {
      headers: { "x-tenant-id": alphaTenantId }
    });
    const alphaInvoice = await alphaInvoiceRes.json();
    assert.equal(alphaInvoiceRes.status, 200);
    assert.equal(alphaInvoice.tenantId, alphaTenantId);
    assert.ok(alphaInvoice.totals.totalAmountUsd > 0);
  } finally {
    await app.close();
  }
});

test("free plan quota blocks requests when monthly unit limit is exceeded", async () => {
  process.env.STORAGE_DRIVER = "file";
  process.env.QUEUE_DRIVER = "file";
  process.env.AUTH_ENABLED = "false";
  process.env.DATA_DIR = await mkdtemp(path.join(os.tmpdir(), "you7li-tenant-"));

  const app = await startTestServer();
  try {
    const quotaTenantId = `t_quota_${Date.now()}`;
    const tenantRes = await fetch(`http://127.0.0.1:${app.port}/api/v1/tenants`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        tenantId: quotaTenantId,
        name: "Quota Tenant",
        planCode: "free",
        settings: { monthlyUnitsOverride: 1 }
      })
    });
    assert.equal(tenantRes.status, 201);

    const first = await fetch(`http://127.0.0.1:${app.port}/api/v1/pipeline/run`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-tenant-id": quotaTenantId
      },
      body: JSON.stringify({ topic: "quota first" })
    });
    assert.equal(first.status, 200);

    const second = await fetch(`http://127.0.0.1:${app.port}/api/v1/pipeline/run`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-tenant-id": quotaTenantId
      },
      body: JSON.stringify({ topic: "quota second" })
    });
    const secondBody = await second.json();
    assert.equal(second.status, 402);
    assert.equal(secondBody.error, "quota exceeded");
  } finally {
    await app.close();
  }
});

test("self-serve onboarding creates tenant and initial channel", async () => {
  process.env.STORAGE_DRIVER = "file";
  process.env.QUEUE_DRIVER = "file";
  process.env.AUTH_ENABLED = "false";
  process.env.DATA_DIR = await mkdtemp(path.join(os.tmpdir(), "you7li-tenant-"));

  const app = await startTestServer();
  try {
    const onboardRes = await fetch(`http://127.0.0.1:${app.port}/api/v1/onboarding/self-serve`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        tenantName: "Onboard Team",
        ownerEmail: "owner@example.com",
        channelName: "Growth Channel",
        planCode: "free"
      })
    });
    const onboard = await onboardRes.json();
    assert.equal(onboardRes.status, 201);
    assert.equal(onboard.tenant.name, "Onboard Team");
    assert.equal(onboard.channel.name, "Growth Channel");
    assert.ok(onboard.wizard.completed.includes("tenant_created"));

    const tenantId = onboard.tenant.tenantId;
    const channelListRes = await fetch(`http://127.0.0.1:${app.port}/api/v1/channels`, {
      headers: { "x-tenant-id": tenantId }
    });
    const channels = await channelListRes.json();
    assert.equal(channelListRes.status, 200);
    assert.ok(channels.items.some((item) => item.channelId === onboard.channel.channelId));
  } finally {
    await app.close();
  }
});

test("billing activation switches tenant between trial and freemium modes", async () => {
  process.env.STORAGE_DRIVER = "file";
  process.env.QUEUE_DRIVER = "file";
  process.env.AUTH_ENABLED = "false";
  process.env.DATA_DIR = await mkdtemp(path.join(os.tmpdir(), "you7li-tenant-"));

  const app = await startTestServer();
  try {
    const tenantId = `t_billing_${Date.now()}`;
    const tenantRes = await fetch(`http://127.0.0.1:${app.port}/api/v1/tenants`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        tenantId,
        name: "Billing Activation",
        planCode: "free",
        settings: { monthlyUnitsOverride: 1 }
      })
    });
    assert.equal(tenantRes.status, 201);

    const activateTrial = await fetch(`http://127.0.0.1:${app.port}/api/v1/billing/activation`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        tenantId,
        mode: "trial",
        durationDays: 7,
        monthlyUnitsOverride: 3,
        ratePerMinuteOverride: 50
      })
    });
    const trialBody = await activateTrial.json();
    assert.equal(activateTrial.status, 200);
    assert.equal(trialBody.tenant.settings.billingMode, "trial");
    assert.equal(trialBody.tenant.settings.trialActive, true);

    const trialFirst = await fetch(`http://127.0.0.1:${app.port}/api/v1/pipeline/run`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-tenant-id": tenantId
      },
      body: JSON.stringify({ topic: "trial first" })
    });
    assert.equal(trialFirst.status, 200);

    const trialSecond = await fetch(`http://127.0.0.1:${app.port}/api/v1/pipeline/run`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-tenant-id": tenantId
      },
      body: JSON.stringify({ topic: "trial second" })
    });
    assert.equal(trialSecond.status, 200);

    const activateFreemium = await fetch(
      `http://127.0.0.1:${app.port}/api/v1/billing/activation`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          tenantId,
          mode: "freemium",
          monthlyUnitsOverride: 1
        })
      }
    );
    const freemiumBody = await activateFreemium.json();
    assert.equal(activateFreemium.status, 200);
    assert.equal(freemiumBody.tenant.planCode, "free");
    assert.equal(freemiumBody.tenant.settings.billingMode, "freemium");
    assert.equal(freemiumBody.tenant.settings.trialActive, false);

    const freemiumBlocked = await fetch(`http://127.0.0.1:${app.port}/api/v1/pipeline/run`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-tenant-id": tenantId
      },
      body: JSON.stringify({ topic: "freemium blocked" })
    });
    const blockedBody = await freemiumBlocked.json();
    assert.equal(freemiumBlocked.status, 402);
    assert.equal(blockedBody.error, "quota exceeded");
  } finally {
    await app.close();
  }
});
