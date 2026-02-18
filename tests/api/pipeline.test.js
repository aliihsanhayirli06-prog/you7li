import test from "node:test";
import assert from "node:assert/strict";

test("runPipeline returns opportunity, script and publish payload", async () => {
  process.env.DATA_DIR = `/tmp/you7li-test-${Date.now()}-${Math.random().toString(16).slice(2)}`;
  process.env.PIPELINE_AUTOGEN_MEDIA = "true";
  process.env.VOICE_PROVIDER = "mock";
  process.env.VISUAL_PROVIDER = "mock";
  const { runPipeline } = await import("../../apps/api/src/services/pipelineService.js");

  const result = await runPipeline("YouTube shorts otomasyon stratejisi");

  assert.ok(result.contract);
  assert.equal(result.contract.version, "v3");
  assert.ok(Array.isArray(result.contract.backwardCompatibleWith));
  assert.ok(result.contract.backwardCompatibleWith.includes("v1"));
  assert.ok(result.contract.legacyFields.includes("publish"));
  assert.ok(result.promptCompliance);
  assert.equal(typeof result.promptCompliance.scorePercent, "number");
  assert.ok(result.promptCompliance.scorePercent >= 0);
  assert.ok(result.promptCompliance.scorePercent <= 100);
  assert.ok(result.promptCompliance.totalChecks >= result.promptCompliance.passedChecks);
  assert.ok(result.strategy);
  assert.equal(result.strategy.selectedTopic, "YouTube shorts otomasyon stratejisi");
  assert.ok(Array.isArray(result.strategy.ranked));
  assert.ok(result.strategy.ranked.length >= 1);
  assert.ok(result.opportunity.opportunityScore >= 0);
  assert.equal(result.script.metadata.format, "shorts");
  assert.ok(result.seo);
  assert.ok(result.seo.title);
  assert.ok(result.seo.description);
  assert.ok(Array.isArray(result.seo.keywords));
  assert.ok(result.media);
  assert.equal(result.media.enabled, true);
  assert.ok(result.media.voice?.audioAssetPath);
  assert.ok(result.media.visual?.visualAssetPath);
  assert.equal(result.publish.status, "scheduled");
  assert.equal(result.publish.title, result.seo.title);
  assert.equal(result.publish.description, result.seo.description);
  assert.equal(result.publish.channelId, "ch_default");
  assert.equal(result.publish.renderStatus, "queued");
  assert.equal(result.publish.complianceStatus, "pass");
  assert.match(result.publish.publishId, /^pub_/);
  assert.ok(result.opportunity.signals.source);
});

test("runPipeline selects best topic when topics array is provided", async () => {
  process.env.DATA_DIR = `/tmp/you7li-test-${Date.now()}-${Math.random().toString(16).slice(2)}`;
  process.env.PIPELINE_AUTOGEN_MEDIA = "false";
  const { runPipeline } = await import("../../apps/api/src/services/pipelineService.js");

  const result = await runPipeline(["genel icerik fikri", "youtube shorts gelir artirma plani"]);

  assert.ok(result.strategy.selectedTopic);
  assert.equal(result.publish.topic, result.strategy.selectedTopic);
  assert.ok(result.seo.title);
  assert.equal(result.media.enabled, false);
  assert.ok(result.strategy.ranked[0].fusion.finalScore >= result.strategy.ranked[1].fusion.finalScore);
});

test("runPipeline allows overriding media generation with options", async () => {
  process.env.DATA_DIR = `/tmp/you7li-test-${Date.now()}-${Math.random().toString(16).slice(2)}`;
  process.env.PIPELINE_AUTOGEN_MEDIA = "true";
  const { runPipeline } = await import("../../apps/api/src/services/pipelineService.js");

  const result = await runPipeline("youtube shorts test", null, "t_default", { generateMedia: false });
  assert.equal(result.media.enabled, false);
});

test("runPipeline throws for empty topic", async () => {
  process.env.DATA_DIR = `/tmp/you7li-test-${Date.now()}-${Math.random().toString(16).slice(2)}`;
  const { runPipeline } = await import("../../apps/api/src/services/pipelineService.js");

  await assert.rejects(async () => runPipeline(""), /TOPIC_REQUIRED/);
});

test("pipeline contract v3 keeps legacy top-level fields for backward compatibility", async () => {
  process.env.DATA_DIR = `/tmp/you7li-test-${Date.now()}-${Math.random().toString(16).slice(2)}`;
  const { runPipeline } = await import("../../apps/api/src/services/pipelineService.js");

  const result = await runPipeline("legacy compatibility test");
  assert.ok(result.promptCompliance);
  assert.ok(result.opportunity);
  assert.ok(result.script);
  assert.ok(result.publish);
  assert.equal(result.contract.version, "v3");
});
