import test from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import { mkdtemp } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { handleApi } from "../../apps/api/src/routes/api.js";
import { dequeue } from "../../apps/api/src/infra/queueClient.js";
import { processRenderJob } from "../../services/worker/src/renderProcessor.js";
import { processPublishJob } from "../../services/worker/src/publishProcessor.js";

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

test("e2e regression: dashboard shell + pipeline + review + render flow", async () => {
  process.env.STORAGE_DRIVER = "file";
  process.env.QUEUE_DRIVER = "file";
  process.env.AUTH_ENABLED = "false";
  process.env.DATA_DIR = await mkdtemp(path.join(os.tmpdir(), "you7li-e2e-"));
  process.env.VIDEO_RENDER_MODE = "mock";
  process.env.YOUTUBE_PUBLISH_MODE = "mock";

  const app = await startTestServer();
  try {
    for (const route of ["/app/dashboard", "/app/ops", "/app/integrations", "/app/security"]) {
      const res = await fetch(`http://127.0.0.1:${app.port}${route}`);
      const html = await res.text();
      assert.equal(res.status, 200);
      assert.match(html, /<!doctype html>/i);
    }

    const pipelineRes = await fetch(`http://127.0.0.1:${app.port}/api/v1/pipeline/run`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ topic: "e2e pipeline smoke" })
    });
    const pipeline = await pipelineRes.json();
    assert.equal(pipelineRes.status, 200);
    assert.ok(pipeline.publish?.publishId);

    const pipelineRenderJob = await dequeue();
    assert.equal(pipelineRenderJob?.jobType, "render.generate");
    assert.equal(pipelineRenderJob?.publishId, pipeline.publish.publishId);
    await processRenderJob(pipelineRenderJob);

    const pipelinePublishJob = await dequeue();
    assert.equal(pipelinePublishJob?.jobType, "publish.execute");
    assert.equal(pipelinePublishJob?.publishId, pipeline.publish.publishId);
    await processPublishJob(pipelinePublishJob);

    const reviewCandidateRes = await fetch(`http://127.0.0.1:${app.port}/api/v1/publish/create`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        topic: "kripto yatirim",
        script: "agresif kaldirac onerisi"
      })
    });
    const reviewCandidate = await reviewCandidateRes.json();
    assert.equal(reviewCandidateRes.status, 201);
    assert.equal(reviewCandidate.complianceStatus, "review");

    const queueRes = await fetch(`http://127.0.0.1:${app.port}/api/v1/review/queue?status=pending`);
    const queue = await queueRes.json();
    assert.equal(queueRes.status, 200);
    const reviewItem = queue.items.find((item) => item.publishId === reviewCandidate.publishId);
    assert.ok(reviewItem);

    const approveRes = await fetch(`http://127.0.0.1:${app.port}/api/v1/review/decision`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        reviewId: reviewItem.reviewId,
        decision: "approve",
        note: "manual kontrol tamamlandi"
      })
    });
    const approve = await approveRes.json();
    assert.equal(approveRes.status, 200);
    assert.equal(approve.decision, "approve");

    const reviewRenderJob = await dequeue();
    assert.equal(reviewRenderJob?.jobType, "render.generate");
    assert.equal(reviewRenderJob?.publishId, reviewCandidate.publishId);
    await processRenderJob(reviewRenderJob);

    const reviewPublishJob = await dequeue();
    assert.equal(reviewPublishJob?.jobType, "publish.execute");
    assert.equal(reviewPublishJob?.publishId, reviewCandidate.publishId);
    await processPublishJob(reviewPublishJob);

    const listRes = await fetch(`http://127.0.0.1:${app.port}/api/v1/publish`);
    const list = await listRes.json();
    assert.equal(listRes.status, 200);
    const reviewed = list.items.find((item) => item.publishId === reviewCandidate.publishId);
    assert.ok(reviewed);
    assert.equal(reviewed.complianceStatus, "pass");
    assert.equal(reviewed.renderStatus, "rendered");
    assert.equal(reviewed.status, "published");
  } finally {
    await app.close();
  }
});
