export function resolveRoute(pathname) {
  if (pathname === "/app/ops") return "ops";
  if (pathname === "/app/integrations") return "integrations";
  if (pathname === "/app/security") return "security";
  return "dashboard";
}

export function getRoleAccess(role = "admin") {
  if (role === "editor") return ["dashboard", "integrations"];
  if (role === "viewer") return ["dashboard"];
  return ["dashboard", "ops", "integrations", "security"];
}

export function selectAccessibleRoute(route, allowedRoutes) {
  if (Array.isArray(allowedRoutes) && allowedRoutes.includes(route)) return route;
  return "dashboard";
}

export function nextSidebarState(state, action) {
  const current = {
    pinned: Boolean(state?.pinned),
    hovered: Boolean(state?.hovered),
    mobileOpen: Boolean(state?.mobileOpen),
    isMobile: Boolean(state?.isMobile)
  };

  if (action === "PIN_TOGGLE") return { ...current, pinned: !current.pinned };
  if (action === "HOVER_ON") return { ...current, hovered: true };
  if (action === "HOVER_OFF") return { ...current, hovered: false };
  if (action === "MOBILE_OPEN") return { ...current, mobileOpen: true };
  if (action === "MOBILE_CLOSE") return { ...current, mobileOpen: false };
  if (action === "MOBILE_TOGGLE") return { ...current, mobileOpen: !current.mobileOpen };
  if (action === "SET_MOBILE")
    return { ...current, isMobile: true, hovered: false, mobileOpen: false };
  if (action === "SET_DESKTOP")
    return { ...current, isMobile: false, mobileOpen: false, hovered: false };
  return current;
}

function isAuthError(message) {
  return message === "HTTP_401" || message === "HTTP_403";
}

async function fetchJson(url, options = undefined) {
  const res = await fetch(url, options);
  if (!res.ok) throw new Error(`HTTP_${res.status}`);
  return res.json();
}

function showError(targetId, message) {
  const target = document.getElementById(targetId);
  if (!target) return;
  if (isAuthError(message)) {
    target.textContent = `Yetki hatasi (${message})`;
    return;
  }
  target.textContent = `hata: ${message}`;
}

let historyEventSource = null;
let streamRefreshTimer = null;

function setLiveStatus(text) {
  const target = document.getElementById("live-status");
  if (target) target.textContent = text;
}

function queueDashboardRefresh() {
  if (streamRefreshTimer) return;
  streamRefreshTimer = setTimeout(() => {
    streamRefreshTimer = null;
    renderDashboardView();
  }, 250);
}

function connectDashboardStream() {
  if (typeof EventSource === "undefined") {
    setLiveStatus("event-stream desteklenmiyor");
    return;
  }

  if (historyEventSource) {
    historyEventSource.close();
    historyEventSource = null;
  }

  const source = new EventSource("/api/v1/history/stream");
  historyEventSource = source;
  setLiveStatus("baglaniliyor...");

  source.addEventListener("ready", () => {
    setLiveStatus("canli");
  });

  source.addEventListener("history", () => {
    setLiveStatus("canli");
    queueDashboardRefresh();
  });

  source.addEventListener("ping", () => {
    setLiveStatus("canli");
  });

  source.onerror = () => {
    setLiveStatus("yeniden baglaniyor...");
  };

  window.addEventListener(
    "beforeunload",
    () => {
      source.close();
      historyEventSource = null;
    },
    { once: true }
  );
}

function renderHistory(items) {
  const tbody = document.getElementById("history-body");
  if (!tbody) return;

  if (!items.length) {
    tbody.innerHTML = '<tr><td colspan="4">Kayit yok</td></tr>';
    return;
  }

  tbody.innerHTML = items
    .map((item) => {
      const detail = item.topic || item.status || item.renderStatus || "-";
      return `<tr>
        <td>${new Date(item.createdAt).toLocaleString("tr-TR")}</td>
        <td>${item.eventType}</td>
        <td>${item.publishId || "-"}</td>
        <td>${detail}</td>
      </tr>`;
    })
    .join("");
}

