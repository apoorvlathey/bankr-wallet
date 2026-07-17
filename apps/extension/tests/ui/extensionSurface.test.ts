import assert from "node:assert/strict";
import test from "node:test";
import {
  getCurrentExtensionViewKind,
  resolveExtensionSurface,
} from "../../src/app/extensionSurface";

test("short side panels keep side-panel layout instead of falling back to popup", () => {
  assert.equal(
    resolveExtensionSurface({
      viewKind: "sidepanel",
      currentWindowType: "normal",
      sidePanelSupported: true,
      sidePanelPreferenceEnabled: true,
      viewportWidth: 360,
      isTopLevel: true,
    }),
    "sidepanel",
  );
});

test("side-panel preference is a height-independent fallback", () => {
  assert.equal(
    resolveExtensionSurface({
      viewKind: "unknown",
      currentWindowType: "normal",
      sidePanelSupported: true,
      sidePanelPreferenceEnabled: true,
      viewportWidth: 320,
      isTopLevel: true,
    }),
    "sidepanel",
  );
});

test("extension view identity separates action popups, tabs, and side panels", () => {
  const currentView = {} as Window;
  const otherView = {} as Window;

  assert.equal(
    getCurrentExtensionViewKind(currentView, {
      getViews: ({ type } = {}) =>
        type === "popup" ? [currentView] : [],
    }),
    "action-popup",
  );
  assert.equal(
    getCurrentExtensionViewKind(currentView, {
      getViews: ({ type } = {}) =>
        type === "tab" ? [currentView] : [],
    }),
    "tab",
  );
  assert.equal(
    getCurrentExtensionViewKind(currentView, {
      getViews: () => [otherView],
    }),
    "sidepanel",
  );
});

test("detached popup windows override tab-like view identity", () => {
  assert.equal(
    resolveExtensionSurface({
      viewKind: "tab",
      currentWindowType: "popup",
      sidePanelSupported: true,
      sidePanelPreferenceEnabled: true,
      viewportWidth: 900,
      isTopLevel: true,
    }),
    "popup-window",
  );
});
