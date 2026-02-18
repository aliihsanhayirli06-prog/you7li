import { scoreOpportunity } from "./opportunityService.js";
import { generateScript } from "./scriptService.js";
import { createDraftPublish } from "./publishService.js";
import { selectTopicByFusion } from "./strategyFusionService.js";
import { generateVoiceover } from "./voiceGenerationService.js";
import { generateVisualAsset } from "./visualGenerationService.js";
import { generateSeoMetadata } from "./seoService.js";
import { getStrategySignalBundle } from "./strategySignalService.js";
import { evaluatePromptCompliance } from "./promptComplianceService.js";

function normalizeTopicsInput(topicOrTopics) {
  if (Array.isArray(topicOrTopics)) return topicOrTopics;
  return [topicOrTopics];
}

function toBoolean(value, fallback = true) {
  if (value == null) return fallback;
  const normalized = String(value).toLowerCase();
  if (normalized === "false" || normalized === "0" || normalized === "no") return false;
  if (normalized === "true" || normalized === "1" || normalized === "yes") return true;
  return fallback;
}

function shouldGenerateMedia(options = {}) {
  if (Object.prototype.hasOwnProperty.call(options, "generateMedia")) {
    return toBoolean(options.generateMedia, true);
  }
  return toBoolean(process.env.PIPELINE_AUTOGEN_MEDIA, true);
}

function buildPipelineContractV3() {
  return {
    version: "v3",
    backwardCompatibleWith: ["v2", "v1"],
    legacyFields: ["opportunity", "script", "publish"],
    generatedAt: new Date().toISOString()
  };
}

async function generateMediaBundle({ topic, script, format, enabled }) {
  if (!enabled) {
    return {
      enabled: false,
      voice: null,
      visual: null
    };
  }

  try {
    const [voice, visual] = await Promise.all([
      generateVoiceover({
        topic,
        script,
        language: "tr",
        voice: "default"
      }),
      generateVisualAsset({
        topic,
        prompt: `${topic} icin dikey video plani`,
        format
      })
    ]);

    return {
      enabled: true,
      voice,
      visual
    };
  } catch (error) {
    return {
      enabled: true,
      voice: null,
      visual: null,
      error: String(error?.message || "MEDIA_GENERATION_FAILED")
    };
  }
}

export async function runPipeline(
  topicOrTopics,
  channelId = null,
  tenantId = "t_default",
  options = {}
) {
  const topics = normalizeTopicsInput(topicOrTopics);
  const topicSignals = await Promise.all(
    topics.map(async (topic) => {
      const normalizedTopic = String(topic || "").trim();
      if (!normalizedTopic) return [normalizedTopic, null];
      const signals = await getStrategySignalBundle(normalizedTopic);
      return [normalizedTopic, signals];
    })
  );
  const signalsByTopic = Object.fromEntries(topicSignals.filter(([topic]) => Boolean(topic)));
  const strategy = selectTopicByFusion(topics, signalsByTopic);
  const selectedTopic = strategy.selectedTopic;
  const selectedSignals = signalsByTopic[selectedTopic] || null;

  const opportunity = scoreOpportunity(selectedTopic, selectedSignals?.opportunitySignals || null);
  const script = generateScript({
    topic: opportunity.topic,
    opportunityScore: opportunity.opportunityScore
  });
  const seo = generateSeoMetadata({
    topic: script.topic,
    script: script.script,
    format: script?.metadata?.format || "shorts",
    language: script?.metadata?.language || "tr"
  });
  const media = await generateMediaBundle({
    topic: script.topic,
    script: script.script,
    format: script?.metadata?.format || "shorts",
    enabled: shouldGenerateMedia(options)
  });
  const publish = await createDraftPublish({
    topic: script.topic,
    script: script.script,
    title: seo.title,
    description: seo.description,
    media,
    channelId,
    tenantId
  });
  const promptCompliance = evaluatePromptCompliance({
    strategy,
    script,
    seo,
    media,
    publish
  });

  return {
    contract: buildPipelineContractV3(),
    promptCompliance,
    strategy,
    opportunity,
    script,
    seo,
    media,
    publish
  };
}
