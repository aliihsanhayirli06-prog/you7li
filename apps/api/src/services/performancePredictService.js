function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max);
}

function wordCount(value) {
  return String(value || "")
    .trim()
    .split(/\s+/)
    .filter(Boolean).length;
}

export function predictPerformance({
  topic,
  script = "",
  opportunityScore = 0.5,
  format = "shorts"
}) {
  const normalizedTopic = String(topic || "").trim();
  if (!normalizedTopic) {
    throw new Error("TOPIC_REQUIRED");
  }

  const normalizedFormat = String(format || "shorts").toLowerCase();
  const validFormat =
    normalizedFormat === "shorts" ||
    normalizedFormat === "reels" ||
    normalizedFormat === "tiktok" ||
    normalizedFormat === "youtube";
  if (!validFormat) {
    throw new Error("FORMAT_INVALID");
  }

  const topicWords = wordCount(normalizedTopic);
  const scriptWords = wordCount(script);
  const trendBoost = /ai|youtube|shorts|otomasyon|growth|viral/i.test(normalizedTopic) ? 0.12 : 0;
  const formatBoost = normalizedFormat === "youtube" ? -0.01 : 0.02;
  const opportunity = clamp(Number(opportunityScore) || 0, 0, 1);
  const brevityScore = clamp(1 - Math.abs(scriptWords - 85) / 120, 0, 1);

  const predictedCtr = clamp(
    0.02 + opportunity * 0.08 + trendBoost * 0.35 + brevityScore * 0.02 + formatBoost,
    0.01,
    0.2
  );
  const predictedRetention3s = clamp(
    0.4 + opportunity * 0.3 + brevityScore * 0.2 + formatBoost,
    0.3,
    0.95
  );
  const predictedCompletionRate = clamp(
    0.28 + opportunity * 0.45 + brevityScore * 0.18 + formatBoost,
    0.2,
    0.95
  );
  const predictedAvgWatchDurationSec = clamp(
    10 + predictedCompletionRate * 28 + predictedRetention3s * 14,
    8,
    58
  );

  const confidence = clamp(0.48 + topicWords * 0.03 + scriptWords / 500 + opportunity * 0.2, 0.35, 0.92);

  return {
    input: {
      topic: normalizedTopic,
      scriptLengthWords: scriptWords,
      opportunityScore: Number(opportunity.toFixed(3)),
      format: normalizedFormat
    },
    forecast: {
      metricsCtr: Number(predictedCtr.toFixed(4)),
      metricsRetention3s: Number(predictedRetention3s.toFixed(4)),
      metricsCompletionRate: Number(predictedCompletionRate.toFixed(4)),
      metricsAvgWatchDurationSec: Number(predictedAvgWatchDurationSec.toFixed(2))
    },
    confidence: Number(confidence.toFixed(3)),
    recommendations: [
      "Hook cumlesini ilk 2 saniyede netlestir.",
      "Tek mesaj + tek CTA kullan.",
      "Retention dusukse ilk 5 saniye tempo ve kesme yogunlugunu artir."
    ]
  };
}
