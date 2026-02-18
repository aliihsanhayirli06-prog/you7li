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

test("health endpoint returns service status", async () => {
  process.env.STORAGE_DRIVER = "file";
  process.env.QUEUE_DRIVER = "file";
  process.env.DATA_DIR = await mkdtemp(path.join(os.tmpdir(), "you7li-routes-"));

  const app = await startTestServer();

  try {
    const res = await fetch(`http://127.0.0.1:${app.port}/health`);
    const json = await res.json();

    assert.equal(res.status, 200);
    assert.equal(json.ok, true);
    assert.equal(json.storage, "file");
    assert.equal(json.queue, "file");
    assert.equal(typeof json.queueSize, "number");
    assert.equal(typeof json.dlqSize, "number");
  } finally {
    await app.close();
  }
});

test("pipeline endpoint creates publish and list endpoint returns it", async () => {
  process.env.STORAGE_DRIVER = "file";
  process.env.QUEUE_DRIVER = "file";
  process.env.DATA_DIR = await mkdtemp(path.join(os.tmpdir(), "you7li-routes-"));

  const app = await startTestServer();

  try {
    const runRes = await fetch(`http://127.0.0.1:${app.port}/api/v1/pipeline/run`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ topic: "YouTube shorts growth deneyi" })
    });

    const runJson = await runRes.json();
    assert.equal(runRes.status, 200);
    assert.ok(runJson.publish.publishId);

    const listRes = await fetch(`http://127.0.0.1:${app.port}/api/v1/publish`);
    const listJson = await listRes.json();

    assert.equal(listRes.status, 200);
    assert.ok(Array.isArray(listJson.items));
    assert.ok(listJson.items.length >= 1);
    assert.ok(listJson.items.some((item) => item.publishId === runJson.publish.publishId));

    const historyRes = await fetch(
      `http://127.0.0.1:${app.port}/api/v1/history?publishId=${runJson.publish.publishId}&limit=20`
    );
    const historyJson = await historyRes.json();
    assert.equal(historyRes.status, 200);
    assert.ok(Array.isArray(historyJson.items));
    assert.ok(historyJson.items.some((item) => item.eventType === "publish.created"));
  } finally {
    await app.close();
  }
});

test("auth me endpoint returns role context", async () => {
  process.env.STORAGE_DRIVER = "file";
  process.env.QUEUE_DRIVER = "file";
  process.env.AUTH_ENABLED = "false";
  process.env.DATA_DIR = await mkdtemp(path.join(os.tmpdir(), "you7li-routes-"));

  const app = await startTestServer();
  try {
    const res = await fetch(`http://127.0.0.1:${app.port}/api/v1/auth/me`);
    const json = await res.json();
    assert.equal(res.status, 200);
    assert.equal(json.role, "admin");
    assert.equal(json.tenantId, "t_default");
  } finally {
    await app.close();
  }
});

test("history stream emits realtime events", async () => {
  process.env.STORAGE_DRIVER = "file";
  process.env.QUEUE_DRIVER = "file";
  process.env.AUTH_ENABLED = "false";
  process.env.DATA_DIR = await mkdtemp(path.join(os.tmpdir(), "you7li-routes-"));

  const app = await startTestServer();
  const sseReq = http.request({
    hostname: "127.0.0.1",
    port: app.port,
    path: "/api/v1/history/stream",
    method: "GET",
    headers: {
      Accept: "text/event-stream"
    }
  });

  let readyResolve;
  let eventResolve;
  let eventReject;
  let readySeen = false;
  const readyPromise = new Promise((resolve) => {
    readyResolve = resolve;
  });
  const eventPromise = new Promise((resolve, reject) => {
    eventResolve = resolve;
    eventReject = reject;
  });

  const timeout = setTimeout(() => eventReject(new Error("SSE_EVENT_TIMEOUT")), 5000);

  try {
    sseReq.on("response", (res) => {
      assert.equal(res.statusCode, 200);
      res.setEncoding("utf8");
      let buffer = "";

      res.on("data", (chunk) => {
        buffer += chunk;
        if (!readySeen && buffer.includes("event: ready")) {
          readySeen = true;
          readyResolve();
        }
        if (buffer.includes("event: history")) {
          clearTimeout(timeout);
          eventResolve(buffer);
        }
      });
    });
    sseReq.end();

    await readyPromise;

    const createRes = await fetch(`http://127.0.0.1:${app.port}/api/v1/publish/create`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        topic: "stream test",
        script: "stream payload"
      })
    });
    assert.equal(createRes.status, 201);

    const streamBody = await eventPromise;
    assert.match(streamBody, /event: history/);
    assert.match(streamBody, /publish\.created/);
  } finally {
    clearTimeout(timeout);
    sseReq.destroy();
    await app.close();
  }
});

