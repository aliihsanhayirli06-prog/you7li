import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

async function withTempDataDir(run) {
  const dir = await mkdtemp(path.join(os.tmpdir(), "you7li-worker-"));
  process.env.DATA_DIR = dir;
  process.env.STORAGE_DRIVER = "file";
  process.env.QUEUE_DRIVER = "file";
  await run(dir);
}

test("worker processor updates publish status to published", async () => {
  await withTempDataDir(async () => {
    const { savePublish, readPublishes } =
      await import("../../apps/api/src/infra/publishRepository.js");
    const { enqueue, dequeue } = await import("../../apps/api/src/infra/queueClient.js");
    const { processPublishJob } = await import("../../services/worker/src/publishProcessor.js");

    const publishId = `pub_test_${Date.now()}`;

    await savePublish({
      publishId,
      topic: "test",
      title: "title",
      description: "desc",
      status: "scheduled",
      complianceStatus: "pass",
      complianceRiskScore: 0,
      complianceReport: { status: "pass", riskScore: 0, findings: [] },
      scheduledAt: new Date().toISOString(),
      publishedAt: null
    });

    await enqueue({
      jobType: "publish.execute",
      publishId,
      topic: "test",
      scheduledAt: new Date().toISOString()
    });

    const job = await dequeue();
    assert.ok(job);

    const result = await processPublishJob(job);
    assert.equal(result.status, "published");
    assert.ok(result.publishedAt);

    const items = await readPublishes();
    assert.equal(items[0].status, "published");
  });
});
