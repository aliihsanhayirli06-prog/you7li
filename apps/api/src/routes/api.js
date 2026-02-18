import { readJsonBody, sendJson } from "../utils/http.js";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { scoreOpportunity } from "../services/opportunityService.js";
import { generateScript } from "../services/scriptService.js";
import { createDraftPublish, getPublish, listPublishes } from "../services/publishService.js";
import { runPipeline } from "../services/pipelineService.js";
import { shouldUsePostgres } from "../infra/db.js";
import { shouldUseRedis } from "../infra/redisClient.js";
import {
  enqueue,
  getBackpressurePolicy,
  getDlqSize,
  getQueueSize,
  listDlq
} from "../infra/queueClient.js";
import { getHistory, logHistory, subscribeHistoryEvents } from "../services/historyService.js";
import { evaluateCompliance } from "../services/complianceService.js";
import {
  getAnalyticsReport,
  ingestAnalytics,
  syncAnalyticsFromYouTube
} from "../services/analyticsService.js";
import { predictPerformance } from "../services/performancePredictService.js";
import { recommendCostAwarePlan } from "../services/costAwareOptimizationService.js";
import { updatePublishOptimization } from "../infra/publishRepository.js";
import { authorize } from "../utils/auth.js";
import { snapshot } from "../infra/metricsStore.js";
import { fetchYouTubeVideoStats } from "../services/youtubeIntegrationService.js";
import { addChannel, getChannelsByTenant } from "../services/channelService.js";
import { getMonthlyInvoice, getUsageReport, recordUsage } from "../services/billingService.js";
import {
  activateFreemiumForTenant,
  activateTrialForTenant,
  createTenantRecord,
  ensureTenantContext,
  getTenantList,
  patchTenantSettings
} from "../services/tenantService.js";
import { checkQuota, checkRateLimit } from "../services/limitService.js";
import { getChannelById } from "../infra/channelRepository.js";
import { decideReview, getReviewQueue } from "../services/reviewService.js";
import { getAuditTrail, verifyAuditTrail } from "../services/auditService.js";
import {
  applyRetentionPolicy,
  erasePublishData,
  runBackupDrill
} from "../services/dataGovernanceService.js";
import {
  getMultiRegionDrStatus,
  runMultiRegionDrill
} from "../services/disasterRecoveryService.js";
import { getAutoscalePlan } from "../services/autoscaleService.js";
import { getSloReport } from "../services/sloService.js";
import {
  getDeployStrategyState,
  switchActiveColor,
  updateCanaryRollout
} from "../services/deployStrategyService.js";
import { cacheStats, invalidateCache } from "../infra/cacheStore.js";
import { getQueryProfileSnapshot } from "../infra/queryProfiler.js";
import { getCircuitBreakerPolicy, getCircuitBreakerSnapshot } from "../infra/circuitBreakerStore.js";
import {
  createWebhook,
  dispatchWebhookEvent,
  listWebhooks,
  removeWebhook
} from "../services/webhookService.js";
import { invokePluginHook, listPlugins, registerPlugin } from "../services/pluginService.js";
import { addConnector, listConnectors, syncConnectors } from "../services/connectorService.js";
import { createApiKey, listApiKeys, revokeApiKey } from "../services/apiKeyService.js";
import { ssoLogin } from "../services/ssoService.js";
import {
  createReportSchedule,
  listReportSchedules,
  toCsv,
  toPdfBuffer,
  validateReportDataset,
  validateReportFormat
} from "../services/reportService.js";
import { addAssetVersion, listAssets } from "../services/assetLibraryService.js";
import { getFeatureStoreSnapshot } from "../services/featureStoreService.js";
import {
  assignVariant,
  createExperiment,
  getExperimentReport,
  listExperiments,
  recordGuardrailMetric
} from "../services/experimentService.js";
import {
  listMarketplacePlugins,
  listPartnerApplications,
  submitPartnerApplication
} from "../services/marketplaceService.js";
import {
  createSupportIncident,
  getSlaTiers,
  getSoc2ReadinessPack,
  listSupportIncidents
} from "../services/enterpriseService.js";

function badRequest(res, message) {
  sendJson(res, 400, { error: message });
}

function isBackpressureError(error) {
  return error?.message === "QUEUE_BACKPRESSURE_REJECTED";
}

function isCircuitOpenError(error) {
  return String(error?.message || "").startsWith("CIRCUIT_OPEN:");
}

