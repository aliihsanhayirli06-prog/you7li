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

test("protected endpoint requires token when auth enabled", async () => {
  process.env.AUTH_ENABLED = "true";
  process.env.ADMIN_API_TOKEN = "admin-token";
  process.env.EDITOR_API_TOKEN = "editor-token";
  process.env.DATA_DIR = await mkdtemp(path.join(os.tmpdir(), "you7li-auth-"));
  process.env.STORAGE_DRIVER = "file";
  process.env.QUEUE_DRIVER = "file";

  const app = await startTestServer();
  try {
    const res = await fetch(`http://127.0.0.1:${app.port}/api/v1/publish`, {
      method: "GET"
    });
    assert.equal(res.status, 401);
  } finally {
    await app.close();
    process.env.AUTH_ENABLED = "false";
  }
});

test("editor can create publish but cannot run admin optimize endpoint", async () => {
  process.env.AUTH_ENABLED = "true";
  process.env.ADMIN_API_TOKEN = "admin-token";
  process.env.EDITOR_API_TOKEN = "editor-token";
  process.env.DATA_DIR = await mkdtemp(path.join(os.tmpdir(), "you7li-auth-"));
  process.env.STORAGE_DRIVER = "file";
  process.env.QUEUE_DRIVER = "file";

  const app = await startTestServer();
  try {
    const createRes = await fetch(`http://127.0.0.1:${app.port}/api/v1/publish/create`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: "Bearer editor-token"
      },
      body: JSON.stringify({ topic: "YouTube test", script: "test script" })
    });

    const created = await createRes.json();
    assert.equal(createRes.status, 201);

    const optimizeRes = await fetch(`http://127.0.0.1:${app.port}/api/v1/optimize/run`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: "Bearer editor-token"
      },
      body: JSON.stringify({ publishId: created.publishId })
    });
    assert.equal(optimizeRes.status, 403);
  } finally {
    await app.close();
    process.env.AUTH_ENABLED = "false";
  }
});

test("auth me returns editor context with editor token", async () => {
  process.env.AUTH_ENABLED = "true";
  process.env.ADMIN_API_TOKEN = "admin-token";
  process.env.EDITOR_API_TOKEN = "editor-token";
  process.env.DATA_DIR = await mkdtemp(path.join(os.tmpdir(), "you7li-auth-"));
  process.env.STORAGE_DRIVER = "file";
  process.env.QUEUE_DRIVER = "file";

  const app = await startTestServer();
  try {
    const res = await fetch(`http://127.0.0.1:${app.port}/api/v1/auth/me`, {
      headers: {
        Authorization: "Bearer editor-token"
      }
    });
    const json = await res.json();
    assert.equal(res.status, 200);
    assert.equal(json.role, "editor");
  } finally {
    await app.close();
    process.env.AUTH_ENABLED = "false";
  }
});