test("dashboard route serves html", async () => {
  process.env.STORAGE_DRIVER = "file";
  process.env.QUEUE_DRIVER = "file";
  process.env.DATA_DIR = await mkdtemp(path.join(os.tmpdir(), "you7li-routes-"));

  const app = await startTestServer();
  try {
    const res = await fetch(`http://127.0.0.1:${app.port}/app/dashboard`);
    const html = await res.text();
    assert.equal(res.status, 200);
    assert.match(html, /Pipeline Dashboard/);
  } finally {
    await app.close();
  }
});

test("additional dashboard routes serve shared shell html", async () => {
  process.env.STORAGE_DRIVER = "file";
  process.env.QUEUE_DRIVER = "file";
  process.env.DATA_DIR = await mkdtemp(path.join(os.tmpdir(), "you7li-routes-"));

  const app = await startTestServer();
  try {
    const routes = ["/app/ops", "/app/integrations", "/app/security"];
    for (const route of routes) {
      const res = await fetch(`http://127.0.0.1:${app.port}${route}`);
      const html = await res.text();
      assert.equal(res.status, 200);
      assert.match(html, /Pipeline Dashboard/);
    }
  } finally {
    await app.close();
  }
});

test("publish create returns 503 when queue backpressure hard limit is reached", async () => {
  process.env.STORAGE_DRIVER = "file";
  process.env.QUEUE_DRIVER = "file";
  process.env.AUTH_ENABLED = "false";
  process.env.DATA_DIR = await mkdtemp(path.join(os.tmpdir(), "you7li-routes-"));
  process.env.QUEUE_BACKPRESSURE_SOFT_LIMIT = "1";
  process.env.QUEUE_BACKPRESSURE_HARD_LIMIT = "1";
  process.env.QUEUE_BACKPRESSURE_DEFER_MS = "0";

  const { enqueue } = await import("../../apps/api/src/infra/queueClient.js");
  await enqueue({ jobType: "render.generate", publishId: "pub_queue_seed" });

  const app = await startTestServer();
  try {
    const res = await fetch(`http://127.0.0.1:${app.port}/api/v1/publish/create`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        topic: "queue pressure",
        script: "render enqueue denemesi"
      })
    });
    const json = await res.json();
    assert.equal(res.status, 503);
    assert.equal(json.error, "queue overloaded, try again later");
  } finally {
    await app.close();
  }
});

test("youtube stats endpoint requires access token", async () => {
  process.env.STORAGE_DRIVER = "file";
  process.env.QUEUE_DRIVER = "file";
  process.env.AUTH_ENABLED = "false";
  process.env.YOUTUBE_PUBLISH_MODE = "live";
  process.env.YOUTUBE_ACCESS_TOKEN = "";
  process.env.DATA_DIR = await mkdtemp(path.join(os.tmpdir(), "you7li-routes-"));

  const app = await startTestServer();
  try {
    const res = await fetch(`http://127.0.0.1:${app.port}/api/v1/youtube/stats?videoId=abc`);
    const json = await res.json();
    assert.equal(res.status, 400);
    assert.equal(json.error, "youtube access token required");
  } finally {
    await app.close();
    process.env.YOUTUBE_PUBLISH_MODE = "mock";
  }
});

