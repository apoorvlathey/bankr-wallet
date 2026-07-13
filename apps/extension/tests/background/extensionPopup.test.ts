import assert from "node:assert/strict";
import test from "node:test";

import { shouldUseSidePanelForRequest } from "../../src/chrome/extensionPopup";

test("fullscreen requests use the side panel even when popup mode is preferred", () => {
  assert.equal(
    shouldUseSidePanelForRequest(false, true, "fullscreen"),
    true,
  );
});

test("non-fullscreen requests preserve the user's display-mode preference", () => {
  assert.equal(shouldUseSidePanelForRequest(false, true, "normal"), false);
  assert.equal(shouldUseSidePanelForRequest(true, true, "normal"), true);
});

test("fullscreen requests still fall back when the side panel is unsupported", () => {
  assert.equal(
    shouldUseSidePanelForRequest(false, false, "fullscreen"),
    false,
  );
});
