import { getPublishById, readPublishes, savePublish } from "../infra/publishRepository.js";
import { enqueue } from "../infra/queueClient.js";
import { logHistory } from "./historyService.js";
import { evaluateCompliance } from "./complianceService.js";
import { resolveChannelId } from "./channelService.js";
import { queueComplianceReview } from "./reviewService.js";

function createId() {
  return `pub_${Date.now()}_${Math.floor(Math.random() * 10000)}`;
}

export async function createDraftPublish({
  topic,
  script,
  channelId = null,
  tenantId = "t_default"
}) {
  if (!topic || !script) {
    throw new Error("TOPIC_AND_SCRIPT_REQUIRED");
  }
  const resolvedChannelId = await resolveChannelId(channelId, tenantId);

  const compliance = evaluateCompliance({ topic, script });
  const isOpen = compliance.status === "pass";

  const title = `${topic} | 30 saniyede uygulanabilir plan`;
  const description = [
    "Bu video AI destekli strateji sistemiyle hazirlandi.",
    "Amac: telife uygun ve surekli buyuyen icerik akisi.",
    "#youtube #shorts #icerikstratejisi"
  ].join("\n");

  const record = {
    publishId: createId(),
    channelId: resolvedChannelId,
    topic,
    title,
    description,
    status: isOpen ? "scheduled" : "blocked",
    renderStatus: isOpen ? "queued" : null,
    videoAssetUrl: null,
    videoAssetPath: null,
    scheduledAt: new Date(Date.now() + 5 * 60 * 1000).toISOString(),
    renderedAt: null,
    publishedAt: null,
    youtubeVideoId: null,
    youtubePublishedAt: null,
    youtubeSyncStatus: isOpen ? "pending" : "blocked",
    complianceStatus: compliance.status,
    complianceRiskScore: compliance.riskScore,
    complianceReport: compliance
  };

  await savePublish(record);
  await logHistory("publish.created", {
    tenantId,
    publishId: record.publishId,
    channelId: record.channelId,
    topic: record.topic,
    status: record.status,
    renderStatus: record.renderStatus
  });

  await logHistory("compliance.checked", {
    tenantId,
    publishId: record.publishId,
    channelId: record.channelId,
    topic: record.topic,
    complianceStatus: compliance.status,
    complianceRiskScore: compliance.riskScore
  });

  if (isOpen) {
    await enqueue({
      jobType: "render.generate",
      publishId: record.publishId,
      tenantId,
      channelId: record.channelId,
      topic: record.topic,
      scheduledAt: record.scheduledAt
    });
    await logHistory("job.enqueued", {
      tenantId,
      publishId: record.publishId,
      channelId: record.channelId,
      topic: record.topic,
      jobType: "render.generate"
    });
  } else {
    if (compliance.status === "review") {
      await queueComplianceReview({
        tenantId,
        publishId: record.publishId,
        channelId: record.channelId,
        reason: "Compliance requires human review",
        riskScore: compliance.riskScore,
        categories: (compliance.policy?.categories || []).map((item) => item.category)
      });
    }
    await logHistory("publish.gate_blocked", {
      tenantId,
      publishId: record.publishId,
      channelId: record.channelId,
      topic: record.topic,
      complianceStatus: compliance.status,
      complianceRiskScore: compliance.riskScore
    });
  }

  return record;
}

export async function listPublishes(filters = {}) {
  return readPublishes(filters);
}

export async function getPublish(publishId) {
  return getPublishById(publishId);
}
