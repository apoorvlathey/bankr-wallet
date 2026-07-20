import assert from "node:assert/strict";
import test from "node:test";

import {
  detectSidePanelSupport,
  popupPathForBrowser,
} from "../../src/chrome/windowing/browserCapabilities";
import {
  effectiveSidePanelMode,
  shouldInitializeInSidePanelMode,
  shouldUseSidePanelForRequest,
} from "../../src/chrome/windowing/modePolicy";

test("browser capability policy accepts Chrome and Brave but rejects partial APIs and Firefox", () => {
  const sidePanel = {
    setPanelBehavior: async () => {},
    open: async () => {},
  } as any;

  assert.equal(popupPathForBrowser({ sidePanel } as any), "popup-init.html");
  assert.equal(popupPathForBrowser(undefined), "");
  for (const browser of ["Chrome", "Brave"]) {
    assert.equal(
      detectSidePanelSupport({ sidePanel } as any),
      true,
      `${browser} should use its complete sidePanel API`,
    );
  }
  assert.equal(
    detectSidePanelSupport({
      sidePanel: { setPanelBehavior: async () => {} },
    } as any),
    false,
  );
  assert.equal(
    detectSidePanelSupport({ sidePanel: undefined } as any),
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

test("request surfaces respect the user's mode at every browser size", () => {
  assert.equal(shouldUseSidePanelForRequest(false, true), false);
  assert.equal(shouldUseSidePanelForRequest(true, true), true);
  assert.equal(shouldUseSidePanelForRequest(true, false), false);
});