function renderPublishes(items) {
  const tbody = document.getElementById("publish-body");
  const count = document.getElementById("publish-count");
  if (!tbody || !count) return;

  count.textContent = String(items.length);

  const rows = buildPublishDashboardModel(items);
  if (!items.length) {
    tbody.innerHTML = '<tr><td colspan="8">Kayit yok</td></tr>';
    return;
  }

  tbody.innerHTML = rows
    .map(
      (item) => `<tr>
      <td>${item.publishId}</td>
      <td>${item.topic}</td>
      <td>${item.complianceStatus || "-"}</td>
      <td>${item.metricsCtr == null ? "-" : Number(item.metricsCtr).toFixed(3)}</td>
      <td>${item.renderStatus || "-"}</td>
      <td>${item.optimizationStatus || "-"}</td>
      <td>${item.status}</td>
      <td>${item.seoSelectionLabel}</td>
    </tr>`
    )
    .join("");
}

export function buildPublishDashboardModel(items) {
  const list = Array.isArray(items) ? items : [];
  return list.map((item) => {
    const selected = item?.optimizationVariants?.selectedSeoVariant || null;
    const variantId = String(selected?.variantId || "").trim();
    const finalScore =
      item?.optimizationVariants?.seoSelection?.ranking?.find((entry) => entry?.variantId === variantId)
        ?.finalScore ?? selected?.variantScore;

    const seoSelectionLabel = variantId
      ? `${variantId}${Number.isFinite(Number(finalScore)) ? ` (${Number(finalScore).toFixed(3)})` : ""}`
      : "-";

    return {
      publishId: item.publishId || "-",
      topic: item.topic || "-",
      complianceStatus: item.complianceStatus || "-",
      metricsCtr: item.metricsCtr,
      renderStatus: item.renderStatus || "-",
      optimizationStatus: item.optimizationStatus || "-",
      status: item.status || "-",
      seoSelectionLabel
    };
  });
}

export function buildVideoDashboardModel(items) {
  const list = Array.isArray(items) ? items : [];
  return list.map((item) => ({
    publishId: item.publishId || "-",
    topic: item.topic || "-",
    renderStatus: item.renderStatus || "-",
    status: item.status || "-",
    videoAssetPath: item.videoAssetPath || item.videoAssetUrl || "-"
  }));
}

function renderVideos(items) {
  const tbody = document.getElementById("videos-body");
  if (!tbody) return;

  const rows = buildVideoDashboardModel(items);
  if (!rows.length) {
    tbody.innerHTML = '<tr><td colspan="5">Kayit yok</td></tr>';
    return;
  }

  tbody.innerHTML = rows
    .map(
      (item) => `<tr>
      <td>${item.publishId}</td>
      <td>${item.topic}</td>
      <td>${item.renderStatus}</td>
      <td>${item.status}</td>
      <td class="mono">${item.videoAssetPath}</td>
    </tr>`
    )
    .join("");
}

export function buildChannelDashboardModel(items) {
  const list = Array.isArray(items) ? items : [];
  return list.map((item) => ({
    channelId: item.channelId || "-",
    name: item.name || "-",
    youtubeChannelId: item.youtubeChannelId || "-",
    defaultLanguage: item.defaultLanguage || "-"
  }));
}

function renderChannels(items) {
  const tbody = document.getElementById("channels-body");
  if (!tbody) return;

  const rows = buildChannelDashboardModel(items);
  if (!rows.length) {
    tbody.innerHTML = '<tr><td colspan="4">Kayit yok</td></tr>';
    return;
  }

  tbody.innerHTML = rows
    .map(
      (item) => `<tr>
      <td>${item.channelId}</td>
      <td>${item.name}</td>
      <td>${item.youtubeChannelId}</td>
      <td>${item.defaultLanguage}</td>
    </tr>`
    )
    .join("");
}

export function buildFusionDashboardModel(items) {
  const list = Array.isArray(items) ? items : [];
  if (!list.length) {
    return {
      summary: "veri yok",
      rows: []
    };
  }

  const avg = list.reduce((sum, item) => sum + Number(item?.fusion?.finalScore || 0), 0) / list.length;
  return {
    summary: `avg=${avg.toFixed(3)} / n=${list.length}`,
    rows: list.map((item) => ({
      topic: item.topic || "-",
      finalScore: Number(item?.fusion?.finalScore || 0),
      revenue: Number(item?.scores?.revenue || 0),
      searchIntent: Number(item?.scores?.searchIntent || 0),
      viralPattern: Number(item?.scores?.viralPattern || 0)
    }))
  };
}

export function buildProviderOpsModel(metrics) {
  const providers = metrics?.providers || {};
  return {
    failures: Number(metrics?.counters?.providerFailuresTotal || 0),
    retries: Number(metrics?.counters?.providerRetriesTotal || 0),
    timeouts: Number(metrics?.counters?.providerTimeoutsTotal || 0),
    providers
  };
}

