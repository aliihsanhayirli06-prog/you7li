import { enqueue } from "../../../apps/api/src/infra/queueClient.js";
import { updatePublishRender } from "../../../apps/api/src/infra/publishRepository.js";
import { logHistory } from "../../../apps/api/src/services/historyService.js";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function buildAssetUrl(publishId) {
  return `https://cdn.you7li.local/assets/${publishId}.mp4`;
}

function buildAssetPath(publishId) {
  const dir = process.env.VIDEO_ASSET_DIR || path.join(process.env.DATA_DIR || "data", "assets");
  return path.join(dir, `${publishId}.mp4`);
}

async function ensureMockAsset(filePath) {
  await mkdir(path.dirname(filePath), { recursive: true });
  // Placeholder bytes to keep local development flow deterministic.
  await writeFile(filePath, Buffer.from("you7li-mock-video-asset"));
}

export async function processRenderJob(job) {
  if (!job?.publishId) {
    throw new Error("INVALID_JOB");
  }

  await updatePublishRender({
    publishId: job.publishId,
    renderStatus: "rendering"
  });
  await logHistory("render.started", {
    publishId: job.publishId,
    channelId: job.channelId || null,
    topic: job.topic,
    renderStatus: "rendering"
  });

  await sleep(150);

  const renderedAt = new Date().toISOString();
  const videoAssetUrl = buildAssetUrl(job.publishId);
  const videoAssetPath = buildAssetPath(job.publishId);
  await ensureMockAsset(videoAssetPath);

  const updated = await updatePublishRender({
    publishId: job.publishId,
    renderStatus: "rendered",
    renderedAt,
    videoAssetUrl,
    videoAssetPath
  });
  await logHistory("render.completed", {
    publishId: job.publishId,
    channelId: job.channelId || null,
    topic: job.topic,
    renderStatus: "rendered",
    videoAssetUrl,
    videoAssetPath
  });

  await enqueue({
    jobType: "publish.execute",
    publishId: job.publishId,
    channelId: job.channelId || null,
    topic: job.topic,
    scheduledAt: job.scheduledAt,
    videoAssetUrl,
    videoAssetPath
  });
  await logHistory("job.enqueued", {
    publishId: job.publishId,
    channelId: job.channelId || null,
    topic: job.topic,
    jobType: "publish.execute"
  });

  return updated;
}
