import { readJsonBody, sendJson } from "../utils/http.js";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { scoreOpportunity } from "../services/opportunityService.js";
import { generateScript } from "../services/scriptService.js";
import { createDraftPublish, getPublish, listPublishes } from "../services/publishService.js";
import { runPipeline } from "../services/pipelineService.js";
import { shouldUsePostgres } from "../infra/db.js";
import { shouldUseRedis } from "../infra/redisClient.js";
import { enqueue, getDlqSize, getQueueSize, listDlq } from "../infra/queueClient.js";
import { getHistory, logHistory } from "../services/historyService.js";
import { evaluateCompliance } from "../services/complianceService.js";
import {
  getAnalyticsReport,
  ingestAnalytics,
  syncAnalyticsFromYouTube
} from "../services/analyticsService.js";
import { updatePublishOptimization } from "../infra/publishRepository.js";
import { authorize } from "../utils/auth.js";
import { snapshot } from "../infra/metricsStore.js";
import { fetchYouTubeVideoStats } from "../services/youtubeIntegrationService.js";
import { addChannel, getChannelsByTenant } from "../services/channelService.js";
import { getMonthlyInvoice, getUsageReport, recordUsage } from "../services/billingService.js";
import {
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
import { getAutoscalePlan } from "../services/autoscaleService.js";
import { getSloReport } from "../services/sloService.js";
import { cacheStats, invalidateCache } from "../infra/cacheStore.js";
import { getQueryProfileSnapshot } from "../infra/queryProfiler.js";
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

function badRequest(res, message) {
  sendJson(res, 400, { error: message });
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

  if (method === "GET" && pathname === "/app/dashboard") {
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

  if (method === "GET" && pathname === "/api/v1/ops/metrics") {
    if (!authorize(req, res, ["admin"])) return;
    const queueSize = await getQueueSize();
    const dlqSize = await getDlqSize();
    return sendJson(res, 200, snapshot({ queueSize, dlqSize }));
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