test("youtube analytics sync endpoint ingests derived metrics", async () => {
  process.env.STORAGE_DRIVER = "file";
  process.env.QUEUE_DRIVER = "file";
  process.env.AUTH_ENABLED = "false";
  process.env.YOUTUBE_PUBLISH_MODE = "mock";
  process.env.DATA_DIR = await mkdtemp(path.join(os.tmpdir(), "you7li-routes-"));

  const { addChannel } = await import("../../apps/api/src/services/channelService.js");
  const { savePublish } = await import("../../apps/api/src/infra/publishRepository.js");
  const channelId = `ch_sync_${Date.now()}`;
  await addChannel({
    tenantId: "t_default",
    channelId,
    name: "Sync Test Channel",
    youtubeChannelId: null,
    defaultLanguage: "tr"
  });
  const publishId = `pub_sync_${Date.now()}`;
  await savePublish({
    publishId,
    channelId,
    topic: "sync test",
    title: "title",
    description: "desc",
    status: "published",
    youtubeVideoId: "mock_sync_id",
    youtubeSyncStatus: "mock_published",
    complianceStatus: "pass",
    complianceRiskScore: 0,
    complianceReport: { status: "pass", riskScore: 0, findings: [] },
    scheduledAt: new Date().toISOString()
  });

  const app = await startTestServer();
  try {
    const res = await fetch(`http://127.0.0.1:${app.port}/api/v1/youtube/analytics/sync`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ publishId })
    });
    const json = await res.json();
    assert.equal(res.status, 200);
    assert.equal(json.publishId, publishId);
    assert.ok(json.derivedMetrics.metricsCtr > 0);
  } finally {
    await app.close();
  }
});

test("ops metrics endpoint returns counters", async () => {
  process.env.STORAGE_DRIVER = "file";
  process.env.QUEUE_DRIVER = "file";
  process.env.AUTH_ENABLED = "false";
  process.env.DATA_DIR = await mkdtemp(path.join(os.tmpdir(), "you7li-routes-"));

  const app = await startTestServer();
  try {
    const res = await fetch(`http://127.0.0.1:${app.port}/api/v1/ops/metrics`);
    const json = await res.json();
    assert.equal(res.status, 200);
    assert.equal(typeof json.counters.httpRequestsTotal, "number");
    assert.equal(typeof json.timings.httpDurationAvgMs, "number");
  } finally {
    await app.close();
  }
});

test("performance predict endpoint returns forecast payload", async () => {
  process.env.STORAGE_DRIVER = "file";
  process.env.QUEUE_DRIVER = "file";
  process.env.AUTH_ENABLED = "false";
  process.env.DATA_DIR = await mkdtemp(path.join(os.tmpdir(), "you7li-routes-"));

  const app = await startTestServer();
  try {
    const res = await fetch(`http://127.0.0.1:${app.port}/api/v1/performance/predict`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        topic: "Shorts retention optimization",
        script: "Hook acik ve net. Sonra 3 adim.",
        opportunityScore: 0.73,
        format: "reels"
      })
    });
    const json = await res.json();
    assert.equal(res.status, 200);
    assert.equal(json.input.format, "reels");
    assert.equal(typeof json.forecast.metricsCtr, "number");
    assert.equal(typeof json.confidence, "number");
  } finally {
    await app.close();
  }
});

test("openapi endpoint serves yaml", async () => {
  process.env.STORAGE_DRIVER = "file";
  process.env.QUEUE_DRIVER = "file";
  process.env.AUTH_ENABLED = "false";
  process.env.DATA_DIR = await mkdtemp(path.join(os.tmpdir(), "you7li-routes-"));

  const app = await startTestServer();
  try {
    const res = await fetch(`http://127.0.0.1:${app.port}/api/v1/openapi`);
    const text = await res.text();
    assert.equal(res.status, 200);
    assert.match(text, /openapi: 3.0.3/);
  } finally {
    await app.close();
  }
});

