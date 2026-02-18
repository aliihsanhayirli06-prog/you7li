import crypto from "node:crypto";
import { listUsageEvents, saveUsageEvent } from "../infra/usageRepository.js";

export const PRICING = {
  "pipeline.run": { units: 1, amountUsd: 0.02 },
  "publish.create": { units: 1, amountUsd: 0.01 },
  "analytics.ingest": { units: 0.5, amountUsd: 0.004 },
  "youtube.analytics.sync": { units: 0.8, amountUsd: 0.006 },
  "optimize.run": { units: 1, amountUsd: 0.01 },
  "channel.create": { units: 0.2, amountUsd: 0.001 },
  "script.generate": { units: 0.3, amountUsd: 0.002 },
  "opportunity.score": { units: 0.2, amountUsd: 0.001 }
};

function normalizeNumber(value, fallback = 0) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function getPrice(action) {
  return PRICING[action] || { units: 0.1, amountUsd: 0.001 };
}

export async function recordUsage(action, context = {}) {
  const price = getPrice(action);
  const event = {
    eventId: `use_${crypto.randomUUID()}`,
    occurredAt: new Date().toISOString(),
    action,
    actorRole: context.actorRole || null,
    tenantId: context.tenantId || "t_default",
    channelId: context.channelId || null,
    publishId: context.publishId || null,
    units: normalizeNumber(context.units, price.units),
    amountUsd: normalizeNumber(context.amountUsd, price.amountUsd),
    metadata: context.metadata || {}
  };

  return saveUsageEvent(event);
}

function summarize(events) {
  const summary = {
    eventCount: events.length,
    totalUnits: 0,
    totalAmountUsd: 0,
    byAction: {}
  };

  for (const event of events) {
    summary.totalUnits += Number(event.units || 0);
    summary.totalAmountUsd += Number(event.amountUsd || 0);

    if (!summary.byAction[event.action]) {
      summary.byAction[event.action] = {
        eventCount: 0,
        units: 0,
        amountUsd: 0
      };
    }

    summary.byAction[event.action].eventCount += 1;
    summary.byAction[event.action].units += Number(event.units || 0);
    summary.byAction[event.action].amountUsd += Number(event.amountUsd || 0);
  }

  summary.totalUnits = Number(summary.totalUnits.toFixed(4));
  summary.totalAmountUsd = Number(summary.totalAmountUsd.toFixed(4));

  for (const action of Object.keys(summary.byAction)) {
    summary.byAction[action].units = Number(summary.byAction[action].units.toFixed(4));
    summary.byAction[action].amountUsd = Number(summary.byAction[action].amountUsd.toFixed(4));
  }

  return summary;
}

export async function getUsageReport({
  from = null,
  to = null,
  tenantId = null,
  channelId = null,
  limit = 200
} = {}) {
  const events = await listUsageEvents({ from, to, tenantId, channelId, limit });

  return {
    from,
    to,
    tenantId,
    channelId,
    pricing: PRICING,
    summary: summarize(events),
    events
  };
}

function getMonthBoundsIso(date = new Date()) {
  const from = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), 1, 0, 0, 0, 0));
  const to = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, 1, 0, 0, 0, 0));
  return { from: from.toISOString(), to: to.toISOString() };
}

export async function getMonthlyInvoice({
  tenantId,
  channelId = null,
  year = null,
  month = null
} = {}) {
  const current = new Date();
  const y = year != null && Number.isFinite(Number(year)) ? Number(year) : current.getUTCFullYear();
  const m =
    month != null && Number.isFinite(Number(month)) ? Number(month) : current.getUTCMonth() + 1;
  const anchor = new Date(Date.UTC(y, m - 1, 1, 0, 0, 0, 0));
  const bounds = getMonthBoundsIso(anchor);

  const usage = await getUsageReport({
    tenantId,
    channelId,
    from: bounds.from,
    to: bounds.to,
    limit: 5000
  });

  return {
    tenantId: tenantId || null,
    channelId,
    billingPeriod: {
      year: y,
      month: m,
      from: bounds.from,
      to: bounds.to
    },
    totals: usage.summary,
    lineItems: usage.summary.byAction
  };
}
