let redisClient;

function getQueueDriver() {
  return process.env.QUEUE_DRIVER || "auto";
}

export function shouldUseRedis() {
  const driver = getQueueDriver();
  if (driver === "redis") return true;
  if (driver === "file") return false;
  return Boolean(process.env.REDIS_URL);
}

export async function getRedisClient() {
  if (!shouldUseRedis()) {
    return null;
  }

  if (redisClient) {
    return redisClient;
  }

  const { createClient } = await import("redis");
  redisClient = createClient({ url: process.env.REDIS_URL });

  if (!redisClient.isOpen) {
    await redisClient.connect();
  }

  return redisClient;
}
