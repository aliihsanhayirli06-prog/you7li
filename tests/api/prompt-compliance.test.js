import test from "node:test";
import assert from "node:assert/strict";
import { evaluatePromptCompliance } from "../../apps/api/src/services/promptComplianceService.js";

test("evaluatePromptCompliance returns bounded score and checks", () => {
  const payload = evaluatePromptCompliance({
    strategy: { selectedTopic: "topic", ranked: [{ topic: "topic" }] },
    script: { estimatedDurationSec: 35 },
    seo: { title: "title", description: "desc" },
    media: { enabled: false, voice: null, visual: null },
    publish: { publishId: "pub_1", complianceStatus: "pass" }
  });

  assert.equal(typeof payload.scorePercent, "number");
  assert.ok(payload.scorePercent >= 0);
  assert.ok(payload.scorePercent <= 100);
  assert.ok(Array.isArray(payload.checks));
  assert.ok(payload.totalChecks >= payload.passedChecks);
});
