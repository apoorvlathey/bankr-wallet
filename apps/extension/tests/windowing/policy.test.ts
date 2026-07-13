import assert from "node:assert/strict";
import test from "node:test";

import {
  detectSidePanelSupport,
  isNonChromeChromiumBrowser,
  popupPathForBrowser,
} from "../../src/chrome/windowing/browserCapabilities";
import {
  effectiveSidePanelMode,
  shouldInitializeInSidePanelMode,
  shouldUseSidePanelForRequest,
} from "../../src/chrome/windowing/modePolicy";

test("browser capability policy distinguishes Chrome, phantom Chromium, and Firefox", () => {
  const sidePanel = { setPanelBehavior: async () => {} } as any;
  const chromeBrand = {
    userAgentData: { brands: [{ brand: "Google Chrome" }] },
  } as any;
  const arcBrands = {
    userAgentData: { brands: [{ brand: "Chromium" }, { brand: "Arc" }] },
  } as any;

  assert.equal(popupPathForBrowser({ sidePanel } as any), "popup-init.html");
  assert.equal(popupPathForBrowser(undefined), "");
  assert.equal(isNonChromeChromiumBrowser(chromeBrand), false);
  assert.equal(isNonChromeChromiumBrowser(arcBrands), true);
  assert.equal(detectSidePanelSupport({ sidePanel } as any, chromeBrand), true);
  assert.equal(detectSidePanelSupport({ sidePanel } as any, arcBrands), false);
  assert.equal(
    detectSidePanelSupport({ sidePanel: undefined } as any, chromeBrand),
    false,
  );
});

test("mode policy keeps runtime default and popup-first startup distinct", () => {
  assert.equal(effectiveSidePanelMode(true, {}), true);
  assert.equal(effectiveSidePanelMode(true, { sidePanelMode: false }), false);
  assert.equal(effectiveSidePanelMode(false, { sidePanelMode: true }), false);
  assert.equal(
    effectiveSidePanelMode(true, {
      isArcBrowser: true,
      sidePanelMode: true,
    }),
    false,
  );

  assert.equal(shouldInitializeInSidePanelMode(true, {}), false);
  assert.equal(
    shouldInitializeInSidePanelMode(true, { sidePanelMode: true }),
    true,
  );
  assert.equal(
    shouldInitializeInSidePanelMode(true, {
      isArcBrowser: true,
      sidePanelMode: true,
    }),
    false,
  );
});

test("fullscreen override never bypasses the browser support boundary", () => {
  assert.equal(shouldUseSidePanelForRequest(false, true, "fullscreen"), true);
  assert.equal(shouldUseSidePanelForRequest(false, true, "normal"), false);
  assert.equal(shouldUseSidePanelForRequest(true, true, "normal"), true);
  assert.equal(shouldUseSidePanelForRequest(true, false, "fullscreen"), false);
});
