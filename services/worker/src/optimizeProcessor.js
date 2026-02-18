import {
  getPublishById,
  updatePublishOptimization
} from "../../../apps/api/src/infra/publishRepository.js";
import { logHistory } from "../../../apps/api/src/services/historyService.js";
import { generateOptimizationVariants } from "../../../apps/api/src/services/optimizationService.js";

export async function processOptimizeJob(job) {
  if (!job?.publishId) {
    throw new Error("INVALID_JOB");
  }

  const publish = await getPublishById(job.publishId);
  if (!publish) {
    throw new Error("PUBLISH_NOT_FOUND");
  }

  const flags = Array.isArray(job.flags) ? job.flags : [];
  const variants = generateOptimizationVariants({
    topic: publish.topic,
    title: publish.title,
    flags
  });

  const updatedAt = new Date().toISOString();
  const updated = await updatePublishOptimization({
    publishId: publish.publishId,
    optimizationStatus: "ready",
    optimizationVariants: variants,
    optimizationUpdatedAt: updatedAt
  });

  await logHistory("optimization.generated", {
    publishId: publish.publishId,
    topic: publish.topic,
    optimizationStatus: "ready",
    flags
  });

  return updated;
}
