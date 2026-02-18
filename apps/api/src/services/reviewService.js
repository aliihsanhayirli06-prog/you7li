import crypto from "node:crypto";
import {
  enqueueReviewItem,
  getReviewItemById,
  listReviewItems,
  updateReviewDecision
} from "../infra/reviewQueueRepository.js";
import {
  getPublishById,
  updatePublishCompliance,
  updatePublishRender,
  updatePublishStatus
} from "../infra/publishRepository.js";
import { enqueue } from "../infra/queueClient.js";
import { logHistory } from "./historyService.js";

export async function queueComplianceReview({
  tenantId,
  publishId,
  channelId = null,
  reason,
  riskScore = 0,
  categories = []
}) {
  const item = {
    reviewId: `rvw_${crypto.randomUUID()}`,
    tenantId,
    publishId,
    channelId,
    status: "pending",
    decision: null,
    reason: reason || "manual review required",
    riskScore,
    categories,
    note: null,
    reviewedBy: null,
    createdAt: new Date().toISOString(),
    reviewedAt: null
  };

  await enqueueReviewItem(item);
  await logHistory("review.queued", {
    tenantId,
    publishId,
    channelId,
    reviewId: item.reviewId,
    reason: item.reason,
    riskScore: item.riskScore
  });
  return item;
}

export async function getReviewQueue({ tenantId, status = "pending", limit = 100 }) {
  const effectiveStatus = status === "all" ? null : status;
  return listReviewItems({ tenantId, status: effectiveStatus, limit });
}

export async function decideReview({
  tenantId,
  reviewId,
  decision,
  note = null,
  actorRole = "admin"
}) {
  if (!reviewId || !decision) throw new Error("REVIEW_ID_AND_DECISION_REQUIRED");
  if (decision !== "approve" && decision !== "reject") throw new Error("INVALID_REVIEW_DECISION");

  const item = await getReviewItemById(reviewId);
  if (!item) throw new Error("REVIEW_NOT_FOUND");
  if (item.tenantId !== tenantId) throw new Error("REVIEW_NOT_FOUND");
  if (item.status !== "pending") throw new Error("REVIEW_ALREADY_DECIDED");

  const reviewedAt = new Date().toISOString();
  const updatedItem = await updateReviewDecision({
    reviewId,
    status: "closed",
    decision,
    note,
    reviewedBy: actorRole,
    reviewedAt
  });

  const publish = await getPublishById(item.publishId);
  if (!publish) throw new Error("PUBLISH_NOT_FOUND");

  if (decision === "approve") {
    const nextReport = {
      ...(publish.complianceReport || {}),
      humanReview: {
        decision: "approved",
        reviewedAt,
        reviewedBy: actorRole,
        note: note || null
      }
    };

    await updatePublishCompliance({
      publishId: publish.publishId,
      complianceStatus: "pass",
      complianceRiskScore: Math.max(0, Number(publish.complianceRiskScore || 0) - 10),
      complianceReport: nextReport
    });
    await updatePublishStatus({
      publishId: publish.publishId,
      status: "scheduled"
    });
    await updatePublishRender({
      publishId: publish.publishId,
      renderStatus: "queued"
    });
    await enqueue({
      jobType: "render.generate",
      tenantId,
      publishId: publish.publishId,
      channelId: publish.channelId || null,
      topic: publish.topic,
      scheduledAt: publish.scheduledAt
    });
    await logHistory("review.approved", {
      tenantId,
      publishId: publish.publishId,
      reviewId,
      note: note || null
    });
    await logHistory("job.enqueued", {
      tenantId,
      publishId: publish.publishId,
      channelId: publish.channelId || null,
      topic: publish.topic,
      jobType: "render.generate"
    });
  } else {
    const nextReport = {
      ...(publish.complianceReport || {}),
      humanReview: {
        decision: "rejected",
        reviewedAt,
        reviewedBy: actorRole,
        note: note || null
      }
    };
    await updatePublishCompliance({
      publishId: publish.publishId,
      complianceStatus: "blocked",
      complianceRiskScore: Math.max(50, Number(publish.complianceRiskScore || 0)),
      complianceReport: nextReport
    });
    await updatePublishStatus({
      publishId: publish.publishId,
      status: "blocked"
    });
    await logHistory("review.rejected", {
      tenantId,
      publishId: publish.publishId,
      reviewId,
      note: note || null
    });
  }

  return {
    review: updatedItem,
    publishId: publish.publishId,
    decision
  };
}
