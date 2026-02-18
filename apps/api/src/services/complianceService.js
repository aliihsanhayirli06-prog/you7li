import { classifyPolicyRisk } from "./moderationService.js";

const DISCLAIMER_FINANCE = "Yatirim tavsiyesi degildir.";
const DISCLAIMER_HEALTH = "Saglik tavsiyesi degildir.";

function includesAny(text, patterns) {
  const normalized = String(text || "").toLowerCase();
  return patterns.some((pattern) => normalized.includes(pattern));
}

export function evaluateCompliance({ topic, script }) {
  const findings = [];
  const fullText = `${topic || ""} ${script || ""}`;

  if (!String(topic || "").trim() || !String(script || "").trim()) {
    throw new Error("TOPIC_AND_SCRIPT_REQUIRED");
  }

  if (includesAny(fullText, ["re-upload", "clip from", "stolen video"])) {
    findings.push({
      severity: "high",
      rule: "copyright",
      message: "Potential re-upload or third-party clip reference detected."
    });
  }

  if (
    includesAny(fullText, [
      "garanti kazanc",
      "kesin para",
      "100% garanti",
      "hemen zengin ol",
      "click now now now"
    ])
  ) {
    findings.push({
      severity: "high",
      rule: "misleading_claim",
      message: "Potential misleading or guaranteed outcome claim detected."
    });
  }

  const financeTopic = includesAny(topic, ["finans", "borsa", "yatirim", "kripto"]);
  const healthTopic = includesAny(topic, ["saglik", "diyet", "tedavi", "hastalik"]);

  if (financeTopic && !String(script).includes(DISCLAIMER_FINANCE)) {
    findings.push({
      severity: "medium",
      rule: "finance_disclaimer",
      message: `Finance content requires disclaimer: \"${DISCLAIMER_FINANCE}\"`
    });
  }

  if (healthTopic && !String(script).includes(DISCLAIMER_HEALTH)) {
    findings.push({
      severity: "medium",
      rule: "health_disclaimer",
      message: `Health content requires disclaimer: \"${DISCLAIMER_HEALTH}\"`
    });
  }

  const policyRisk = classifyPolicyRisk({ topic, script });
  for (const category of policyRisk.categories) {
    findings.push({
      severity: category.severity,
      rule: `policy_${category.category}`,
      message: `Policy classifier flagged category: ${category.category}`
    });
  }

  const highCount = findings.filter((item) => item.severity === "high").length;
  const mediumCount = findings.filter((item) => item.severity === "medium").length;
  const riskScore = Math.min(100, highCount * 45 + mediumCount * 20);

  let status = "pass";
  if (highCount > 0) {
    status = "blocked";
  } else if (mediumCount > 0) {
    status = "review";
  }

  return {
    status,
    riskScore,
    findings,
    policy: policyRisk,
    checkedAt: new Date().toISOString()
  };
}
