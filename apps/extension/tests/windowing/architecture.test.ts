import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import test from "node:test";

const sourceRoot = new URL("../../src/chrome/windowing/", import.meta.url);

test("historical windowing facades preserve public identities", async () => {
  const [sidepanel, popup, capabilities, initialization, transitions, policy, popupWindow, request] =
    await Promise.all([
      import("../../src/chrome/sidepanelManager"),
      import("../../src/chrome/extensionPopup"),
      import("../../src/chrome/windowing/browserCapabilities"),
      import("../../src/chrome/windowing/initialization"),
      import("../../src/chrome/windowing/modeTransitions"),
      import("../../src/chrome/windowing/modePolicy"),
      import("../../src/chrome/windowing/popupWindow"),
      import("../../src/chrome/windowing/requestSurface"),
    ]);

  assert.equal(sidepanel.POPUP_PATH, capabilities.POPUP_PATH);
  assert.equal(sidepanel.isSidePanelSupported, capabilities.isSidePanelSupported);
  assert.equal(sidepanel.initSidePanel, initialization.initSidePanel);
  assert.equal(sidepanel.getSidePanelMode, transitions.getSidePanelMode);
  assert.equal(sidepanel.setSidePanelMode, transitions.setSidePanelMode);
  assert.equal(
    sidepanel.transitionSidePanelToPopup,
    transitions.transitionSidePanelToPopup,
  );
  assert.equal(
    popup.shouldUseSidePanelForRequest,
    policy.shouldUseSidePanelForRequest,
  );
  assert.equal(popup.openPopupWindow, popupWindow.openPopupWindow);
  assert.equal(popup.openExtensionPopup, request.openExtensionPopup);
});

test("windowing domain stays one-way, explicit, and audit-sized", async () => {
  const budgets: Record<string, number> = {
    "browserCapabilities.ts": 80,
    "chromeAdapter.ts": 120,
    "initialization.ts": 90,
    "modePolicy.ts": 50,
    "modeTransitions.ts": 170,
    "popupGeometry.ts": 70,
    "popupWindow.ts": 150,
    "requestSidePanel.ts": 90,
    "requestSurface.ts": 120,
    "types.ts": 40,
  };
  const entries = (await readdir(sourceRoot)).sort();
  assert.deepEqual(entries, ["README.md", ...Object.keys(budgets)].sort());

  for (const [name, maximumLines] of Object.entries(budgets)) {
    const source = await readFile(new URL(name, sourceRoot), "utf8");
    assert.ok(
      source.split(/\r?\n/).length <= maximumLines,
      `${name} exceeds its ${maximumLines}-line audit budget`,
    );
    assert.doesNotMatch(source, /from ["']\.\.\/(?:extensionPopup|sidepanelManager)["']/);
    assert.doesNotMatch(source, /background\/composition/);
  }

  for (const facadeName of ["sidepanelManager.ts", "extensionPopup.ts"]) {
    const facade = await readFile(new URL(`../../src/chrome/${facadeName}`, import.meta.url), "utf8");
    assert.doesNotMatch(facade, /(?:async\s+)?function\s+/);
    assert.doesNotMatch(facade, /\bchrome\./);
    assert.ok(facade.split(/\r?\n/).length <= 20);
  }
});
