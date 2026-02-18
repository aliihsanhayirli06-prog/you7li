import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

test("requeueWithRetry retries then moves to dlq", async () => {
  process.env.DATA_DIR = await mkdtemp(path.join(os.tmpdir(), "you7li-retry-"));
  process.env.STORAGE_DRIVER = "file";
  process.env.QUEUE_DRIVER = "file";
  process.env.JOB_MAX_ATTEMPTS = "2";

  const { enqueue, dequeue, requeueWithRetry, listDlq } =
    await import("../../apps/api/src/infra/queueClient.js");

  await enqueue({ jobType: "optimize.generate", publishId: "pub1" });
  const job = await dequeue();
  assert.ok(job);
  assert.equal(job.attempt, 0);

  const first = await requeueWithRetry(job, "boom-1");
  assert.equal(first.action, "retried");
  assert.equal(first.attempt, 1);

  const retryJob = await dequeue();
  assert.ok(retryJob);
  assert.equal(retryJob.attempt, 1);

  const second = await requeueWithRetry(retryJob, "boom-2");
  assert.equal(second.action, "dlq");
  assert.equal(second.attempt, 2);

  const dlq = await listDlq(10);
  assert.equal(dlq.length, 1);
  assert.equal(dlq[0].publishId, "pub1");
  assert.equal(dlq[0].error, "boom-2");
});

test("idempotency store tracks processed jobs", async () => {
  process.env.DATA_DIR = await mkdtemp(path.join(os.tmpdir(), "you7li-idempotency-"));

  const { buildJobKey, isProcessed, markProcessed } =
    await import("../../services/worker/src/idempotencyStore.js");

  const key = buildJobKey({ jobId: "job-123", jobType: "publish.execute", publishId: "pub-1" });
  assert.equal(await isProcessed(key), false);

  await markProcessed(key);
  assert.equal(await isProcessed(key), true);
});

test("enqueue rejects new jobs when queue backpressure hard limit is reached", async () => {
  process.env.DATA_DIR = await mkdtemp(path.join(os.tmpdir(), "you7li-backpressure-"));
  process.env.STORAGE_DRIVER = "file";
  process.env.QUEUE_DRIVER = "file";
  process.env.QUEUE_BACKPRESSURE_SOFT_LIMIT = "1";
  process.env.QUEUE_BACKPRESSURE_HARD_LIMIT = "1";
  process.env.QUEUE_BACKPRESSURE_DEFER_MS = "0";

  const { enqueue } = await import("../../apps/api/src/infra/queueClient.js");

  await enqueue({ jobType: "render.generate", publishId: "pub_bp_1" });
  await assert.rejects(
    async () => enqueue({ jobType: "render.generate", publishId: "pub_bp_2" }),
    /QUEUE_BACKPRESSURE_REJECTED/
  );
});
