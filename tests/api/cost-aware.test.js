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

test("cost-aware optimization recommends preset based on budget", async () => {
  process.env.STORAGE_DRIVER = "file";
  process.env.QUEUE_DRIVER = "file";
  process.env.AUTH_ENABLED = "false";
  process.env.DATA_DIR = await mkdtemp(path.join(os.tmpdir(), "you7li-cost-aware-"));

  const app = await startTestServer();
  try {
    const lowRes = await fetch(`http://127.0.0.1:${app.port}/api/v1/optimize/cost-aware`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        topic: "YouTube growth loop",
        script: "Hook then value then CTA",
        format: "shorts",
        budgetTier: "low",
        opportunityScore: 0.8
      })
    });
    const low = await lowRes.json();
    assert.equal(lowRes.status, 200);
    assert.ok(["fast", "balanced", "quality"].includes(low.recommendation.preset));
    assert.equal(low.input.budgetTier, "low");

    const highRes = await fetch(`http://127.0.0.1:${app.port}/api/v1/optimize/cost-aware`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        topic: "YouTube growth loop",
        script: "Hook then value then CTA",
        format: "shorts",
        budgetTier: "high",
        opportunityScore: 0.8
      })
    });
    const high = await highRes.json();
    assert.equal(highRes.status, 200);
    assert.equal(high.input.budgetTier, "high");
    assert.ok(high.alternatives.length === 3);
  } finally {
    await app.close();
  }
});
