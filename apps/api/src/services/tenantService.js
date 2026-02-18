import {
  createTenant,
  ensureDefaultTenant,
  getTenantById,
  listTenants,
  updateTenantSettings
} from "../infra/tenantRepository.js";

export const PLAN_CONFIG = {
  free: {
    code: "free",
    monthlyUnits: 250,
    ratePerMinute: 30,
    overageEnabled: false,
    overageUnitPriceUsd: 0.002
  },
  pro: {
    code: "pro",
    monthlyUnits: 5000,
    ratePerMinute: 120,
    overageEnabled: true,
    overageUnitPriceUsd: 0.0016
  },
  business: {
    code: "business",
    monthlyUnits: 50000,
    ratePerMinute: 400,
    overageEnabled: true,
    overageUnitPriceUsd: 0.0012
  }
};

const DEFAULT_TENANT_ID = "t_default";

export function getDefaultTenantId() {
  return process.env.DEFAULT_TENANT_ID || DEFAULT_TENANT_ID;
}

export function resolveTenantIdFromRequest(req) {
  const raw = String(req.headers["x-tenant-id"] || "").trim();
  return raw || getDefaultTenantId();
}

export function getPlanConfig(planCode) {
  return PLAN_CONFIG[planCode] || PLAN_CONFIG.free;
}

export async function ensureTenantContext(tenantId) {
  await ensureDefaultTenant();
  const resolvedId = tenantId || getDefaultTenantId();
  const tenant = await getTenantById(resolvedId);
  if (!tenant) throw new Error("TENANT_NOT_FOUND");
  if (tenant.status !== "active") throw new Error("TENANT_INACTIVE");
  return tenant;
}

export async function getTenantList() {
  return listTenants();
}

export async function createTenantRecord(payload) {
  if (!PLAN_CONFIG[payload.planCode || "free"]) {
    throw new Error("INVALID_PLAN_CODE");
  }
  return createTenant(payload);
}

export async function patchTenantSettings(tenantId, patch) {
  if (patch.planCode && !PLAN_CONFIG[patch.planCode]) {
    throw new Error("INVALID_PLAN_CODE");
  }
  return updateTenantSettings(tenantId, patch);
}

function parsePositiveNumber(value, fallback) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) return fallback;
  return parsed;
}

export async function activateTrialForTenant(
  tenantId,
  { durationDays = 14, monthlyUnitsOverride = 3000, ratePerMinuteOverride = 120 } = {}
) {
  if (!tenantId) throw new Error("TENANT_ID_REQUIRED");
  const current = await getTenantById(tenantId);
  if (!current) return null;

  const now = new Date();
  const days = parsePositiveNumber(durationDays, 14);
  const trialEndsAt = new Date(now.getTime() + days * 24 * 60 * 60 * 1000);

  return updateTenantSettings(tenantId, {
    settings: {
      ...(current.settings || {}),
      billingMode: "trial",
      trialActive: true,
      trialStartedAt: now.toISOString(),
      trialEndsAt: trialEndsAt.toISOString(),
      trialDurationDays: days,
      monthlyUnitsOverride: parsePositiveNumber(monthlyUnitsOverride, 3000),
      ratePerMinuteOverride: parsePositiveNumber(ratePerMinuteOverride, 120)
    }
  });
}

export async function activateFreemiumForTenant(
  tenantId,
  { monthlyUnitsOverride = null, ratePerMinuteOverride = null } = {}
) {
  if (!tenantId) throw new Error("TENANT_ID_REQUIRED");
  const current = await getTenantById(tenantId);
  if (!current) return null;

  return updateTenantSettings(tenantId, {
    planCode: "free",
    settings: {
      ...(current.settings || {}),
      billingMode: "freemium",
      trialActive: false,
      trialEndedAt: new Date().toISOString(),
      monthlyUnitsOverride:
        monthlyUnitsOverride == null ? null : parsePositiveNumber(monthlyUnitsOverride, null),
      ratePerMinuteOverride:
        ratePerMinuteOverride == null ? null : parsePositiveNumber(ratePerMinuteOverride, null)
    }
  });
}
