import assert from "node:assert/strict";
import test from "node:test";

import { shouldUseSidePanelForRequest } from "../../src/chrome/extensionPopup";

test("fullscreen requests preserve popup mode when the panel is disabled", () => {
  assert.equal(
    shouldUseSidePanelForRequest(false, true),
    false,
  );
});

test("non-fullscreen requests preserve the user's display-mode preference", () => {
  assert.equal(shouldUseSidePanelForRequest(false, true), false);
  assert.equal(shouldUseSidePanelForRequest(true, true), true);
});

test("fullscreen requests use the side panel when the mode is enabled", () => {
  assert.equal(shouldUseSidePanelForRequest(true, true), true);
});

test("fullscreen requests still fall back when the side panel is unsupported", () => {
  assert.equal(
    shouldUseSidePanelForRequest(false, false),
    false,
  );
});
