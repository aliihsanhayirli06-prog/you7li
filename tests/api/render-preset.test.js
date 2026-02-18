import test from "node:test";
import assert from "node:assert/strict";
import {
  resolveRenderFormat,
  resolveRenderPreset,
  resolveRenderTemplate
} from "../../services/worker/src/renderProcessor.js";

test("resolveRenderPreset returns expected fast profile", () => {
  const preset = resolveRenderPreset("fast");
  assert.equal(preset.ffmpegPreset, "veryfast");
  assert.equal(preset.crf, 31);
  assert.equal(preset.fps, 24);
  assert.equal(preset.targetBitrateKbps, 1200);
});

test("resolveRenderPreset returns expected quality profile", () => {
  const preset = resolveRenderPreset("quality");
  assert.equal(preset.ffmpegPreset, "slow");
  assert.equal(preset.crf, 21);
  assert.equal(preset.fps, 30);
  assert.equal(preset.targetBitrateKbps, 2800);
});

test("resolveRenderPreset defaults to balanced", () => {
  const preset = resolveRenderPreset("unknown");
  assert.equal(preset.ffmpegPreset, "medium");
  assert.equal(preset.crf, 26);
  assert.equal(preset.fps, 30);
  assert.equal(preset.targetBitrateKbps, 1800);
});

test("resolveRenderTemplate returns basic layout defaults", () => {
  const template = resolveRenderTemplate("basic");
  assert.equal(template.introDurationSec, 1.6);
  assert.equal(template.outroDurationSec, 1.6);
  assert.equal(template.lowerThirdEnabled, true);
});

test("resolveRenderTemplate returns minimal layout", () => {
  const template = resolveRenderTemplate("minimal");
  assert.equal(template.introDurationSec, 0);
  assert.equal(template.outroDurationSec, 0);
  assert.equal(template.lowerThirdEnabled, false);
});

test("resolveRenderFormat returns youtube landscape format", () => {
  const format = resolveRenderFormat("youtube");
  assert.equal(format.width, 1920);
  assert.equal(format.height, 1080);
  assert.equal(format.label, "16:9");
});

test("resolveRenderFormat defaults to shorts portrait", () => {
  const format = resolveRenderFormat("unknown");
  assert.equal(format.width, 1080);
  assert.equal(format.height, 1920);
  assert.equal(format.label, "9:16");
});
