function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max);
}

function toPercent(value) {
  return Number((clamp(value, 0, 1) * 100).toFixed(2));
}

export function evaluatePromptCompliance({ strategy, script, seo, media, publish }) {
  const checks = [
    {
      id: "strategy_fusion_available",
      weight: 0.2,
      ok: Boolean(strategy?.selectedTopic) && Array.isArray(strategy?.ranked)
    },
    {
      id: "script_duration_target",
      weight: 0.15,
      ok: Number(script?.estimatedDurationSec || 0) >= 30 && Number(script?.estimatedDurationSec || 0) <= 45
    },
    {
      id: "seo_generated",
      weight: 0.15,
      ok: Boolean(seo?.title) && Boolean(seo?.description)
    },
    {
      id: "media_generation_step",
      weight: 0.2,
      ok: Boolean(media) && (media.enabled === false || (Boolean(media.voice) && Boolean(media.visual)))
    },
    {
      id: "compliance_gate_applied",
      weight: 0.2,
      ok: ["pass", "review", "blocked"].includes(String(publish?.complianceStatus || ""))
    },
    {
      id: "publish_record_created",
      weight: 0.1,
      ok: Boolean(publish?.publishId)
    }
  ];

  const totalWeight = checks.reduce((sum, item) => sum + item.weight, 0);
  const gainedWeight = checks.reduce((sum, item) => sum + (item.ok ? item.weight : 0), 0);
  const normalized = totalWeight > 0 ? gainedWeight / totalWeight : 0;
  const scorePercent = toPercent(normalized);

  return {
    scorePercent,
    passedChecks: checks.filter((item) => item.ok).length,
    totalChecks: checks.length,
    checks: checks.map((item) => ({
      id: item.id,
      ok: item.ok,
      weight: item.weight
    }))
  };
}
