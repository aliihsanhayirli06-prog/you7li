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

test("review-required publish is queued and can be approved", async () => {
  process.env.DATA_DIR = await mkdtemp(path.join(os.tmpdir(), "you7li-review-"));
  process.env.STORAGE_DRIVER = "file";
  process.env.QUEUE_DRIVER = "file";
  process.env.AUTH_ENABLED = "false";

  const app = await startTestServer();
  try {
    const createRes = await fetch(`http://127.0.0.1:${app.port}/api/v1/publish/create`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        topic: "kripto yatirim",
        script: "Portfoy dagilimini anlatiyorum"
      })
    });
    const created = await createRes.json();
    assert.equal(createRes.status, 201);
    assert.equal(created.complianceStatus, "review");
    assert.equal(created.renderStatus, null);

    const queueRes = await fetch(`http://127.0.0.1:${app.port}/api/v1/review/queue?status=pending`);
    const queue = await queueRes.json();
    assert.equal(queueRes.status, 200);
    const reviewItem = queue.items.find((item) => item.publishId === created.publishId);
    assert.ok(reviewItem);

    const decisionRes = await fetch(`http://127.0.0.1:${app.port}/api/v1/review/decision`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        reviewId: reviewItem.reviewId,
        decision: "approve",
        note: "disclaimer sonradan eklendi"
      })
    });
    const decision = await decisionRes.json();
    assert.equal(decisionRes.status, 200);
    assert.equal(decision.decision, "approve");

    const listRes = await fetch(`http://127.0.0.1:${app.port}/api/v1/publish`);
    const list = await listRes.json();
    const updated = list.items.find((item) => item.publishId === created.publishId);
    assert.ok(updated);
    assert.equal(updated.complianceStatus, "pass");
    assert.equal(updated.status, "scheduled");
    assert.equal(updated.renderStatus, "queued");

    const historyRes = await fetch(
      `http://127.0.0.1:${app.port}/api/v1/history?publishId=${created.publishId}&limit=20`
    );
    const history = await historyRes.json();
    assert.equal(historyRes.status, 200);
    assert.ok(
      history.items.some(
        (item) => item.eventType === "job.enqueued" && item.jobType === "render.generate"
      )
    );
  } finally {
    await app.close();
  }
});
