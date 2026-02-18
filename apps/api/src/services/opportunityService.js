import { getCache, setCache } from "../infra/cacheStore.js";

function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max);
}

export function scoreOpportunity(topic, signals = null) {
  const normalized = String(topic || "").trim();

  if (!normalized) {
    throw new Error("TOPIC_REQUIRED");
  }

  const cacheKey = `opportunity:${normalized.toLowerCase()}:${JSON.stringify(signals || {})}`;
  const cached = getCache(cacheKey);
  if (cached) return cached;

  const words = normalized.split(/\s+/).length;
  const lengthScore = clamp(words / 8, 0.2, 1);
  const trendBoost = /ai|youtube|shorts|otomasyon|growth/i.test(normalized) ? 0.2 : 0;
  const competitionPenalty = words <= 2 ? 0.15 : 0;

  const signalTrend = signals?.trendScore ?? 0.45;
  const signalCompetition = signals?.competitionLevel ?? 0.45;

  const score = clamp(
    0.45 +
      lengthScore * 0.2 +
      trendBoost * 0.5 +
      signalTrend * 0.25 -
      competitionPenalty -
      signalCompetition * 0.1,
    0,
    1
  );

  const sourceLabel = signals?.source || "heuristic";

  const payload = {
    topic: normalized,
    opportunityScore: Number(score.toFixed(2)),
    signals: {
      source: sourceLabel,
      trendScore: Number(signalTrend.toFixed(2)),
      competitionLevel: Number(signalCompetition.toFixed(2))
    },
    notes: [
      "Score combines heuristics and live signal adapters.",
      "Replace fallback adapters as external integrations mature."
    ]
  };

  setCache(cacheKey, payload, Number(process.env.CACHE_OPPORTUNITY_TTL_MS || 60000));
  return payload;
}
