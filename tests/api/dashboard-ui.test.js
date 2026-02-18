import test from "node:test";
import assert from "node:assert/strict";
import {
  buildOnboardingViewModel,
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
