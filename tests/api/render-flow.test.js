import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, stat } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

test("render job is enqueued before publish and completes full flow", async () => {
  const dir = await mkdtemp(path.join(os.tmpdir(), "you7li-render-flow-"));
  process.env.DATA_DIR = dir;
  process.env.STORAGE_DRIVER = "file";
  process.env.QUEUE_DRIVER = "file";

  const { createDraftPublish } = await import("../../apps/api/src/services/publishService.js");
  const { dequeue } = await import("../../apps/api/src/infra/queueClient.js");
  const { processRenderJob } = await import("../../services/worker/src/renderProcessor.js");
  const { processPublishJob } = await import("../../services/worker/src/publishProcessor.js");
  const { readPublishes } = await import("../../apps/api/src/infra/publishRepository.js");
  const { getHistory } = await import("../../apps/api/src/services/historyService.js");

  const draft = await createDraftPublish({
    topic: "YouTube shorts test",
    script: "test script"
  });

  const firstJob = await dequeue();
  assert.equal(firstJob.jobType, "render.generate");
  assert.equal(firstJob.channelId, "ch_default");

  const rendered = await processRenderJob(firstJob);
  assert.equal(rendered.renderStatus, "rendered");
  assert.ok(rendered.videoAssetUrl);

  const secondJob = await dequeue();
  assert.equal(secondJob.jobType, "publish.execute");
  assert.equal(secondJob.channelId, "ch_default");

  const published = await processPublishJob(secondJob);
  assert.equal(published.status, "published");

  const items = await readPublishes();
  assert.equal(items.length, 1);
  assert.equal(items[0].publishId, draft.publishId);
  assert.equal(items[0].channelId, "ch_default");
  assert.equal(items[0].complianceStatus, "pass");
  assert.equal(items[0].renderStatus, "rendered");
  assert.equal(items[0].status, "published");
  assert.ok(items[0].youtubeVideoId);
  assert.ok(items[0].youtubeSyncStatus);

  const history = await getHistory({ publishId: draft.publishId, limit: 20 });
  assert.ok(history.some((item) => item.eventType === "publish.created"));
  assert.ok(history.some((item) => item.eventType === "render.completed"));
  assert.ok(history.some((item) => item.eventType === "publish.completed"));
});

test("pipeline attaches generated media assets to render job payload", async () => {
  const dir = await mkdtemp(path.join(os.tmpdir(), "you7li-render-flow-"));
  process.env.DATA_DIR = dir;
  process.env.STORAGE_DRIVER = "file";
  process.env.QUEUE_DRIVER = "file";
  process.env.VOICE_PROVIDER = "mock";
  process.env.VISUAL_PROVIDER = "mock";
  process.env.PIPELINE_AUTOGEN_MEDIA = "true";

  const { runPipeline } = await import("../../apps/api/src/services/pipelineService.js");
  const { dequeue } = await import("../../apps/api/src/infra/queueClient.js");

  const result = await runPipeline("youtube shorts medyali pipeline testi");
  assert.ok(result.media.enabled);
  assert.ok(result.media.voice?.audioAssetPath);
  assert.ok(result.media.visual?.visualAssetPath);

  const firstJob = await dequeue();
  assert.equal(firstJob.jobType, "render.generate");
  assert.equal(firstJob.publishId, result.publish.publishId);
  assert.ok(firstJob.audioAssetPath);
  assert.ok(firstJob.visualAssetPath);

  await stat(firstJob.audioAssetPath);
  await stat(firstJob.visualAssetPath);
});

test("render quality gate routes invalid asset to review queue", async () => {
  const dir = await mkdtemp(path.join(os.tmpdir(), "you7li-render-flow-"));
  process.env.DATA_DIR = dir;
  process.env.STORAGE_DRIVER = "file";
  process.env.QUEUE_DRIVER = "file";
  process.env.MEDIA_QUALITY_MIN_BYTES = "9999999";

  const { createDraftPublish } = await import("../../apps/api/src/services/publishService.js");
  const { dequeue } = await import("../../apps/api/src/infra/queueClient.js");
  const { processRenderJob } = await import("../../services/worker/src/renderProcessor.js");
  const { getPublishById } = await import("../../apps/api/src/infra/publishRepository.js");
  const { getReviewQueue } = await import("../../apps/api/src/services/reviewService.js");

  const draft = await createDraftPublish({
    topic: "YouTube quality gate test",
    script: "test script"
  });

  const firstJob = await dequeue();
  assert.equal(firstJob.jobType, "render.generate");
  const result = await processRenderJob(firstJob);
  assert.equal(result.renderStatus, "failed_quality_gate");

  const nextJob = await dequeue();
  assert.equal(nextJob, null);

  const updated = await getPublishById(draft.publishId);
  assert.equal(updated.status, "review");
  assert.equal(updated.renderStatus, "failed_quality_gate");

  const queue = await getReviewQueue({ tenantId: "t_default", status: "pending" });
  assert.ok(queue.some((item) => item.publishId === draft.publishId));
});