async function renderFusionPanel(publishes) {
  const summaryEl = document.getElementById("fusion-summary");
  const bodyEl = document.getElementById("fusion-body");
  if (!summaryEl || !bodyEl) return;

  const topics = Array.isArray(publishes)
    ? publishes
        .map((item) => String(item?.topic || "").trim())
        .filter(Boolean)
        .slice(0, 5)
    : [];

  if (!topics.length) {
    summaryEl.textContent = "veri yok";
    bodyEl.innerHTML = '<tr><td colspan="5">Kayit yok</td></tr>';
    return;
  }

  const scored = await Promise.all(
    topics.map(async (topic) => {
      try {
        return await fetchJson("/api/v1/strategy/score", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ topic })
        });
      } catch {
        return null;
      }
    })
  );
  const valid = scored.filter(Boolean);
  const view = buildFusionDashboardModel(valid);
  summaryEl.textContent = view.summary;

  if (!view.rows.length) {
    bodyEl.innerHTML = '<tr><td colspan="5">Kayit yok</td></tr>';
    return;
  }

  bodyEl.innerHTML = view.rows
    .map(
      (row) => `<tr>
      <td>${row.topic}</td>
      <td>${row.finalScore.toFixed(3)}</td>
      <td>${row.revenue.toFixed(3)}</td>
      <td>${row.searchIntent.toFixed(3)}</td>
      <td>${row.viralPattern.toFixed(3)}</td>
    </tr>`
    )
    .join("");
}

export function buildOnboardingViewModel(payload) {
  const steps = Array.isArray(payload?.steps) ? payload.steps : [];
  const completedSteps = steps.filter((item) => item.done).length;
  return {
    status: payload?.onboardingStatus || "in_progress",
    emptyState: Boolean(payload?.emptyState?.showGuidedSetup),
    summary: `${completedSteps}/${steps.length || 0} adim tamamlandi`,
    steps
  };
}

function renderOnboardingPanel(payload) {
  const panel = document.getElementById("onboarding-panel");
  const badge = document.getElementById("onboarding-badge");
  const summary = document.getElementById("onboarding-summary");
  const stepsHost = document.getElementById("onboarding-steps");
  if (!panel || !badge || !summary || !stepsHost) return;

  const view = buildOnboardingViewModel(payload);
  panel.hidden = !view.emptyState && view.status === "completed";
  badge.textContent = view.status;
  summary.textContent = view.summary;

  if (!view.steps.length) {
    stepsHost.innerHTML = "<li class='todo'>Kurulum adimi bulunamadi.</li>";
    return;
  }

  stepsHost.innerHTML = view.steps
    .map((step) => {
      const state = step.done ? "done" : "todo";
      const icon = step.done ? "✓" : "○";
      return `<li class="${state}">${icon} ${step.label} - ${step.hint || "-"}</li>`;
    })
    .join("");
}

async function renderDashboardView() {
  try {
    const [health, history, publishes, onboarding, channels] = await Promise.all([
      fetchJson("/health"),
      fetchJson("/api/v1/history?limit=20"),
      fetchJson("/api/v1/publish"),
      fetchJson("/api/v1/onboarding/status"),
      fetchJson("/api/v1/channels")
    ]);

    document.getElementById("health").textContent =
      `${health.storage}/${health.queue} q=${health.queueSize}`;
    renderHistory(history.items || []);
    renderPublishes(publishes.items || []);
    renderVideos(publishes.items || []);
    renderChannels(channels.items || []);
    await renderFusionPanel(publishes.items || []);
    renderOnboardingPanel(onboarding);
  } catch (error) {
    showError("health", error.message);
    renderHistory([]);
    renderPublishes([]);
    renderVideos([]);
    renderChannels([]);
    showError("fusion-summary", error.message);
    renderOnboardingPanel({
      onboardingStatus: "in_progress",
      emptyState: { showGuidedSetup: true },
      steps: []
    });
  }
}

