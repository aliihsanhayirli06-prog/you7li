import { generateSeoMetadata } from "./seoService.js";

export function evaluatePerformance(metrics) {
  const ctr = Number(metrics.metricsCtr || 0);
  const retention3s = Number(metrics.metricsRetention3s || 0);
  const completion = Number(metrics.metricsCompletionRate || 0);

  const lowCtr = ctr < 0.04;
  const lowRetention = retention3s < 0.55;
  const lowCompletion = completion < 0.6;

  const flags = [];
  if (lowCtr) flags.push("low_ctr");
  if (lowRetention) flags.push("low_retention_3s");
  if (lowCompletion) flags.push("low_completion");

  return {
    needsOptimization: flags.length > 0,
    flags
  };
}

export function generateOptimizationVariants({ topic, title, flags }) {
  const reasons = flags.length ? flags.join(",") : "baseline";

  const titleVariants = [
    `${topic}: 3 adimda hizli uygulama`,
    `${topic} icin en kritik hata ve cozum`,
    `${topic} | 30 saniyede net plan`
  ];

  const hookVariants = [
    `${topic} neden buyumuyor? 1 dakikada tani koyuyoruz.`,
    `Bu ${topic} stratejisi retention'i ilk 3 saniyede toparlar.`,
    `${topic} icin tek degisiklikle daha yuksek izlenme al.`
  ];

  const thumbnailVariants = [
    "Kontrastli kirmizi metin + tek buyuk rakam",
    "Once/sonra layout + yuz ifadesi",
    "Kisa soru basligi: Neden dusuyor?"
  ];

  const seoTopics = [
    topic,
    `${topic} nasil hizlandirilir`,
    `${topic} icin en kritik 3 hamle`
  ];
  const seoVariants = seoTopics.map((seoTopic, index) => {
    const metadata = generateSeoMetadata({
      topic: seoTopic,
      script: `${title} ${reasons}`,
      format: "shorts",
      language: "tr"
    });
    const score =
      Number(metadata.title.length <= 70 ? 0.3 : 0.15) +
      Number(metadata.hashtags.length >= 3 ? 0.25 : 0.1) +
      Number(metadata.keywords.length >= 4 ? 0.25 : 0.1) +
      Number(flags.includes("low_ctr") ? metadata.title.toLowerCase().includes("3") : 0.15) +
      Number(flags.includes("low_retention_3s") ? metadata.description.length < 260 : 0.05);

    return {
      variantId: `seo_${index + 1}`,
      rationale: index === 0 ? "baseline" : index === 1 ? "question_intent" : "listicle_intent",
      title: metadata.title,
      description: metadata.description,
      keywords: metadata.keywords,
      hashtags: metadata.hashtags,
      variantScore: Number(score.toFixed(4))
    };
  });
  const selection = rankSeoVariantsForSelection({
    variants: seoVariants,
    flags
  });

  return {
    generatedAt: new Date().toISOString(),
    reason: reasons,
    basedOnTitle: title,
    titleVariants,
    hookVariants,
    thumbnailVariants,
    seoVariants,
    selectedSeoVariant: selection.selected,
    seoSelection: {
      ranking: selection.ranking,
      scoringWeights: selection.weights
    }
  };
}

export function rankSeoVariantsForSelection({ variants, flags = [] }) {
  const weights = {
    baseVariantScore: 1,
    ctrListicleBoost: flags.includes("low_ctr") ? 0.25 : 0,
    retentionDescriptionBoost: flags.includes("low_retention_3s") ? 0.2 : 0,
    completionKeywordBoost: flags.includes("low_completion") ? 0.15 : 0
  };

  const ranked = (Array.isArray(variants) ? variants : [])
    .map((variant) => {
      const base = Number(variant?.variantScore || 0) * weights.baseVariantScore;
      const listicleBoost =
        weights.ctrListicleBoost > 0 && /\b3\b/.test(String(variant?.title || "")) ? weights.ctrListicleBoost : 0;
      const retentionBoost =
        weights.retentionDescriptionBoost > 0 && String(variant?.description || "").length < 260
          ? weights.retentionDescriptionBoost
          : 0;
      const completionBoost =
        weights.completionKeywordBoost > 0 && Array.isArray(variant?.keywords) && variant.keywords.length >= 5
          ? weights.completionKeywordBoost
          : 0;

      return {
        ...variant,
        finalScore: Number((base + listicleBoost + retentionBoost + completionBoost).toFixed(4))
      };
    })
    .sort((a, b) => b.finalScore - a.finalScore);

  return {
    selected: ranked[0] || null,
    ranking: ranked,
    weights
  };
}
