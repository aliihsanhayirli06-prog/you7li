import { dequeue, requeueWithRetry } from "../../../apps/api/src/infra/queueClient.js";
import { processPublishJob } from "./publishProcessor.js";
import { processRenderJob } from "./renderProcessor.js";
import { processOptimizeJob } from "./optimizeProcessor.js";
import { logHistory } from "../../../apps/api/src/services/historyService.js";
import { buildJobKey, isProcessed, markProcessed } from "./idempotencyStore.js";
import { increment } from "../../../apps/api/src/infra/metricsStore.js";
import { sendAlert } from "../../../apps/api/src/services/alertingService.js";
import { validateConfig } from "../../../apps/api/src/utils/config.js";

const POLL_MS = Number(process.env.WORKER_POLL_MS || 1000);
validateConfig("worker");
let stopping = false;

async function processByType(job) {
  if (job.jobType === "render.generate") {
    return processRenderJob(job);
  }

  if (job.jobType === "publish.execute") {
    return processPublishJob(job);
  }

  if (job.jobType === "optimize.generate") {
    return processOptimizeJob(job);
  }

  throw new Error(`UNKNOWN_JOB_TYPE:${job.jobType}`);
}

async function tick() {
  const job = await dequeue();
  if (!job) return;

  const jobKey = buildJobKey(job);
  const alreadyProcessed = await isProcessed(jobKey);

  if (alreadyProcessed) {
    await logHistory("job.duplicate_skipped", {
      publishId: job.publishId,
      topic: job.topic,
      jobType: job.jobType,
      jobId: job.jobId || null
    });
    increment("jobsCompletedTotal");
    return;
  }

  try {
    const result = await processByType(job);
    await markProcessed(jobKey);

    await logHistory("job.completed", {
      publishId: job.publishId,
      topic: job.topic,
      jobType: job.jobType,
      jobId: job.jobId || null,
      attempt: Number(job.attempt || 0),
      resultStatus: result?.status || result?.optimizationStatus || result?.renderStatus || null
    });
    increment("jobsCompletedTotal");

    console.log(`[worker] job completed: ${job.jobType} ${result?.publishId || job.publishId}`);
  } catch (error) {
    const message = error?.message || "unknown";
    increment("jobsFailedTotal");

    const retry = await requeueWithRetry(job, message);

    await logHistory("job.failed", {
      publishId: job.publishId,
      topic: job.topic,
      jobType: job.jobType,
      jobId: job.jobId || null,
      error: message,
      retryAction: retry.action,
      attempt: retry.attempt
    });

    if (retry.action === "retried") {
      increment("jobsRetriedTotal");
      console.warn(
        `[worker] job retry queued: ${job.jobType} ${job.publishId} attempt=${retry.attempt}`
      );
      return;
    }

    increment("jobsDlqTotal");
    await sendAlert("job_moved_to_dlq", {
      jobType: job.jobType,
      publishId: job.publishId,
      attempt: retry.attempt,
      error: message
    });
    console.error(`[worker] job moved to dlq: ${job.jobType} ${job.publishId} error=${message}`);
  }
}

async function loop() {
  console.log(`[worker] started with poll interval ${POLL_MS}ms`);

  while (!stopping) {
    await tick();
    await new Promise((resolve) => setTimeout(resolve, POLL_MS));
  }

  console.log("[worker] stopped");
}

process.on("SIGINT", () => {
  stopping = true;
});
process.on("SIGTERM", () => {
  stopping = true;
});

loop().catch((error) => {
  console.error("[worker] fatal", error);
  process.exit(1);
});