async function renderOpsView() {
  try {
    const [metrics, slo, autoscale] = await Promise.all([
      fetchJson("/api/v1/ops/metrics"),
      fetchJson("/api/v1/ops/slo"),
      fetchJson("/api/v1/ops/autoscale")
    ]);
    const provider = buildProviderOpsModel(metrics);

    document.getElementById("ops-http-p95").textContent = `${metrics.timings.httpDurationP95Ms} ms`;
    document.getElementById("ops-queue-size").textContent = String(autoscale.queueSize);
    document.getElementById("ops-autoscale").textContent = String(autoscale.desiredWorkers);
    document.getElementById("ops-provider-failures").textContent = String(provider.failures);
    document.getElementById("ops-provider-retries").textContent = String(provider.retries);
    document.getElementById("ops-provider-timeouts").textContent = String(provider.timeouts);
    document.getElementById("ops-provider-telemetry").textContent = JSON.stringify(
      provider.providers,
      null,
      2
    );
    document.getElementById("ops-slo").textContent = JSON.stringify(slo, null, 2);
  } catch (error) {
    showError("ops-http-p95", error.message);
    showError("ops-queue-size", error.message);
    showError("ops-autoscale", error.message);
    showError("ops-provider-failures", error.message);
    showError("ops-provider-retries", error.message);
    showError("ops-provider-timeouts", error.message);
    showError("ops-provider-telemetry", error.message);
    showError("ops-slo", error.message);
  }
}

async function renderIntegrationsView() {
  try {
    const [webhooks, connectors, plugins, assets] = await Promise.all([
      fetchJson("/api/v1/integrations/webhooks"),
      fetchJson("/api/v1/integrations/connectors"),
      fetchJson("/api/v1/plugins"),
      fetchJson("/api/v1/assets/library")
    ]);

    document.getElementById("int-webhooks").textContent = String((webhooks.items || []).length);
    document.getElementById("int-connectors").textContent = String((connectors.items || []).length);
    document.getElementById("int-plugins").textContent = String((plugins.items || []).length);
    document.getElementById("int-assets").textContent = String((assets.items || []).length);
    document.getElementById("int-status").textContent = "Integrations endpointleri erisilebilir.";
  } catch (error) {
    showError("int-webhooks", error.message);
    showError("int-connectors", error.message);
    showError("int-plugins", error.message);
    showError("int-assets", error.message);
    showError("int-status", error.message);
  }
}

async function renderSecurityView() {
  try {
    const [auditVerify, checklist] = await Promise.all([
      fetchJson("/api/v1/audit/verify"),
      fetchJson("/api/v1/security/checklist")
    ]);

    document.getElementById("sec-audit-ok").textContent = auditVerify.ok ? "OK" : "FAILED";
    const lines = String(checklist.checklist || "")
      .split("\n")
      .filter(Boolean);
    document.getElementById("sec-checklist-lines").textContent = String(lines.length);
    document.getElementById("sec-checklist").textContent = checklist.checklist || "-";
  } catch (error) {
    showError("sec-audit-ok", error.message);
    showError("sec-checklist-lines", error.message);
    showError("sec-checklist", error.message);
  }
}

function setActiveView(route) {
  const titleMap = {
    dashboard: "Pipeline Dashboard",
    ops: "Ops Dashboard",
    integrations: "Integrations Dashboard",
    security: "Security Dashboard"
  };

  document.getElementById("page-title").textContent = titleMap[route] || titleMap.dashboard;

  for (const section of document.querySelectorAll("[data-view]")) {
    const active = section.getAttribute("data-view") === route;
    section.hidden = !active;
  }

  for (const item of document.querySelectorAll(".menu-item")) {
    if (item.getAttribute("data-route") === route) {
      item.setAttribute("aria-current", "page");
    } else {
      item.removeAttribute("aria-current");
    }
  }
}

function applySidebarState(shell, sidebar, state) {
  const expanded = state.isMobile ? state.mobileOpen : state.pinned || state.hovered;
  shell.classList.toggle("sidebar-expanded", expanded);
  shell.classList.toggle("sidebar-collapsed", !expanded);
  shell.setAttribute("data-mobile-open", state.mobileOpen ? "true" : "false");
  sidebar.setAttribute("data-pinned", state.pinned ? "true" : "false");
  sidebar.setAttribute("data-hovered", state.hovered ? "true" : "false");
}

function isMobileViewport() {
  return window.matchMedia("(max-width: 900px)").matches;
}

function applyRoleUi(role, allowedRoutes) {
  const roleBadge = document.getElementById("role-badge");
  if (roleBadge) roleBadge.textContent = `role: ${role}`;

  for (const item of document.querySelectorAll(".menu-item")) {
    const route = item.getAttribute("data-route");
    const allowed = allowedRoutes.includes(route);
    item.hidden = !allowed;
    item.setAttribute("aria-hidden", allowed ? "false" : "true");
  }

  for (const section of document.querySelectorAll("[data-view]")) {
    const route = section.getAttribute("data-view");
    if (!allowedRoutes.includes(route)) {
      section.hidden = true;
    }
  }
}

