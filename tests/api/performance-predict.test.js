import test from "node:test";
import assert from "node:assert/strict";
import { predictPerformance } from "../../apps/api/src/services/performancePredictService.js";

test("predictPerformance returns bounded forecast metrics", () => {
  const result = predictPerformance({
    topic: "YouTube shorts otomasyon",
    script: "Ilk 2 saniyede dikkat cek. Sonra 3 adimlik cozum ver.",
    opportunityScore: 0.78,
    format: "shorts"
  });

  assert.ok(result.forecast.metricsCtr >= 0.01 && result.forecast.metricsCtr <= 0.2);
  assert.ok(result.forecast.metricsRetention3s >= 0.3 && result.forecast.metricsRetention3s <= 0.95);
  assert.ok(result.forecast.metricsCompletionRate >= 0.2 && result.forecast.metricsCompletionRate <= 0.95);
  assert.ok(result.forecast.metricsAvgWatchDurationSec >= 8);
  assert.ok(result.confidence >= 0.35 && result.confidence <= 0.92);
});

test("predictPerformance throws on invalid format", () => {
  assert.throws(
    () =>
      predictPerformance({
        topic: "test",
        script: "test script",
        format: "square"
      }),
    /FORMAT_INVALID/
  );
});
