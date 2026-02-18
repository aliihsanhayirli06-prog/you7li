const breakerState = new Map();

function toNumber(value, fallback) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function threshold() {
  return Math.max(1, toNumber(process.env.CIRCUIT_BREAKER_FAILURE_THRESHOLD || 3, 3));
}

function cooldownMs() {
  return Math.max(1000, toNumber(process.env.CIRCUIT_BREAKER_COOLDOWN_MS || 30000, 30000));
}

function getState(key) {
  return breakerState.get(key) || { failures: 0, openUntil: 0 };
}

export function resetCircuitBreakers() {
  breakerState.clear();
}

export function getCircuitBreakerPolicy() {
  return {
    failureThreshold: threshold(),
    cooldownMs: cooldownMs()
  };
}

export function getCircuitBreakerSnapshot() {
  const now = Date.now();
  const items = [];
  for (const [key, value] of breakerState.entries()) {
    items.push({
      key,
      failures: Number(value?.failures || 0),
      openUntil: Number(value?.openUntil || 0),
      state: Number(value?.openUntil || 0) > now ? "open" : "closed"
    });
  }
  return items;
}

export async function withCircuitBreaker(key, task) {
  const now = Date.now();
  const state = getState(key);

  if (state.openUntil > now) {
    throw new Error(`CIRCUIT_OPEN:${key}`);
  }

  try {
    const result = await task();
    breakerState.set(key, { failures: 0, openUntil: 0 });
    return result;
  } catch (error) {
    const nextFailures = Number(state.failures || 0) + 1;
    if (nextFailures >= threshold()) {
      breakerState.set(key, {
        failures: 0,
        openUntil: now + cooldownMs()
      });
    } else {
      breakerState.set(key, {
        failures: nextFailures,
        openUntil: 0
      });
    }
    throw error;
  }
}
