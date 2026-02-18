import test from "node:test";
import assert from "node:assert/strict";
import {
  scoreStrategyForTopic,
  selectTopicByFusion
} from "../../apps/api/src/services/strategyFusionService.js";

test("scoreStrategyForTopic returns fusion payload with prompt weights", () => {
  const result = scoreStrategyForTopic("youtube shorts gelir artirma stratejisi");

  assert.equal(result.fusion.weights.opportunity, 0.25);
  assert.equal(result.fusion.weights.revenue, 0.25);
  assert.equal(result.fusion.weights.searchIntent, 0.15);
  assert.equal(result.fusion.weights.pillar, 0.1);
  assert.equal(result.fusion.weights.viralPattern, 0.15);
  assert.equal(result.fusion.weights.problemRelevance, 0.1);
  assert.ok(result.fusion.finalScore >= 0);
  assert.ok(result.fusion.finalScore <= 1);
});

test("selectTopicByFusion ranks and selects highest score", () => {
  const payload = selectTopicByFusion(["rastgele fikir", "youtube shorts gelir artirma plani"]);

  assert.ok(payload.selectedTopic);
  assert.equal(payload.selectedTopic, payload.ranked[0].topic);
  assert.ok(payload.ranked.length, 2);
  assert.ok(payload.ranked[0].fusion.finalScore >= payload.ranked[1].fusion.finalScore);
});

test("selectTopicByFusion rejects empty topic list", () => {
  assert.throws(() => selectTopicByFusion([]), /TOPICS_REQUIRED/);
});

test("scoreStrategyForTopic blends external engine signals when provided", () => {
  const base = scoreStrategyForTopic("youtube icerik plani");
  const boosted = scoreStrategyForTopic("youtube icerik plani", {
    opportunitySignals: { source: "test", trendScore: 0.7, competitionLevel: 0.4 },
    engineSignals: {
      source: "test-external",
      sampleCount: 8,
      confidence: 0.9,
      searchIntent: 0.95,
      pillar: 0.92,
      viralPattern: 0.88,
      revenue: 0.86,
      problemRelevance: 0.9
    }
  });

  assert.ok(boosted.scores.searchIntent >= base.scores.searchIntent);
  assert.ok(boosted.scores.pillar >= base.scores.pillar);
  assert.equal(boosted.signalContext.engineSource, "test-external");
});
