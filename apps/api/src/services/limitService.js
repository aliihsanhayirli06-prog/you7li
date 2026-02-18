import { PRICING, getUsageReport } from "./billingService.js";
import { getPlanConfig } from "./tenantService.js";

const inMemoryRateWindow = new Map();
const PROVIDER_ACTIONS = ["voice.generate", "video.generate"];
const PLAN_PROVIDER_BUDGET_USD = {
  free: 10,
  pro: 100,
  business: 1000
};

function getMonthStartIso(now = new Date()) {
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1, 0, 0, 0, 0)).toISOString();
}

function getMinuteBucket(now = Date.now()) {
  return Math.floor(now / 60000);
}

export async function checkQuota({ tenant, action }) {
  const plan = getPlanConfig(tenant.planCode);
  const quotaUnits = Number(tenant.settings?.monthlyUnitsOverride || plan.monthlyUnits);
  const report = await getUsageReport({
    tenantId: tenant.tenantId,
    from: getMonthStartIso(new Date()),
    to: new Date().toISOString(),
    limit: 5000
  });

  const usedUnits = Number(report.summary.totalUnits || 0);
  const nextUnits = Number((report.pricing?.[action]?.units || 0.1).toFixed(4));
  const projected = usedUnits + nextUnits;
  const within = projected <= quotaUnits;

  if (within || plan.overageEnabled) {
    return {
      ok: true,
      usage: {
        usedUnits,
        projectedUnits: Number(projected.toFixed(4)),
        quotaUnits,
        overage: !within
      }
    };
  }

  return {
    ok: false,
    reason: "QUOTA_EXCEEDED",
    usage: {
      usedUnits,
      projectedUnits: Number(projected.toFixed(4)),
      quotaUnits,
      overage: false
    }
  };
}

export function checkRateLimit({ tenant, action }) {
  const plan = getPlanConfig(tenant.planCode);
  const tenantRatePerMinute = Number(tenant.settings?.ratePerMinuteOverride || plan.ratePerMinute);
  const tenantId = tenant.tenantId;
  const key = `${tenantId}:${action}`;
  const currentMinute = getMinuteBucket();

  const current = inMemoryRateWindow.get(key) || { minute: currentMinute, count: 0 };
  const bucket = current.minute === currentMinute ? current : { minute: currentMinute, count: 0 };
  bucket.count += 1;
  inMemoryRateWindow.set(key, bucket);

  if (bucket.count > tenantRatePerMinute) {
    return {
      ok: false,
      reason: "RATE_LIMIT_EXCEEDED",
      limit: tenantRatePerMinute,
      current: bucket.count
    };
  }

  return {
    ok: true,
    limit: tenantRatePerMinute,
    current: bucket.count
  };
}

function isGuardrailEnabled() {
  const value = String(process.env.PROVIDER_COST_GUARDRAIL_ENABLED ?? "true").toLowerCase();
  return value !== "false" && value !== "0" && value !== "no";
}

function getProviderBudgetUsd(tenant, plan) {
  const override = Number(tenant.settings?.providerBudgetUsdOverride);
  if (Number.isFinite(override) && override >= 0) return override;
  return Number(PLAN_PROVIDER_BUDGET_USD[plan.code] || PLAN_PROVIDER_BUDGET_USD.free);
}

export async function checkProviderCostGuardrail({ tenant, actions = [] }) {
  const plan = getPlanConfig(tenant.planCode);
  const budgetUsd = getProviderBudgetUsd(tenant, plan);
  const evaluatedActions = Array.from(
    new Set((Array.isArray(actions) ? actions : []).filter((item) => PROVIDER_ACTIONS.includes(item)))
  );

  if (!isGuardrailEnabled() || !evaluatedActions.length) {
    return {
      ok: true,
      usage: {
        usedAmountUsd: 0,
        projectedAmountUsd: 0,
        budgetUsd,
        overage: false
      }
    };
  }

  const report = await getUsageReport({
    tenantId: tenant.tenantId,
    from: getMonthStartIso(new Date()),
    to: new Date().toISOString(),
    limit: 5000
  });

  const usedAmountUsd = Number(
    PROVIDER_ACTIONS.reduce(
      (sum, action) => sum + Number(report.summary.byAction?.[action]?.amountUsd || 0),
      0
    ).toFixed(4)
  );
  const nextAmountUsd = Number(
    evaluatedActions.reduce((sum, action) => sum + Number(PRICING[action]?.amountUsd || 0), 0).toFixed(4)
  );
  const projectedAmountUsd = Number((usedAmountUsd + nextAmountUsd).toFixed(4));
  const within = projectedAmountUsd <= budgetUsd;

  return {
    ok: within,
    reason: within ? null : "PROVIDER_COST_BUDGET_EXCEEDED",
    usage: {
      usedAmountUsd,
      nextAmountUsd,
      projectedAmountUsd,
      budgetUsd,
      overage: !within
    }
  };
}
