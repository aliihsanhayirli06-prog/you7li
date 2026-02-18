export function generateScript({ topic, opportunityScore }) {
  const normalized = String(topic || "").trim();
  if (!normalized) {
    throw new Error("TOPIC_REQUIRED");
  }

  const urgency = opportunityScore >= 0.75 ? "hizli" : "temkinli";

  const hook = `${normalized} konusunda ${urgency} bir avantaj yakalamanin 3 yolu.`;
  const body = [
    "1) Net problem ve hedef kitle tanimi yap.",
    "2) Tek bir format secip 7 gun boyunca tekrar et.",
    "3) CTR ve retention verisine gore hook'u yeniden yaz."
  ].join(" ");
  const cta = "Daha fazla icerik stratejisi icin takip et ve bir sonraki deneyi kacirma.";

  const script = `${hook} ${body} ${cta}`;

  return {
    topic: normalized,
    estimatedDurationSec: 35,
    script,
    metadata: {
      format: "shorts",
      language: "tr",
      compliance: "requires-final-review"
    }
  };
}
