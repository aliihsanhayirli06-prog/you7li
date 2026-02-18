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

test("asset library stores versioned entries per asset key", async () => {
  process.env.STORAGE_DRIVER = "file";
  process.env.QUEUE_DRIVER = "file";
  process.env.AUTH_ENABLED = "false";
  process.env.DATA_DIR = await mkdtemp(path.join(os.tmpdir(), "you7li-assets-"));

  const app = await startTestServer();
  try {
    const firstRes = await fetch(`http://127.0.0.1:${app.port}/api/v1/assets/library`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        assetKey: "brand_intro",
        name: "Brand Intro V1",
        type: "template",
        sourceUrl: "https://cdn.example.com/brand-intro-v1.mp4"
      })
    });
    const first = await firstRes.json();
    assert.equal(firstRes.status, 201);
    assert.equal(first.version, 1);

    const secondRes = await fetch(`http://127.0.0.1:${app.port}/api/v1/assets/library`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        assetKey: "brand_intro",
        name: "Brand Intro V2",
        type: "template",
        sourceUrl: "https://cdn.example.com/brand-intro-v2.mp4"
      })
    });
    const second = await secondRes.json();
    assert.equal(secondRes.status, 201);
    assert.equal(second.version, 2);

    const listRes = await fetch(
      `http://127.0.0.1:${app.port}/api/v1/assets/library?assetKey=brand_intro`
    );
    const list = await listRes.json();
    assert.equal(listRes.status, 200);
    assert.equal(list.items.length, 2);
    assert.equal(list.items[0].version, 2);
    assert.equal(list.items[1].version, 1);
  } finally {
    await app.close();
  }
});
