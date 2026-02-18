import test from "node:test";
import assert from "node:assert/strict";
import { deriveEngineExternalSignals } from "../../apps/api/src/services/strategySignalService.js";

test("deriveEngineExternalSignals returns normalized scores from snippet corpus", () => {
  const payload = deriveEngineExternalSignals({
    topic: "youtube growth strategy",
    opportunitySignals: { source: "youtube-api", trendScore: 0.8 },
    snippets: [
      {
        title: "YouTube growth: 3 steps to fix low retention",
        description: "How to improve CTR and monetization quickly"
      },
      {
        title: "Why your channel is not growing",
        description: "Problem breakdown and solution guide for creators"
      }
    ]
  });

  assert.equal(payload.source, "youtube-api");
  assert.ok(payload.searchIntent > 0);
  assert.ok(payload.viralPattern > 0);
  assert.ok(payload.revenue > 0);
  assert.ok(payload.problemRelevance > 0);
  assert.equal(payload.sampleCount, 2);
});
