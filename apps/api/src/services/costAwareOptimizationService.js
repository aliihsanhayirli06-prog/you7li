import { predictPerformance } from "./performancePredictService.js";

const COST_PROFILES = {
  fast: { relativeCost: 0.6, qualityScore: 0.72 },
  balanced: { relativeCost: 1, qualityScore: 0.86 },
  quality: { relativeCost: 1.45, qualityScore: 0.95 }
};

function normalizeBudgetTier(value) {
  const tier = String(value || "medium").toLowerCase();
  if (tier === "low" || tier === "high") return tier;
  return "medium";
}

function budgetToMaxRelativeCost(tier, override) {
  const direct = Number(override);
  if (Number.isFinite(direct) && direct > 0) return direct;
  if (tier === "low") return 0.8;
  if (tier === "high") return 2;
  return 1.2;
}

export function recommendCostAwarePlan({
  topic,
  script = "",
  format = "shorts",
  opportunityScore = 0.5,
  budgetTier = "medium",
  maxRelativeCost = null
}) {
  const prediction = predictPerformance({ topic, script, format, opportunityScore });
  const tier = normalizeBudgetTier(budgetTier);
  const maxCost = budgetToMaxRelativeCost(tier, maxRelativeCost);

  const candidates = Object.entries(COST_PROFILES).map(([preset, profile]) => {
    const weightedPerformance =
      prediction.forecast.metricsCtr * 0.45 +
      prediction.forecast.metricsRetention3s * 0.3 +
      prediction.forecast.metricsCompletionRate * 0.25;
    const utility = weightedPerformance * profile.qualityScore;
    const normalizedCost = profile.relativeCost / maxCost;
    const score = utility - normalizedCost * 0.2;
    return {
      preset,
      relativeCost: profile.relativeCost,
      qualityScore: profile.qualityScore,
      utility: Number(utility.toFixed(4)),
      score: Number(score.toFixed(4)),
      fitsBudget: profile.relativeCost <= maxCost
    };
  });

  const affordable = candidates.filter((item) => item.fitsBudget);
  const pool = affordable.length ? affordable : candidates;
  pool.sort((a, b) => b.score - a.score);
  const selected = pool[0];

  return {
    input: {
      topic,
      format,
      budgetTier: tier,
      maxRelativeCost: maxCost
    },
    forecast: prediction.forecast,
    recommendation: {
      preset: selected.preset,
      format,
      expectedQualityScore: selected.qualityScore,
      expectedRelativeCost: selected.relativeCost,
      reason: selected.fitsBudget
        ? "best score within budget"
        : "no preset fits budget, selected best fallback"
    },
    alternatives: candidates
  };
}