test("status page route serves html", async () => {
  process.env.STORAGE_DRIVER = "file";
  process.env.QUEUE_DRIVER = "file";
  process.env.AUTH_ENABLED = "false";
  process.env.DATA_DIR = await mkdtemp(path.join(os.tmpdir(), "you7li-routes-"));

  const app = await startTestServer();
  try {
    const res = await fetch(`http://127.0.0.1:${app.port}/status`);
    const html = await res.text();
    assert.equal(res.status, 200);
    assert.match(html, /you7li status/i);
  } finally {
    await app.close();
  }
});

test("ops status/runbook/postmortem endpoints return expected payloads", async () => {
  process.env.STORAGE_DRIVER = "file";
  process.env.QUEUE_DRIVER = "file";
  process.env.AUTH_ENABLED = "false";
  process.env.DEPLOY_MARKER = "test-build-1";
  process.env.DEPLOYED_AT = "2026-02-18T00:00:00.000Z";
  process.env.DATA_DIR = await mkdtemp(path.join(os.tmpdir(), "you7li-routes-"));

  const app = await startTestServer();
  try {
    const statusRes = await fetch(`http://127.0.0.1:${app.port}/api/v1/ops/status`);
    const statusJson = await statusRes.json();
    assert.equal(statusRes.status, 200);
    assert.equal(statusJson.deployMarker, "test-build-1");
    assert.equal(typeof statusJson.queueSize, "number");

    const runbookRes = await fetch(`http://127.0.0.1:${app.port}/api/v1/ops/runbook`);
    const runbookJson = await runbookRes.json();
    assert.equal(runbookRes.status, 200);
    assert.match(runbookJson.markdown, /Incident Runbook/);

    const exportRes = await fetch(`http://127.0.0.1:${app.port}/api/v1/ops/postmortem/export`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        incidentId: "inc_001",
        summary: "queue saturation",
        impact: "publish delays",
        timeline: ["10:00 detect", "10:10 mitigate"],
        actions: ["add queue guardrails"]
      })
    });
    const exportJson = await exportRes.json();
    assert.equal(exportRes.status, 200);
    assert.match(exportJson.markdown, /Postmortem - inc_001/);
    assert.match(exportJson.markdown, /queue saturation/);
  } finally {
    await app.close();
  }
});

test("channels endpoint supports create/list and pipeline uses selected channel", async () => {
  process.env.STORAGE_DRIVER = "file";
  process.env.QUEUE_DRIVER = "file";
  process.env.AUTH_ENABLED = "false";
  process.env.DATA_DIR = await mkdtemp(path.join(os.tmpdir(), "you7li-routes-"));

  const app = await startTestServer();
  try {
    const channelId = `ch_news_${Date.now()}`;
    const createRes = await fetch(`http://127.0.0.1:${app.port}/api/v1/channels`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        channelId,
        name: "News Channel",
        youtubeChannelId: "UC-NEWS"
      })
    });
    const created = await createRes.json();
    assert.equal(createRes.status, 201);
    assert.equal(created.channelId, channelId);

    const listRes = await fetch(`http://127.0.0.1:${app.port}/api/v1/channels`);
    const list = await listRes.json();
    assert.equal(listRes.status, 200);
    assert.ok(list.items.some((item) => item.channelId === "ch_default"));
    assert.ok(list.items.some((item) => item.channelId === channelId));

    const runRes = await fetch(`http://127.0.0.1:${app.port}/api/v1/pipeline/run`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ topic: "channel test", channelId })
    });
    const run = await runRes.json();
    assert.equal(runRes.status, 200);
    assert.equal(run.publish.channelId, channelId);
  } finally {
    await app.close();
  }
});
