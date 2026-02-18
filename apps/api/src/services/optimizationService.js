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

  return {
    generatedAt: new Date().toISOString(),
    reason: reasons,
    basedOnTitle: title,
    titleVariants,
    hookVariants,
    thumbnailVariants
  };
}
