import {
  getPublishById,
  updatePublishAnalytics,
  updatePublishOptimization
} from "../infra/publishRepository.js";
import { enqueue } from "../infra/queueClient.js";
import { logHistory } from "./historyService.js";
import { evaluatePerformance } from "./optimizationService.js";
import { fetchYouTubeVideoStats } from "./youtubeIntegrationService.js";
import { getCache, invalidateCache, setCache } from "../infra/cacheStore.js";

export async function ingestAnalytics({
  publishId,
  metricsCtr,
  metricsRetention3s,
  metricsAvgWatchDurationSec,
  metricsCompletionRate
}) {
  if (!publishId) {
    throw new Error("PUBLISH_ID_REQUIRED");
  }

  const publish = await getPublishById(publishId);
  if (!publish) {
    throw new Error("PUBLISH_NOT_FOUND");
  }

  const analyzedAt = new Date().toISOString();
  const updated = await updatePublishAnalytics({
    publishId,
    metricsCtr: Number(metricsCtr),
    metricsRetention3s: Number(metricsRetention3s),
    metricsAvgWatchDurationSec: Number(metricsAvgWatchDurationSec),
    metricsCompletionRate: Number(metricsCompletionRate),
    lastAnalyzedAt: analyzedAt
  });

  await logHistory("analytics.ingested", {
    publishId,
    topic: publish.topic,
    metricsCtr: updated.metricsCtr,
    metricsRetention3s: updated.metricsRetention3s,
    metricsCompletionRate: updated.metricsCompletionRate
  });

  const evaluation = evaluatePerformance(updated);
  invalidateCache(`analytics:report:${publishId}`);

  if (evaluation.needsOptimization) {
    await updatePublishOptimization({
      publishId,
      optimizationStatus: "queued",
      optimizationVariants: null,
      optimizationUpdatedAt: analyzedAt
    });

    await enqueue({
      jobType: "optimize.generate",
      publishId,
      topic: publish.topic,
      flags: evaluation.flags
    });

    await logHistory("job.enqueued", {
      publishId,
      topic: publish.topic,
      jobType: "optimize.generate",
      flags: evaluation.flags
    });
  }

  return {
    publishId,
    evaluation,
    metrics: {
      metricsCtr: updated.metricsCtr,
      metricsRetention3s: updated.metricsRetention3s,
      metricsAvgWatchDurationSec: updated.metricsAvgWatchDurationSec,
      metricsCompletionRate: updated.metricsCompletionRate,
      lastAnalyzedAt: updated.lastAnalyzedAt
    }
  };
}

function deriveMetricsFromYouTubeStats(stats) {
  const views = Math.max(1, Number(stats.viewCount || 0));
  const likes = Number(stats.likeCount || 0);
  const comments = Number(stats.commentCount || 0);

  const engagementRate = Math.min(1, (likes + comments * 2) / views);
  const metricsCtr = Number(Math.min(0.2, 0.01 + engagementRate * 0.35).toFixed(4));
  const metricsRetention3s = Number(Math.min(0.95, 0.45 + engagementRate * 0.6).toFixed(4));
  const metricsCompletionRate = Number(Math.min(0.95, 0.35 + engagementRate * 0.7).toFixed(4));
  const metricsAvgWatchDurationSec = Number((12 + engagementRate * 45).toFixed(2));

  return {
    metricsCtr,
    metricsRetention3s,
    metricsAvgWatchDurationSec,
    metricsCompletionRate
  };
}

export async function syncAnalyticsFromYouTube(publishId) {
  if (!publishId) {
    throw new Error("PUBLISH_ID_REQUIRED");
  }

  const publish = await getPublishById(publishId);
  if (!publish) {
    throw new Error("PUBLISH_NOT_FOUND");
  }

  if (!publish.youtubeVideoId) {
    throw new Error("YOUTUBE_VIDEO_ID_REQUIRED");
  }

  const stats = await fetchYouTubeVideoStats(publish.youtubeVideoId);
  const derived = deriveMetricsFromYouTubeStats(stats);

  const ingested = await ingestAnalytics({
    publishId,
    ...derived
  });

  await logHistory("analytics.youtube_synced", {
    publishId,
    topic: publish.topic,
    youtubeVideoId: publish.youtubeVideoId,
    viewCount: stats.viewCount,
    likeCount: stats.likeCount
  });

  return {
    publishId,
    youtubeVideoId: publish.youtubeVideoId,
    sourceStats: stats,
    derivedMetrics: derived,
    ingestion: ingested
  };
}

export async function getAnalyticsReport(publishId) {
  if (!publishId) {
    throw new Error("PUBLISH_ID_REQUIRED");
  }

  const cacheKey = `analytics:report:${publishId}`;
  const cached = getCache(cacheKey);
  if (cached) return cached;

  const publish = await getPublishById(publishId);
  if (!publish) {
    throw new Error("PUBLISH_NOT_FOUND");
  }

  const report = {
    publishId: publish.publishId,
    topic: publish.topic,
    youtube: {
      youtubeVideoId: publish.youtubeVideoId,
      youtubePublishedAt: publish.youtubePublishedAt,
      youtubeSyncStatus: publish.youtubeSyncStatus
    },
    metrics: {
      metricsCtr: publish.metricsCtr,
      metricsRetention3s: publish.metricsRetention3s,
      metricsAvgWatchDurationSec: publish.metricsAvgWatchDurationSec,
      metricsCompletionRate: publish.metricsCompletionRate,
      lastAnalyzedAt: publish.lastAnalyzedAt
    },
    optimization: {
      optimizationStatus: publish.optimizationStatus,
      optimizationUpdatedAt: publish.optimizationUpdatedAt,
      optimizationVariants: publish.optimizationVariants
    }
  };

  setCache(cacheKey, report, Number(process.env.CACHE_ANALYTICS_TTL_MS || 45000));
  return report;
}
