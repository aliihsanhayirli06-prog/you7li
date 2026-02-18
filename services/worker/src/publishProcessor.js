import {
  getPublishById,
  updatePublishStatus,
  updatePublishYouTube
} from "../../../apps/api/src/infra/publishRepository.js";
import { logHistory } from "../../../apps/api/src/services/historyService.js";
import { publishVideoToYouTube } from "../../../apps/api/src/services/youtubeIntegrationService.js";

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function processPublishJob(job) {
  if (!job?.publishId) {
    throw new Error("INVALID_JOB");
  }

  const publish = await getPublishById(job.publishId);
  if (!publish) {
    throw new Error("PUBLISH_NOT_FOUND");
  }

  if (publish.complianceStatus !== "pass") {
    await updatePublishStatus({
      publishId: job.publishId,
      status: "blocked"
    });
    await logHistory("publish.gate_blocked", {
      publishId: job.publishId,
      topic: job.topic,
      complianceStatus: publish.complianceStatus,
      complianceRiskScore: publish.complianceRiskScore
    });
    return publish;
  }

  await updatePublishStatus({
    publishId: job.publishId,
    status: "processing"
  });
  await logHistory("publish.started", {
    publishId: job.publishId,
    topic: job.topic,
    status: "processing"
  });

  await sleep(150);

  const youtube = await publishVideoToYouTube({
    publishId: publish.publishId,
    topic: publish.topic,
    title: publish.title,
    description: publish.description,
    videoAssetPath: publish.videoAssetPath || job.videoAssetPath
  });

  await updatePublishYouTube({
    publishId: publish.publishId,
    youtubeVideoId: youtube.videoId,
    youtubePublishedAt: youtube.youtubePublishedAt,
    youtubeSyncStatus: youtube.youtubeSyncStatus
  });

  const publishedAt = new Date().toISOString();
  const updated = await updatePublishStatus({
    publishId: job.publishId,
    status: "published",
    publishedAt
  });

  await logHistory("youtube.publish.completed", {
    publishId: job.publishId,
    topic: job.topic,
    youtubeVideoId: youtube.videoId,
    youtubeSyncStatus: youtube.youtubeSyncStatus
  });

  await logHistory("publish.completed", {
    publishId: job.publishId,
    topic: job.topic,
    status: "published",
    publishedAt
  });

  return updated;
}