function slugify(value, fallback = "item") {
  const normalized = String(value || "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
  return normalized || fallback;
}

async function enforceCommercialLimits(req, res, action) {
  const tenant = await ensureTenantContext(req.tenantId);

  const rate = checkRateLimit({
    tenant,
    action
  });
  if (!rate.ok) {
    sendJson(res, 429, {
      error: "rate limit exceeded",
      tenantId: tenant.tenantId,
      action,
      limit: rate.limit
    });
    return null;
  }

  const quota = await checkQuota({ tenant, action });
  if (!quota.ok) {
    sendJson(res, 402, {
      error: "quota exceeded",
      tenantId: tenant.tenantId,
      action,
      usage: quota.usage
    });
    return null;
  }

  return { tenant, usage: quota.usage };
}

async function assertPublishTenantAccess(res, publishId, tenantId) {
  const publish = await getPublish(publishId);
  if (!publish) {
    sendJson(res, 404, { error: "publish not found" });
    return null;
  }

  const channel = await getChannelById(publish.channelId || "ch_default", tenantId);
  if (!channel) {
    sendJson(res, 404, { error: "publish not found" });
    return null;
  }

  return publish;
}

async function ensureTenantOrReject(req, res) {
  try {
    return await ensureTenantContext(req.tenantId);
  } catch (error) {
    if (error.message === "TENANT_NOT_FOUND") {
      sendJson(res, 404, { error: "tenant not found" });
      return null;
    }
    if (error.message === "TENANT_INACTIVE") {
      sendJson(res, 403, { error: "tenant inactive" });
      return null;
    }
    throw error;
  }
}

export async function handleApi(req, res) {
  const { method } = req;
  const parsedUrl = new URL(req.url || "/", "http://localhost");
  const pathname = parsedUrl.pathname;

  if (
    method === "GET" &&
    (pathname === "/app/dashboard" ||
      pathname === "/app/ops" ||
      pathname === "/app/integrations" ||
      pathname === "/app/security")
  ) {
    const html = await readFile(path.resolve("apps/web/dashboard.html"), "utf8");
    res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
    res.end(html);
    return;
  }

  if (method === "GET" && pathname === "/app/dashboard.css") {
    const css = await readFile(path.resolve("apps/web/dashboard.css"), "utf8");
    res.writeHead(200, { "Content-Type": "text/css; charset=utf-8" });
    res.end(css);
    return;
  }

  if (method === "GET" && pathname === "/app/dashboard.js") {
    const js = await readFile(path.resolve("apps/web/dashboard.js"), "utf8");
    res.writeHead(200, { "Content-Type": "application/javascript; charset=utf-8" });
    res.end(js);
    return;
  }

  if (method === "GET" && pathname === "/status") {
    const html = await readFile(path.resolve("apps/web/status.html"), "utf8");
    res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
    res.end(html);
    return;
  }

  if (method === "GET" && pathname === "/status.js") {
    const js = await readFile(path.resolve("apps/web/status.js"), "utf8");
    res.writeHead(200, { "Content-Type": "application/javascript; charset=utf-8" });
    res.end(js);
    return;
  }

  if (method === "GET" && pathname === "/developer/portal") {
    const html = await readFile(path.resolve("apps/web/developer-portal.html"), "utf8");
    res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
    res.end(html);
    return;
  }

  if (method === "GET" && pathname === "/api/v1/openapi") {
    if (!authorize(req, res, ["admin", "editor"])) return;
    const yaml = await readFile(path.resolve("docs/api/openapi.yaml"), "utf8");
    res.writeHead(200, { "Content-Type": "application/yaml; charset=utf-8" });
    res.end(yaml);
    return;
  }

  if (method === "GET" && pathname === "/health") {
    const queueSize = await getQueueSize();
    const dlqSize = await getDlqSize();
    return sendJson(res, 200, {
      ok: true,
      service: "you7li-api",
      storage: shouldUsePostgres() ? "postgres" : "file",
      queue: shouldUseRedis() ? "redis" : "file",
      queueSize,
      dlqSize
    });
  }

  if (method === "GET" && pathname === "/api/v1/publish") {
    if (!authorize(req, res, ["admin", "editor"])) return;
    if (!(await ensureTenantOrReject(req, res))) return;
    const channels = await getChannelsByTenant(req.tenantId);
    const items = await listPublishes({
      channelIds: channels.map((item) => item.channelId)
    });
    return sendJson(res, 200, { items });
  }

  if (method === "GET" && pathname === "/api/v1/auth/me") {
    if (!authorize(req, res, ["admin", "editor"])) return;
    return sendJson(res, 200, {
      role: req.userRole || "admin",
      tenantId: req.tenantId || "t_default",
      authSource: req.authSource || "local"
    });
  }

  if (method === "GET" && pathname === "/api/v1/channels") {
    if (!authorize(req, res, ["admin", "editor"])) return;
    if (!(await ensureTenantOrReject(req, res))) return;
    const items = await getChannelsByTenant(req.tenantId);
    return sendJson(res, 200, { items });
  }

  if (method === "GET" && pathname === "/api/v1/compliance/report") {
    if (!authorize(req, res, ["admin", "editor"])) return;
    if (!(await ensureTenantOrReject(req, res))) return;
    const publishId = parsedUrl.searchParams.get("publishId");
    if (!publishId) return badRequest(res, "publishId required");

    const publish = await assertPublishTenantAccess(res, publishId, req.tenantId);
    if (!publish) return;

    return sendJson(res, 200, {
      publishId: publish.publishId,
      complianceStatus: publish.complianceStatus,
      complianceRiskScore: publish.complianceRiskScore,
      complianceReport: publish.complianceReport
    });
  }

  if (method === "GET" && pathname === "/api/v1/history") {
    if (!authorize(req, res, ["admin", "editor"])) return;
    if (!(await ensureTenantOrReject(req, res))) return;
    const limit = Number(parsedUrl.searchParams.get("limit") || "100");
    const publishId = parsedUrl.searchParams.get("publishId");
    const items = await getHistory({
      limit: Number.isFinite(limit) ? Math.min(Math.max(limit, 1), 500) : 100,
      publishId,
      tenantId: req.tenantId
    });
    return sendJson(res, 200, { items });
  }

  if (method === "GET" && pathname === "/api/v1/history/stream") {
    if (!authorize(req, res, ["admin", "editor"])) return;
    if (!(await ensureTenantOrReject(req, res))) return;

    const publishId = parsedUrl.searchParams.get("publishId");

    res.writeHead(200, {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive"
    });
    res.write("event: ready\ndata: {}\n\n");

    const unsubscribe = subscribeHistoryEvents((event) => {
      if (!event) return;
      const eventTenant = String(event.tenantId || "t_default");
      if (eventTenant !== String(req.tenantId || "t_default")) return;
      if (publishId && String(event.publishId || "") !== String(publishId)) return;
      res.write(`event: history\ndata: ${JSON.stringify(event)}\n\n`);
    });

    const heartbeat = setInterval(() => {
      res.write("event: ping\ndata: {}\n\n");
    }, 15000);

    const closeStream = () => {
      clearInterval(heartbeat);
      unsubscribe();
      if (!res.writableEnded) res.end();
    };

    req.on("close", closeStream);
    res.on("close", closeStream);
    return;
  }

  if (method === "GET" && pathname === "/api/v1/analytics/report") {
    if (!authorize(req, res, ["admin", "editor"])) return;
    if (!(await ensureTenantOrReject(req, res))) return;
    const publishId = parsedUrl.searchParams.get("publishId");
    if (!publishId) return badRequest(res, "publishId required");

    try {
      const publish = await assertPublishTenantAccess(res, publishId, req.tenantId);
      if (!publish) return;
      const report = await getAnalyticsReport(publishId);
      return sendJson(res, 200, report);
    } catch (error) {
      if (error.message === "PUBLISH_NOT_FOUND")
        return sendJson(res, 404, { error: "publish not found" });
      if (error.message === "PUBLISH_ID_REQUIRED") return badRequest(res, "publishId required");
      return sendJson(res, 500, { error: "internal error" });
    }
  }

  if (method === "GET" && pathname === "/api/v1/analytics/feature-store") {
    if (!authorize(req, res, ["admin", "editor"])) return;
    if (!(await ensureTenantOrReject(req, res))) return;
    const snapshot = await getFeatureStoreSnapshot(req.tenantId);
    return sendJson(res, 200, snapshot);
  }

  if (method === "GET" && pathname === "/api/v1/experiments") {
    if (!authorize(req, res, ["admin", "editor"])) return;
    if (!(await ensureTenantOrReject(req, res))) return;
    const items = await listExperiments(req.tenantId);
    return sendJson(res, 200, { items });
  }

  if (method === "POST" && pathname === "/api/v1/experiments") {
    if (!authorize(req, res, ["admin"])) return;
    if (!(await ensureTenantOrReject(req, res))) return;
    try {
      const body = await readJsonBody(req);
      const created = await createExperiment({
        tenantId: req.tenantId,
        name: body.name,
        targetMetric: body.targetMetric || "ctr",
        variants: Array.isArray(body.variants) ? body.variants : [],
        guardrails: body.guardrails || {}
      });
      return sendJson(res, 201, created);
    } catch (error) {
      if (error.message === "INVALID_JSON") return badRequest(res, "invalid json");
      if (error.message === "EXPERIMENT_NAME_REQUIRED") return badRequest(res, "name required");
      if (error.message === "AT_LEAST_TWO_VARIANTS_REQUIRED")
        return badRequest(res, "at least two variants required");
      return sendJson(res, 500, { error: "internal error" });
    }
  }

  if (method === "POST" && pathname === "/api/v1/experiments/assign") {
    if (!authorize(req, res, ["admin", "editor"])) return;
    if (!(await ensureTenantOrReject(req, res))) return;
    try {
      const body = await readJsonBody(req);
      const assignment = await assignVariant({
        tenantId: req.tenantId,
        experimentId: body.experimentId,
        publishId: body.publishId || null,
        subjectId: body.subjectId || null
      });
      return sendJson(res, 200, assignment);
    } catch (error) {
      if (error.message === "INVALID_JSON") return badRequest(res, "invalid json");
      if (error.message === "SUBJECT_REQUIRED") return badRequest(res, "publishId or subjectId required");
      if (error.message === "EXPERIMENT_NOT_FOUND")
        return sendJson(res, 404, { error: "experiment not found" });
      if (error.message === "EXPERIMENT_NOT_ACTIVE")
        return sendJson(res, 409, { error: "experiment not active" });
      return sendJson(res, 500, { error: "internal error" });
    }
  }

  if (method === "POST" && pathname === "/api/v1/experiments/metrics") {
    if (!authorize(req, res, ["admin", "editor"])) return;
    if (!(await ensureTenantOrReject(req, res))) return;
    try {
      const body = await readJsonBody(req);
      const event = await recordGuardrailMetric({
        tenantId: req.tenantId,
        experimentId: body.experimentId,
        variantKey: body.variantKey,
        publishId: body.publishId || null,
        metricsCtr: body.metricsCtr,
        metricsRetention3s: body.metricsRetention3s,
        metricsCompletionRate: body.metricsCompletionRate,
        errorRate: body.errorRate
      });
      return sendJson(res, 201, event);
    } catch (error) {
      if (error.message === "INVALID_JSON") return badRequest(res, "invalid json");
      if (error.message === "EXPERIMENT_NOT_FOUND")
        return sendJson(res, 404, { error: "experiment not found" });
      if (error.message === "VARIANT_NOT_FOUND") return sendJson(res, 404, { error: "variant not found" });
      return sendJson(res, 500, { error: "internal error" });
    }
  }

  if (method === "GET" && pathname === "/api/v1/experiments/report") {
    if (!authorize(req, res, ["admin", "editor"])) return;
    if (!(await ensureTenantOrReject(req, res))) return;
    const experimentId = parsedUrl.searchParams.get("experimentId");
    if (!experimentId) return badRequest(res, "experimentId required");
    try {
      const report = await getExperimentReport({
        tenantId: req.tenantId,
        experimentId
      });
      return sendJson(res, 200, report);
    } catch (error) {
      if (error.message === "EXPERIMENT_NOT_FOUND")
        return sendJson(res, 404, { error: "experiment not found" });
      return sendJson(res, 500, { error: "internal error" });
    }
  }

  if (method === "GET" && pathname === "/api/v1/marketplace/plugins") {
    if (!authorize(req, res, ["admin", "editor"])) return;
    if (!(await ensureTenantOrReject(req, res))) return;
    const items = await listMarketplacePlugins();
    return sendJson(res, 200, { items });
  }

  if (method === "GET" && pathname === "/api/v1/marketplace/partners/applications") {
    if (!authorize(req, res, ["admin", "editor"])) return;
    if (!(await ensureTenantOrReject(req, res))) return;
    const items = await listPartnerApplications(req.tenantId);
    return sendJson(res, 200, { items });
  }

  if (method === "GET" && pathname === "/api/v1/enterprise/compliance-pack") {
    if (!authorize(req, res, ["admin"])) return;
    if (!(await ensureTenantOrReject(req, res))) return;
    return sendJson(res, 200, getSoc2ReadinessPack());
  }

  if (method === "GET" && pathname === "/api/v1/enterprise/sla-tiers") {
    if (!authorize(req, res, ["admin", "editor"])) return;
    if (!(await ensureTenantOrReject(req, res))) return;
    return sendJson(res, 200, getSlaTiers());
  }

  if (method === "GET" && pathname === "/api/v1/enterprise/support/incidents") {
    if (!authorize(req, res, ["admin", "editor"])) return;
    if (!(await ensureTenantOrReject(req, res))) return;
    const items = await listSupportIncidents(req.tenantId);
    return sendJson(res, 200, { items });
  }

  if (method === "POST" && pathname === "/api/v1/enterprise/support/incidents") {
    if (!authorize(req, res, ["admin", "editor"])) return;
    if (!(await ensureTenantOrReject(req, res))) return;
    try {
      const body = await readJsonBody(req);
      const created = await createSupportIncident({
        tenantId: req.tenantId,
        severity: body.severity || "sev3",
        title: body.title,
        description: body.description || "",
        slaTier: body.slaTier || "standard"
      });
      return sendJson(res, 201, created);
    } catch (error) {
      if (error.message === "INVALID_JSON") return badRequest(res, "invalid json");
      if (error.message === "TITLE_REQUIRED") return badRequest(res, "title required");
      return sendJson(res, 500, { error: "internal error" });
    }
  }

  if (method === "POST" && pathname === "/api/v1/marketplace/partners/apply") {
    if (!authorize(req, res, ["admin", "editor"])) return;
    if (!(await ensureTenantOrReject(req, res))) return;
    try {
      const body = await readJsonBody(req);
      const created = await submitPartnerApplication({
        tenantId: req.tenantId,
        companyName: body.companyName,
        contactEmail: body.contactEmail,
        useCase: body.useCase,
        targetPluginCode: body.targetPluginCode || null
      });
      return sendJson(res, 201, created);
    } catch (error) {
      if (error.message === "INVALID_JSON") return badRequest(res, "invalid json");
      if (error.message === "COMPANY_NAME_REQUIRED") return badRequest(res, "companyName required");
      if (error.message === "INVALID_EMAIL") return badRequest(res, "invalid email");
      if (error.message === "USE_CASE_REQUIRED") return badRequest(res, "useCase required");
      if (error.message === "INVALID_PLUGIN_CODE") return badRequest(res, "invalid targetPluginCode");
      return sendJson(res, 500, { error: "internal error" });
    }
  }

  if (method === "GET" && pathname === "/api/v1/billing/usage") {
    if (!authorize(req, res, ["admin", "editor"])) return;
    if (!(await ensureTenantOrReject(req, res))) return;
    const days = Number(parsedUrl.searchParams.get("days") || "30");
    const channelId = parsedUrl.searchParams.get("channelId");
    const limit = Number(parsedUrl.searchParams.get("limit") || "200");

    const fromDate = new Date(Date.now() - Math.max(1, days) * 24 * 60 * 60 * 1000).toISOString();
    const report = await getUsageReport({
      from: fromDate,
      to: new Date().toISOString(),
      tenantId: req.tenantId,
      channelId: channelId || null,
      limit: Number.isFinite(limit) ? Math.min(Math.max(limit, 1), 1000) : 200
    });
    return sendJson(res, 200, report);
  }

  if (method === "GET" && pathname === "/api/v1/billing/invoice") {
    if (!authorize(req, res, ["admin", "editor"])) return;
    if (!(await ensureTenantOrReject(req, res))) return;
    const year = Number(parsedUrl.searchParams.get("year") || "");
    const month = Number(parsedUrl.searchParams.get("month") || "");
    const channelId = parsedUrl.searchParams.get("channelId");
    const invoice = await getMonthlyInvoice({
      tenantId: req.tenantId,
      channelId: channelId || null,
      year: Number.isFinite(year) && year > 0 ? year : null,
      month: Number.isFinite(month) && month >= 1 && month <= 12 ? month : null
    });
    return sendJson(res, 200, invoice);
  }

  if (method === "GET" && pathname === "/api/v1/reports/export") {
    if (!authorize(req, res, ["admin", "editor"])) return;
    const tenant = await ensureTenantOrReject(req, res);
    if (!tenant) return;

    const dataset = String(parsedUrl.searchParams.get("dataset") || "history").toLowerCase();
    const format = String(parsedUrl.searchParams.get("format") || "json").toLowerCase();
    const limit = Number(parsedUrl.searchParams.get("limit") || "200");
    const safeLimit = Number.isFinite(limit) ? Math.min(Math.max(limit, 1), 2000) : 200;

    if (!validateReportDataset(dataset)) return badRequest(res, "invalid dataset");
    if (!validateReportFormat(format)) return badRequest(res, "invalid format");

    const channels = await getChannelsByTenant(req.tenantId);
    const channelIds = new Set(channels.map((item) => item.channelId));

    let items = [];
    if (dataset === "history") {
      items = await getHistory({ tenantId: req.tenantId, limit: safeLimit });
    } else if (dataset === "publish") {
      items = (await listPublishes()).filter((item) => channelIds.has(item.channelId)).slice(0, safeLimit);
    } else if (dataset === "usage") {
      const usage = await getUsageReport({ tenantId: req.tenantId, limit: safeLimit });
      items = usage.events || [];
    } else if (dataset === "audit") {
      items = await getAuditTrail({ tenantId: req.tenantId, limit: safeLimit });
    }

    if (format === "json") {
      return sendJson(res, 200, {
        tenantId: tenant.tenantId,
        dataset,
        format,
        generatedAt: new Date().toISOString(),
        count: items.length,
        items
      });
    }

    if (format === "csv") {
      const csv = toCsv(items);
      res.writeHead(200, {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename=\"${dataset}-report.csv\"`
      });
      res.end(csv);
      return;
    }

    const pdf = toPdfBuffer({ title: `${dataset} report`, items });
    res.writeHead(200, {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename=\"${dataset}-report.pdf\"`
    });
    res.end(pdf);
    return;
  }

  if (method === "GET" && pathname === "/api/v1/reports/schedules") {
    if (!authorize(req, res, ["admin", "editor"])) return;
    if (!(await ensureTenantOrReject(req, res))) return;
    const items = await listReportSchedules(req.tenantId);
    return sendJson(res, 200, { items });
  }

  if (method === "POST" && pathname === "/api/v1/reports/schedules") {
    if (!authorize(req, res, ["admin"])) return;
    if (!(await ensureTenantOrReject(req, res))) return;
    try {
      const body = await readJsonBody(req);
      const created = await createReportSchedule({
        tenantId: req.tenantId,
        email: body.email,
        dataset: body.dataset,
        format: body.format || "csv",
        cadence: body.cadence || "weekly",
        timezone: body.timezone || "Europe/Istanbul"
      });
      return sendJson(res, 201, {
        schedule: created,
        delivery: {
          mode: "simulated_email",
          status: "scheduled"
        }
      });
    } catch (error) {
      if (error.message === "INVALID_JSON") return badRequest(res, "invalid json");
      if (error.message === "INVALID_EMAIL") return badRequest(res, "invalid email");
      if (error.message === "INVALID_DATASET") return badRequest(res, "invalid dataset");
      if (error.message === "INVALID_FORMAT") return badRequest(res, "invalid format");
      if (error.message === "INVALID_CADENCE") return badRequest(res, "invalid cadence");
      return sendJson(res, 500, { error: "internal error" });
    }
  }

  if (method === "POST" && pathname === "/api/v1/billing/activation") {
    if (!authorize(req, res, ["admin"])) return;
    try {
      const body = await readJsonBody(req);
      const mode = String(body.mode || "").trim().toLowerCase();
      const targetTenantId = String(body.tenantId || req.tenantId || "").trim() || "t_default";

      let updated = null;
      if (mode === "trial") {
        updated = await activateTrialForTenant(targetTenantId, {
          durationDays: body.durationDays,
          monthlyUnitsOverride: body.monthlyUnitsOverride,
          ratePerMinuteOverride: body.ratePerMinuteOverride
        });
      } else if (mode === "freemium") {
        updated = await activateFreemiumForTenant(targetTenantId, {
          monthlyUnitsOverride: body.monthlyUnitsOverride,
          ratePerMinuteOverride: body.ratePerMinuteOverride
        });
      } else {
        return badRequest(res, "mode must be trial or freemium");
      }

      if (!updated) return sendJson(res, 404, { error: "tenant not found" });
      return sendJson(res, 200, {
        tenant: updated,
        activation: {
          mode,
          activatedAt: new Date().toISOString()
        }
      });
    } catch (error) {
      if (error.message === "INVALID_JSON") return badRequest(res, "invalid json");
      if (error.message === "TENANT_ID_REQUIRED") return badRequest(res, "tenantId required");
      return sendJson(res, 500, { error: "internal error" });
    }
  }

  if (method === "GET" && pathname === "/api/v1/tenants") {
    if (!authorize(req, res, ["admin"])) return;
    const items = await getTenantList();
    return sendJson(res, 200, { items });
  }

  if (method === "GET" && pathname === "/api/v1/tenants/me") {
    if (!authorize(req, res, ["admin", "editor"])) return;
    const tenant = await ensureTenantOrReject(req, res);
    if (!tenant) return;
    return sendJson(res, 200, tenant);
  }

  if (method === "GET" && pathname === "/api/v1/onboarding/status") {
    if (!authorize(req, res, ["admin", "editor"])) return;
    const tenant = await ensureTenantOrReject(req, res);
    if (!tenant) return;

    const [channels, publishes, webhooks, connectors, plugins] = await Promise.all([
      getChannelsByTenant(req.tenantId),
      listPublishes(),
      listWebhooks(req.tenantId),
      listConnectors(req.tenantId),
      listPlugins(req.tenantId)
    ]);

    const channelIds = new Set(channels.map((item) => item.channelId));
    const tenantPublishes = publishes.filter((item) => channelIds.has(item.channelId));

    const completedMap = {
      tenant_profile: Boolean(tenant.name) && Boolean(tenant.settings?.ownerEmail),
      channel_connected: channels.length > 0,
      first_publish_created: tenantPublishes.length > 0,
      first_publish_completed: tenantPublishes.some((item) => item.status === "published"),
      integrations_connected: webhooks.length + connectors.length + plugins.length > 0
    };

    const steps = [
      {
        key: "tenant_profile",
        label: "Tenant profile",
        done: completedMap.tenant_profile,
        hint: "Tenant adini ve owner email bilgisini tamamla."
      },
      {
        key: "channel_connected",
        label: "Channel baglantisi",
        done: completedMap.channel_connected,
        hint: "Ilk YouTube kanalini bagla."
      },
      {
        key: "first_publish_created",
        label: "Ilk publish olustur",
        done: completedMap.first_publish_created,
        hint: "Pipeline veya publish/create ile ilk kaydi olustur."
      },
      {
        key: "first_publish_completed",
        label: "Ilk publish tamamlandi",
        done: completedMap.first_publish_completed,
        hint: "Render + publish islemi tamamlanmis en az bir kayit olustur."
      },
      {
        key: "integrations_connected",
        label: "Integrations bagli",
        done: completedMap.integrations_connected,
        hint: "Webhook, connector veya plugin baglantisi ekle."
      }
    ];

    const completedSteps = steps.filter((item) => item.done).map((item) => item.key);
    const nextStep = steps.find((item) => !item.done)?.key || null;
    const isCompleted = steps.every((item) => item.done);

    return sendJson(res, 200, {
      tenantId: req.tenantId,
      onboardingStatus: isCompleted ? "completed" : "in_progress",
      emptyState: {
        hasPublish: tenantPublishes.length > 0,
        hasChannel: channels.length > 0,
        showGuidedSetup: !isCompleted || tenantPublishes.length === 0
      },
      summary: {
        channels: channels.length,
        publishes: tenantPublishes.length,
        published: tenantPublishes.filter((item) => item.status === "published").length,
        integrations: {
          webhooks: webhooks.length,
          connectors: connectors.length,
          plugins: plugins.length
        }
      },
      steps,
      completedSteps,
      nextStep
    });
  }

  if (method === "GET" && pathname === "/api/v1/ops/metrics") {
    if (!authorize(req, res, ["admin"])) return;
    const queueSize = await getQueueSize();
    const dlqSize = await getDlqSize();
    return sendJson(res, 200, snapshot({ queueSize, dlqSize }));
  }

  if (method === "GET" && pathname === "/api/v1/ops/status") {
    if (!authorize(req, res, ["admin"])) return;
    const queueSize = await getQueueSize();
    const dlqSize = await getDlqSize();
    const metrics = snapshot({ queueSize, dlqSize });
    const slo = await getSloReport();
    const deployStrategy = await getDeployStrategyState();

    return sendJson(res, 200, {
      status: slo.slo.status === "healthy" ? "operational" : "degraded",
      service: "you7li-api",
      deployMarker: process.env.DEPLOY_MARKER || "dev-local",
      deployedAt: process.env.DEPLOYED_AT || null,
      deployStrategy,
      queueSize,
      dlqSize,
      errorRate: slo.slo.errorRate,
      httpP95Ms: slo.slo.httpP95Ms,
      counters: metrics.counters,
      generatedAt: new Date().toISOString()
    });
  }

  if (method === "GET" && pathname === "/api/v1/ops/deploy/strategy") {
    if (!authorize(req, res, ["admin"])) return;
    const state = await getDeployStrategyState();
    return sendJson(res, 200, state);
  }

  if (method === "POST" && pathname === "/api/v1/ops/deploy/canary") {
    if (!authorize(req, res, ["admin"])) return;
    try {
      const body = await readJsonBody(req);
      const state = await updateCanaryRollout(body.percent);
      return sendJson(res, 200, state);
    } catch (error) {
      if (error.message === "INVALID_JSON") return badRequest(res, "invalid json");
      if (error.message === "INVALID_CANARY_PERCENT")
        return badRequest(res, "percent must be between 0 and 100");
      return sendJson(res, 500, { error: "internal error" });
    }
  }

  if (method === "POST" && pathname === "/api/v1/ops/deploy/switch") {
    if (!authorize(req, res, ["admin"])) return;
    try {
      const body = await readJsonBody(req);
      const targetColor = body?.targetColor || null;
      const state = await switchActiveColor(targetColor);
      return sendJson(res, 200, state);
    } catch (error) {
      if (error.message === "INVALID_JSON") return badRequest(res, "invalid json");
      return sendJson(res, 500, { error: "internal error" });
    }
  }

  if (method === "GET" && pathname === "/api/v1/ops/autoscale") {
    if (!authorize(req, res, ["admin"])) return;
    const plan = await getAutoscalePlan();
    return sendJson(res, 200, plan);
  }

  if (method === "GET" && pathname === "/api/v1/ops/slo") {
    if (!authorize(req, res, ["admin"])) return;
    const report = await getSloReport();
    return sendJson(res, 200, report);
  }

  if (method === "GET" && pathname === "/api/v1/ops/capacity-plan") {
    if (!authorize(req, res, ["admin"])) return;
    const [autoscale, slo] = await Promise.all([getAutoscalePlan(), getSloReport()]);
    return sendJson(res, 200, {
      autoscale,
      sloStatus: slo.slo.status,
      capacity: slo.capacity,
      generatedAt: new Date().toISOString()
    });
  }

  if (method === "GET" && pathname === "/api/v1/ops/db/profile") {
    if (!authorize(req, res, ["admin"])) return;
    return sendJson(res, 200, getQueryProfileSnapshot());
  }

  if (method === "GET" && pathname === "/api/v1/ops/cache") {
    if (!authorize(req, res, ["admin"])) return;
    return sendJson(res, 200, cacheStats());
  }

  if (method === "POST" && pathname === "/api/v1/ops/cache/invalidate") {
    if (!authorize(req, res, ["admin"])) return;
    try {
      const body = await readJsonBody(req);
      const cleared = invalidateCache(String(body.prefix || ""));
      return sendJson(res, 200, { cleared });
    } catch (error) {
      if (error.message === "INVALID_JSON") return badRequest(res, "invalid json");
      return sendJson(res, 500, { error: "internal error" });
    }
  }

  if (method === "GET" && pathname === "/api/v1/ops/dlq") {
    if (!authorize(req, res, ["admin"])) return;
    const limit = Number(parsedUrl.searchParams.get("limit") || "20");
    const items = await listDlq(Number.isFinite(limit) ? Math.min(Math.max(limit, 1), 500) : 20);
    return sendJson(res, 200, { items });
  }

  if (method === "GET" && pathname === "/api/v1/ops/reliability/policy") {
    if (!authorize(req, res, ["admin"])) return;
    const queueSize = await getQueueSize();
    const dlqSize = await getDlqSize();
    return sendJson(res, 200, {
      backpressure: getBackpressurePolicy(),
      circuitBreaker: {
        ...getCircuitBreakerPolicy(),
        circuits: getCircuitBreakerSnapshot()
      },
      queueSize,
      dlqSize,
      generatedAt: new Date().toISOString()
    });
  }

  if (method === "GET" && pathname === "/api/v1/ops/runbook") {
    if (!authorize(req, res, ["admin"])) return;
    const markdown = await readFile(path.resolve("docs/ops/incident-runbook.md"), "utf8");
    return sendJson(res, 200, {
      title: "Incident Runbook",
      markdown
    });
  }

  if (method === "POST" && pathname === "/api/v1/ops/postmortem/export") {
    if (!authorize(req, res, ["admin"])) return;
    try {
      const body = await readJsonBody(req);
      const incidentId = String(body.incidentId || `inc_${Date.now()}`);
      const summary = String(body.summary || "Summary pending");
      const impact = String(body.impact || "Impact pending");
      const timeline = Array.isArray(body.timeline) ? body.timeline : [];
      const actions = Array.isArray(body.actions) ? body.actions : [];

      const markdown = [
        `# Postmortem - ${incidentId}`,
        "",
        `GeneratedAt: ${new Date().toISOString()}`,
        "",
        "## Summary",
        summary,
        "",
        "## Impact",
        impact,
        "",
        "## Timeline",
        ...timeline.map((item) => `- ${String(item)}`),
        "",
        "## Action Items",
        ...actions.map((item) => `- ${String(item)}`)
      ].join("\n");

      return sendJson(res, 200, {
        incidentId,
        markdown
      });
    } catch (error) {
      if (error.message === "INVALID_JSON") return badRequest(res, "invalid json");
      return sendJson(res, 500, { error: "internal error" });
    }
  }

  if (method === "GET" && pathname === "/api/v1/audit/trail") {
    if (!authorize(req, res, ["admin"])) return;
    if (!(await ensureTenantOrReject(req, res))) return;
    const limit = Number(parsedUrl.searchParams.get("limit") || "200");
    const publishId = parsedUrl.searchParams.get("publishId");
    const items = await getAuditTrail({
      tenantId: req.tenantId,
      publishId: publishId || null,
      limit: Number.isFinite(limit) ? Math.min(Math.max(limit, 1), 1000) : 200
    });
    return sendJson(res, 200, { items });
  }

  if (method === "GET" && pathname === "/api/v1/audit/verify") {
    if (!authorize(req, res, ["admin"])) return;
    if (!(await ensureTenantOrReject(req, res))) return;
    const report = await verifyAuditTrail({ tenantId: req.tenantId });
    return sendJson(res, report.ok ? 200 : 409, report);
  }

  if (method === "GET" && pathname === "/api/v1/privacy/policy") {
    if (!authorize(req, res, ["admin", "editor"])) return;
    if (!(await ensureTenantOrReject(req, res))) return;
    return sendJson(res, 200, {
      tenantId: req.tenantId,
      retention: {
        defaultDays: Number(process.env.RETENTION_DAYS || 90),
        datasets: ["publishes", "history", "usage", "audit", "reviewQueue"]
      },
      erase: {
        supported: ["publish"]
      },
      policyVersion: "2026-02-18",
      standards: ["GDPR-like", "KVKK-like"]
    });
  }

  if (method === "POST" && pathname === "/api/v1/privacy/retention/apply") {
    if (!authorize(req, res, ["admin"])) return;
    if (!(await ensureTenantOrReject(req, res))) return;
    try {
      const body = await readJsonBody(req);
      const result = await applyRetentionPolicy({
        tenantId: req.tenantId,
        retentionDays: Number(body.retentionDays || process.env.RETENTION_DAYS || 90)
      });
      return sendJson(res, 200, result);
    } catch (error) {
      if (error.message === "INVALID_JSON") return badRequest(res, "invalid json");
      return sendJson(res, 500, { error: "internal error" });
    }
  }

  if (method === "POST" && pathname === "/api/v1/privacy/erase-publish") {
    if (!authorize(req, res, ["admin"])) return;
    if (!(await ensureTenantOrReject(req, res))) return;
    try {
      const body = await readJsonBody(req);
      if (!body.publishId) return badRequest(res, "publishId required");
      const result = await erasePublishData({
        tenantId: req.tenantId,
        publishId: body.publishId
      });
      await logHistory("privacy.erase_publish", {
        tenantId: req.tenantId,
        publishId: body.publishId,
        actorRole: req.userRole
      });
      return sendJson(res, 200, result);
    } catch (error) {
      if (error.message === "INVALID_JSON") return badRequest(res, "invalid json");
      if (error.message === "PUBLISH_ID_REQUIRED") return badRequest(res, "publishId required");
      return sendJson(res, 500, { error: "internal error" });
    }
  }

  if (method === "POST" && pathname === "/api/v1/ops/dr/drill") {
    if (!authorize(req, res, ["admin"])) return;
    if (!(await ensureTenantOrReject(req, res))) return;
    const report = await runBackupDrill({ tenantId: req.tenantId });
    return sendJson(res, 200, report);
  }

  if (method === "GET" && pathname === "/api/v1/ops/dr/multi-region/status") {
    if (!authorize(req, res, ["admin"])) return;
    if (!(await ensureTenantOrReject(req, res))) return;
    const status = await getMultiRegionDrStatus();
    return sendJson(res, 200, status);
  }

  if (method === "POST" && pathname === "/api/v1/ops/dr/multi-region/run") {
    if (!authorize(req, res, ["admin"])) return;
    if (!(await ensureTenantOrReject(req, res))) return;
    const report = await runMultiRegionDrill({ tenantId: req.tenantId });
    return sendJson(res, 200, report);
  }

  if (method === "GET" && pathname === "/api/v1/review/queue") {
    if (!authorize(req, res, ["admin", "editor"])) return;
    if (!(await ensureTenantOrReject(req, res))) return;
    const status = parsedUrl.searchParams.get("status") || "pending";
    const limit = Number(parsedUrl.searchParams.get("limit") || "100");
    const items = await getReviewQueue({
      tenantId: req.tenantId,
      status,
      limit: Number.isFinite(limit) ? Math.min(Math.max(limit, 1), 500) : 100
    });
    return sendJson(res, 200, { items });
  }

  if (method === "GET" && pathname === "/api/v1/integrations/webhooks") {
    if (!authorize(req, res, ["admin", "editor"])) return;
    if (!(await ensureTenantOrReject(req, res))) return;
    const items = await listWebhooks(req.tenantId);
    return sendJson(res, 200, { items });
  }

  if (method === "GET" && pathname === "/api/v1/integrations/connectors") {
    if (!authorize(req, res, ["admin", "editor"])) return;
    if (!(await ensureTenantOrReject(req, res))) return;
    const items = await listConnectors(req.tenantId);
    return sendJson(res, 200, { items });
  }

  if (method === "GET" && pathname === "/api/v1/plugins") {
    if (!authorize(req, res, ["admin", "editor"])) return;
    if (!(await ensureTenantOrReject(req, res))) return;
    const items = await listPlugins(req.tenantId);
    return sendJson(res, 200, { items });
  }

  if (method === "GET" && pathname === "/api/v1/assets/library") {
    if (!authorize(req, res, ["admin", "editor"])) return;
    if (!(await ensureTenantOrReject(req, res))) return;
    const type = parsedUrl.searchParams.get("type");
    const assetKey = parsedUrl.searchParams.get("assetKey");
    const items = await listAssets({
      tenantId: req.tenantId,
      type: type || null,
      assetKey: assetKey || null
    });
    return sendJson(res, 200, { items });
  }

  if (method === "GET" && pathname === "/api/v1/developer/keys") {
    if (!authorize(req, res, ["admin", "editor"])) return;
    if (!(await ensureTenantOrReject(req, res))) return;
    const items = await listApiKeys(req.tenantId);
    return sendJson(res, 200, { items });
  }

  if (method === "GET" && pathname === "/api/v1/security/checklist") {
    if (!authorize(req, res, ["admin"])) return;
    const checklist = await readFile(path.resolve("docs/security/pentest-checklist.md"), "utf8");
    return sendJson(res, 200, {
      version: "2026-02-18",
      status: "tracked",
      checklist
    });
  }

  if (method === "GET" && pathname === "/api/v1/youtube/stats") {
    if (!authorize(req, res, ["admin", "editor"])) return;
    if (!(await ensureTenantOrReject(req, res))) return;
    const videoId = parsedUrl.searchParams.get("videoId");
    if (!videoId) return badRequest(res, "videoId required");

    try {
      const stats = await fetchYouTubeVideoStats(videoId);
      return sendJson(res, 200, stats);
    } catch (error) {
      if (isCircuitOpenError(error)) {
        return sendJson(res, 503, { error: "upstream temporarily unavailable" });
      }
      if (error.message === "YOUTUBE_ACCESS_TOKEN_REQUIRED") {
        return sendJson(res, 400, { error: "youtube access token required" });
      }
      if (error.message === "VIDEO_ID_REQUIRED") return badRequest(res, "videoId required");
      if (error.message === "YOUTUBE_VIDEO_NOT_FOUND") {
        return sendJson(res, 404, { error: "youtube video not found" });
      }
      if (String(error.message || "").startsWith("YOUTUBE_HTTP_")) {
        return sendJson(res, 502, { error: "youtube api error" });
      }
      return sendJson(res, 500, { error: "internal error" });
    }
  }

  if (method === "POST" && pathname === "/api/v1/opportunity/score") {
    if (!authorize(req, res, ["admin", "editor"])) return;
    try {
      const quota = await enforceCommercialLimits(req, res, "opportunity.score");
      if (!quota) return;
      const body = await readJsonBody(req);
      const payload = scoreOpportunity(body.topic);
      await recordUsage("opportunity.score", {
        actorRole: req.userRole,
        tenantId: req.tenantId,
        metadata: { overage: quota.usage.overage }
      });
      return sendJson(res, 200, payload);
    } catch (error) {
      if (error.message === "INVALID_JSON") return badRequest(res, "invalid json");
      if (error.message === "TOPIC_REQUIRED") return badRequest(res, "topic required");
      if (error.message === "TENANT_NOT_FOUND")
        return sendJson(res, 404, { error: "tenant not found" });
      if (error.message === "TENANT_INACTIVE")
        return sendJson(res, 403, { error: "tenant inactive" });
      return sendJson(res, 500, { error: "internal error" });
    }
  }

  if (method === "POST" && pathname === "/api/v1/compliance/check") {
    if (!authorize(req, res, ["admin", "editor"])) return;
    try {
      const body = await readJsonBody(req);
      return sendJson(res, 200, evaluateCompliance({ topic: body.topic, script: body.script }));
    } catch (error) {
      if (error.message === "INVALID_JSON") return badRequest(res, "invalid json");
      if (error.message === "TOPIC_AND_SCRIPT_REQUIRED") {
        return badRequest(res, "topic and script required");
      }
      return sendJson(res, 500, { error: "internal error" });
    }
  }

  if (method === "POST" && pathname === "/api/v1/auth/sso/login") {
    try {
      const body = await readJsonBody(req);
      const session = ssoLogin({
        provider: body.provider,
        idToken: body.idToken,
        email: body.email
      });
      return sendJson(res, 200, session);
    } catch (error) {
      if (error.message === "INVALID_JSON") return badRequest(res, "invalid json");
      if (error.message === "SSO_PROVIDER_INVALID")
        return badRequest(res, "provider must be oidc or saml");
      if (error.message === "SSO_TOKEN_INVALID")
        return sendJson(res, 401, { error: "invalid sso token" });
      return sendJson(res, 500, { error: "internal error" });
    }
  }

  if (method === "POST" && pathname === "/api/v1/integrations/webhooks") {
    if (!authorize(req, res, ["admin"])) return;
    if (!(await ensureTenantOrReject(req, res))) return;
    try {
      const body = await readJsonBody(req);
      const created = await createWebhook({
        tenantId: req.tenantId,
        url: body.url,
        eventTypes: body.eventTypes,
        provider: body.provider || "generic"
      });
      return sendJson(res, 201, created);
    } catch (error) {
      if (error.message === "INVALID_JSON") return badRequest(res, "invalid json");
      if (error.message === "WEBHOOK_URL_REQUIRED") return badRequest(res, "url required");
      return sendJson(res, 500, { error: "internal error" });
    }
  }

  if (method === "POST" && pathname === "/api/v1/integrations/webhooks/test") {
    if (!authorize(req, res, ["admin"])) return;
    if (!(await ensureTenantOrReject(req, res))) return;
    try {
      const body = await readJsonBody(req);
      const result = await dispatchWebhookEvent({
        tenantId: req.tenantId,
        eventType: body.eventType || "webhook.test",
        payload: body.payload || { ping: true }
      });
      return sendJson(res, 200, result);
    } catch (error) {
      if (error.message === "INVALID_JSON") return badRequest(res, "invalid json");
      return sendJson(res, 500, { error: "internal error" });
    }
  }

  if (method === "DELETE" && pathname === "/api/v1/integrations/webhooks") {
    if (!authorize(req, res, ["admin"])) return;
    if (!(await ensureTenantOrReject(req, res))) return;
    const webhookId = parsedUrl.searchParams.get("webhookId");
    if (!webhookId) return badRequest(res, "webhookId required");
    const result = await removeWebhook({ tenantId: req.tenantId, webhookId });
    return sendJson(res, 200, result);
  }

  if (method === "POST" && pathname === "/api/v1/integrations/connectors") {
    if (!authorize(req, res, ["admin"])) return;
    if (!(await ensureTenantOrReject(req, res))) return;
    try {
      const body = await readJsonBody(req);
      const created = await addConnector({
        tenantId: req.tenantId,
        type: body.type,
        endpoint: body.endpoint
      });
      return sendJson(res, 201, created);
    } catch (error) {
      if (error.message === "INVALID_JSON") return badRequest(res, "invalid json");
      if (error.message === "CONNECTOR_TYPE_AND_ENDPOINT_REQUIRED") {
        return badRequest(res, "type and endpoint required");
      }
      return sendJson(res, 500, { error: "internal error" });
    }
  }

  if (method === "POST" && pathname === "/api/v1/integrations/connectors/sync") {
    if (!authorize(req, res, ["admin", "editor"])) return;
    if (!(await ensureTenantOrReject(req, res))) return;
    try {
      const body = await readJsonBody(req);
      const result = await syncConnectors({
        tenantId: req.tenantId,
        publishId: body.publishId
      });
      return sendJson(res, 200, result);
    } catch (error) {
      if (isCircuitOpenError(error)) {
        return sendJson(res, 503, { error: "upstream temporarily unavailable" });
      }
      if (error.message === "INVALID_JSON") return badRequest(res, "invalid json");
      if (error.message === "PUBLISH_ID_REQUIRED") return badRequest(res, "publishId required");
      if (error.message === "PUBLISH_NOT_FOUND")
        return sendJson(res, 404, { error: "publish not found" });
      return sendJson(res, 500, { error: "internal error" });
    }
  }

  if (method === "POST" && pathname === "/api/v1/plugins/register") {
    if (!authorize(req, res, ["admin"])) return;
    if (!(await ensureTenantOrReject(req, res))) return;
    try {
      const body = await readJsonBody(req);
      const created = await registerPlugin({
        tenantId: req.tenantId,
        name: body.name,
        endpoint: body.endpoint,
        hooks: body.hooks
      });
      return sendJson(res, 201, created);
    } catch (error) {
      if (error.message === "INVALID_JSON") return badRequest(res, "invalid json");
      if (error.message === "PLUGIN_NAME_AND_ENDPOINT_REQUIRED") {
        return badRequest(res, "name and endpoint required");
      }
      return sendJson(res, 500, { error: "internal error" });
    }
  }

  if (method === "POST" && pathname === "/api/v1/plugins/execute") {
    if (!authorize(req, res, ["admin"])) return;
    if (!(await ensureTenantOrReject(req, res))) return;
    try {
      const body = await readJsonBody(req);
      const result = await invokePluginHook({
        tenantId: req.tenantId,
        hook: body.hook,
        payload: body.payload || {}
      });
      return sendJson(res, 200, result);
    } catch (error) {
      if (error.message === "INVALID_JSON") return badRequest(res, "invalid json");
      if (error.message === "PLUGIN_HOOK_REQUIRED") return badRequest(res, "hook required");
      return sendJson(res, 500, { error: "internal error" });
    }
  }

  if (method === "POST" && pathname === "/api/v1/assets/library") {
    if (!authorize(req, res, ["admin", "editor"])) return;
    if (!(await ensureTenantOrReject(req, res))) return;
    try {
      const body = await readJsonBody(req);
      const created = await addAssetVersion({
        tenantId: req.tenantId,
        assetKey: body.assetKey,
        name: body.name,
        type: body.type || "template",
        sourceUrl: body.sourceUrl || "",
        metadata: body.metadata || {}
      });
      return sendJson(res, 201, created);
    } catch (error) {
      if (error.message === "INVALID_JSON") return badRequest(res, "invalid json");
      if (error.message === "ASSET_KEY_AND_NAME_REQUIRED")
        return badRequest(res, "assetKey and name required");
      if (error.message === "INVALID_ASSET_TYPE") return badRequest(res, "invalid asset type");
      return sendJson(res, 500, { error: "internal error" });
    }
  }

  if (method === "POST" && pathname === "/api/v1/developer/keys") {
    if (!authorize(req, res, ["admin"])) return;
    if (!(await ensureTenantOrReject(req, res))) return;
    try {
      const body = await readJsonBody(req);
      const created = await createApiKey({
        tenantId: req.tenantId,
        name: body.name
      });
      return sendJson(res, 201, created);
    } catch (error) {
      if (error.message === "INVALID_JSON") return badRequest(res, "invalid json");
      if (error.message === "API_KEY_NAME_REQUIRED") return badRequest(res, "name required");
      return sendJson(res, 500, { error: "internal error" });
    }
  }

  if (method === "POST" && pathname === "/api/v1/developer/keys/revoke") {
    if (!authorize(req, res, ["admin"])) return;
    if (!(await ensureTenantOrReject(req, res))) return;
    try {
      const body = await readJsonBody(req);
      const result = await revokeApiKey({
        tenantId: req.tenantId,
        keyId: body.keyId
      });
      return sendJson(res, 200, result);
    } catch (error) {
      if (error.message === "INVALID_JSON") return badRequest(res, "invalid json");
      if (error.message === "API_KEY_ID_REQUIRED") return badRequest(res, "keyId required");
      if (error.message === "API_KEY_NOT_FOUND")
        return sendJson(res, 404, { error: "api key not found" });
      return sendJson(res, 500, { error: "internal error" });
    }
  }

  if (method === "POST" && pathname === "/api/v1/review/decision") {
    if (!authorize(req, res, ["admin"])) return;
    if (!(await ensureTenantOrReject(req, res))) return;
    try {
      const body = await readJsonBody(req);
      const result = await decideReview({
        tenantId: req.tenantId,
        reviewId: body.reviewId,
        decision: body.decision,
        note: body.note || null,
        actorRole: req.userRole
      });
      return sendJson(res, 200, result);
    } catch (error) {
      if (isBackpressureError(error)) {
        return sendJson(res, 503, { error: "queue overloaded, try again later" });
      }
      if (error.message === "INVALID_JSON") return badRequest(res, "invalid json");
      if (error.message === "REVIEW_ID_AND_DECISION_REQUIRED") {
        return badRequest(res, "reviewId and decision required");
      }
      if (error.message === "INVALID_REVIEW_DECISION") {
        return badRequest(res, "decision must be approve or reject");
      }
      if (error.message === "REVIEW_NOT_FOUND")
        return sendJson(res, 404, { error: "review not found" });
      if (error.message === "REVIEW_ALREADY_DECIDED") {
        return sendJson(res, 409, { error: "review already decided" });
      }
      return sendJson(res, 500, { error: "internal error" });
    }
  }

  if (method === "POST" && pathname === "/api/v1/analytics/ingest") {
    if (!authorize(req, res, ["admin", "editor"])) return;
    try {
      const quota = await enforceCommercialLimits(req, res, "analytics.ingest");
      if (!quota) return;
      const body = await readJsonBody(req);
      const publish = await assertPublishTenantAccess(res, body.publishId, req.tenantId);
      if (!publish) return;
      const result = await ingestAnalytics({
        publishId: body.publishId,
        metricsCtr: body.metricsCtr,
        metricsRetention3s: body.metricsRetention3s,
        metricsAvgWatchDurationSec: body.metricsAvgWatchDurationSec,
        metricsCompletionRate: body.metricsCompletionRate
      });
      await recordUsage("analytics.ingest", {
        actorRole: req.userRole,
        tenantId: req.tenantId,
        channelId: publish.channelId || null,
        publishId: body.publishId,
        metadata: { overage: quota.usage.overage }
      });
      return sendJson(res, 200, result);
    } catch (error) {
      if (isBackpressureError(error)) {
        return sendJson(res, 503, { error: "queue overloaded, try again later" });
      }
      if (error.message === "INVALID_JSON") return badRequest(res, "invalid json");
      if (error.message === "PUBLISH_ID_REQUIRED") return badRequest(res, "publishId required");
      if (error.message === "PUBLISH_NOT_FOUND")
        return sendJson(res, 404, { error: "publish not found" });
      if (error.message === "TENANT_NOT_FOUND")
        return sendJson(res, 404, { error: "tenant not found" });
      if (error.message === "TENANT_INACTIVE")
        return sendJson(res, 403, { error: "tenant inactive" });
      return sendJson(res, 500, { error: "internal error" });
    }
  }

  if (method === "POST" && pathname === "/api/v1/performance/predict") {
    if (!authorize(req, res, ["admin", "editor"])) return;
    try {
      const quota = await enforceCommercialLimits(req, res, "performance.predict");
      if (!quota) return;
      const body = await readJsonBody(req);
      const prediction = predictPerformance({
        topic: body.topic,
        script: body.script || "",
        opportunityScore: Number(body.opportunityScore || 0.5),
        format: body.format || "shorts"
      });
      await recordUsage("performance.predict", {
        actorRole: req.userRole,
        tenantId: req.tenantId,
        metadata: { overage: quota.usage.overage, format: body.format || "shorts" }
      });
      return sendJson(res, 200, prediction);
    } catch (error) {
      if (error.message === "INVALID_JSON") return badRequest(res, "invalid json");
      if (error.message === "TOPIC_REQUIRED") return badRequest(res, "topic required");
      if (error.message === "FORMAT_INVALID") {
        return badRequest(res, "format must be shorts, reels, tiktok, youtube");
      }
      if (error.message === "TENANT_NOT_FOUND")
        return sendJson(res, 404, { error: "tenant not found" });
      if (error.message === "TENANT_INACTIVE")
        return sendJson(res, 403, { error: "tenant inactive" });
      return sendJson(res, 500, { error: "internal error" });
    }
  }

  if (method === "POST" && pathname === "/api/v1/optimize/cost-aware") {
    if (!authorize(req, res, ["admin", "editor"])) return;
    try {
      const quota = await enforceCommercialLimits(req, res, "optimize.cost_aware");
      if (!quota) return;
      const body = await readJsonBody(req);
      const plan = recommendCostAwarePlan({
        topic: body.topic,
        script: body.script || "",
        format: body.format || "shorts",
        opportunityScore: Number(body.opportunityScore || 0.5),
        budgetTier: body.budgetTier || "medium",
        maxRelativeCost: body.maxRelativeCost ?? null
      });
      await recordUsage("optimize.cost_aware", {
        actorRole: req.userRole,
        tenantId: req.tenantId,
        metadata: { overage: quota.usage.overage, budgetTier: body.budgetTier || "medium" }
      });
      return sendJson(res, 200, plan);
    } catch (error) {
      if (error.message === "INVALID_JSON") return badRequest(res, "invalid json");
      if (error.message === "TOPIC_REQUIRED") return badRequest(res, "topic required");
      if (error.message === "FORMAT_INVALID") {
        return badRequest(res, "format must be shorts, reels, tiktok, youtube");
      }
      if (error.message === "TENANT_NOT_FOUND")
        return sendJson(res, 404, { error: "tenant not found" });
      if (error.message === "TENANT_INACTIVE")
        return sendJson(res, 403, { error: "tenant inactive" });
      return sendJson(res, 500, { error: "internal error" });
    }
  }

  if (method === "POST" && pathname === "/api/v1/youtube/analytics/sync") {
    if (!authorize(req, res, ["admin", "editor"])) return;
    try {
      const quota = await enforceCommercialLimits(req, res, "youtube.analytics.sync");
      if (!quota) return;
      const body = await readJsonBody(req);
      const publish = await assertPublishTenantAccess(res, body.publishId, req.tenantId);
      if (!publish) return;
      const result = await syncAnalyticsFromYouTube(body.publishId);
      await recordUsage("youtube.analytics.sync", {
        actorRole: req.userRole,
        tenantId: req.tenantId,
        channelId: publish.channelId || null,
        publishId: body.publishId,
        metadata: { overage: quota.usage.overage }
      });
      return sendJson(res, 200, result);
    } catch (error) {
      if (isCircuitOpenError(error)) {
        return sendJson(res, 503, { error: "upstream temporarily unavailable" });
      }
      if (error.message === "INVALID_JSON") return badRequest(res, "invalid json");
      if (error.message === "PUBLISH_ID_REQUIRED") return badRequest(res, "publishId required");
      if (error.message === "PUBLISH_NOT_FOUND")
        return sendJson(res, 404, { error: "publish not found" });
      if (error.message === "YOUTUBE_VIDEO_ID_REQUIRED")
        return badRequest(res, "youtube video id required");
      if (error.message === "YOUTUBE_ACCESS_TOKEN_REQUIRED") {
        return sendJson(res, 400, { error: "youtube access token required" });
      }
      if (String(error.message || "").startsWith("YOUTUBE_HTTP_")) {
        return sendJson(res, 502, { error: "youtube api error" });
      }
      if (error.message === "TENANT_NOT_FOUND")
        return sendJson(res, 404, { error: "tenant not found" });
      if (error.message === "TENANT_INACTIVE")
        return sendJson(res, 403, { error: "tenant inactive" });
      return sendJson(res, 500, { error: "internal error" });
    }
  }

  if (method === "POST" && pathname === "/api/v1/script/generate") {
    if (!authorize(req, res, ["admin", "editor"])) return;
    try {
      const quota = await enforceCommercialLimits(req, res, "script.generate");
      if (!quota) return;
      const body = await readJsonBody(req);
      const payload = generateScript({
        topic: body.topic,
        opportunityScore: Number(body.opportunityScore || 0)
      });
      await recordUsage("script.generate", {
        actorRole: req.userRole,
        tenantId: req.tenantId,
        metadata: { overage: quota.usage.overage }
      });
      return sendJson(res, 200, payload);
    } catch (error) {
      if (error.message === "INVALID_JSON") return badRequest(res, "invalid json");
      if (error.message === "TOPIC_REQUIRED") return badRequest(res, "topic required");
      if (error.message === "TENANT_NOT_FOUND")
        return sendJson(res, 404, { error: "tenant not found" });
      if (error.message === "TENANT_INACTIVE")
        return sendJson(res, 403, { error: "tenant inactive" });
      return sendJson(res, 500, { error: "internal error" });
    }
  }

  if (method === "POST" && pathname === "/api/v1/channels") {
    if (!authorize(req, res, ["admin"])) return;
    try {
      const quota = await enforceCommercialLimits(req, res, "channel.create");
      if (!quota) return;
      const body = await readJsonBody(req);
      const created = await addChannel({
        channelId: body.channelId,
        tenantId: req.tenantId,
        name: body.name,
        youtubeChannelId: body.youtubeChannelId || null,
        defaultLanguage: body.defaultLanguage || "tr"
      });
      await recordUsage("channel.create", {
        actorRole: req.userRole,
        tenantId: req.tenantId,
        channelId: created.channelId,
        metadata: { overage: quota.usage.overage }
      });
      return sendJson(res, 201, created);
    } catch (error) {
      if (error.message === "INVALID_JSON") return badRequest(res, "invalid json");
      if (error.message === "CHANNEL_ID_AND_NAME_REQUIRED") {
        return badRequest(res, "channelId and name required");
      }
      if (error.message === "CHANNEL_ALREADY_EXISTS") {
        return sendJson(res, 409, { error: "channel already exists" });
      }
      if (error.message === "TENANT_NOT_FOUND")
        return sendJson(res, 404, { error: "tenant not found" });
      if (error.message === "TENANT_INACTIVE")
        return sendJson(res, 403, { error: "tenant inactive" });
      return sendJson(res, 500, { error: "internal error" });
    }
  }

  if (method === "POST" && pathname === "/api/v1/publish/create") {
    if (!authorize(req, res, ["admin", "editor"])) return;
    try {
      const quota = await enforceCommercialLimits(req, res, "publish.create");
      if (!quota) return;
      const body = await readJsonBody(req);
      const payload = await createDraftPublish({
        topic: body.topic,
        script: body.script,
        channelId: body.channelId || null,
        tenantId: req.tenantId
      });
      await recordUsage("publish.create", {
        actorRole: req.userRole,
        tenantId: req.tenantId,
        channelId: payload.channelId,
        publishId: payload.publishId,
        metadata: { overage: quota.usage.overage }
      });
      return sendJson(res, 201, payload);
    } catch (error) {
      if (isBackpressureError(error)) {
        return sendJson(res, 503, { error: "queue overloaded, try again later" });
      }
      if (error.message === "INVALID_JSON") return badRequest(res, "invalid json");
      if (error.message === "TOPIC_AND_SCRIPT_REQUIRED") {
        return badRequest(res, "topic and script required");
      }
      if (error.message === "CHANNEL_NOT_FOUND") {
        return sendJson(res, 404, { error: "channel not found" });
      }
      if (error.message === "TENANT_NOT_FOUND")
        return sendJson(res, 404, { error: "tenant not found" });
      if (error.message === "TENANT_INACTIVE")
        return sendJson(res, 403, { error: "tenant inactive" });
      return sendJson(res, 500, { error: "internal error" });
    }
  }

  if (method === "POST" && pathname === "/api/v1/optimize/run") {
    if (!authorize(req, res, ["admin"])) return;
    try {
      const quota = await enforceCommercialLimits(req, res, "optimize.run");
      if (!quota) return;
      const body = await readJsonBody(req);
      if (!body.publishId) return badRequest(res, "publishId required");
      const publish = await assertPublishTenantAccess(res, body.publishId, req.tenantId);
      if (!publish) return;

      const now = new Date().toISOString();
      await updatePublishOptimization({
        publishId: body.publishId,
        optimizationStatus: "queued",
        optimizationVariants: null,
        optimizationUpdatedAt: now
      });

      await enqueue({
        jobType: "optimize.generate",
        publishId: body.publishId,
        topic: body.topic || null,
        flags: Array.isArray(body.flags) ? body.flags : []
      });
      await logHistory("job.enqueued", {
        tenantId: req.tenantId,
        publishId: body.publishId,
        topic: body.topic || null,
        jobType: "optimize.generate",
        flags: Array.isArray(body.flags) ? body.flags : []
      });
      await recordUsage("optimize.run", {
        actorRole: req.userRole,
        tenantId: req.tenantId,
        channelId: publish.channelId || null,
        publishId: body.publishId,
        metadata: { overage: quota.usage.overage }
      });

      return sendJson(res, 202, { queued: true, publishId: body.publishId });
    } catch (error) {
      if (isBackpressureError(error)) {
        return sendJson(res, 503, { error: "queue overloaded, try again later" });
      }
      if (error.message === "INVALID_JSON") return badRequest(res, "invalid json");
      if (error.message === "TENANT_NOT_FOUND")
        return sendJson(res, 404, { error: "tenant not found" });
      if (error.message === "TENANT_INACTIVE")
        return sendJson(res, 403, { error: "tenant inactive" });
      return sendJson(res, 500, { error: "internal error" });
    }
  }

  if (method === "POST" && pathname === "/api/v1/tenants") {
    if (!authorize(req, res, ["admin"])) return;
    try {
      const body = await readJsonBody(req);
      const created = await createTenantRecord({
        tenantId: body.tenantId,
        name: body.name,
        planCode: body.planCode || "free",
        status: body.status || "active",
        settings: body.settings || {}
      });
      return sendJson(res, 201, created);
    } catch (error) {
      if (error.message === "INVALID_JSON") return badRequest(res, "invalid json");
      if (error.message === "TENANT_ID_AND_NAME_REQUIRED") {
        return badRequest(res, "tenantId and name required");
      }
      if (error.message === "TENANT_ALREADY_EXISTS") {
        return sendJson(res, 409, { error: "tenant already exists" });
      }
      if (error.message === "INVALID_PLAN_CODE") return badRequest(res, "invalid planCode");
      return sendJson(res, 500, { error: "internal error" });
    }
  }

  if (method === "POST" && pathname === "/api/v1/onboarding/self-serve") {
    try {
      const body = await readJsonBody(req);
      const tenantName = String(body.tenantName || "").trim();
      const ownerEmail = String(body.ownerEmail || "").trim();
      const channelName = String(body.channelName || "").trim();
      if (!tenantName || !ownerEmail || !channelName) {
        return badRequest(res, "tenantName, ownerEmail and channelName required");
      }

      const tenantId =
        String(body.tenantId || "").trim() || `t_${slugify(tenantName, "tenant")}_${Date.now()}`;
      const planCode = String(body.planCode || "free").trim() || "free";
      const locale = String(body.locale || "tr");
      const timezone = String(body.timezone || "Europe/Istanbul");

      const createdTenant = await createTenantRecord({
        tenantId,
        name: tenantName,
        planCode,
        status: "active",
        settings: {
          locale,
          timezone,
          ownerEmail,
          onboardingStatus: "in_progress",
          onboardingStep: "channel_connected"
        }
      });

      const channelId =
        String(body.channelId || "").trim() || `ch_${slugify(channelName, "channel")}_${Date.now()}`;
      const createdChannel = await addChannel({
        tenantId,
        channelId,
        name: channelName,
        youtubeChannelId: body.youtubeChannelId || null,
        defaultLanguage: body.defaultLanguage || "tr"
      });

      return sendJson(res, 201, {
        tenant: createdTenant,
        channel: createdChannel,
        wizard: {
          completed: ["tenant_created", "channel_created"],
          next: ["content_profile", "first_pipeline_run"]
        }
      });
    } catch (error) {
      if (error.message === "INVALID_JSON") return badRequest(res, "invalid json");
      if (error.message === "TENANT_ID_AND_NAME_REQUIRED") {
        return badRequest(res, "tenantId and name required");
      }
      if (error.message === "TENANT_ALREADY_EXISTS")
        return sendJson(res, 409, { error: "tenant already exists" });
      if (error.message === "INVALID_PLAN_CODE") return badRequest(res, "invalid planCode");
      if (error.message === "CHANNEL_ID_AND_NAME_REQUIRED") {
        return badRequest(res, "channelId and name required");
      }
      if (error.message === "CHANNEL_ALREADY_EXISTS") {
        return sendJson(res, 409, { error: "channel already exists" });
      }
      return sendJson(res, 500, { error: "internal error" });
    }
  }

  if (method === "PATCH" && pathname === "/api/v1/tenants/me/settings") {
    if (!authorize(req, res, ["admin"])) return;
    try {
      const body = await readJsonBody(req);
      const updated = await patchTenantSettings(req.tenantId, {
        planCode: body.planCode || null,
        status: body.status || null,
        settings: body.settings || {}
      });
      if (!updated) return sendJson(res, 404, { error: "tenant not found" });
      return sendJson(res, 200, updated);
    } catch (error) {
      if (error.message === "INVALID_JSON") return badRequest(res, "invalid json");
      if (error.message === "INVALID_PLAN_CODE") return badRequest(res, "invalid planCode");
      return sendJson(res, 500, { error: "internal error" });
    }
  }

  if (method === "POST" && pathname === "/api/v1/pipeline/run") {
    if (!authorize(req, res, ["admin", "editor"])) return;
    try {
      const quota = await enforceCommercialLimits(req, res, "pipeline.run");
      if (!quota) return;
      const body = await readJsonBody(req);
      const result = await runPipeline(body.topic, body.channelId || null, req.tenantId);
      await recordUsage("pipeline.run", {
        actorRole: req.userRole,
        tenantId: req.tenantId,
        channelId: result.publish?.channelId || body.channelId || null,
        publishId: result.publish?.publishId || null,
        metadata: { overage: quota.usage.overage }
      });
      return sendJson(res, 200, result);
    } catch (error) {
      if (isBackpressureError(error)) {
        return sendJson(res, 503, { error: "queue overloaded, try again later" });
      }
      if (error.message === "INVALID_JSON") return badRequest(res, "invalid json");
      if (error.message === "TOPIC_REQUIRED") return badRequest(res, "topic required");
      if (error.message === "TOPIC_AND_SCRIPT_REQUIRED") {
        return badRequest(res, "topic and script required");
      }
      if (error.message === "CHANNEL_NOT_FOUND") {
        return sendJson(res, 404, { error: "channel not found" });
      }
      if (error.message === "TENANT_NOT_FOUND")
        return sendJson(res, 404, { error: "tenant not found" });
      if (error.message === "TENANT_INACTIVE")
        return sendJson(res, 403, { error: "tenant inactive" });
      return sendJson(res, 500, { error: "internal error" });
    }
  }

  return sendJson(res, 404, { error: "not found" });
}
