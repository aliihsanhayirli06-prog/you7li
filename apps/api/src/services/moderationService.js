function includesAny(text, patterns) {
  const normalized = String(text || "").toLowerCase();
  return patterns.some((pattern) => normalized.includes(pattern));
}

export function classifyPolicyRisk({ topic, script }) {
  const text = `${topic || ""} ${script || ""}`;
  const categories = [];

  if (
    includesAny(text, [
      "nefret",
      "hate group",
      "irkci",
      "kill them",
      "all women are",
      "all men are trash"
    ])
  ) {
    categories.push({ category: "hate", severity: "high", score: 0.92 });
  }

  if (
    includesAny(text, ["bomb", "how to attack", "silahla saldir", "evde bomba", "violent revenge"])
  ) {
    categories.push({ category: "violence", severity: "high", score: 0.95 });
  }

  if (includesAny(text, ["intihar et", "kendine zarar ver", "self harm method", "overdose now"])) {
    categories.push({ category: "self_harm", severity: "high", score: 0.97 });
  }

  if (includesAny(text, ["erotik", "sexual explicit", "porno", "adult only body"])) {
    categories.push({ category: "sexual", severity: "medium", score: 0.78 });
  }

  const high = categories.filter((item) => item.severity === "high").length;
  const medium = categories.filter((item) => item.severity === "medium").length;
  const riskScore = Math.min(100, high * 45 + medium * 20);

  return {
    riskScore,
    categories,
    requiresHumanReview: high > 0 || medium > 0,
    blocked: high > 0
  };
}
