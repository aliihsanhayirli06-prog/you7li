import { scoreOpportunity } from "./opportunityService.js";

const FUSION_WEIGHTS = Object.freeze({
  opportunity: 0.25,
  revenue: 0.25,
  searchIntent: 0.15,
  pillar: 0.1,
  viralPattern: 0.15,
  problemRelevance: 0.1
});

function clamp(value, min = 0, max = 1) {
  return Math.min(Math.max(value, min), max);
}

function normalizeTopic(value) {
  const normalized = String(value || "").trim();
  if (!normalized) {
    throw new Error("TOPIC_REQUIRED");
  }
  return normalized;
}

function scoreFormatEngine(topic) {
  const normalized = String(topic || "").toLowerCase();
  const educationalIntent = /(nasil|adim|rehber|strateji|plan|neden)/i.test(normalized) ? 0.2 : 0.1;
  const shortsAffinity = /(shorts|reels|tiktok|kisa)/i.test(normalized) ? 0.25 : 0.15;
  return clamp(0.45 + educationalIntent + shortsAffinity);
}

function scoreSearchIntentEngine(topic) {
  const normalized = String(topic || "").toLowerCase();
  const intentSignals = ["nasil", "neden", "ne", "ipuclari", "rehber", "adim", "cozum"];
  const matched = intentSignals.filter((keyword) => normalized.includes(keyword)).length;
  return clamp(0.35 + matched * 0.13);
}

function scoreContentPillarEngine(topic) {
  const normalized = String(topic || "").toLowerCase();
  const pillarSignals = ["buyume", "icerik", "otomasyon", "youtube", "gelir", "performans"];
  const matched = pillarSignals.filter((keyword) => normalized.includes(keyword)).length;
  return clamp(0.32 + matched * 0.12);
}

function scoreViralPatternEngine(topic) {
  const normalized = String(topic || "").toLowerCase();
  const hooks = ["sok", "hata", "sir", "x yolu", "3 yol", "once sonra", "viral"];
  const matched = hooks.filter((keyword) => normalized.includes(keyword)).length;
  const brevity = normalized.split(/\s+/).filter(Boolean).length <= 8 ? 0.1 : 0;
  return clamp(0.34 + matched * 0.15 + brevity);
}

function scoreRevenueEngine(topic) {
  const normalized = String(topic || "").toLowerCase();
  const revenueSignals = ["gelir", "para", "kazanc", "monetizasyon", "satis", "roi", "karlilik"];
  const matched = revenueSignals.filter((keyword) => normalized.includes(keyword)).length;
  return clamp(0.28 + matched * 0.16);
}

function scoreProblemBasedEngine(topic) {
  const normalized = String(topic || "").toLowerCase();
  const problemSignals = ["sorun", "problem", "neden", "dusuk", "az", "cozulmuyor", "iyilesmiyor"];
  const matched = problemSignals.filter((keyword) => normalized.includes(keyword)).length;
  return clamp(0.3 + matched * 0.15);
}

function toRounded(value, digits = 4) {
  return Number(Number(value).toFixed(digits));
}

function normalizeSignalEnvelope(signals) {
  if (!signals) return { opportunitySignals: null, engineSignals: null };
  if (signals.opportunitySignals || signals.engineSignals) {
    return {
      opportunitySignals: signals.opportunitySignals || null,
      engineSignals: signals.engineSignals || null
    };
  }
  return {
    opportunitySignals: signals,
    engineSignals: null
  };
}

function blendWithExternal(baseScore, externalScore) {
  if (externalScore == null || !Number.isFinite(Number(externalScore))) return clamp(baseScore);
  return clamp(baseScore * 0.7 + Number(externalScore) * 0.3);
}

export function scoreStrategyForTopic(topic, signals = null) {
  const normalizedTopic = normalizeTopic(topic);
  const signalEnvelope = normalizeSignalEnvelope(signals);
  const engineSignals = signalEnvelope.engineSignals || null;

  const opportunity = scoreOpportunity(normalizedTopic, signalEnvelope.opportunitySignals).opportunityScore;
  const format = scoreFormatEngine(normalizedTopic);
  const searchIntent = blendWithExternal(
    scoreSearchIntentEngine(normalizedTopic),
    engineSignals?.searchIntent
  );
  const pillar = blendWithExternal(scoreContentPillarEngine(normalizedTopic), engineSignals?.pillar);
  const viralPattern = blendWithExternal(
    scoreViralPatternEngine(normalizedTopic),
    engineSignals?.viralPattern
  );
  const revenue = blendWithExternal(scoreRevenueEngine(normalizedTopic), engineSignals?.revenue);
  const problemRelevance = blendWithExternal(
    scoreProblemBasedEngine(normalizedTopic),
    engineSignals?.problemRelevance
  );

  const weighted = {
    opportunity: opportunity * FUSION_WEIGHTS.opportunity,
    revenue: revenue * FUSION_WEIGHTS.revenue,
    searchIntent: searchIntent * FUSION_WEIGHTS.searchIntent,
    pillar: pillar * FUSION_WEIGHTS.pillar,
    viralPattern: viralPattern * FUSION_WEIGHTS.viralPattern,
    problemRelevance: problemRelevance * FUSION_WEIGHTS.problemRelevance
  };

  const finalScore = Object.values(weighted).reduce((sum, score) => sum + score, 0);

  return {
    topic: normalizedTopic,
    scores: {
      opportunity: toRounded(opportunity),
      format: toRounded(format),
      searchIntent: toRounded(searchIntent),
      pillar: toRounded(pillar),
      viralPattern: toRounded(viralPattern),
      revenue: toRounded(revenue),
      problemRelevance: toRounded(problemRelevance)
    },
    signalContext: {
      opportunitySource: signalEnvelope.opportunitySignals?.source || "heuristic",
      engineSource: engineSignals?.source || "heuristic",
      externalSampleCount: Number(engineSignals?.sampleCount || 0),
      externalConfidence: toRounded(engineSignals?.confidence || 0, 3)
    },
    fusion: {
      weights: FUSION_WEIGHTS,
      weighted: {
        opportunity: toRounded(weighted.opportunity),
        revenue: toRounded(weighted.revenue),
        searchIntent: toRounded(weighted.searchIntent),
        pillar: toRounded(weighted.pillar),
        viralPattern: toRounded(weighted.viralPattern),
        problemRelevance: toRounded(weighted.problemRelevance)
      },
      finalScore: toRounded(finalScore)
    }
  };
}

export function selectTopicByFusion(topics, signalsByTopic = {}) {
  if (!Array.isArray(topics) || topics.length === 0) {
    throw new Error("TOPICS_REQUIRED");
  }

  const normalizedTopics = topics.map((topic) =>
    typeof topic === "string" ? normalizeTopic(topic) : normalizeTopic(topic?.topic)
  );

  const ranked = normalizedTopics
    .map((topic) => scoreStrategyForTopic(topic, signalsByTopic[topic] || null))
    .sort((a, b) => b.fusion.finalScore - a.fusion.finalScore);

  return {
    selectedTopic: ranked[0].topic,
    finalScore: ranked[0].fusion.finalScore,
    ranked
  };
}
