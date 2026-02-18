import test from "node:test";
import assert from "node:assert/strict";

test("runPipeline returns opportunity, script and publish payload", async () => {
  process.env.DATA_DIR = `/tmp/you7li-test-${Date.now()}-${Math.random().toString(16).slice(2)}`;
  const { runPipeline } = await import("../../apps/api/src/services/pipelineService.js");

  const result = await runPipeline("YouTube shorts otomasyon stratejisi");

  assert.ok(result.opportunity.opportunityScore >= 0);
  assert.equal(result.script.metadata.format, "shorts");
  assert.equal(result.publish.status, "scheduled");
  assert.equal(result.publish.channelId, "ch_default");
  assert.equal(result.publish.renderStatus, "queued");
  assert.equal(result.publish.complianceStatus, "pass");
  assert.match(result.publish.publishId, /^pub_/);
  assert.ok(result.opportunity.signals.source);
});

test("runPipeline throws for empty topic", async () => {
  process.env.DATA_DIR = `/tmp/you7li-test-${Date.now()}-${Math.random().toString(16).slice(2)}`;
  const { runPipeline } = await import("../../apps/api/src/services/pipelineService.js");

  await assert.rejects(async () => runPipeline(""), /TOPIC_REQUIRED/);
});
