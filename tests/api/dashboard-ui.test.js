import test from "node:test";
import assert from "node:assert/strict";
import {
  buildPublishDashboardModel,
  buildChannelDashboardModel,
  buildFusionDashboardModel,
  buildOnboardingViewModel,
  buildProviderOpsModel,
  buildVideoDashboardModel,
  getRoleAccess,
  nextSidebarState,
  resolveRoute,
  selectAccessibleRoute
} from "../../apps/web/dashboard.js";

test("resolveRoute maps dashboard paths", () => {
  assert.equal(resolveRoute("/app/dashboard"), "dashboard");
  assert.equal(resolveRoute("/app/ops"), "ops");
  assert.equal(resolveRoute("/app/integrations"), "integrations");
  assert.equal(resolveRoute("/app/security"), "security");
  assert.equal(resolveRoute("/unknown"), "dashboard");
});

test("nextSidebarState handles hover/pin/mobile transitions", () => {
  const base = { pinned: false, hovered: false, mobileOpen: false, isMobile: false };

  const hovered = nextSidebarState(base, "HOVER_ON");
  assert.equal(hovered.hovered, true);

  const pinned = nextSidebarState(hovered, "PIN_TOGGLE");
  assert.equal(pinned.pinned, true);

  const mobile = nextSidebarState(pinned, "SET_MOBILE");
  assert.equal(mobile.isMobile, true);
  assert.equal(mobile.mobileOpen, false);

  const opened = nextSidebarState(mobile, "MOBILE_TOGGLE");
  assert.equal(opened.mobileOpen, true);

  const closed = nextSidebarState(opened, "MOBILE_CLOSE");
  assert.equal(closed.mobileOpen, false);

  const desktop = nextSidebarState(closed, "SET_DESKTOP");
  assert.equal(desktop.isMobile, false);
  assert.equal(desktop.mobileOpen, false);
});

test("role access limits routes for editor and viewer", () => {
  const admin = getRoleAccess("admin");
  const editor = getRoleAccess("editor");
  const viewer = getRoleAccess("viewer");

  assert.deepEqual(admin, ["dashboard", "ops", "integrations", "security"]);
  assert.deepEqual(editor, ["dashboard", "integrations"]);
  assert.deepEqual(viewer, ["dashboard"]);
});

test("selectAccessibleRoute falls back to dashboard", () => {
  assert.equal(selectAccessibleRoute("ops", ["dashboard", "integrations"]), "dashboard");
  assert.equal(selectAccessibleRoute("integrations", ["dashboard", "integrations"]), "integrations");
});

test("buildOnboardingViewModel summarizes guided setup state", () => {
  const view = buildOnboardingViewModel({
    onboardingStatus: "in_progress",
    emptyState: { showGuidedSetup: true },
    steps: [
      { key: "tenant_profile", done: true },
      { key: "channel_connected", done: false }
    ]
  });

  assert.equal(view.status, "in_progress");
  assert.equal(view.emptyState, true);
  assert.equal(view.summary, "1/2 adim tamamlandi");
});

test("buildFusionDashboardModel aggregates summary and rows", () => {
  const view = buildFusionDashboardModel([
    {
      topic: "topic-a",
      fusion: { finalScore: 0.7 },
      scores: { revenue: 0.6, searchIntent: 0.5, viralPattern: 0.4 }
    },
    {
      topic: "topic-b",
      fusion: { finalScore: 0.9 },
      scores: { revenue: 0.8, searchIntent: 0.6, viralPattern: 0.7 }
    }
  ]);

  assert.equal(view.summary, "avg=0.800 / n=2");
  assert.equal(view.rows.length, 2);
  assert.equal(view.rows[0].topic, "topic-a");
});

test("buildProviderOpsModel extracts provider counters", () => {
  const view = buildProviderOpsModel({
    counters: {
      providerFailuresTotal: 4,
      providerRetriesTotal: 3,
      providerTimeoutsTotal: 2
    },
    providers: {
      voice: { attempts: 7 },
      visual: { attempts: 5 }
    }
  });

  assert.equal(view.failures, 4);
  assert.equal(view.retries, 3);
  assert.equal(view.timeouts, 2);
  assert.equal(view.providers.voice.attempts, 7);
});

test("buildVideoDashboardModel maps publish rows to video view model", () => {
  const rows = buildVideoDashboardModel([
    {
      publishId: "pub_1",
      topic: "video topic",
      renderStatus: "rendered",
      status: "published",
      videoAssetPath: "data/assets/pub_1.mp4"
    }
  ]);

  assert.equal(rows.length, 1);
  assert.equal(rows[0].publishId, "pub_1");
  assert.equal(rows[0].videoAssetPath, "data/assets/pub_1.mp4");
});

test("buildChannelDashboardModel maps channel rows", () => {
  const rows = buildChannelDashboardModel([
    {
      channelId: "ch_1",
      name: "Ana Kanal",
      youtubeChannelId: "yt_123",
      defaultLanguage: "tr"
    }
  ]);

  assert.equal(rows.length, 1);
  assert.equal(rows[0].channelId, "ch_1");
  assert.equal(rows[0].name, "Ana Kanal");
});

test("buildPublishDashboardModel maps selected seo variant label", () => {
  const rows = buildPublishDashboardModel([
    {
      publishId: "pub_1",
      topic: "SEO topic",
      complianceStatus: "pass",
      metricsCtr: 0.0812,
      renderStatus: "rendered",
      optimizationStatus: "ready",
      status: "published",
      optimizationVariants: {
        selectedSeoVariant: { variantId: "seo_2", variantScore: 0.71 },
        seoSelection: { ranking: [{ variantId: "seo_2", finalScore: 0.8451 }] }
      }
    }
  ]);

  assert.equal(rows.length, 1);
  assert.equal(rows[0].publishId, "pub_1");
  assert.equal(rows[0].seoSelectionLabel, "seo_2 (0.845)");
});
