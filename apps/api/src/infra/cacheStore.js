const cache = new Map();

function now() {
  return Date.now();
}

export function setCache(key, value, ttlMs = 30000) {
  cache.set(key, {
    value,
    expiresAt: now() + Math.max(1, Number(ttlMs || 30000)),
    createdAt: new Date().toISOString()
  });
}

export function getCache(key) {
  const item = cache.get(key);
  if (!item) return null;
  if (item.expiresAt <= now()) {
    cache.delete(key);
    return null;
  }
  return item.value;
}

export function invalidateCache(prefix = "") {
  const keys = [...cache.keys()];
  let count = 0;
  for (const key of keys) {
    if (!prefix || key.startsWith(prefix)) {
      cache.delete(key);
      count += 1;
    }
  }
  return count;
}

export function cacheStats() {
  const active = [...cache.values()].filter((item) => item.expiresAt > now()).length;
  return {
    items: active,
    totalKeys: cache.size,
    generatedAt: new Date().toISOString()
  };
}
