import test from "node:test";
import assert from "node:assert/strict";
import { resetCircuitBreakers, withCircuitBreaker } from "../../apps/api/src/infra/circuitBreakerStore.js";

test("circuit breaker opens after threshold and recovers after cooldown", async () => {
  process.env.CIRCUIT_BREAKER_FAILURE_THRESHOLD = "1";
  process.env.CIRCUIT_BREAKER_COOLDOWN_MS = "1200";
  resetCircuitBreakers();

  await assert.rejects(
    async () =>
      withCircuitBreaker("test.adapter", async () => {
        throw new Error("boom");
      }),
    /boom/
  );

  await assert.rejects(
    async () => withCircuitBreaker("test.adapter", async () => "ok"),
    /CIRCUIT_OPEN:test\.adapter/
  );

  await new Promise((resolve) => setTimeout(resolve, 1250));

  const value = await withCircuitBreaker("test.adapter", async () => "ok");
  assert.equal(value, "ok");
});
