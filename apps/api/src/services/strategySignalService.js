import { getYouTubeSearchSnippets, getYouTubeSignals } from "../infra/youtubeSignalClient.js";

function clamp(value, min = 0, max = 1) {
  return Math.min(Math.max(value, min), max);
}

function ratio(text, keywords) {
  const normalized = String(text || "").toLowerCase();
  if (!normalized) return 0;
  const hits = keywords.filter((item) => normalized.includes(item)).length;
  return clamp(hits / Math.max(1, keywords.length));
}

export function deriveEngineExternalSignals({ topic, snippets, opportunitySignals }) {
  const joined = [
    String(topic || ""),
    ...(Array.isArray(snippets) ? snippets.map((item) => `${item.title || ""} ${item.description || ""}`) : [])
  ].join(" ");

  const trendScore = Number(opportunitySignals?.trendScore || 0.45);
  const searchIntent = clamp(
    ratio(joined, ["nasil", "neden", "ne", "how", "why", "guide", "tips", "adim"]) * 0.75 +
      trendScore * 0.25
  );
  const pillar = clamp(
    ratio(joined, ["youtube", "icerik", "otomasyon", "buyume", "performans", "kanal"]) * 0.7 +
      trendScore * 0.3
  );
  const viralPattern = clamp(
    ratio(joined, ["viral", "sok", "hata", "sir", "trend", "before", "after", "3"]) * 0.7 +
      trendScore * 0.3
  );
  const revenue = clamp(
    ratio(joined, ["gelir", "para", "kazanc", "monetization", "sales", "roi", "karlilik"]) * 0.7 +
      trendScore * 0.3
  );
  const problemRelevance = clamp(
    ratio(joined, ["problem", "sorun", "dusuk", "neden", "cozum", "fix", "iyiles"]) * 0.75 +
      trendScore * 0.25
  );

  return {
    source: opportunitySignals?.source || "youtube-derived",
    sampleCount: Array.isArray(snippets) ? snippets.length : 0,
    confidence: clamp(0.4 + (Array.isArray(snippets) ? snippets.length : 0) * 0.05),
    searchIntent: Number(searchIntent.toFixed(4)),
    pillar: Number(pillar.toFixed(4)),
    viralPattern: Number(viralPattern.toFixed(4)),
    revenue: Number(revenue.toFixed(4)),
    problemRelevance: Number(problemRelevance.toFixed(4))
  };
}

export async function getStrategySignalBundle(topic) {
  const [opportunitySignals, snippets] = await Promise.all([
    getYouTubeSignals(topic),
    getYouTubeSearchSnippets(topic, 8)
  ]);

  if (!opportunitySignals && (!snippets || snippets.length === 0)) {
    return {
      opportunitySignals: null,
      engineSignals: null
    };
  }

  return {
    opportunitySignals,
    engineSignals: deriveEngineExternalSignals({
      topic,
      snippets,
      opportunitySignals
    })
  };
}