async function resolveViewerRole() {
  try {
    const me = await fetchJson("/api/v1/auth/me");
    return me.role || "admin";
  } catch (error) {
    if (isAuthError(error.message)) return "viewer";
    return "admin";
  }
}

async function initApp() {
  const requestedRoute = resolveRoute(window.location.pathname);
  const role = await resolveViewerRole();
  const allowedRoutes = getRoleAccess(role);
  const route = selectAccessibleRoute(requestedRoute, allowedRoutes);

  applyRoleUi(role, allowedRoutes);
  if (route !== requestedRoute && typeof history !== "undefined") {
    history.replaceState({}, "", `/app/${route}`);
  }
  setActiveView(route);

  if (route === "dashboard") {
    const runPipelineBtn = document.getElementById("onboarding-run-pipeline");
    if (runPipelineBtn) {
      runPipelineBtn.addEventListener("click", async () => {
        runPipelineBtn.disabled = true;
        runPipelineBtn.textContent = "Calisiyor...";
        try {
          await fetchJson("/api/v1/pipeline/run", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ topic: "ilk onboarding pipeline denemesi" })
          });
          await renderDashboardView();
        } catch {
          runPipelineBtn.textContent = "Tekrar Dene";
        } finally {
          runPipelineBtn.disabled = false;
          if (runPipelineBtn.textContent === "Calisiyor...") {
            runPipelineBtn.textContent = "Ilk Pipeline'i Baslat";
          }
        }
      });
    }

    const refreshBtn = document.getElementById("refresh");
    if (refreshBtn) {
      refreshBtn.addEventListener("click", renderDashboardView);
    }
    renderDashboardView();
    connectDashboardStream();
    setInterval(renderDashboardView, 5000);
  } else if (route === "ops") {
    renderOpsView();
  } else if (route === "integrations") {
    renderIntegrationsView();
  } else if (route === "security") {
    renderSecurityView();
  }

  const shell = document.getElementById("app-shell");
  const sidebar = document.getElementById("sidebar");
  const pinBtn = document.getElementById("pin-sidebar");
  const mobileToggle = document.getElementById("mobile-toggle");
  const backdrop = document.getElementById("mobile-backdrop");

  let state = {
    pinned: false,
    hovered: false,
    mobileOpen: false,
    isMobile: isMobileViewport()
  };

  applySidebarState(shell, sidebar, state);

  pinBtn.addEventListener("click", () => {
    state = nextSidebarState(state, "PIN_TOGGLE");
    applySidebarState(shell, sidebar, state);
  });

  sidebar.addEventListener("mouseenter", () => {
    if (state.isMobile) return;
    state = nextSidebarState(state, "HOVER_ON");
    applySidebarState(shell, sidebar, state);
  });

  sidebar.addEventListener("mouseleave", () => {
    if (state.isMobile) return;
    state = nextSidebarState(state, "HOVER_OFF");
    applySidebarState(shell, sidebar, state);
  });

  mobileToggle.addEventListener("click", () => {
    state = nextSidebarState(state, "MOBILE_TOGGLE");
    applySidebarState(shell, sidebar, state);
  });

  backdrop.addEventListener("click", () => {
    state = nextSidebarState(state, "MOBILE_CLOSE");
    applySidebarState(shell, sidebar, state);
  });

  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && state.mobileOpen) {
      state = nextSidebarState(state, "MOBILE_CLOSE");
      applySidebarState(shell, sidebar, state);
    }
  });

  window.addEventListener("resize", () => {
    const mobile = isMobileViewport();
    if (mobile && !state.isMobile) {
      state = nextSidebarState(state, "SET_MOBILE");
    } else if (!mobile && state.isMobile) {
      state = nextSidebarState(state, "SET_DESKTOP");
    }
    applySidebarState(shell, sidebar, state);
  });

  for (const link of document.querySelectorAll(".menu-item")) {
    link.addEventListener("click", () => {
      if (state.isMobile) {
        state = nextSidebarState(state, "MOBILE_CLOSE");
        applySidebarState(shell, sidebar, state);
      }
    });
  }
}

if (typeof document !== "undefined") {
  initApp().catch(() => {
    setActiveView("dashboard");
  });
}
