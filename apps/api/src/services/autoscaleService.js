import { getQueueSize } from "../infra/queueClient.js";

export async function getAutoscalePlan() {
  const queueSize = await getQueueSize();
  const minWorkers = Number(process.env.AUTOSCALE_MIN_WORKERS || 1);
  const maxWorkers = Number(process.env.AUTOSCALE_MAX_WORKERS || 20);
  const jobsPerWorker = Number(process.env.AUTOSCALE_JOBS_PER_WORKER || 5);

  const desired = Math.min(
    maxWorkers,
    Math.max(minWorkers, Math.ceil(queueSize / Math.max(1, jobsPerWorker)) || minWorkers)
  );

  return {
    queueSize,
    desiredWorkers: desired,
    minWorkers,
    maxWorkers,
    jobsPerWorker,
    scaleDirection: desired > minWorkers ? "up" : "steady",
    generatedAt: new Date().toISOString()
  };
}
