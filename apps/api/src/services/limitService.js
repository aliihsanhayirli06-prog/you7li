import { getUsageReport } from "./billingService.js";
import { getPlanConfig } from "./tenantService.js";

const inMemoryRateWindow = new Map();

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
