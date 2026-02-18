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

test("marketplace plugins and partner onboarding application flow", async () => {
  process.env.STORAGE_DRIVER = "file";
  process.env.QUEUE_DRIVER = "file";
  process.env.AUTH_ENABLED = "false";
  process.env.DATA_DIR = await mkdtemp(path.join(os.tmpdir(), "you7li-marketplace-"));

  const app = await startTestServer();
  try {
    const pluginsRes = await fetch(`http://127.0.0.1:${app.port}/api/v1/marketplace/plugins`);
    const plugins = await pluginsRes.json();
    assert.equal(pluginsRes.status, 200);
    assert.ok(plugins.items.length >= 3);

    const targetPluginCode = plugins.items[0].pluginCode;
    const applyRes = await fetch(`http://127.0.0.1:${app.port}/api/v1/marketplace/partners/apply`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        companyName: "Partner Labs",
        contactEmail: "partner@example.com",
        useCase: "Distribution integration",
        targetPluginCode
      })
    });
    const applied = await applyRes.json();
    assert.equal(applyRes.status, 201);
    assert.equal(applied.status, "submitted");

    const listRes = await fetch(
      `http://127.0.0.1:${app.port}/api/v1/marketplace/partners/applications`
    );
    const list = await listRes.json();
    assert.equal(listRes.status, 200);
    assert.ok(list.items.some((item) => item.applicationId === applied.applicationId));
  } finally {
    await app.close();
  }
});
